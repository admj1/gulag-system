const pool = require('../config/db');

// Registro de quem fez o que, para as acoes destrutivas ou sensiveis do
// admin — a resposta pronta para "quem foi?" da proxima vez que algo sumir.
// Guarda o nome do autor e uma descricao do alvo prontos (nao so os ids),
// porque tanto o autor quanto o alvo podem deixar de existir depois e o
// registro precisa continuar legivel mesmo assim.
//
// Uma falha ao gravar a auditoria nunca pode derrubar a acao em si: o pior
// cenario aceitavel e a acao valer sem deixar rastro, nunca o contrario.
async function logAudit({ actorId, actorName, action, targetType, targetId, targetLabel, details }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, target_label, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        actorId || null,
        actorName || 'desconhecido',
        action,
        targetType || null,
        targetId ?? null,
        targetLabel || null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    console.error(`Falha ao gravar auditoria (${action}):`, err.message);
  }
}

module.exports = { logAudit };
