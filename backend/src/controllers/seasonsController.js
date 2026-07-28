const pool = require('../config/db');

async function list(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM seasons ORDER BY year DESC');
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

module.exports = { list, create };
