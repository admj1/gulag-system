const zlib = require('zlib');
const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');
const { deliver, MAIL_CONFIGURED } = require('./mailer');

// Todas as tabelas com dado de verdade (fora migrations/one_off_fixes, que sao
// so controle interno). team_players nao tem coluna id propria.
const TABLES = [
  { name: 'players', orderBy: 'id' },
  { name: 'seasons', orderBy: 'id' },
  { name: 'player_status_history', orderBy: 'id' },
  { name: 'matchdays', orderBy: 'id' },
  { name: 'confirmations', orderBy: 'id' },
  { name: 'teams', orderBy: 'id' },
  { name: 'team_players', orderBy: 'team_id, player_id' },
  { name: 'player_match_stats', orderBy: 'id' },
  { name: 'goalkeeper_match_stats', orderBy: 'id' },
  { name: 'payments', orderBy: 'id' },
  { name: 'settings', orderBy: 'id' },
  { name: 'audit_log', orderBy: 'id' },
];

// Copia de tudo, tabela por tabela, no mesmo formato usado para recuperar a
// pelada de 08/08/26 na mao — um objeto com uma chave por tabela, pronto
// para virar INSERT de novo se precisar. Nomes de tabela vem de uma lista
// fixa aqui em cima, nunca de entrada externa.
async function buildBackupPayload() {
  const tables = {};
  let totalRows = 0;
  for (const { name, orderBy } of TABLES) {
    const { rows } = await pool.query(`SELECT * FROM ${name} ORDER BY ${orderBy}`);
    tables[name] = rows;
    totalRows += rows.length;
  }
  return { generated_at: new Date().toISOString(), total_rows: totalRows, tables };
}

// Quem recebe: todo admin ativo com e-mail cadastrado. Mais de uma pessoa de
// proposito — se o backup so for para uma caixa de entrada, ela vira ponto
// unico de falha igual o banco que estamos tentando proteger.
async function backupRecipients() {
  const { rows } = await pool.query(
    `SELECT ${displayNameSql('p')} AS name, email FROM players p
     WHERE p.role = 'admin' AND p.active AND p.email IS NOT NULL AND p.email <> ''`
  );
  return rows;
}

// Provedores de e-mail costumam recusar anexo grande; nesse caso e melhor
// avisar sem o arquivo do que a mensagem inteira falhar calada
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// Gera o backup e manda por e-mail para os admins, compactado. Retorna um
// resumo do que aconteceu — usado tanto pelo job semanal quanto pelo botao
// manual de teste.
async function sendWeeklyBackup() {
  if (!MAIL_CONFIGURED) {
    return { configured: false, sent: 0, failed: 0 };
  }

  const recipients = await backupRecipients();
  if (recipients.length === 0) {
    return { configured: true, sent: 0, failed: 0, recipients: 0 };
  }

  const payload = await buildBackupPayload();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  const dataStr = payload.generated_at.slice(0, 10);
  const filename = `gulag-backup-${dataStr}.json.gz`;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  const tooGrande = gz.length > MAX_ATTACHMENT_BYTES;
  const html = tooGrande
    ? `<p>O backup semanal do Gulag System (${dataStr}) ficou grande demais para anexar por e-mail
       (${(gz.length / 1024 / 1024).toFixed(1)} MB). Peça para alguém com acesso técnico gerar uma
       cópia direto do banco.</p>`
    : `<p>Backup semanal do Gulag System, gerado em ${dataStr}: ${payload.total_rows} linha(s) em
       ${TABLES.length} tabelas, compactado em ${(gz.length / 1024).toFixed(0)} KB.</p>
       <p>O anexo é um <code>.json.gz</code> — descompacte e é um JSON com uma chave por tabela
       (jogadores, peladas, súmulas, pagamentos...), pronto para reconstruir o banco na mão se um
       dia precisar.</p>
       <p>Guarde este e-mail. Se algo sumir, essa é a cópia.</p>`;
  const text = tooGrande
    ? `Backup de ${dataStr} grande demais para anexar (${(gz.length / 1024 / 1024).toFixed(1)} MB).`
    : `Backup semanal do Gulag System (${dataStr}): ${payload.total_rows} linha(s). Guarde este e-mail.`;

  let sent = 0;
  let failed = 0;
  let lastError = null;
  for (const r of recipients) {
    try {
      await deliver({
        from,
        to: r.email,
        subject: `Backup semanal do Gulag System — ${dataStr}`,
        html,
        text,
        attachments: tooGrande ? [] : [{ filename, content: gz }],
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      lastError = err.message;
      console.error(`Falha ao enviar backup para ${r.email}:`, err.message);
    }
  }

  return {
    configured: true, sent, failed, lastError, recipients: recipients.length,
    rows: payload.total_rows, bytes: gz.length, tooGrande,
  };
}

module.exports = { buildBackupPayload, sendWeeklyBackup };
