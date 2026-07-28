const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');

const PLAYER_FIELDS = `id, first_name, last_name, nickname, ${displayNameSql()} AS name,
  phone, email, photo_url, position, stars, role, player_type`;

function signToken(player) {
  return jwt.sign(
    { id: player.id, role: player.role, name: player.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function register(req, res, next) {
  try {
    const { first_name, last_name, nickname, phone, email, password } = req.body;
    if (!first_name || !last_name || !phone || !password) {
      return res.status(400).json({ error: 'Nome, sobrenome, telefone e senha são obrigatórios' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO players (first_name, last_name, nickname, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${PLAYER_FIELDS}`,
      [first_name, last_name, nickname || null, phone, email || null, passwordHash]
    );

    const player = rows[0];
    res.status(201).json({ player, token: signToken(player) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado' });
    }
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { phone, email, password } = req.body;
    const identifier = phone || email;
    const { rows } = await pool.query(
      `SELECT ${PLAYER_FIELDS}, password_hash, blocked, block_reason
       FROM players WHERE phone = $1 OR email = $1`,
      [identifier]
    );
    const player = rows[0];

    if (!player || !(await bcrypt.compare(password, player.password_hash))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (player.blocked) {
      return res.status(403).json({ error: player.block_reason || 'Cadastro bloqueado' });
    }

    delete player.password_hash;
    res.json({ player, token: signToken(player) });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
