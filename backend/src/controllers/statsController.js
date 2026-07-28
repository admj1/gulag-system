const pool = require('../config/db');

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
         COUNT(*) FILTER (WHERE result = 'win') AS wins,
         COUNT(*) FILTER (WHERE result = 'loss') AS losses,
         COUNT(*) FILTER (WHERE result = 'draw') AS draws,
         COALESCE(SUM(penalties_saved), 0) AS penalties_saved,
         COALESCE(SUM(assists), 0) AS assists,
         COALESCE(SUM(goals), 0) AS goals
       FROM goalkeeper_match_stats WHERE player_id = $1`,
      [id]
    );

    res.json({ totals: totals[0], goalkeeperTotals: goalkeeperTotals[0] });
  } catch (err) {
    next(err);
  }
}

async function rankings(req, res, next) {
  try {
    const { seasonId } = req.query;
    const seasonFilter = seasonId ? 'WHERE m.season_id = $1' : '';
    const params = seasonId ? [seasonId] : [];

    const { rows: topScorers } = await pool.query(
      `SELECT p.id, p.name, SUM(s.goals) AS goals
       FROM player_match_stats s
       JOIN players p ON p.id = s.player_id
       JOIN matchdays m ON m.id = s.matchday_id
       ${seasonFilter}
       GROUP BY p.id, p.name ORDER BY goals DESC LIMIT 10`,
      params
    );

    const { rows: topAssists } = await pool.query(
      `SELECT p.id, p.name, SUM(s.assists) AS assists
       FROM player_match_stats s
       JOIN players p ON p.id = s.player_id
       JOIN matchdays m ON m.id = s.matchday_id
       ${seasonFilter}
       GROUP BY p.id, p.name ORDER BY assists DESC LIMIT 10`,
      params
    );

    res.json({ topScorers, topAssists });
  } catch (err) {
    next(err);
  }
}

module.exports = { playerProfile, rankings };
