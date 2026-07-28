const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');

const PLAYER_FIELDS = `id, first_name, last_name, nickname, ${displayNameSql()} AS name,
  phone, email, photo_url, position, stars, role, player_type, blocked`;

async function list(req, res, next) {
  try {
    const { type, search } = req.query;
    const conditions = [];
    const params = [];

    if (type) {
      params.push(type);
      conditions.push(`player_type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR nickname ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${PLAYER_FIELDS} FROM players ${where} ORDER BY ${displayNameSql()}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT ${PLAYER_FIELDS}, block_reason FROM players WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT ${PLAYER_FIELDS}, block_reason FROM players WHERE id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Jogador edita os proprios dados pessoais
async function updateMe(req, res, next) {
  try {
    const { first_name, last_name, nickname, phone, email, photo_url, position } = req.body;
    const { rows } = await pool.query(
      `UPDATE players SET
         first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         nickname = $3,
         phone = COALESCE($4, phone),
         email = $5,
         photo_url = COALESCE($6, photo_url),
         position = COALESCE($7, position)
       WHERE id = $8
       RETURNING ${PLAYER_FIELDS}`,
      [first_name, last_name, nickname || null, phone, email || null, photo_url, position, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado' });
    }
    next(err);
  }
}

// Admin: cadastro manual de jogador (import inicial)
async function create(req, res, next) {
  try {
    const { first_name, last_name, nickname, phone, email, password, position, stars, player_type } = req.body;
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'Nome e sobrenome são obrigatórios' });
    }

    const passwordHash = await bcrypt.hash(password || Math.random().toString(36).slice(2), 10);
    const { rows } = await pool.query(
      `INSERT INTO players (first_name, last_name, nickname, phone, email, password_hash, position, stars, player_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::numeric, 3), COALESCE($9, 'diarista'))
       RETURNING ${PLAYER_FIELDS}`,
      [first_name, last_name, nickname || null, phone, email || null, passwordHash, position || null, stars, player_type]
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
    const { first_name, last_name, nickname, position, stars, photo_url } = req.body;
    const { rows } = await pool.query(
      `UPDATE players SET
         first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         nickname = COALESCE($3, nickname),
         position = COALESCE($4, position),
         stars = COALESCE($5, stars),
         photo_url = COALESCE($6, photo_url)
       WHERE id = $7
       RETURNING ${PLAYER_FIELDS}`,
      [first_name, last_name, nickname, position, stars, photo_url, req.params.id]
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
       RETURNING id, ${displayNameSql()} AS name, blocked, block_reason`,
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
       RETURNING id, ${displayNameSql()} AS name, player_type`,
      [player_type, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, getMe, updateMe, create, update, setBlock, changeStatus };
