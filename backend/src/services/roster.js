const pool = require('../config/db');
const { logAudit, nomeJogador, dataPelada } = require('./audit');

// Quem entra na ata sozinho: todo mensalista e o goleiro marcado como fixo.
// Goleiro nao marcado coloca o nome como avulso, igual a um diarista.
const ROSTER_SQL = `
  active AND NOT blocked AND (
    player_type = 'mensalista'
    OR (player_type = 'goleiro' AND auto_roster)
  )
`;

// O elenco fixo entra na ata no momento em que ela e lancada. Quem passa a
// fazer parte dele DEPOIS (virou mensalista, foi reativado, saiu de uma
// suspensao, virou goleiro fixo...) precisa entrar tambem nas atas que ja
// estao abertas — senao fica de fora da pelada da semana sem ninguem
// perceber (foi o caso do Andre Lucas: virou mensalista 14 min depois da ata
// ser lancada). Entra como 'pending', igual a quem estava la desde o inicio.
// Nao faz nada se a pessoa nao e do elenco fixo ou ja esta na ata.
async function incluiNasAtasAbertas(playerId, { client = pool, req = null } = {}) {
  const { rows } = await client.query(
    `INSERT INTO confirmations (matchday_id, player_id, status)
     SELECT m.id, p.id, 'pending'
     FROM matchdays m, players p
     WHERE m.status = 'open' AND p.id = $1
       AND p.id IN (SELECT id FROM players WHERE ${ROSTER_SQL})
     ON CONFLICT (matchday_id, player_id) DO NOTHING
     RETURNING matchday_id`,
    [playerId]
  );

  for (const { matchday_id: matchdayId } of rows) {
    await logAudit({
      actorId: req?.user?.id ?? null, actorName: req?.user?.name || 'sistema',
      action: 'ata.roster_add', targetType: 'player', targetId: Number(playerId),
      targetLabel: await nomeJogador(playerId, client),
      details: { pelada: await dataPelada(matchdayId, client) },
    });
  }
  return rows.length;
}

module.exports = { ROSTER_SQL, incluiNasAtasAbertas };
