const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');

async function playerProfile(req, res, next) {
  try {
    const { id } = req.params;

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

    const teamTotals = await collectiveTotals(id);

    res.json({
      totals: totals[0],
      goalkeeperTotals: goalkeeperTotals[0],
      collective: teamTotals,
    });
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
    `WITH campeoes AS (${BEST_TEAM_SQL})
     SELECT COUNT(*)::int AS vezes
     FROM campeoes c
     JOIN team_players tp ON tp.team_id = c.id
     WHERE tp.player_id = $1`,
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

module.exports = { playerProfile, rankings };
