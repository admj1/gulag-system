const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { displayNameSql, getSettings } = require('../config/settings');


async function create(req, res, next) {
  try {
    const { season_id, match_date, confirmation_deadline } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO matchdays (season_id, match_date, confirmation_deadline)
       VALUES ($1, $2, $3) RETURNING *`,
      [season_id, match_date, confirmation_deadline]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: previa do elenco padrao da ata (mensalistas numerados + goleiros)
async function rosterPreview(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, ${displayNameSql()} AS name, player_type, stars, mensalista_number
       FROM players
       WHERE player_type IN ('mensalista', 'goleiro') AND NOT blocked
       ORDER BY player_type, mensalista_number NULLS LAST, ${displayNameSql()}`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Admin: cria a ata com todos os mensalistas e goleiros ja relacionados (pendentes de confirmacao).
// Diaristas entram por ordem de confirmacao. Com confirm_all a ata ja nasce confirmada (lancamento retroativo).
async function createFromRoster(req, res, next) {
  const client = await pool.connect();
  try {
    const { match_date, diarista_ids = [], season_id, confirm_all = false } = req.body;
    if (!match_date) {
      return res.status(400).json({ error: 'Informe a data da pelada' });
    }

    const settings = await getSettings();
    await client.query('BEGIN');

    let seasonId = season_id || null;
    if (!seasonId) {
      const { rows } = await client.query(
        `SELECT id FROM seasons WHERE year = EXTRACT(YEAR FROM $1::date) ORDER BY id LIMIT 1`,
        [match_date]
      );
      seasonId = rows[0]?.id || null;
    }
    if (!seasonId) {
      const { rows } = await client.query(
        `INSERT INTO seasons (name, year, start_date)
         VALUES (EXTRACT(YEAR FROM $1::date)::int::text, EXTRACT(YEAR FROM $1::date)::int, date_trunc('year', $1::date))
         RETURNING id`,
        [match_date]
      );
      seasonId = rows[0].id;
    }

    const { rows: matchdayRows } = await client.query(
      `INSERT INTO matchdays (season_id, match_date, confirmation_deadline, status)
       VALUES ($1, $2, ($2::date + $3::time), $4)
       RETURNING *`,
      [seasonId, match_date, settings.match_time, confirm_all ? 'closed' : 'open']
    );
    const matchday = matchdayRows[0];

    // Mensalistas e goleiros ja entram relacionados; ficam verdes conforme confirmam
    await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, status)
       SELECT $1, id, $2 FROM players
       WHERE player_type IN ('mensalista', 'goleiro') AND NOT blocked
       ON CONFLICT (matchday_id, player_id) DO NOTHING`,
      [matchday.id, confirm_all ? 'confirmed' : 'pending']
    );

    let position = 0;
    for (const playerId of diarista_ids) {
      position += 1;
      await client.query(
        `INSERT INTO confirmations (matchday_id, player_id, queue_position, status)
         VALUES ($1, $2, $3, 'confirmed')
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET status = 'confirmed', queue_position = EXCLUDED.queue_position`,
        [matchday.id, playerId, position]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(matchday);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function list(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM matchdays ORDER BY match_date DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM matchdays WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Mensalistas saem na ordem fixa 1-20; diaristas na ordem em que confirmaram
async function getConfirmations(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, ${displayNameSql('p')} AS name, p.player_type, p.stars, p.photo_url, p.mensalista_number,
              ${displayNameSql('inv')} AS invited_by_name
       FROM confirmations c
       JOIN players p ON p.id = c.player_id
       LEFT JOIN players inv ON inv.id = c.invited_by_player_id
       WHERE c.matchday_id = $1
       ORDER BY p.mensalista_number NULLS LAST, c.queue_position NULLS LAST, c.confirmed_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Jogador desiste da propria vaga. Mensalista continua relacionado (volta a pendente);
// diarista sai da fila, liberando a posicao para os proximos.
async function cancelOwnConfirmation(req, res, next) {
  try {
    const { rows: matchdayRows } = await pool.query(
      'SELECT status FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    if (matchdayRows[0].status !== 'open' && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
    }

    const { rows: playerRows } = await pool.query(
      'SELECT player_type FROM players WHERE id = $1', [req.user.id]
    );

    if (playerRows[0]?.player_type === 'mensalista') {
      await pool.query(
        `UPDATE confirmations SET status = 'pending' WHERE matchday_id = $1 AND player_id = $2`,
        [req.params.id, req.user.id]
      );
    } else {
      await pool.query(
        'DELETE FROM confirmations WHERE matchday_id = $1 AND player_id = $2',
        [req.params.id, req.user.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Qualquer jogador logado pode incluir alguem na lista (diarista ou goleiro convidado).
// Aceita um jogador ja cadastrado ou um nome novo, que entra como diarista.
async function invitePlayer(req, res, next) {
  const client = await pool.connect();
  try {
    const { player_id, first_name, last_name, nickname, player_type } = req.body;

    const { rows: matchdayRows } = await client.query(
      'SELECT status FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    if (matchdayRows[0].status !== 'open' && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
    }

    await client.query('BEGIN');

    let invitedId = player_id;
    if (!invitedId) {
      if (!first_name) {
        return res.status(400).json({ error: 'Informe o nome de quem você quer incluir' });
      }
      const type = player_type === 'goleiro' ? 'goleiro' : 'diarista';
      const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
      const { rows } = await client.query(
        `INSERT INTO players (first_name, last_name, nickname, password_hash, player_type)
         VALUES ($1, COALESCE($2, ''), $3, $4, $5) RETURNING id`,
        [first_name, last_name, nickname || null, passwordHash, type]
      );
      invitedId = rows[0].id;
    } else {
      const { rows } = await client.query(
        'SELECT player_type, blocked, block_reason FROM players WHERE id = $1', [invitedId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
      if (rows[0].blocked) {
        return res.status(403).json({ error: rows[0].block_reason || 'Jogador bloqueado' });
      }
      if (rows[0].player_type === 'mensalista') {
        return res.status(409).json({ error: 'Mensalistas já entram na lista e confirmam sozinhos' });
      }
    }

    const queuePosition = await nextQueuePosition(client, req.params.id);
    const { rows } = await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET
         status = 'confirmed',
         invited_by_player_id = COALESCE(confirmations.invited_by_player_id, EXCLUDED.invited_by_player_id),
         queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position)
       RETURNING *`,
      [req.params.id, invitedId, req.user.id, queuePosition]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Admin marca/desmarca a presenca de qualquer jogador na ata
async function setConfirmation(req, res, next) {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'waitlist', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { rows: playerRows } = await client.query(
      'SELECT player_type FROM players WHERE id = $1', [req.params.playerId]
    );
    if (!playerRows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });

    const queuePosition = playerRows[0].player_type === 'diarista' && status === 'confirmed'
      ? await nextQueuePosition(client, req.params.id)
      : null;

    const { rows } = await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, status, queue_position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET
         status = EXCLUDED.status,
         queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position)
       RETURNING *`,
      [req.params.id, req.params.playerId, status, queuePosition]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

// Admin remove um jogador da ata (usado para tirar diarista incluido por engano)
// Retira alguem da lista. Alem do admin, quem convidou pode retirar
// a pessoa que incluiu, caso ela desista.
async function removeConfirmation(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.invited_by_player_id, p.player_type, m.status AS matchday_status
       FROM confirmations c
       JOIN players p ON p.id = c.player_id
       JOIN matchdays m ON m.id = c.matchday_id
       WHERE c.matchday_id = $1 AND c.player_id = $2`,
      [req.params.id, req.params.playerId]
    );
    const entry = rows[0];
    if (!entry) return res.status(404).json({ error: 'Jogador não está nesta lista' });

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      if (entry.player_type === 'mensalista') {
        return res.status(403).json({ error: 'Mensalistas não podem ser retirados da lista' });
      }
      if (entry.invited_by_player_id !== req.user.id) {
        return res.status(403).json({ error: 'Só quem convidou pode retirar esta pessoa' });
      }
      if (entry.matchday_status !== 'open') {
        return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
      }
    }

    await pool.query(
      'DELETE FROM confirmations WHERE matchday_id = $1 AND player_id = $2',
      [req.params.id, req.params.playerId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function nextQueuePosition(client, matchdayId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next FROM confirmations WHERE matchday_id = $1`,
    [matchdayId]
  );
  return rows[0].next;
}

// Jogador confirma presença. Mensalista confirma a qualquer momento ate o fechamento;
// diarista entra na fila por ordem de confirmacao.
async function confirm(req, res, next) {
  const client = await pool.connect();
  try {
    const playerId = req.body.player_id && req.user.role === 'admin' ? req.body.player_id : req.user.id;
    const { invited_by_player_id } = req.body;

    const { rows: playerRows } = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const player = playerRows[0];
    if (!player) return res.status(404).json({ error: 'Jogador não encontrado' });
    if (player.blocked) {
      return res.status(403).json({ error: player.block_reason || 'Cadastro bloqueado' });
    }

    const { rows: matchdayRows } = await client.query(
      'SELECT status FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    if (matchdayRows[0].status !== 'open' && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
    }

    const queuePosition = player.player_type === 'diarista'
      ? await nextQueuePosition(client, req.params.id)
      : null;

    const { rows } = await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET
         status = 'confirmed',
         queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position),
         confirmed_at = now()
       RETURNING *`,
      [req.params.id, playerId, invited_by_player_id || null, queuePosition]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

// Confirma mensalistas/goleiros e completa vagas com diaristas por ordem de fila
async function closeMatchday(matchdayId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mensalistas tem prioridade e podem confirmar ate o fechamento;
    // quem nao confirmou perde a vaga, que passa para a fila de diaristas.
    const { rows: mensalistasConfirmados } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'mensalista' AND c.status = 'confirmed'`,
      [matchdayId]
    );
    const { rows: mensalistasAusentes } = await client.query(
      `UPDATE confirmations c SET status = 'declined'
       FROM players p
       WHERE p.id = c.player_id AND c.matchday_id = $1
         AND p.player_type = 'mensalista' AND c.status = 'pending'
       RETURNING c.id`,
      [matchdayId]
    );

    // Goleiros nao disputam as vagas de linha; quem nao confirmou apenas sai da relacao
    await client.query(
      `UPDATE confirmations c SET status = 'declined'
       FROM players p
       WHERE p.id = c.player_id AND c.matchday_id = $1
         AND p.player_type = 'goleiro' AND c.status = 'pending'`,
      [matchdayId]
    );
    const { rows: goleiros } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'goleiro' AND c.status = 'confirmed'`,
      [matchdayId]
    );

    // Nao existe numero fixo de vagas: cada mensalista que nao confirmou libera a sua
    const { rows: totalMensalistas } = await client.query(
      `SELECT COUNT(*)::int AS total FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'mensalista'`,
      [matchdayId]
    );
    const vagas = Math.max(0, totalMensalistas[0].total - mensalistasConfirmados.length);
    const { rows: diaristas } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'diarista' AND c.status IN ('confirmed', 'waitlist')
       ORDER BY c.queue_position ASC NULLS LAST, c.confirmed_at`,
      [matchdayId]
    );

    const confirmados = diaristas.slice(0, vagas).map((r) => r.id);
    const fila = diaristas.slice(vagas).map((r) => r.id);

    if (confirmados.length) {
      await client.query(`UPDATE confirmations SET status = 'confirmed' WHERE id = ANY($1::int[])`, [confirmados]);
    }
    if (fila.length) {
      await client.query(`UPDATE confirmations SET status = 'waitlist' WHERE id = ANY($1::int[])`, [fila]);
    }

    await client.query(`UPDATE matchdays SET status = 'closed' WHERE id = $1`, [matchdayId]);
    await client.query('COMMIT');
    return {
      mensalistas: mensalistasConfirmados.length,
      mensalistasSemConfirmar: mensalistasAusentes.length,
      goleiros: goleiros.length,
      diaristasConfirmados: confirmados.length,
      fila: fila.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Admin: fecha a lista manualmente (mesma logica do job automatico de sexta 17h)
async function closeList(req, res, next) {
  try {
    const summary = await closeMatchday(req.params.id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

// Admin: sorteia times equilibrados por soma de estrelas (goleiros ficam de fora)
async function drawTeams(req, res, next) {
  try {
    const { numberOfTeams } = req.body;
    const teams = Math.max(2, numberOfTeams || 2);

    const { rows: players } = await pool.query(
      `SELECT p.id, p.stars FROM confirmations c
       JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND c.status = 'confirmed' AND p.player_type != 'goleiro'
       ORDER BY p.stars DESC`,
      [req.params.id]
    );

    const buckets = Array.from({ length: teams }, () => ({ players: [], totalStars: 0 }));
    for (const player of players) {
      const target = buckets.reduce((min, b) => (b.totalStars < min.totalStars ? b : min), buckets[0]);
      target.players.push(player.id);
      target.totalStars += Number(player.stars);
    }

    await pool.query('DELETE FROM teams WHERE matchday_id = $1', [req.params.id]);
    const created = [];
    for (let i = 0; i < buckets.length; i += 1) {
      const { rows } = await pool.query(
        `INSERT INTO teams (matchday_id, name) VALUES ($1, $2) RETURNING id, name`,
        [req.params.id, `Time ${String.fromCharCode(65 + i)}`]
      );
      const team = rows[0];
      for (const playerId of buckets[i].players) {
        await pool.query('INSERT INTO team_players (team_id, player_id) VALUES ($1, $2)', [team.id, playerId]);
      }
      created.push({ ...team, players: buckets[i].players, totalStars: buckets[i].totalStars });
    }

    res.json(created);
  } catch (err) {
    next(err);
  }
}

async function getTeams(req, res, next) {
  try {
    const { rows: teams } = await pool.query(
      'SELECT * FROM teams WHERE matchday_id = $1 ORDER BY name',
      [req.params.id]
    );
    const { rows: teamPlayers } = await pool.query(
      `SELECT tp.team_id, p.id, ${displayNameSql('p')} AS name, p.stars FROM team_players tp
       JOIN players p ON p.id = tp.player_id
       WHERE tp.team_id = ANY($1::int[])`,
      [teams.map((t) => t.id)]
    );
    const result = teams.map((t) => ({
      ...t,
      players: teamPlayers.filter((p) => p.team_id === t.id),
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Admin: move um jogador confirmado para outro time do sorteio
async function moveTeamPlayer(req, res, next) {
  try {
    const { player_id, team_id } = req.body;
    await pool.query(
      `DELETE FROM team_players WHERE player_id = $1
       AND team_id IN (SELECT id FROM teams WHERE matchday_id = $2)`,
      [player_id, req.params.id]
    );
    await pool.query('INSERT INTO team_players (team_id, player_id) VALUES ($1, $2)', [team_id, player_id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await pool.query('DELETE FROM payments WHERE matchday_id = $1', [req.params.id]);
    await pool.query('DELETE FROM matchdays WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const { rows: playerStats } = await pool.query(
      'SELECT * FROM player_match_stats WHERE matchday_id = $1', [req.params.id]
    );
    const { rows: goalkeeperStats } = await pool.query(
      'SELECT * FROM goalkeeper_match_stats WHERE matchday_id = $1', [req.params.id]
    );
    res.json({ playerStats, goalkeeperStats });
  } catch (err) {
    next(err);
  }
}

// Admin: lançamento da súmula pós-jogo (gera multas e diarias automaticamente)
async function submitSummary(req, res, next) {
  const client = await pool.connect();
  try {
    const settings = await getSettings();
    await client.query('BEGIN');
    const { playerStats = [], goalkeeperStats = [], teamResults = [] } = req.body;

    const { rows: matchdayRows } = await client.query(
      'SELECT season_id FROM matchdays WHERE id = $1', [req.params.id]
    );
    const seasonId = matchdayRows[0]?.season_id || null;

    for (const t of teamResults) {
      await client.query(
        'UPDATE teams SET wins = $1, draws = $2, losses = $3 WHERE id = $4 AND matchday_id = $5',
        [Number(t.wins) || 0, Number(t.draws) || 0, Number(t.losses) || 0, t.team_id, req.params.id]
      );
    }

    // Recalcula do zero: reeditar a sumula nao pode duplicar cobrancas
    await client.query(
      `DELETE FROM payments WHERE matchday_id = $1 AND type IN ('multa', 'diaria') AND status = 'pending'`,
      [req.params.id]
    );

    for (const s of playerStats) {
      await client.query(
        `INSERT INTO player_match_stats
           (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET
           team_id = EXCLUDED.team_id, goals = EXCLUDED.goals, assists = EXCLUDED.assists,
           yellow_cards = EXCLUDED.yellow_cards, blue_cards = EXCLUDED.blue_cards,
           red_cards = EXCLUDED.red_cards, absent = EXCLUDED.absent`,
        [req.params.id, s.player_id, s.team_id || null, s.goals || 0, s.assists || 0,
         s.yellow_cards || 0, s.blue_cards || 0, s.red_cards || 0, !!s.absent]
      );

      const { rows: playerRows } = await client.query(
        'SELECT player_type FROM players WHERE id = $1', [s.player_id]
      );
      const playerType = playerRows[0]?.player_type;
      if (playerType === 'goleiro') continue; // goleiros sao isentos de qualquer cobranca

      if (s.absent) {
        // Multa por confirmar presenca e faltar
        await client.query(
          `INSERT INTO payments (player_id, season_id, type, matchday_id, amount, status)
           VALUES ($1, $2, 'multa', $3, $4, 'pending')`,
          [s.player_id, seasonId, req.params.id, settings.absence_fine]
        );
      } else if (playerType === 'diarista') {
        // Diaria de quem efetivamente jogou
        await client.query(
          `INSERT INTO payments (player_id, season_id, type, matchday_id, amount, status)
           VALUES ($1, $2, 'diaria', $3, $4, 'pending')`,
          [s.player_id, seasonId, req.params.id, settings.daily_fee]
        );
      }
    }

    for (const g of goalkeeperStats) {
      await client.query(
        `INSERT INTO goalkeeper_match_stats
           (matchday_id, player_id, wins, draws, losses, penalties_saved, assists, goals, yellow_cards, red_cards)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET
           wins = EXCLUDED.wins, draws = EXCLUDED.draws, losses = EXCLUDED.losses,
           penalties_saved = EXCLUDED.penalties_saved, assists = EXCLUDED.assists, goals = EXCLUDED.goals,
           yellow_cards = EXCLUDED.yellow_cards, red_cards = EXCLUDED.red_cards`,
        [req.params.id, g.player_id, g.wins || 0, g.draws || 0, g.losses || 0,
         g.penalties_saved || 0, g.assists || 0, g.goals || 0, g.yellow_cards || 0, g.red_cards || 0]
      );
    }

    await client.query(`UPDATE matchdays SET status = 'played' WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  create, list, getById, getConfirmations, confirm, closeList, closeMatchday,
  drawTeams, submitSummary, getSummary, getTeams, moveTeamPlayer, rosterPreview, createFromRoster, remove,
  setConfirmation, removeConfirmation, invitePlayer, cancelOwnConfirmation,
};
