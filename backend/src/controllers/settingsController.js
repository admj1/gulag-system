const pool = require('../config/db');

async function get(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { monthly_fee, daily_fee, absence_fine, match_time } = req.body;
    const { rows } = await pool.query(
      `UPDATE settings SET
         monthly_fee = COALESCE($1, monthly_fee),
         daily_fee = COALESCE($2, daily_fee),
         absence_fine = COALESCE($3, absence_fine),
         match_time = COALESCE($4::time, match_time)
       WHERE id = 1 RETURNING *`,
      [monthly_fee, daily_fee, absence_fine, match_time]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
