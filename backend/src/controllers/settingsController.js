const pool = require('../config/db');
const { DEFAULT_INVITE_HTML } = require('../services/mailer');

async function get(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
    // O modelo padrao vai junto para a tela poder mostrar/restaurar
    res.json({ ...rows[0], invite_html_default: DEFAULT_INVITE_HTML });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { monthly_fee, daily_fee, absence_fine, match_time, invite_html } = req.body;
    const { rows } = await pool.query(
      `UPDATE settings SET
         monthly_fee = COALESCE($1, monthly_fee),
         daily_fee = COALESCE($2, daily_fee),
         absence_fine = COALESCE($3, absence_fine),
         match_time = COALESCE($4::time, match_time),
         -- Campo em branco volta ao modelo padrao; nao informado mantem o que esta
         invite_html = CASE WHEN $5::boolean THEN NULLIF(TRIM($6::text), '') ELSE invite_html END
       WHERE id = 1 RETURNING *`,
      [monthly_fee, daily_fee, absence_fine, match_time,
       invite_html !== undefined, invite_html ?? null]
    );
    res.json({ ...rows[0], invite_html_default: DEFAULT_INVITE_HTML });
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update };
