const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

function signToken(player) {
  return jwt.sign(
    { id: player.id, role: player.role, name: player.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function register(req, res, next) {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Nome, telefone e senha são obrigatórios' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO players (name, phone, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, email, role, player_type`,
      [name, phone, email || null, passwordHash]
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
    const { phone, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM players WHERE phone = $1', [phone]);
    const player = rows[0];

    if (!player || !(await bcrypt.compare(password, player.password_hash))) {
      return res.status(401).json({ error: 'Telefone ou senha inválidos' });
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
