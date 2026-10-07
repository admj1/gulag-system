const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');
const { logAudit } = require('../services/audit');
const { pendenciasDe } = require('../services/debts');
const L = require('../services/tournamentLogic');

// Torneio: tudo em tabelas proprias (ver migration 025). Nada daqui entra nas
// estatisticas nem no financeiro da pelada.

const LIVE_STATS = ['goals', 'assists', 'yellow_cards', 'blue_cards', 'red_cards'];

function erro(res, status, mensagem) {
  return res.status(status).json({ error: mensagem });
}

async function audita(req, action, tournament, details = null) {
  await logAudit({
    actorId: req.user?.id, actorName: req.user?.name, action,
    targetType: 'tournament', targetId: tournament.id, targetLabel: tournament.name, details,
  });
}

async function buscaTorneio(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM tournaments WHERE id = $1', [id]);
  return rows[0] || null;
}

// Tudo o que a tela do torneio precisa, numa consulta so: inscritos, times,
// jogos com placar, classificacao, estatisticas e a situacao do draft.
async function montaTorneio(id) {
  const tournament = await buscaTorneio(id);
  if (!tournament) return null;

  const [{ rows: registrations }, { rows: teams }, { rows: roster }, { rows: matches }, { rows: stats }] = await Promise.all([
    pool.query(
      `SELECT r.player_id, r.fee_paid, r.paid_at, r.created_at, ${displayNameSql('p')} AS name,
              p.player_type, p.photo_url, p.stars
       FROM tournament_registrations r JOIN players p ON p.id = r.player_id
       WHERE r.tournament_id = $1 ORDER BY r.created_at`, [id]),
    pool.query(
      `SELECT t.*, ${displayNameSql('c')} AS captain_name
       FROM tournament_teams t JOIN players c ON c.id = t.captain_id
       WHERE t.tournament_id = $1 ORDER BY t.draft_position NULLS LAST, t.id`, [id]),
    pool.query(
      `SELECT tp.team_id, tp.player_id, tp.is_goalkeeper, tp.pick_number, ${displayNameSql('p')} AS name,
              p.player_type, p.photo_url
       FROM tournament_team_players tp JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = $1 ORDER BY tp.pick_number NULLS FIRST`, [id]),
    pool.query(
      `SELECT m.*,
         (SELECT COALESCE(SUM(goals), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.home_team_id)::int AS home_goals,
         (SELECT COALESCE(SUM(goals), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.away_team_id)::int AS away_goals,
         (SELECT COALESCE(SUM(yellow_cards), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.home_team_id)::int AS home_yellows,
         (SELECT COALESCE(SUM(yellow_cards), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.away_team_id)::int AS away_yellows
       FROM tournament_matches m WHERE m.tournament_id = $1 ORDER BY m.order_num`, [id]),
    pool.query(
      `SELECT s.player_id, s.team_id, ${displayNameSql('p')} AS name, p.player_type,
              COUNT(*)::int AS jogos, SUM(s.goals)::int AS goals, SUM(s.assists)::int AS assists,
              SUM(s.yellow_cards)::int AS yellow_cards, SUM(s.blue_cards)::int AS blue_cards,
              SUM(s.red_cards)::int AS red_cards
       FROM tournament_match_stats s
       JOIN tournament_matches m ON m.id = s.match_id
       JOIN players p ON p.id = s.player_id
       WHERE m.tournament_id = $1
       GROUP BY s.player_id, s.team_id, p.nickname, p.first_name, p.last_name, p.player_type`, [id]),
  ]);

  const nomeTime = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  // Classificacao por grupo, so com jogos encerrados
  const standings = {};
  for (const grupo of [...new Set(teams.map((t) => t.group_label).filter(Boolean))].sort()) {
    const doGrupo = teams.filter((t) => t.group_label === grupo);
    const jogos = matches.filter((m) => m.stage === 'grupo' && m.group_label === grupo && m.status === 'encerrada');
    const amarelos = {};
    for (const m of jogos) {
      amarelos[m.home_team_id] = (amarelos[m.home_team_id] || 0) + m.home_yellows;
      amarelos[m.away_team_id] = (amarelos[m.away_team_id] || 0) + m.away_yellows;
    }
    standings[grupo] = L.classificacao(doGrupo, jogos, amarelos);
  }

  // Goleiros: gols sofridos = gols do adversario nos jogos encerrados do time
  const goleiros = roster.filter((r) => r.is_goalkeeper).map((g) => {
    const jogos = matches.filter((m) => m.status === 'encerrada'
      && (m.home_team_id === g.team_id || m.away_team_id === g.team_id));
    const sofridos = jogos.reduce((soma, m) => soma + (m.home_team_id === g.team_id ? m.away_goals : m.home_goals), 0);
    return {
      player_id: g.player_id, name: g.name, team_id: g.team_id, team_name: nomeTime[g.team_id],
      jogos: jogos.length, sofridos, media: jogos.length ? sofridos / jogos.length : null,
    };
  });

  return {
    tournament,
    registrations,
    teams: teams.map((t) => ({ ...t, players: roster.filter((r) => r.team_id === t.id) })),
    matches: matches.map((m) => ({
      ...m, home_name: nomeTime[m.home_team_id] || null, away_name: nomeTime[m.away_team_id] || null,
    })),
    standings,
    stats: stats.map((s) => ({ ...s, team_name: nomeTime[s.team_id] })),
    goleiros,
    draft: L.estadoDoDraft({ tournament, teams, roster, registrations }),
  };
}

// ---------------------------------------------------------------------------
// Torneio
// ---------------------------------------------------------------------------

async function list(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT t.*,
         (SELECT COUNT(*) FROM tournament_registrations r WHERE r.tournament_id = t.id)::int AS inscritos,
         (SELECT name FROM tournament_teams c WHERE c.id = t.champion_team_id) AS champion_name,
         EXISTS (SELECT 1 FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.player_id = $1) AS inscrito
       FROM tournaments t ORDER BY t.event_date DESC, t.id DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const dados = await montaTorneio(req.params.id);
    if (!dados) return erro(res, 404, 'Torneio não encontrado');
    res.json(dados);
  } catch (err) {
    next(err);
  }
}

function lerConfig(body) {
  const num = (v, padrao) => (v === undefined || v === '' ? padrao : Number(v));
  return {
    name: String(body.name || '').trim().slice(0, 80),
    event_date: body.event_date,
    fee: num(body.fee, 0),
    num_teams: num(body.num_teams, 6),
    line_per_team: num(body.line_per_team, 6),
    gk_per_team: num(body.gk_per_team, 1),
    num_groups: num(body.num_groups, 2),
  };
}

async function create(req, res, next) {
  try {
    const c = lerConfig(req.body);
    if (!c.name || !c.event_date) return erro(res, 400, 'Informe o nome e a data do torneio');
    const { rows } = await pool.query(
      `INSERT INTO tournaments (name, event_date, fee, num_teams, line_per_team, gk_per_team, num_groups, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [c.name, c.event_date, c.fee, c.num_teams, c.line_per_team, c.gk_per_team, c.num_groups, req.user.id]
    );
    await audita(req, 'tournament.create', rows[0], {
      times: c.num_teams, por_time: c.line_per_team, goleiros: c.gk_per_team, taxa: c.fee,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return erro(res, 400, 'Configuração inválida (confira times, jogadores e grupos)');
    next(err);
  }
}

// Configuracao so muda antes de existir time — depois disso o draft depende dela
async function update(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    const { rows: times } = await pool.query('SELECT 1 FROM tournament_teams WHERE tournament_id = $1 LIMIT 1', [t.id]);
    const c = lerConfig({ ...t, ...req.body });
    if (times.length > 0 && ['num_teams', 'line_per_team', 'gk_per_team', 'num_groups'].some((k) => Number(t[k]) !== c[k])) {
      return erro(res, 409, 'Os capitães já foram definidos: times, jogadores por time e grupos não mudam mais');
    }
    const { rows } = await pool.query(
      `UPDATE tournaments SET name = $1, event_date = $2, fee = $3, num_teams = $4, line_per_team = $5,
         gk_per_team = $6, num_groups = $7 WHERE id = $8 RETURNING *`,
      [c.name, c.event_date, c.fee, c.num_teams, c.line_per_team, c.gk_per_team, c.num_groups, t.id]
    );
    await audita(req, 'tournament.update', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23514') return erro(res, 400, 'Configuração inválida (confira times, jogadores e grupos)');
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    await pool.query('DELETE FROM tournaments WHERE id = $1', [t.id]);
    await audita(req, 'tournament.delete', t);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Inscricao e taxa
// ---------------------------------------------------------------------------

// Motivo que impede a inscricao, ou null. Suspenso/bloqueado, devendo na
// pelada (mesma regra da ata) ou com taxa de torneio anterior em aberto.
async function bloqueioInscricao(playerId, tournamentId) {
  const { rows } = await pool.query(
    `SELECT ${displayNameSql()} AS nome, active, blocked, block_reason FROM players WHERE id = $1`, [playerId]
  );
  const p = rows[0];
  if (!p) return 'Jogador não encontrado';
  if (!p.active) return `${p.nome} está com o cadastro inativo.`;
  if (p.blocked) return `${p.nome} está suspenso/bloqueado${p.block_reason ? ` (${p.block_reason})` : ''}.`;

  const pendencias = await pendenciasDe(playerId);
  if (pendencias) return `${p.nome} tem pendência no financeiro (${pendencias}).`;

  const { rows: taxas } = await pool.query(
    `SELECT t.name FROM tournament_registrations r
     JOIN tournaments t ON t.id = r.tournament_id
     JOIN tournament_team_players tp ON tp.tournament_id = r.tournament_id AND tp.player_id = r.player_id
     WHERE r.player_id = $1 AND r.tournament_id <> $2 AND NOT r.fee_paid AND NOT tp.is_goalkeeper AND t.fee > 0`,
    [playerId, tournamentId]
  );
  if (taxas[0]) return `${p.nome} está com a taxa do torneio "${taxas[0].name}" em aberto.`;
  return null;
}

// Jogador se inscreve (ou o admin inscreve alguem, passando player_id).
// Bloqueio por debito/suspensao vale para o jogador; o admin pode passar por
// cima, igual na ata.
async function register(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    const isAdmin = req.user.role === 'admin';
    const playerId = isAdmin && req.body.player_id ? Number(req.body.player_id) : req.user.id;

    if (t.status !== 'inscricoes' && !(isAdmin && t.status === 'draft')) {
      return erro(res, 409, 'As inscrições deste torneio estão encerradas');
    }
    if (!isAdmin) {
      const motivo = await bloqueioInscricao(playerId, t.id);
      if (motivo) return erro(res, 403, `${motivo} Não é possível se inscrever — fale com um administrador.`);
    }

    await pool.query(
      `INSERT INTO tournament_registrations (tournament_id, player_id) VALUES ($1, $2)
       ON CONFLICT (tournament_id, player_id) DO NOTHING`,
      [t.id, playerId]
    );
    await audita(req, 'tournament.register', t, { jogador: await nomeDe(playerId) });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function nomeDe(playerId) {
  const { rows } = await pool.query(`SELECT ${displayNameSql()} AS nome FROM players WHERE id = $1`, [playerId]);
  return rows[0]?.nome || null;
}

// Sair da inscricao: o proprio jogador (so com inscricoes abertas) ou o admin
// (enquanto a pessoa nao estiver em um time)
async function unregister(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    const isAdmin = req.user.role === 'admin';
    const playerId = req.params.playerId ? Number(req.params.playerId) : req.user.id;
    if (!isAdmin && playerId !== req.user.id) return erro(res, 403, 'Sem permissão');
    if (!isAdmin && t.status !== 'inscricoes') return erro(res, 409, 'As inscrições deste torneio estão encerradas');

    const { rows: noTime } = await pool.query(
      'SELECT 1 FROM tournament_team_players WHERE tournament_id = $1 AND player_id = $2', [t.id, playerId]
    );
    if (noTime[0]) return erro(res, 409, 'Este jogador já está em um time — desfaça a escolha no draft antes');

    await pool.query('DELETE FROM tournament_registrations WHERE tournament_id = $1 AND player_id = $2', [t.id, playerId]);
    await audita(req, 'tournament.unregister', t, { jogador: await nomeDe(playerId) });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function setFee(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    const paid = !!req.body.paid;
    const { rows } = await pool.query(
      `UPDATE tournament_registrations SET fee_paid = $1, paid_at = CASE WHEN $1 THEN now() ELSE NULL END
       WHERE tournament_id = $2 AND player_id = $3 RETURNING *`,
      [paid, t.id, req.params.playerId]
    );
    if (!rows[0]) return erro(res, 404, 'Inscrição não encontrada');
    await audita(req, paid ? 'tournament.fee_paid' : 'tournament.fee_pending', t, {
      jogador: await nomeDe(req.params.playerId), valor: Number(t.fee),
    });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

async function startDraft(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    if (t.status !== 'inscricoes') return erro(res, 409, 'O torneio já passou da fase de inscrições');
    await pool.query(`UPDATE tournaments SET status = 'draft' WHERE id = $1`, [t.id]);
    await audita(req, 'tournament.start_draft', t);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function temEscolhas(tournamentId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM tournament_team_players WHERE tournament_id = $1 AND pick_number IS NOT NULL LIMIT 1',
    [tournamentId]
  );
  return rows.length > 0;
}

// Define os capitaes (recria os times). Cada time leva o nome do capitao.
async function setCaptains(req, res, next) {
  const client = await pool.connect();
  try {
    const t = await buscaTorneio(req.params.id, client);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    if (t.status !== 'draft') return erro(res, 409, 'Os capitães são definidos na fase de draft');
    if (await temEscolhas(t.id)) return erro(res, 409, 'O draft já começou — desfaça as escolhas antes de trocar capitães');

    const ids = [...new Set((req.body.player_ids || []).map(Number))];
    if (ids.length !== t.num_teams) return erro(res, 400, `Escolha exatamente ${t.num_teams} capitães`);

    const { rows: validos } = await client.query(
      `SELECT r.player_id, ${displayNameSql('p')} AS nome, p.player_type
       FROM tournament_registrations r JOIN players p ON p.id = r.player_id
       WHERE r.tournament_id = $1 AND r.player_id = ANY($2::int[])`,
      [t.id, ids]
    );
    if (validos.length !== ids.length) return erro(res, 400, 'Todo capitão precisa estar inscrito no torneio');
    if (validos.some((v) => v.player_type === 'goleiro')) return erro(res, 400, 'Capitão é jogador de linha — goleiro entra no draft dos goleiros');

    await client.query('BEGIN');
    await client.query('DELETE FROM tournament_teams WHERE tournament_id = $1', [t.id]);
    for (let i = 0; i < ids.length; i += 1) {
      const v = validos.find((x) => x.player_id === ids[i]);
      const { rows } = await client.query(
        `INSERT INTO tournament_teams (tournament_id, name, captain_id, draft_position)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [t.id, `Time ${v.nome}`.slice(0, 60), v.player_id, i + 1]
      );
      await client.query(
        `INSERT INTO tournament_team_players (tournament_id, team_id, player_id) VALUES ($1, $2, $3)`,
        [t.id, rows[0].id, v.player_id]
      );
    }
    await client.query('COMMIT');
    await audita(req, 'tournament.captains', t, { capitaes: validos.map((v) => v.nome).join(', ') });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Ordem do draft: sorteada pelo sistema ({ random: true }) ou definida na mao
// ({ team_ids: [...] }, ex.: sorteio feito no papel)
async function setDraftOrder(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    if (t.status !== 'draft') return erro(res, 409, 'A ordem é definida na fase de draft');
    if (await temEscolhas(t.id)) return erro(res, 409, 'O draft já começou — a ordem não muda mais');

    const { rows: teams } = await pool.query('SELECT id FROM tournament_teams WHERE tournament_id = $1', [t.id]);
    const atuais = teams.map((x) => x.id);
    let ordem = req.body.random ? L.embaralha(atuais) : (req.body.team_ids || []).map(Number);
    if (ordem.length !== atuais.length || !ordem.every((id) => atuais.includes(id))) {
      return erro(res, 400, 'Ordem inválida');
    }
    for (let i = 0; i < ordem.length; i += 1) {
      await pool.query('UPDATE tournament_teams SET draft_position = $1 WHERE id = $2', [i + 1, ordem[i]]);
    }
    await audita(req, 'tournament.draft_order', t, { sorteio: !!req.body.random });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Uma escolha do draft: so vale para o time da vez e da fase certa (linha ou goleiro)
async function pick(req, res, next) {
  try {
    const dados = await montaTorneio(req.params.id);
    if (!dados) return erro(res, 404, 'Torneio não encontrado');
    const { tournament: t, draft, registrations, teams } = dados;
    if (t.status !== 'draft') return erro(res, 409, 'O torneio não está na fase de draft');
    if (teams.length !== t.num_teams) return erro(res, 409, 'Defina os capitães antes de começar o draft');
    if (draft.fase === 'fim') return erro(res, 409, 'O draft já terminou');

    const playerId = Number(req.body.player_id);
    const inscrito = registrations.find((r) => r.player_id === playerId);
    if (!inscrito) return erro(res, 400, 'Jogador não está inscrito no torneio');
    const goleiro = inscrito.player_type === 'goleiro';
    if (goleiro !== (draft.fase === 'goleiro')) {
      return erro(res, 400, draft.fase === 'goleiro' ? 'Agora é o draft dos goleiros' : 'Goleiro entra no draft dos goleiros, depois dos jogadores de linha');
    }
    if (teams.some((tm) => tm.players.some((p) => p.player_id === playerId))) {
      return erro(res, 409, 'Este jogador já está em um time');
    }

    await pool.query(
      `INSERT INTO tournament_team_players (tournament_id, team_id, player_id, is_goalkeeper, pick_number)
       VALUES ($1, $2, $3, $4, $5)`,
      [t.id, draft.teamId, playerId, goleiro, draft.proximaEscolha]
    );
    const time = teams.find((tm) => tm.id === draft.teamId);
    await audita(req, 'tournament.pick', t, {
      escolha: draft.proximaEscolha, time: time?.name, jogador: inscrito.name,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return erro(res, 409, 'Este jogador já está em um time');
    next(err);
  }
}

async function undoPick(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    if (t.status !== 'draft') return erro(res, 409, 'O torneio não está na fase de draft');
    const { rows } = await pool.query(
      `DELETE FROM tournament_team_players
       WHERE tournament_id = $1 AND pick_number = (
         SELECT MAX(pick_number) FROM tournament_team_players WHERE tournament_id = $1)
       RETURNING player_id, pick_number`,
      [t.id]
    );
    if (!rows[0]) return erro(res, 409, 'Nenhuma escolha para desfazer');
    await audita(req, 'tournament.undo_pick', t, { escolha: rows[0].pick_number, jogador: await nomeDe(rows[0].player_id) });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Fecha o draft: divide os times em grupos e gera os jogos da fase de grupos
async function finishDraft(req, res, next) {
  const client = await pool.connect();
  try {
    const t = await buscaTorneio(req.params.id, client);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    if (t.status !== 'draft') return erro(res, 409, 'O torneio não está na fase de draft');
    const { rows: teams } = await client.query(
      'SELECT id FROM tournament_teams WHERE tournament_id = $1 ORDER BY draft_position', [t.id]
    );
    if (teams.length !== t.num_teams) return erro(res, 409, 'Defina os capitães antes de fechar o draft');
    if (t.num_groups === 2 && teams.length < 4) return erro(res, 409, 'Com 2 grupos são precisos pelo menos 4 times');

    const grupos = L.divideEmGrupos(teams.map((x) => x.id), t.num_groups);
    const jogos = L.tabelaDeGrupos(grupos);

    await client.query('BEGIN');
    for (const g of grupos) {
      await client.query('UPDATE tournament_teams SET group_label = $1 WHERE id = $2', [g.grupo, g.id]);
    }
    await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [t.id]);
    for (let i = 0; i < jogos.length; i += 1) {
      await client.query(
        `INSERT INTO tournament_matches (tournament_id, stage, group_label, order_num, home_team_id, away_team_id)
         VALUES ($1, 'grupo', $2, $3, $4, $5)`,
        [t.id, jogos[i].grupo, i + 1, jogos[i].home, jogos[i].away]
      );
    }
    await client.query(`UPDATE tournaments SET status = 'grupos' WHERE id = $1`, [t.id]);
    await client.query('COMMIT');
    await audita(req, 'tournament.finish_draft', t, { jogos: jogos.length });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------

async function buscaPartida(matchId, client = pool) {
  const { rows } = await client.query(
    `SELECT m.*,
       (SELECT COALESCE(SUM(goals), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.home_team_id)::int AS home_goals,
       (SELECT COALESCE(SUM(goals), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.away_team_id)::int AS away_goals
     FROM tournament_matches m WHERE m.id = $1`, [matchId]
  );
  return rows[0] || null;
}

// Tela da sumula: os dois times com elenco, numeros de cada um nesta
// partida, quem esta suspenso (vermelho no jogo anterior do time) e quem
// esta com a taxa em aberto.
async function getMatch(req, res, next) {
  try {
    const m = await buscaPartida(req.params.matchId);
    if (!m) return erro(res, 404, 'Partida não encontrada');
    const t = await buscaTorneio(m.tournament_id);

    const { rows: elenco } = await pool.query(
      `SELECT tp.team_id, tp.player_id, tp.is_goalkeeper, ${displayNameSql('p')} AS name, p.player_type,
              COALESCE(r.fee_paid, FALSE) AS fee_paid,
              (tt.captain_id = tp.player_id) AS is_captain
       FROM tournament_team_players tp
       JOIN players p ON p.id = tp.player_id
       JOIN tournament_teams tt ON tt.id = tp.team_id
       LEFT JOIN tournament_registrations r ON r.tournament_id = tp.tournament_id AND r.player_id = tp.player_id
       WHERE tp.team_id = ANY($1::int[])
       ORDER BY tp.is_goalkeeper DESC, (tt.captain_id = tp.player_id) DESC, tp.pick_number NULLS FIRST`,
      [[m.home_team_id, m.away_team_id].filter(Boolean)]
    );
    const { rows: stats } = await pool.query('SELECT * FROM tournament_match_stats WHERE match_id = $1', [m.id]);
    const { rows: teams } = await pool.query(
      'SELECT id, name FROM tournament_teams WHERE id = ANY($1::int[])', [[m.home_team_id, m.away_team_id].filter(Boolean)]
    );

    // Vermelho no jogo anterior (ja encerrado) do mesmo time = fora deste
    const { rows: suspensos } = await pool.query(
      `SELECT s.player_id FROM tournament_match_stats s
       JOIN tournament_matches prev ON prev.id = s.match_id
       WHERE prev.tournament_id = $1 AND prev.status = 'encerrada' AND prev.order_num < $2
         AND s.red_cards > 0
         AND prev.order_num = (
           SELECT MAX(p2.order_num) FROM tournament_matches p2
           WHERE p2.tournament_id = $1 AND p2.status = 'encerrada' AND p2.order_num < $2
             AND (p2.home_team_id = s.team_id OR p2.away_team_id = s.team_id))`,
      [m.tournament_id, m.order_num]
    );
    const suspensoSet = new Set(suspensos.map((s) => s.player_id));
    const taxaVale = Number(t.fee) > 0;

    res.json({
      match: m,
      tournament: { id: t.id, name: t.name, status: t.status, fee: t.fee },
      teams: teams.map((tm) => ({
        ...tm,
        players: elenco.filter((p) => p.team_id === tm.id).map((p) => ({
          ...p,
          suspenso: suspensoSet.has(p.player_id),
          taxa_pendente: taxaVale && !p.is_goalkeeper && !p.fee_paid,
        })),
      })),
      stats,
    });
  } catch (err) {
    next(err);
  }
}

// Sumula ao vivo: mesmo esquema da pelada (cada toque com id do aparelho,
// repetido e ignorado, entao reenviar a fila depois de perder sinal e seguro)
async function pushEvents(req, res, next) {
  const client = await pool.connect();
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length > 200) return erro(res, 400, 'Lista de lançamentos inválida');
    const m = await buscaPartida(req.params.matchId, client);
    if (!m) return erro(res, 404, 'Partida não encontrada');
    if (m.status === 'encerrada') return erro(res, 409, 'Partida encerrada — reabra para corrigir a súmula');

    await client.query('BEGIN');
    let applied = 0;
    let ignored = 0;
    for (const e of events) {
      const clientId = String(e.client_id || '');
      const delta = Number(e.delta);
      const playerId = Number(e.player_id);
      if (!clientId || clientId.length > 60 || (delta !== 1 && delta !== -1) || !LIVE_STATS.includes(e.stat)) {
        await client.query('ROLLBACK');
        return erro(res, 400, 'Lançamento inválido');
      }
      const { rows: time } = await client.query(
        `SELECT team_id FROM tournament_team_players
         WHERE tournament_id = $1 AND player_id = $2 AND team_id = ANY($3::int[])`,
        [m.tournament_id, playerId, [m.home_team_id, m.away_team_id]]
      );
      if (!time[0]) { ignored += 1; continue; } // saiu do time depois do toque

      const { rows: reg } = await client.query(
        `INSERT INTO tournament_events (match_id, player_id, stat, delta, client_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (client_id) DO NOTHING RETURNING id`,
        [m.id, playerId, e.stat, delta, clientId, req.user.id]
      );
      if (!reg[0]) { ignored += 1; continue; }

      await client.query(
        `INSERT INTO tournament_match_stats (match_id, player_id, team_id, ${e.stat})
         VALUES ($1, $2, $3, GREATEST(0, $4))
         ON CONFLICT (match_id, player_id) DO UPDATE SET
           ${e.stat} = GREATEST(0, tournament_match_stats.${e.stat} + $4)`,
        [m.id, playerId, time[0].team_id, delta]
      );
      applied += 1;
    }
    if (m.status === 'pendente' && applied > 0) {
      await client.query(`UPDATE tournament_matches SET status = 'em_andamento' WHERE id = $1`, [m.id]);
    }
    await client.query('COMMIT');

    const { rows: stats } = await pool.query('SELECT * FROM tournament_match_stats WHERE match_id = $1', [m.id]);
    res.json({ applied, ignored, stats });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Depois de cada partida encerrada: fase de grupos completa gera o mata-mata;
// semifinais completas geram a final; final decidida define campeao e vice.
async function avancaFases(client, tournamentId) {
  const t = await buscaTorneio(tournamentId, client);
  const { rows: matches } = await client.query(
    `SELECT m.*,
       (SELECT COALESCE(SUM(goals), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.home_team_id)::int AS home_goals,
       (SELECT COALESCE(SUM(goals), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.away_team_id)::int AS away_goals,
       (SELECT COALESCE(SUM(yellow_cards), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.home_team_id)::int AS home_yellows,
       (SELECT COALESCE(SUM(yellow_cards), 0) FROM tournament_match_stats s WHERE s.match_id = m.id AND s.team_id = m.away_team_id)::int AS away_yellows
     FROM tournament_matches m WHERE m.tournament_id = $1 ORDER BY m.order_num`, [tournamentId]
  );
  const proximaOrdem = (matches.at(-1)?.order_num || 0) + 1;
  const grupo = matches.filter((m) => m.stage === 'grupo');
  const semis = matches.filter((m) => m.stage === 'semi');
  const final = matches.find((m) => m.stage === 'final');

  if (t.status === 'grupos' && grupo.length > 0 && grupo.every((m) => m.status === 'encerrada')) {
    const { rows: teams } = await client.query('SELECT id, name, group_label FROM tournament_teams WHERE tournament_id = $1', [t.id]);
    const tabela = {};
    for (const g of [...new Set(teams.map((x) => x.group_label))].sort()) {
      const jogos = grupo.filter((m) => m.group_label === g);
      const amarelos = {};
      for (const m of jogos) {
        amarelos[m.home_team_id] = (amarelos[m.home_team_id] || 0) + m.home_yellows;
        amarelos[m.away_team_id] = (amarelos[m.away_team_id] || 0) + m.away_yellows;
      }
      tabela[g] = L.classificacao(teams.filter((x) => x.group_label === g), jogos, amarelos);
    }
    if (t.num_groups === 2) {
      // Semifinais cruzadas: 1o A x 2o B, 1o B x 2o A
      await client.query(
        `INSERT INTO tournament_matches (tournament_id, stage, order_num, home_team_id, away_team_id)
         VALUES ($1, 'semi', $2, $3, $4), ($1, 'semi', $5, $6, $7)`,
        [t.id, proximaOrdem, tabela.A[0].team_id, tabela.B[1].team_id,
          proximaOrdem + 1, tabela.B[0].team_id, tabela.A[1].team_id]
      );
    } else {
      await client.query(
        `INSERT INTO tournament_matches (tournament_id, stage, order_num, home_team_id, away_team_id)
         VALUES ($1, 'final', $2, $3, $4)`,
        [t.id, proximaOrdem, tabela.A[0].team_id, tabela.A[1].team_id]
      );
    }
    await client.query(`UPDATE tournaments SET status = 'mata_mata' WHERE id = $1`, [t.id]);
    return;
  }

  if (t.status === 'mata_mata' && !final && semis.length === 2 && semis.every((m) => m.status === 'encerrada')) {
    await client.query(
      `INSERT INTO tournament_matches (tournament_id, stage, order_num, home_team_id, away_team_id)
       VALUES ($1, 'final', $2, $3, $4)`,
      [t.id, proximaOrdem, L.vencedor(semis[0]), L.vencedor(semis[1])]
    );
    return;
  }

  if (final && final.status === 'encerrada') {
    const campeao = L.vencedor(final);
    const vice = campeao === final.home_team_id ? final.away_team_id : final.home_team_id;
    await client.query(
      `UPDATE tournaments SET status = 'encerrado', champion_team_id = $1, runner_up_team_id = $2 WHERE id = $3`,
      [campeao, vice, t.id]
    );
  }
}

async function finishMatch(req, res, next) {
  const client = await pool.connect();
  try {
    const m = await buscaPartida(req.params.matchId, client);
    if (!m) return erro(res, 404, 'Partida não encontrada');
    if (m.status === 'encerrada') return erro(res, 409, 'Partida já encerrada');

    let homePen = null;
    let awayPen = null;
    if (m.stage !== 'grupo' && m.home_goals === m.away_goals) {
      homePen = Number(req.body.home_penalties);
      awayPen = Number(req.body.away_penalties);
      if (!Number.isInteger(homePen) || !Number.isInteger(awayPen) || homePen < 0 || awayPen < 0 || homePen === awayPen) {
        return erro(res, 400, 'Jogo de mata-mata empatado: informe o placar dos pênaltis (sem empate)');
      }
    }

    await client.query('BEGIN');
    await client.query(
      `UPDATE tournament_matches SET status = 'encerrada', home_penalties = $1, away_penalties = $2 WHERE id = $3`,
      [homePen, awayPen, m.id]
    );
    await avancaFases(client, m.tournament_id);
    await client.query('COMMIT');

    const t = await buscaTorneio(m.tournament_id);
    await audita(req, 'tournament.finish_match', t, {
      partida: m.order_num, placar: `${m.home_goals} x ${m.away_goals}`,
      ...(homePen != null ? { penaltis: `${homePen} x ${awayPen}` } : {}),
    });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Reabre uma partida para corrigir a sumula. So enquanto a fase seguinte que
// ela gerou ainda nao comecou — nesse caso a fase seguinte e desfeita (vai ser
// gerada de novo quando a partida for encerrada outra vez).
async function reopenMatch(req, res, next) {
  const client = await pool.connect();
  try {
    const m = await buscaPartida(req.params.matchId, client);
    if (!m) return erro(res, 404, 'Partida não encontrada');
    if (m.status !== 'encerrada') return erro(res, 409, 'A partida não está encerrada');

    const posteriores = m.stage === 'grupo' ? ['semi', 'final'] : m.stage === 'semi' ? ['final'] : [];
    const { rows: comecadas } = await client.query(
      `SELECT 1 FROM tournament_matches WHERE tournament_id = $1 AND stage = ANY($2::text[]) AND status <> 'pendente' LIMIT 1`,
      [m.tournament_id, posteriores]
    );
    if (comecadas[0]) return erro(res, 409, 'A fase seguinte já começou — não dá mais para reabrir esta partida');

    await client.query('BEGIN');
    await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1 AND stage = ANY($2::text[])', [m.tournament_id, posteriores]);
    await client.query(
      `UPDATE tournament_matches SET status = 'em_andamento', home_penalties = NULL, away_penalties = NULL WHERE id = $1`, [m.id]
    );
    const status = m.stage === 'grupo' ? 'grupos' : 'mata_mata';
    await client.query(
      `UPDATE tournaments SET status = $1, champion_team_id = NULL, runner_up_team_id = NULL WHERE id = $2`,
      [status, m.tournament_id]
    );
    await client.query('COMMIT');
    const t = await buscaTorneio(m.tournament_id);
    await audita(req, 'tournament.reopen_match', t, { partida: m.order_num });
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Melhor goleiro e craque: escolha do admin (a tela sugere pelos numeros)
async function setAwards(req, res, next) {
  try {
    const t = await buscaTorneio(req.params.id);
    if (!t) return erro(res, 404, 'Torneio não encontrado');
    const gk = req.body.best_gk_player_id ? Number(req.body.best_gk_player_id) : null;
    const mvp = req.body.mvp_player_id ? Number(req.body.mvp_player_id) : null;
    await pool.query(
      'UPDATE tournaments SET best_gk_player_id = $1, mvp_player_id = $2 WHERE id = $3', [gk, mvp, t.id]
    );
    await audita(req, 'tournament.awards', t, {
      melhor_goleiro: gk ? await nomeDe(gk) : null, craque: mvp ? await nomeDe(mvp) : null,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list, getById, create, update, remove,
  register, unregister, setFee,
  startDraft, setCaptains, setDraftOrder, pick, undoPick, finishDraft,
  getMatch, pushEvents, finishMatch, reopenMatch, setAwards,
};
