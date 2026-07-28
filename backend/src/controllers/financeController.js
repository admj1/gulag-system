const pool = require('../config/db');

const MONTHLY_FEE = 50;
const DAILY_FEE = 15;

async function listPending(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT pay.*, p.name FROM payments pay
       JOIN players p ON p.id = pay.player_id
       WHERE pay.status = 'pending'
       ORDER BY p.name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function historyByPlayer(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM payments WHERE player_id = $1 ORDER BY created_at DESC`,
      [req.params.playerId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function markPaid(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE payments SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cobrança não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: gera a mensalidade do mês para todos os mensalistas ativos
async function generateMonthlyFees(req, res, next) {
  try {
    const { season_id, month, year } = req.body;
    const { rows: mensalistas } = await pool.query(
      `SELECT id FROM players WHERE player_type = 'mensalista'`
    );

    const created = [];
    for (const p of mensalistas) {
      const { rows } = await pool.query(
        `INSERT INTO payments (player_id, season_id, type, reference_month, reference_year, amount, status)
         VALUES ($1, $2, 'mensalidade', $3, $4, $5, 'pending')
         RETURNING *`,
        [p.id, season_id, month, year, MONTHLY_FEE]
      );
      created.push(rows[0]);
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

// Admin: lança diária para diaristas que jogaram na rodada
async function chargeDailyFee(req, res, next) {
  try {
    const { season_id } = req.body;
    const { rows: diaristas } = await pool.query(
      `SELECT c.player_id FROM confirmations c
       JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND c.status = 'confirmed' AND p.player_type = 'diarista'`,
      [req.params.matchdayId]
    );

    const created = [];
    for (const d of diaristas) {
      const { rows } = await pool.query(
        `INSERT INTO payments (player_id, season_id, type, matchday_id, amount, status)
         VALUES ($1, $2, 'diaria', $3, $4, 'pending')
         RETURNING *`,
        [d.player_id, season_id, req.params.matchdayId, DAILY_FEE]
      );
      created.push(rows[0]);
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

module.exports = { listPending, historyByPlayer, markPaid, generateMonthlyFees, chargeDailyFee };
