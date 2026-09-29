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

// Rotulos prontos para o registro: nome como aparece nas listas e data da
// pelada. Falha aqui vira null — rotulo faltando nunca pode derrubar a acao.
async function nomeJogador(id, client = pool) {
  try {
    const { rows } = await client.query(
      `SELECT TRIM(COALESCE(NULLIF(nickname, ''), first_name || ' ' || last_name)) AS nome
       FROM players WHERE id = $1`, [id]
    );
    return rows[0]?.nome || null;
  } catch {
    return null;
  }
}

async function dataPelada(id, client = pool) {
  try {
    const { rows } = await client.query(
      `SELECT to_char(match_date, 'YYYY-MM-DD') AS dia FROM matchdays WHERE id = $1`, [id]
    );
    return rows[0]?.dia || null;
  } catch {
    return null;
  }
}

// Atalho para acao sobre um jogador dentro de uma pelada (ata, times):
// o alvo e o jogador, e a pelada vai nos detalhes.
async function logAuditAta(req, action, playerId, matchdayId, extra = {}) {
  await logAudit({
    actorId: req.user?.id, actorName: req.user?.name,
    action, targetType: 'player', targetId: Number(playerId),
    targetLabel: await nomeJogador(playerId),
    details: { pelada: await dataPelada(matchdayId), ...extra },
  });
}

module.exports = { logAudit, logAuditAta, nomeJogador, dataPelada };
