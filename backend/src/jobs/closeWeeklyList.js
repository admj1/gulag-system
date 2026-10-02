const cron = require('node-cron');
const pool = require('../config/db');
const { closeMatchday } = require('../controllers/matchdaysController');
const { logAudit, dataPelada } = require('../services/audit');

// Lista so fecha sozinha quando ja da jogo: 20 na linha (mensalistas +
// diaristas confirmados) e pelo menos 1 goleiro. Sem isso continua aberta
// depois do prazo, para mais gente poder entrar.
const MIN_LINHA = 20;
const MIN_GOLEIROS = 1;

// De hora em hora (no minuto 0) fecha a lista de toda pelada aberta que:
// - ja passou do prazo (vespera da pelada, 17:00 — sexta 17h para a de sabado);
// - esta completa (MIN_LINHA na linha e MIN_GOLEIROS no gol);
// - nao foi reaberta pelo admin (auto_close). Ata reaberta so fecha na mao.
// Se no prazo ainda nao estiver completa, fecha na primeira hora cheia em que
// completar.
async function fechaListasVencidas() {
  const fechadas = [];
  const { rows } = await pool.query(
    `SELECT m.id,
            COUNT(*) FILTER (WHERE p.player_type IN ('mensalista', 'diarista'))::int AS linha,
            COUNT(*) FILTER (WHERE p.player_type = 'goleiro')::int AS goleiros
     FROM matchdays m
     LEFT JOIN confirmations c ON c.matchday_id = m.id AND c.status = 'confirmed'
     LEFT JOIN players p ON p.id = c.player_id
     WHERE m.status = 'open' AND m.auto_close AND m.confirmation_deadline <= now()
     GROUP BY m.id`
  );
  for (const matchday of rows) {
    if (matchday.linha < MIN_LINHA || matchday.goleiros < MIN_GOLEIROS) continue;
    console.log(`Fechando lista da pelada ${matchday.id} (prazo vencido e lista completa)`);
    const resumo = await closeMatchday(matchday.id);
    await logAudit({
      actorId: null, actorName: 'sistema',
      action: 'matchday.close', targetType: 'matchday', targetId: matchday.id,
      targetLabel: await dataPelada(matchday.id), details: { automatico: true, ...resumo },
    });
    fechadas.push(matchday.id);
  }
  return fechadas;
}

function scheduleWeeklyClose() {
  cron.schedule('0 * * * *', async () => {
    try {
      await fechaListasVencidas();
    } catch (err) {
      console.error('Falha ao fechar lista semanal:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleWeeklyClose, fechaListasVencidas, MIN_LINHA, MIN_GOLEIROS };
