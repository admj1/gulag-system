const cron = require('node-cron');
const pool = require('../config/db');
const { closeMatchday } = require('../controllers/matchdaysController');

// Toda sexta as 17:00 (horario de Brasilia), fecha a lista de peladas abertas com prazo vencido
function scheduleWeeklyClose() {
  cron.schedule('0 17 * * 5', async () => {
    try {
      const { rows } = await pool.query(
        `SELECT id FROM matchdays WHERE status = 'open' AND confirmation_deadline <= now()`
      );
      for (const matchday of rows) {
        console.log(`Fechando lista da pelada ${matchday.id} (job semanal de sexta 17h)`);
        await closeMatchday(matchday.id);
      }
    } catch (err) {
      console.error('Falha ao fechar lista semanal:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleWeeklyClose };
