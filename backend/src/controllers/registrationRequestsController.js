const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');
const { logAudit } = require('../services/audit');

const PLAYER_FIELDS = `id, first_name, last_name, nickname, ${displayNameSql()} AS name,
  phone, email, player_type, role, active`;

// Pedidos de cadastro, mais recentes primeiro. So os pendentes por padrao;
// includeReviewed=true tambem traz o historico de ja aprovados/recusados.
async function list(req, res, next) {
  try {
    const where = req.query.includeReviewed === 'true' ? '' : `WHERE status = 'pending'`;
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, nickname, phone, email, status,
              rejection_reason, reviewed_at, created_player_id, created_at
       FROM registration_requests ${where}
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Cria o cadastro de verdade a partir do pedido — a senha que a pessoa
// escolheu na hora do pedido ja fica pronta (hash), nao precisa pedir de novo.
async function approve(req, res, next) {
  try {
    const { rows: requestRows } = await pool.query(
      'SELECT * FROM registration_requests WHERE id = $1', [req.params.id]
    );
    const request = requestRows[0];
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Esta solicitação já foi analisada' });
    }

    // O telefone/e-mail pode ter sido ocupado por outro caminho enquanto o
    // pedido esperava (ex: o organizador cadastrou a pessoa na mao nesse meio-tempo)
    const { rows: existing } = await pool.query(
      `SELECT phone, email FROM players WHERE phone = $1 OR (email IS NOT NULL AND email = $2)`,
      [request.phone, request.email]
    );
    if (existing[0]) {
      return res.status(409).json({
        error: 'Telefone ou e-mail já foi cadastrado por outro caminho enquanto o pedido esperava. Recuse esta solicitação.',
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO players (first_name, last_name, nickname, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${PLAYER_FIELDS}`,
      [request.first_name, request.last_name, request.nickname, request.phone, request.email, request.password_hash]
    );
    const player = rows[0];

    await pool.query(
      `UPDATE registration_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = now(), created_player_id = $2
       WHERE id = $3`,
      [req.user.id, player.id, request.id]
    );

    await logAudit({
      actorId: req.user.id, actorName: req.user.name,
      action: 'registration.approve', targetType: 'player', targetId: player.id, targetLabel: player.name,
    });

    res.status(201).json(player);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Telefone ou e-mail já cadastrado' });
    }
    next(err);
  }
}

// Recusa sem criar cadastro nenhum. O motivo e so para o admin lembrar o
// porque depois (nao vai pra pessoa automaticamente).
async function reject(req, res, next) {
  try {
    const { reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE registration_requests
       SET status = 'rejected', rejection_reason = $1, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 AND status = 'pending'
       RETURNING id, first_name, last_name, nickname, phone`,
      [reason || null, req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Solicitação não encontrada ou já analisada' });

    await logAudit({
      actorId: req.user.id, actorName: req.user.name,
      action: 'registration.reject', targetType: 'registration_request', targetId: rows[0].id,
      targetLabel: `${rows[0].first_name} ${rows[0].last_name}`,
      details: reason ? { motivo: reason } : null,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, approve, reject };
