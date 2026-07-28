const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function list(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, email, photo_url, position, stars, role, player_type, blocked
       FROM players ORDER BY name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, email, photo_url, position, stars, role, player_type, blocked, block_reason
       FROM players WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: cadastro manual de jogador (import inicial)
async function create(req, res, next) {
  try {
    const { name, phone, email, password, position, stars, player_type } = req.body;
    const passwordHash = await bcrypt.hash(password || Math.random().toString(36).slice(2), 10);
    const { rows } = await pool.query(
      `INSERT INTO players (name, phone, email, password_hash, position, stars, player_type)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 3), COALESCE($7, 'diarista'))
       RETURNING id, name, phone, email, position, stars, player_type`,
      [name, phone, email || null, passwordHash, position || null, stars, player_type]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado' });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { name, position, stars, photo_url } = req.body;
    const { rows } = await pool.query(
      `UPDATE players SET
         name = COALESCE($1, name),
         position = COALESCE($2, position),
         stars = COALESCE($3, stars),
         photo_url = COALESCE($4, photo_url)
       WHERE id = $5
       RETURNING id, name, phone, email, photo_url, position, stars, role, player_type`,
      [name, position, stars, photo_url, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: bloqueio por débito ou suspensão disciplinar
async function setBlock(req, res, next) {
  try {
    const { blocked, block_reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE players SET blocked = $1, block_reason = $2 WHERE id = $3
       RETURNING id, name, blocked, block_reason`,
      [blocked, blocked ? block_reason : null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: promove a mensalista ou rebaixa a diarista, com data de início/fim registrada no histórico
async function changeStatus(req, res, next) {
  try {
    const { player_type, start_date } = req.body;
    if (!['mensalista', 'diarista', 'goleiro'].includes(player_type)) {
      return res.status(400).json({ error: 'player_type inválido' });
    }

    await pool.query(
      `UPDATE player_status_history SET end_date = $1
       WHERE player_id = $2 AND end_date IS NULL`,
      [start_date, req.params.id]
    );

    await pool.query(
      `INSERT INTO player_status_history (player_id, player_type, start_date)
       VALUES ($1, $2, $3)`,
      [req.params.id, player_type, start_date]
    );

    const { rows } = await pool.query(
      `UPDATE players SET player_type = $1 WHERE id = $2
       RETURNING id, name, player_type`,
      [player_type, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setBlock, changeStatus };
