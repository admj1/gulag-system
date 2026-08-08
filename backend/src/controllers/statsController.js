const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');

// Numeros completos de um jogador: usados na pagina dele e na comparacao 1x1
async function playerSummary(id) {
  const { rows: totals } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE NOT absent) AS peladas_jogadas,
       COALESCE(SUM(goals), 0) AS goals,
       COALESCE(SUM(assists), 0) AS assists,
       COALESCE(SUM(yellow_cards), 0) AS yellow_cards,
       COALESCE(SUM(blue_cards), 0) AS blue_cards,
       COALESCE(SUM(red_cards), 0) AS red_cards,
       COUNT(*) FILTER (WHERE absent) AS absences
     FROM player_match_stats WHERE player_id = $1`,
    [id]
  );

  const { rows: goalkeeperTotals } = await pool.query(
    `SELECT
       COALESCE(SUM(wins), 0) AS wins,
       COALESCE(SUM(losses), 0) AS losses,
       COALESCE(SUM(draws), 0) AS draws,
       COALESCE(SUM(penalties_saved), 0) AS penalties_saved,
       COALESCE(SUM(assists), 0) AS assists,
       COALESCE(SUM(goals), 0) AS goals,
       COALESCE(SUM(yellow_cards), 0) AS yellow_cards,
       COALESCE(SUM(red_cards), 0) AS red_cards
     FROM goalkeeper_match_stats WHERE player_id = $1`,
    [id]
  );

  // Artilheiro e garcom do dia: quem fez mais gols / mais assistencias na pelada.
  // Empate divide o titulo, entao todos os empatados no topo levam o dia.
  const { rows: titles } = await pool.query(
    `WITH por_dia AS (
       SELECT player_id, goals, assists,
              MAX(goals) OVER (PARTITION BY matchday_id) AS max_goals,
              MAX(assists) OVER (PARTITION BY matchday_id) AS max_assists
       FROM player_match_stats
       WHERE NOT absent
     )
     SELECT
       COUNT(*) FILTER (WHERE goals > 0 AND goals = max_goals)::int AS top_scorer_days,
       COUNT(*) FILTER (WHERE assists > 0 AND assists = max_assists)::int AS top_assist_days
     FROM por_dia WHERE player_id = $1`,
    [id]
  );

  const collective = await collectiveTotals(id);

  return {
    totals: { ...totals[0], ...titles[0] },
    goalkeeperTotals: goalkeeperTotals[0],
    collective,
  };
}

async function playerProfile(req, res, next) {
  try {
    res.json(await playerSummary(req.params.id));
  } catch (err) {
    next(err);
  }
}

// Melhor time do dia: mais vitorias e, no empate, menos derrotas.
// Dias com empate total na lideranca nao contam para ninguem.
const BEST_TEAM_SQL = `
  WITH jogados AS (
    SELECT * FROM teams WHERE wins + draws + losses > 0
  ),
  mais_vitorias AS (
    SELECT matchday_id, MAX(wins) AS w FROM jogados GROUP BY matchday_id
  ),
  candidatos AS (
    SELECT j.* FROM jogados j
    JOIN mais_vitorias mv ON mv.matchday_id = j.matchday_id AND j.wins = mv.w
  ),
  menos_derrotas AS (
    SELECT matchday_id, MIN(losses) AS l FROM candidatos GROUP BY matchday_id
  ),
  campeoes AS (
    SELECT c.* FROM candidatos c
    JOIN menos_derrotas md ON md.matchday_id = c.matchday_id AND c.losses = md.l
  )
  SELECT * FROM campeoes camp
  WHERE (SELECT COUNT(*) FROM campeoes c2 WHERE c2.matchday_id = camp.matchday_id) = 1
`;

// Goleiro do dia: mais vitorias na pelada; empate desempata por menos derrotas
// e depois por mais penaltis defendidos. RANK deixa os empatados todos em 1o.
// Vale como "time da pelada": o goleiro nao e alocado em time nenhum, entao sem
// isso ele nunca pontuaria no coletivo.
const GOLEIRO_DO_DIA_SQL = `
  SELECT matchday_id, player_id FROM (
    SELECT matchday_id, player_id, wins,
           RANK() OVER (
             PARTITION BY matchday_id
             ORDER BY wins DESC, losses ASC, penalties_saved DESC
           ) AS posicao
    FROM goalkeeper_match_stats
    WHERE wins + draws + losses > 0
  ) ranqueado
  WHERE posicao = 1 AND wins > 0
`;

async function collectiveTotals(playerId) {
  const { rows: totals } = await pool.query(
    `SELECT
       COUNT(DISTINCT t.matchday_id)::int AS peladas,
       COALESCE(SUM(t.wins), 0)::int AS wins,
       COALESCE(SUM(t.draws), 0)::int AS draws,
       COALESCE(SUM(t.losses), 0)::int AS losses
     FROM team_players tp
     JOIN teams t ON t.id = tp.team_id
     WHERE tp.player_id = $1`,
    [playerId]
  );

  const { rows: best } = await pool.query(
    `WITH campeoes AS (${BEST_TEAM_SQL}), goleiros AS (${GOLEIRO_DO_DIA_SQL})
     SELECT (
       (SELECT COUNT(*) FROM campeoes c
        JOIN team_players tp ON tp.team_id = c.id
        WHERE tp.player_id = $1)
       + (SELECT COUNT(*) FROM goleiros g WHERE g.player_id = $1)
     )::int AS vezes`,
    [playerId]
  );

  // Parceiros de time: com quem mais ganhou e com quem mais perdeu
  const { rows: mates } = await pool.query(
    `SELECT companheiro.id,
            ${displayNameSql('companheiro')} AS name,
            SUM(t.wins)::int AS wins,
            SUM(t.draws)::int AS draws,
            SUM(t.losses)::int AS losses,
            SUM(t.wins + t.draws + t.losses)::int AS total
     FROM team_players tp
     JOIN teams t ON t.id = tp.team_id
     JOIN team_players tp2 ON tp2.team_id = tp.team_id AND tp2.player_id <> tp.player_id
     JOIN players companheiro ON companheiro.id = tp2.player_id
     WHERE tp.player_id = $1 AND t.wins + t.draws + t.losses > 0
     GROUP BY companheiro.id, companheiro.nickname, companheiro.first_name, companheiro.last_name
     HAVING SUM(t.wins + t.draws + t.losses) > 0`,
    [playerId]
  );

  const withPct = mates.map((m) => ({
    ...m,
    winPct: Math.round((m.wins / m.total) * 100),
    lossPct: Math.round((m.losses / m.total) * 100),
  }));

  const bestMate = [...withPct].sort((a, b) => b.wins - a.wins || b.winPct - a.winPct)[0] || null;
  const worstMate = [...withPct].sort((a, b) => b.losses - a.losses || b.lossPct - a.lossPct)[0] || null;

  return {
    ...totals[0],
    bestTeamCount: best[0].vezes,
    bestMate,
    worstMate,
  };
}

// Retrospecto entre dois jogadores. Cada um esta num unico time por pelada, entao
// o dia e ou "mesmo time" ou "times adversarios" — nunca os dois.
//
// Nos dias em lados opostos nao da para dizer quem ganhou o confronto direto: a ata
// guarda quantas vitorias cada time fez no dia inteiro, nao partida a partida. Por
// isso comparamos como cada time TERMINOU o dia (mais vitorias, desempate por menos
// derrotas, a mesma regra do melhor time do dia) e contamos os dias de cada um.
async function headToHead(a, b) {
  const { rows } = await pool.query(
    `WITH lado_a AS (
       SELECT t.matchday_id, t.id AS team_id, t.wins, t.draws, t.losses
       FROM team_players tp JOIN teams t ON t.id = tp.team_id
       WHERE tp.player_id = $1 AND t.wins + t.draws + t.losses > 0
     ), lado_b AS (
       SELECT t.matchday_id, t.id AS team_id, t.wins, t.draws, t.losses
       FROM team_players tp JOIN teams t ON t.id = tp.team_id
       WHERE tp.player_id = $2 AND t.wins + t.draws + t.losses > 0
     ), dias AS (
       SELECT a.team_id = b.team_id AS mesmo_time,
              a.wins AS a_wins, a.draws AS a_draws, a.losses AS a_losses,
              b.wins AS b_wins, b.losses AS b_losses
       FROM lado_a a JOIN lado_b b ON b.matchday_id = a.matchday_id
     )
     SELECT
       COUNT(*) FILTER (WHERE mesmo_time)::int AS peladas_juntos,
       COALESCE(SUM(a_wins) FILTER (WHERE mesmo_time), 0)::int AS juntos_wins,
       COALESCE(SUM(a_draws) FILTER (WHERE mesmo_time), 0)::int AS juntos_draws,
       COALESCE(SUM(a_losses) FILTER (WHERE mesmo_time), 0)::int AS juntos_losses,
       COUNT(*) FILTER (WHERE NOT mesmo_time)::int AS peladas_adversarios,
       COUNT(*) FILTER (WHERE NOT mesmo_time
         AND (a_wins > b_wins OR (a_wins = b_wins AND a_losses < b_losses)))::int AS a_dias_melhores,
       COUNT(*) FILTER (WHERE NOT mesmo_time
         AND (b_wins > a_wins OR (b_wins = a_wins AND b_losses < a_losses)))::int AS b_dias_melhores,
       COUNT(*) FILTER (WHERE NOT mesmo_time
         AND a_wins = b_wins AND a_losses = b_losses)::int AS dias_iguais
     FROM dias`,
    [a, b]
  );
  return rows[0];
}

// Comparacao 1x1: os numeros dos dois lado a lado, mais o retrospecto entre eles
async function comparePlayers(req, res, next) {
  try {
    const a = Number(req.query.a);
    const b = Number(req.query.b);
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      return res.status(400).json({ error: 'Escolha os dois jogadores' });
    }
    if (a === b) {
      return res.status(400).json({ error: 'Escolha dois jogadores diferentes' });
    }

    const { rows: players } = await pool.query(
      `SELECT id, ${displayNameSql()} AS name, photo_url, position, player_type, stars
       FROM players WHERE id = ANY($1::int[])`,
      [[a, b]]
    );
    const playerA = players.find((p) => p.id === a);
    const playerB = players.find((p) => p.id === b);
    if (!playerA || !playerB) return res.status(404).json({ error: 'Jogador não encontrado' });

    const [statsA, statsB, confronto] = await Promise.all([
      playerSummary(a), playerSummary(b), headToHead(a, b),
    ]);

    res.json({
      a: { player: playerA, ...statsA },
      b: { player: playerB, ...statsB },
      headToHead: confronto,
    });
  } catch (err) {
    next(err);
  }
}

// Sugestao de estrelas: o sistema so recomenda, quem decide e o admin.
// Janela curta e proposital — estrela e sobre a fase atual, nao sobre a carreira.
const SUGGESTION_WINDOW = 10; // ultimas peladas de cada jogador
const MIN_PELADAS = 4;        // abaixo disso nao da para concluir nada
const STEP = 0.5;             // a sugestao anda meia estrela por vez
const MIN_STARS = 1;
const MAX_STARS = 5;

// Posicao do jogador dentro do elenco, de 0 a 100. Empate divide a posicao,
// para quem esta na media nao ser jogado para um dos extremos.
function percentile(value, values) {
  if (values.length < 2) return 50;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return ((below + equal / 2) / values.length) * 100;
}

// Faixa de estrelas esperada para quem esta naquele patamar do elenco
function expectedStars(score) {
  if (score >= 85) return 4.5;
  if (score >= 65) return 4;
  if (score >= 35) return 3.5;
  if (score >= 15) return 3;
  return 2.5;
}

async function starSuggestions(req, res, next) {
  try {
    const { rows } = await pool.query(
      `WITH recentes AS (
         SELECT s.player_id, s.goals, s.assists, s.team_id, m.match_date,
                ROW_NUMBER() OVER (PARTITION BY s.player_id ORDER BY m.match_date DESC) AS rn
         FROM player_match_stats s
         JOIN matchdays m ON m.id = s.matchday_id
         WHERE NOT s.absent
       )
       SELECT p.id, ${displayNameSql('p')} AS name, p.player_type, p.stars,
              COUNT(*)::int AS peladas,
              MIN(j.match_date) AS desde,
              COALESCE(SUM(j.goals), 0)::int AS goals,
              COALESCE(SUM(j.assists), 0)::int AS assists,
              COALESCE(SUM(t.wins), 0)::int AS wins,
              COALESCE(SUM(t.draws), 0)::int AS draws,
              COALESCE(SUM(t.losses), 0)::int AS losses
       FROM recentes j
       JOIN players p ON p.id = j.player_id
       LEFT JOIN teams t ON t.id = j.team_id
       WHERE j.rn <= $1 AND p.active AND p.player_type <> 'goleiro'
       GROUP BY p.id, p.nickname, p.first_name, p.last_name, p.player_type, p.stars`,
      [SUGGESTION_WINDOW]
    );

    const avaliados = rows
      .filter((r) => r.peladas >= MIN_PELADAS)
      .map((r) => {
        const jogos = r.wins + r.draws + r.losses;
        return {
          ...r,
          stars: Number(r.stars),
          // Participacao direta em gol por pelada e aproveitamento do time (pontos corridos)
          contribution: (r.goals + r.assists) / r.peladas,
          winPct: jogos > 0 ? ((r.wins * 3 + r.draws) / (jogos * 3)) * 100 : null,
        };
      });

    const contributions = avaliados.map((r) => r.contribution);
    const winPcts = avaliados.filter((r) => r.winPct !== null).map((r) => r.winPct);
    const mediaContribuicao = contributions.length
      ? contributions.reduce((sum, v) => sum + v, 0) / contributions.length
      : 0;

    const suggestions = [];
    for (const player of avaliados) {
      const pAtaque = percentile(player.contribution, contributions);
      const pColetivo = player.winPct === null ? pAtaque : percentile(player.winPct, winPcts);
      // O que o jogador faz pesa mais que o resultado do time, que depende dos outros
      const score = pAtaque * 0.6 + pColetivo * 0.4;
      const alvo = expectedStars(score);

      // Só sugere quando a diferenca passa de meia estrela, e anda um passo por vez
      if (Math.abs(alvo - player.stars) < STEP) continue;
      const direction = alvo > player.stars ? 'up' : 'down';
      const suggested = Math.min(MAX_STARS, Math.max(MIN_STARS,
        player.stars + (direction === 'up' ? STEP : -STEP)));
      if (suggested === player.stars) continue;

      suggestions.push({
        id: player.id,
        name: player.name,
        player_type: player.player_type,
        current_stars: player.stars,
        suggested_stars: suggested,
        direction,
        peladas: player.peladas,
        desde: player.desde,
        goals: player.goals,
        assists: player.assists,
        contribution: Number(player.contribution.toFixed(2)),
        win_pct: player.winPct === null ? null : Math.round(player.winPct),
        rank_pct: Math.round(score),
      });
    }

    suggestions.sort((a, b) => Math.abs(b.rank_pct - 50) - Math.abs(a.rank_pct - 50));

    res.json({
      suggestions,
      window: SUGGESTION_WINDOW,
      evaluated: avaliados.length,
      skipped: rows.length - avaliados.length,
      minMatches: MIN_PELADAS,
      averageContribution: Number(mediaContribuicao.toFixed(2)),
    });
  } catch (err) {
    next(err);
  }
}

function periodFilter({ month, year, seasonId }, startIndex) {
  const conditions = [];
  const params = [];
  let i = startIndex;

  if (seasonId) {
    params.push(seasonId);
    conditions.push(`m.season_id = $${i++}`);
  }
  if (year) {
    params.push(year);
    conditions.push(`EXTRACT(YEAR FROM m.match_date) = $${i++}`);
  }
  if (month) {
    params.push(month);
    conditions.push(`EXTRACT(MONTH FROM m.match_date) = $${i++}`);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

// Recordes e curiosidades de todo o periodo registrado. Empate entra todo
// mundo: se dois fizeram 7 gols no mesmo dia, os dois sao o recorde.
async function curiosities(req, res, next) {
  try {
    // Recorde num unico dia, para a coluna informada
    const recordeDoDia = async (expressao) => {
      const { rows } = await pool.query(
        `WITH valores AS (
           SELECT s.player_id, ${expressao} AS valor, m.match_date
           FROM player_match_stats s
           JOIN matchdays m ON m.id = s.matchday_id
           WHERE NOT s.absent
         )
         SELECT v.valor::int AS value, v.match_date, ${displayNameSql('p')} AS name, p.id
         FROM valores v
         JOIN players p ON p.id = v.player_id
         WHERE v.valor = (SELECT MAX(valor) FROM valores) AND v.valor > 0
         ORDER BY v.match_date DESC, ${displayNameSql('p')}`
      );
      return rows.length ? { value: rows[0].value, entries: rows } : null;
    };

    // Quem mais vezes ficou no topo do dia (artilheiro/garcom)
    const maisVezesNoTopo = async (coluna) => {
      const { rows } = await pool.query(
        `WITH por_dia AS (
           SELECT player_id, ${coluna} AS valor,
                  MAX(${coluna}) OVER (PARTITION BY matchday_id) AS melhor
           FROM player_match_stats WHERE NOT absent
         ),
         contagem AS (
           SELECT player_id, COUNT(*)::int AS vezes
           FROM por_dia WHERE valor > 0 AND valor = melhor
           GROUP BY player_id
         )
         SELECT c.vezes AS value, ${displayNameSql('p')} AS name, p.id
         FROM contagem c JOIN players p ON p.id = c.player_id
         WHERE c.vezes = (SELECT MAX(vezes) FROM contagem)
         ORDER BY ${displayNameSql('p')}`
      );
      return rows.length ? { value: rows[0].value, entries: rows } : null;
    };

    const [topScorerDay, topAssistDay, topCardsDay, topScorerTitles, topAssistTitles] =
      await Promise.all([
        recordeDoDia('s.goals'),
        recordeDoDia('s.assists'),
        recordeDoDia('s.yellow_cards + s.blue_cards + s.red_cards'),
        maisVezesNoTopo('goals'),
        maisVezesNoTopo('assists'),
      ]);

    // Mais vezes no melhor time do dia
    const { rows: campeoes } = await pool.query(
      `WITH campeoes AS (${BEST_TEAM_SQL}),
       goleiros AS (${GOLEIRO_DO_DIA_SQL}),
       contagem AS (
         SELECT player_id, COUNT(*)::int AS vezes FROM (
           SELECT tp.player_id FROM campeoes c JOIN team_players tp ON tp.team_id = c.id
           UNION ALL
           SELECT player_id FROM goleiros
         ) juntos
         GROUP BY player_id
       )
       SELECT c.vezes AS value, ${displayNameSql('p')} AS name, p.id
       FROM contagem c JOIN players p ON p.id = c.player_id
       WHERE c.vezes = (SELECT MAX(vezes) FROM contagem)
       ORDER BY ${displayNameSql('p')}`
    );

    res.json({
      topScorerDay,
      topAssistDay,
      topCardsDay,
      bestTeamTitles: campeoes.length ? { value: campeoes[0].value, entries: campeoes } : null,
      topScorerTitles,
      topAssistTitles,
    });
  } catch (err) {
    next(err);
  }
}

// Periodos que realmente tem sumula lancada, para o filtro dos rankings nao
// oferecer mes e ano vazios.
async function rankingPeriods(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT
         EXTRACT(YEAR FROM m.match_date)::int AS year,
         EXTRACT(MONTH FROM m.match_date)::int AS month
       FROM matchdays m
       WHERE EXISTS (SELECT 1 FROM player_match_stats s WHERE s.matchday_id = m.id)
          OR EXISTS (SELECT 1 FROM goalkeeper_match_stats g WHERE g.matchday_id = m.id)
       ORDER BY year DESC, month DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function rankings(req, res, next) {
  try {
    const filter = {
      seasonId: req.query.seasonId || null,
      year: req.query.year || null,
      month: req.query.month || null,
    };
    const { where, params } = periodFilter(filter, 1);

    const { rows: topScorers } = await pool.query(
      `SELECT p.id, ${displayNameSql('p')} AS name, SUM(s.goals)::int AS goals
       FROM player_match_stats s
       JOIN players p ON p.id = s.player_id
       JOIN matchdays m ON m.id = s.matchday_id
       ${where}
       GROUP BY p.id, p.nickname, p.first_name, p.last_name
       HAVING SUM(s.goals) > 0
       ORDER BY goals DESC LIMIT 10`,
      params
    );

    const { rows: topAssists } = await pool.query(
      `SELECT p.id, ${displayNameSql('p')} AS name, SUM(s.assists)::int AS assists
       FROM player_match_stats s
       JOIN players p ON p.id = s.player_id
       JOIN matchdays m ON m.id = s.matchday_id
       ${where}
       GROUP BY p.id, p.nickname, p.first_name, p.last_name
       HAVING SUM(s.assists) > 0
       ORDER BY assists DESC LIMIT 10`,
      params
    );

    const { rows: topGoalkeepers } = await pool.query(
      `SELECT p.id, ${displayNameSql('p')} AS name,
              SUM(g.wins)::int AS wins,
              SUM(g.penalties_saved)::int AS penalties_saved
       FROM goalkeeper_match_stats g
       JOIN players p ON p.id = g.player_id
       JOIN matchdays m ON m.id = g.matchday_id
       ${where}
       GROUP BY p.id, p.nickname, p.first_name, p.last_name
       ORDER BY wins DESC, penalties_saved DESC LIMIT 10`,
      params
    );

    res.json({ topScorers, topAssists, topGoalkeepers });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  playerProfile, rankings, rankingPeriods, curiosities, comparePlayers, starSuggestions,
};
