const pool = require('../config/db');

async function list(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM seasons ORDER BY year DESC, id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, year, start_date, end_date } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO seasons (name, year, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, year, start_date, end_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { name, year, start_date, end_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE seasons SET
         name = COALESCE($1, name),
         year = COALESCE($2, year),
         start_date = COALESCE($3, start_date),
         end_date = $4
       WHERE id = $5 RETURNING *`,
      [name, year, start_date, end_date || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Temporada não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM matchdays WHERE season_id = $1',
      [req.params.id]
    );
    if (rows[0].count > 0) {
      return res.status(409).json({ error: `Temporada possui ${rows[0].count} pelada(s) e não pode ser apagada` });
    }
    await pool.query('DELETE FROM seasons WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
