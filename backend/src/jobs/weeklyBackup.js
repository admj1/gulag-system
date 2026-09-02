const cron = require('node-cron');
const { sendWeeklyBackup } = require('../services/backup');

// Domingo de madrugada, longe do fechamento de sexta 17h e do jogo de sabado —
// nao compete por banco com nada que importe na hora
function scheduleWeeklyBackup() {
  cron.schedule('0 4 * * 0', async () => {
    try {
      const result = await sendWeeklyBackup();
      console.log(`Backup semanal: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error('Falha ao gerar backup semanal:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleWeeklyBackup };
