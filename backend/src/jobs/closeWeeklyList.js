const cron = require('node-cron');
const pool = require('../config/db');
const { closeMatchday } = require('../controllers/matchdaysController');
const { logAudit, dataPelada } = require('../services/audit');

// De hora em hora (no minuto 0), fecha a lista de toda pelada aberta com prazo
// vencido. O prazo e a vespera da pelada as 17:00 — sexta 17h para a pelada
// de sabado, mas vale para pelada em outro dia da semana tambem. Rodar de
// hora em hora (e nao so sexta 17h) garante isso e ainda cobre o caso do
// servidor estar reiniciando bem na hora.
function scheduleWeeklyClose() {
  cron.schedule('0 * * * *', async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id FROM matchdays WHERE status = 'open' AND confirmation_deadline <= now()`
      );
      for (const matchday of rows) {
        console.log(`Fechando lista da pelada ${matchday.id} (prazo vencido)`);
        const resumo = await closeMatchday(matchday.id);
        await logAudit({
          actorId: null, actorName: 'sistema',
          action: 'matchday.close', targetType: 'matchday', targetId: matchday.id,
          targetLabel: await dataPelada(matchday.id), details: { automatico: true, ...resumo },
        });
      }
    } catch (err) {
      console.error('Falha ao fechar lista semanal:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleWeeklyClose };
