const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');

const PLAYER_FIELDS = `id, first_name, last_name, nickname, ${displayNameSql()} AS name,
  phone, email, photo_url, position, stars, role, player_type, is_owner, active`;

function signToken(player) {
  return jwt.sign(
    { id: player.id, role: player.role, name: player.name },
    process.env.JWT_SECRET,
    { expiresIn: '3d' }
  );
}

async function register(req, res, next) {
  try {
    const { first_name, last_name, nickname, phone, email, password } = req.body;
    if (!first_name || !last_name || !phone || !password) {
      return res.status(400).json({ error: 'Nome, sobrenome, telefone e senha são obrigatórios' });
    }

    // Telefone ja cadastrado normalmente significa que o organizador
    // ja importou a pessoa; o caminho e recuperar a senha, nao criar outra conta.
    const { rows: existing } = await pool.query(
      `SELECT phone, email FROM players WHERE phone = $1 OR (email IS NOT NULL AND email = $2)`,
      [phone, email || null]
    );
    if (existing[0]) {
      const porTelefone = existing.some((p) => p.phone === phone);
      return res.status(409).json({
        error: porTelefone
          ? 'Este telefone já está cadastrado. Peça ao organizador para cadastrar uma nova senha para você.'
          : 'Este e-mail já está cadastrado. Peça ao organizador para cadastrar uma nova senha para você.',
        code: porTelefone ? 'phone_taken' : 'email_taken',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO players (first_name, last_name, nickname, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${PLAYER_FIELDS}`,
      [first_name, last_name, nickname || null, phone, email || null, passwordHash]
    );

    let player = rows[0];

    // Banco novo: o primeiro cadastro assume como dono, senao ninguem
    // conseguiria promover administradores depois.
    const { rows: promoted } = await pool.query(
      `UPDATE players SET role = 'admin', is_owner = TRUE
       WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM players WHERE is_owner AND id <> $1)
         AND NOT EXISTS (SELECT 1 FROM players WHERE role = 'admin' AND id <> $1)
       RETURNING ${PLAYER_FIELDS}`,
      [player.id]
    );
    if (promoted[0]) player = promoted[0];

    res.status(201).json({ player, token: signToken(player) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Telefone ou e-mail já cadastrado. Peça ao organizador para cadastrar uma nova senha para você.',
        code: 'phone_taken',
      });
    }
    next(err);
  }
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKED_MESSAGE = 'Senha bloqueada por tentativas erradas. '
  + 'Fale com o organizador para cadastrar uma nova senha.';

async function login(req, res, next) {
  try {
    const { phone, email, password } = req.body;
    const identifier = phone || email;
    const { rows } = await pool.query(
      `SELECT ${PLAYER_FIELDS}, password_hash, blocked, block_reason,
              failed_login_attempts, login_locked
       FROM players WHERE phone = $1 OR email = $1`,
      [identifier]
    );
    const player = rows[0];

    // Mensagem generica quando nao existe, para nao revelar quem esta cadastrado
    if (!player) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    if (player.login_locked) {
      return res.status(423).json({ error: LOCKED_MESSAGE, code: 'login_locked' });
    }

    if (!(await bcrypt.compare(password, player.password_hash))) {
      const attempts = player.failed_login_attempts + 1;
      const lock = attempts >= MAX_LOGIN_ATTEMPTS;
      await pool.query(
        'UPDATE players SET failed_login_attempts = $1, login_locked = $2 WHERE id = $3',
        [attempts, lock, player.id]
      );
      if (lock) {
        return res.status(423).json({ error: LOCKED_MESSAGE, code: 'login_locked' });
      }
      return res.status(401).json({
        error: 'Credenciais inválidas',
        remainingAttempts: MAX_LOGIN_ATTEMPTS - attempts,
      });
    }

    if (!player.active) {
      return res.status(403).json({ error: 'Cadastro inativo. Procure o organizador.' });
    }
    if (player.blocked) {
      return res.status(403).json({ error: player.block_reason || 'Cadastro bloqueado' });
    }

    // Acertou: zera o contador
    if (player.failed_login_attempts > 0) {
      await pool.query(
        'UPDATE players SET failed_login_attempts = 0 WHERE id = $1', [player.id]
      );
    }

    delete player.password_hash;
    delete player.failed_login_attempts;
    delete player.login_locked;
    res.json({ player, token: signToken(player) });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };
