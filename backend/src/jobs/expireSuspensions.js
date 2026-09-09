const cron = require('node-cron');
const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');
const { logAudit } = require('../services/audit');

// De hora em hora, libera sozinho quem foi suspenso com prazo e o prazo ja
// passou. Bloqueio por debito fica de fora dessa checagem: so tem
// blocked_until quem foi suspenso com duracao definida (ver setBlock em
// controllers/playersController.js) — bloqueio por debito continua so ate o
// admin desbloquear na mao.
function scheduleExpireSuspensions() {
  cron.schedule('5 * * * *', async () => {
    try {
      const { rows } = await pool.query(
        `UPDATE players SET blocked = FALSE, block_reason = NULL, blocked_until = NULL
         WHERE blocked AND blocked_until IS NOT NULL AND blocked_until <= now()
         RETURNING id, ${displayNameSql()} AS name`
      );
      for (const player of rows) {
        console.log(`Suspensão expirada, liberando ${player.name} (id ${player.id})`);
        await logAudit({
          actorId: null, actorName: 'sistema',
          action: 'player.unblock', targetType: 'player', targetId: player.id,
          targetLabel: player.name, details: { motivo: 'prazo da suspensão expirou' },
        });
      }
    } catch (err) {
      console.error('Falha ao expirar suspensões:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleExpireSuspensions };
