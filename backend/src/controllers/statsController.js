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
              COUNT(*) FILTER (WHERE g.result = 'win')::int AS wins,
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
