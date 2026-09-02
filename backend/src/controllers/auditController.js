const pool = require('../config/db');

// Historico de acoes destrutivas/sensiveis, mais recentes primeiro.
async function list(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const { rows } = await pool.query(
      `SELECT id, actor_id, actor_name, action, target_type, target_id, target_label,
              details, created_at
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: totalRows } = await pool.query('SELECT COUNT(*)::int AS total FROM audit_log');

    res.json({ entries: rows, total: totalRows[0].total });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
