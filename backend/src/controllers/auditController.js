const pool = require('../config/db');

// Grupos do filtro da tela, por prefixo da acao
const CATEGORIAS = {
  ata: ['ata.%'],
  pelada: ['matchday.%'],
  cadastro: ['player.%', 'registration.%'],
  financeiro: ['finance.%'],
  torneio: ['tournament.%'],
  sistema: ['season.%', 'settings.%'],
};

// Historico de tudo que acontece no sistema, mais recentes primeiro.
// Filtros opcionais: categoria (ver CATEGORIAS) e busca por nome — de quem
// fez ou de quem/o que foi atingido.
async function list(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const conditions = [];
    const params = [];
    const prefixos = CATEGORIAS[req.query.categoria];
    if (prefixos) {
      params.push(prefixos);
      conditions.push(`action LIKE ANY($${params.length}::text[])`);
    }
    const busca = String(req.query.busca || '').trim();
    if (busca) {
      params.push(`%${busca}%`);
      conditions.push(`(actor_name ILIKE $${params.length} OR target_label ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT id, actor_id, actor_name, action, target_type, target_id, target_label,
              details, created_at
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_log ${where}`, params
    );

    res.json({ entries: rows, total: totalRows[0].total });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
