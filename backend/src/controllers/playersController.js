const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');

const PLAYER_FIELDS = `id, first_name, last_name, nickname, ${displayNameSql()} AS name,
  phone, email, photo_url, position, stars, role, player_type, blocked, mensalista_number,
  active, is_owner, login_locked, exempt_monthly, auto_roster`;

// Mensalistas seguem a propria numeracao; os demais ficam em ordem alfabetica
const PLAYER_ORDER = `mensalista_number NULLS LAST, ${displayNameSql()}`;

// A numeracao do mensalista e um inteiro de 1 a 99, sem limite de quantidade
function parseMensalistaNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 99) {
    const err = new Error('O número do mensalista deve ser um inteiro entre 1 e 99');
    err.status = 400;
    throw err;
  }
  return number;
}

// Elenco ativo, todos os tipos: e o que "GET /players" sem filtro devolve.
// Existe como funcao a parte (nao so a rota) para telas que agregam varias
// consultas numa unica chamada poderem reaproveitar a mesma query.
async function listActivePlayers() {
  const { rows } = await pool.query(
    `SELECT ${PLAYER_FIELDS} FROM players WHERE active ORDER BY ${PLAYER_ORDER}`
  );
  return rows;
}

async function list(req, res, next) {
  try {
    const { type, search, includeInactive } = req.query;
    const conditions = [];
    const params = [];

    // Inativos ficam fora das listas, mas o admin pode pedir para ver
    if (!(includeInactive === 'true' && req.user.role === 'admin')) {
      conditions.push('active');
    }
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
      `SELECT ${PLAYER_FIELDS} FROM players ${where} ORDER BY ${PLAYER_ORDER}`,
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

// Jogador troca a propria senha, confirmando a senha atual
async function changeMyPassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM players WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });

    if (!(await bcrypt.compare(current_password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      `UPDATE players SET password_hash = $1, failed_login_attempts = 0, login_locked = FALSE
       WHERE id = $2`,
      [passwordHash, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Admin libera a senha bloqueada por tentativas erradas
async function unlockLogin(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE players SET login_locked = FALSE, failed_login_attempts = 0
       WHERE id = $1
       RETURNING id, ${displayNameSql()} AS name, login_locked`,
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
    const {
      first_name, last_name, nickname, phone, email, password,
      position, stars, player_type, mensalista_number,
    } = req.body;
    if (!first_name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const number = parseMensalistaNumber(mensalista_number);
    if (number) {
      await pool.query('UPDATE players SET mensalista_number = NULL WHERE mensalista_number = $1', [number]);
    }

    const passwordHash = await bcrypt.hash(password || Math.random().toString(36).slice(2), 10);
    const { rows } = await pool.query(
      `INSERT INTO players (first_name, last_name, nickname, phone, email, password_hash, position, stars, player_type, mensalista_number)
       VALUES ($1, COALESCE($2, ''), $3, $4, $5, $6, $7, COALESCE($8::numeric, 3), COALESCE($9, 'diarista'), $10)
       RETURNING ${PLAYER_FIELDS}`,
      [first_name, last_name, nickname || null, phone || null, email || null, passwordHash,
       position || null, stars, player_type, number]
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
    const {
      first_name, last_name, nickname, position, stars, photo_url,
      mensalista_number, phone, email, password, exempt_monthly, auto_roster,
    } = req.body;
    const number = parseMensalistaNumber(mensalista_number);

    // Numero e exclusivo de mensalista, para nao ocupar vaga de quem e da lista fixa
    if (number !== null) {
      const { rows: target } = await pool.query(
        'SELECT player_type FROM players WHERE id = $1', [req.params.id]
      );
      if (target[0] && target[0].player_type !== 'mensalista') {
        return res.status(409).json({
          error: 'Só mensalista tem número. Use "Tornar Mensalista" para atribuir automaticamente.',
        });
      }
    }

    if (number !== null) {
      // A numeracao 1-20 e exclusiva: libera quem estiver ocupando a vaga
      await pool.query(
        'UPDATE players SET mensalista_number = NULL WHERE mensalista_number = $1 AND id != $2',
        [number, req.params.id]
      );
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const { rows } = await pool.query(
      `UPDATE players SET
         first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         nickname = CASE WHEN $3::boolean THEN NULLIF($4, '') ELSE nickname END,
         position = COALESCE($5, position),
         stars = COALESCE($6, stars),
         photo_url = COALESCE($7, photo_url),
         mensalista_number = CASE WHEN $8::boolean THEN $9::int ELSE mensalista_number END,
         phone = CASE WHEN $10::boolean THEN NULLIF($11, '') ELSE phone END,
         email = CASE WHEN $12::boolean THEN NULLIF($13, '') ELSE email END,
         password_hash = COALESCE($14, password_hash),
         -- Senha nova do admin tambem libera o bloqueio por tentativas
         login_locked = CASE WHEN $14 IS NOT NULL THEN FALSE ELSE login_locked END,
         failed_login_attempts = CASE WHEN $14 IS NOT NULL THEN 0 ELSE failed_login_attempts END,
         exempt_monthly = CASE WHEN $16::boolean THEN $17::boolean ELSE exempt_monthly END,
         auto_roster = CASE WHEN $18::boolean THEN $19::boolean ELSE auto_roster END
       WHERE id = $15
       RETURNING ${PLAYER_FIELDS}`,
      [first_name, last_name,
       nickname !== undefined, nickname,
       position, stars, photo_url,
       mensalista_number !== undefined, number,
       phone !== undefined, phone,
       email !== undefined, email,
       passwordHash, req.params.id,
       exempt_monthly !== undefined, !!exempt_monthly,
       auto_roster !== undefined, !!auto_roster]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado' });
    }
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

// Menor numero livre entre 1 e 99, para quem vira mensalista entrar na primeira vaga
async function firstFreeNumber(client) {
  const { rows } = await client.query(
    `SELECT n FROM generate_series(1, 99) AS n
     WHERE n NOT IN (SELECT mensalista_number FROM players WHERE mensalista_number IS NOT NULL)
     ORDER BY n LIMIT 1`
  );
  return rows[0]?.n || null;
}

// Admin: troca o tipo do jogador com efeito imediato.
// A data entra automaticamente no histórico (usada para saber de quando cobrar mensalidade).
async function changeStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const { player_type, start_date } = req.body;
    if (!['mensalista', 'diarista', 'goleiro'].includes(player_type)) {
      return res.status(400).json({ error: 'player_type inválido' });
    }
    const date = start_date || new Date().toISOString().slice(0, 10);

    await client.query('BEGIN');

    await client.query(
      `UPDATE player_status_history SET end_date = $1
       WHERE player_id = $2 AND end_date IS NULL`,
      [date, req.params.id]
    );
    await client.query(
      `INSERT INTO player_status_history (player_id, player_type, start_date)
       VALUES ($1, $2, $3)`,
      [req.params.id, player_type, date]
    );

    // Ao virar mensalista ocupa a primeira vaga livre; ao sair, libera a sua
    let number = null;
    if (player_type === 'mensalista') {
      const { rows: current } = await client.query(
        'SELECT mensalista_number FROM players WHERE id = $1',
        [req.params.id]
      );
      number = current[0]?.mensalista_number || await firstFreeNumber(client);
    }

    const { rows } = await client.query(
      `UPDATE players SET player_type = $1, mensalista_number = $2
       WHERE id = $3
       RETURNING id, ${displayNameSql()} AS name, player_type, mensalista_number`,
      [player_type, number, req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Jogador não encontrado' });
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Admin: inativa um cadastro (sai das listas, mantem o historico) ou reativa
async function setActive(req, res, next) {
  try {
    const active = req.body.active !== false;
    const { rows } = await pool.query(
      `UPDATE players SET
         active = $1,
         mensalista_number = CASE WHEN $1 THEN mensalista_number ELSE NULL END
       WHERE id = $2 AND NOT is_owner
       RETURNING id, ${displayNameSql()} AS name, active, mensalista_number`,
      [active, req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Jogador não encontrado ou é o dono do sistema' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: exclui de vez, so quando o cadastro nao tem nada lancado
async function remove(req, res, next) {
  try {
    const { rows: owner } = await pool.query(
      'SELECT is_owner FROM players WHERE id = $1', [req.params.id]
    );
    if (!owner[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
    if (owner[0].is_owner) {
      return res.status(403).json({ error: 'O dono do sistema não pode ser excluído' });
    }

    const { rows: usage } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM confirmations WHERE player_id = $1)::int AS confirmacoes,
         (SELECT COUNT(*) FROM player_match_stats WHERE player_id = $1)::int AS sumulas,
         (SELECT COUNT(*) FROM goalkeeper_match_stats WHERE player_id = $1)::int AS sumulas_goleiro,
         (SELECT COUNT(*) FROM payments WHERE player_id = $1)::int AS cobrancas`,
      [req.params.id]
    );
    const total = Object.values(usage[0]).reduce((sum, n) => sum + n, 0);
    if (total > 0) {
      return res.status(409).json({
        error: 'Este jogador já tem histórico no sistema. Inative o cadastro em vez de excluir.',
        usage: usage[0],
      });
    }

    await pool.query('DELETE FROM player_status_history WHERE player_id = $1', [req.params.id]);
    await pool.query('DELETE FROM players WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Somente o dono do sistema promove ou rebaixa administradores
async function setRole(req, res, next) {
  try {
    // Confere no banco, para o token nao poder afirmar que e dono
    const { rows: requester } = await pool.query(
      'SELECT is_owner FROM players WHERE id = $1', [req.user.id]
    );
    if (!requester[0]?.is_owner) {
      return res.status(403).json({ error: 'Apenas o dono do sistema pode alterar administradores' });
    }
    const { role } = req.body;
    if (!['admin', 'player'].includes(role)) {
      return res.status(400).json({ error: 'Perfil inválido' });
    }

    const { rows } = await pool.query(
      `UPDATE players SET role = $1 WHERE id = $2 AND NOT is_owner
       RETURNING id, ${displayNameSql()} AS name, role`,
      [role, req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Jogador não encontrado ou é o dono do sistema' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list, listActivePlayers, getById, getMe, updateMe, create, update, setBlock,
  changeStatus, setActive, remove, setRole, changeMyPassword, unlockLogin,
};
