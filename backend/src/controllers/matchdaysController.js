const pool = require('../config/db');

const MAX_CONFIRMED = 20;
const ABSENCE_FINE = 15;

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

async function list(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM matchdays ORDER BY match_date DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getConfirmations(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, p.name, p.player_type, p.stars
       FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1
       ORDER BY c.queue_position NULLS FIRST, c.confirmed_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Jogador confirma presença (mensalista direto, diarista entra na fila)
async function confirm(req, res, next) {
  try {
    const playerId = req.user.id;
    const { invited_by_player_id } = req.body;

    const { rows: playerRows } = await pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const player = playerRows[0];
    if (player.blocked) {
      return res.status(403).json({ error: player.block_reason || 'Cadastro bloqueado' });
    }

    let queuePosition = null;
    if (player.player_type === 'diarista') {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM confirmations WHERE matchday_id = $1 AND queue_position IS NOT NULL`,
        [req.params.id]
      );
      queuePosition = countRows[0].count + 1;
    }

    const { rows } = await pool.query(
      `INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET status = 'pending'
       RETURNING *`,
      [req.params.id, playerId, invited_by_player_id || null, queuePosition]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: fecha a lista, confirma mensalistas e completa vagas com diaristas por ordem de fila
async function closeList(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: mensalistas } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'mensalista'`,
      [req.params.id]
    );
    await client.query(
      `UPDATE confirmations SET status = 'confirmed' WHERE id = ANY($1::int[])`,
      [mensalistas.map((r) => r.id)]
    );

    const vagas = Math.max(0, MAX_CONFIRMED - mensalistas.length);
    const { rows: diaristas } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'diarista'
       ORDER BY c.queue_position ASC`,
      [req.params.id]
    );

    const confirmados = diaristas.slice(0, vagas).map((r) => r.id);
    const fila = diaristas.slice(vagas).map((r) => r.id);

    if (confirmados.length) {
      await client.query(`UPDATE confirmations SET status = 'confirmed' WHERE id = ANY($1::int[])`, [confirmados]);
    }
    if (fila.length) {
      await client.query(`UPDATE confirmations SET status = 'waitlist' WHERE id = ANY($1::int[])`, [fila]);
    }

    await client.query(`UPDATE matchdays SET status = 'closed' WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ mensalistas: mensalistas.length, diaristasConfirmados: confirmados.length, fila: fila.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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

// Admin: lançamento da súmula pós-jogo
async function submitSummary(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { playerStats = [], goalkeeperStats = [], teamResults = [] } = req.body;

    for (const t of teamResults) {
      await client.query('UPDATE teams SET result = $1 WHERE id = $2', [t.result, t.team_id]);
    }

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

      // Multa automática por confirmar e faltar
      if (s.absent) {
        const { rows: seasonRows } = await client.query(
          'SELECT season_id FROM matchdays WHERE id = $1', [req.params.id]
        );
        await client.query(
          `INSERT INTO payments (player_id, season_id, type, matchday_id, amount, status)
           VALUES ($1, $2, 'multa', $3, $4, 'pending')`,
          [s.player_id, seasonRows[0].season_id, req.params.id, ABSENCE_FINE]
        );
      }
    }

    for (const g of goalkeeperStats) {
      await client.query(
        `INSERT INTO goalkeeper_match_stats
           (matchday_id, player_id, opponent_team_id, result, penalties_saved, assists, goals)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET
           opponent_team_id = EXCLUDED.opponent_team_id, result = EXCLUDED.result,
           penalties_saved = EXCLUDED.penalties_saved, assists = EXCLUDED.assists, goals = EXCLUDED.goals`,
        [req.params.id, g.player_id, g.opponent_team_id || null, g.result, g.penalties_saved || 0,
         g.assists || 0, g.goals || 0]
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

module.exports = { create, list, getConfirmations, confirm, closeList, drawTeams, submitSummary };
