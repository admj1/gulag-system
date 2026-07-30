const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const pool = require('../config/db');
const { displayNameSql, getSettings } = require('../config/settings');

// O logo vai embutido na mensagem (cid), e nao por link: cliente de e-mail
// costuma bloquear imagem de fora, e ai o cabecalho apareceria quebrado.
const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'logo.jpeg');
const LOGO_CID = 'gulag-logo';
const HAS_LOGO = fs.existsSync(LOGO_PATH);

// Sem SMTP configurado o sistema continua funcionando: o aviso simplesmente nao
// sai (mesmo criterio das fotos, que caem para o disco quando falta Cloudinary).
const MAIL_CONFIGURED = !!(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);

let transporter = null;
function getTransporter() {
  if (!MAIL_CONFIGURED) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 abre TLS direto; 587 sobe com STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

// Link do aviso. Em producao vale o APP_URL; sem ele, usa o proprio endereco
// pelo qual o admin lancou a ATA, que e o mesmo que os jogadores acessam.
function appBaseUrl(req) {
  const url = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return url.replace(/\/+$/, '');
}

function formatDate(matchDate) {
  return new Date(`${matchDate}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// O servidor do Railway roda em UTC: sem fixar o fuso, o e-mail anunciaria
// "20:00" para uma lista que fecha as 17:00.
function formatDeadline(deadline) {
  if (!deadline) return null;
  return new Date(deadline).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: process.env.TZ || 'America/Sao_Paulo',
  });
}

// E-mail simples de proposito: quando é, o botao para confirmar e nada mais.
// Estilo em linha porque cliente de e-mail ignora folha de estilo.
function inviteTemplate({ name, playerType, dateLabel, timeLabel, deadlineLabel, url }) {
  const quando = `${dateLabel}${timeLabel ? `, às ${timeLabel}` : ''}`;
  // Diarista disputa as vagas que sobram, por ordem de inscricao
  const comoEntra = playerType === 'diarista'
    ? 'Diarista entra nas vagas que sobrarem, por ordem de inscrição — quanto antes confirmar, melhor sua posição na fila.'
    : 'Confirme seu nome para garantir a vaga.';
  const prazo = deadlineLabel
    ? `<p style="margin:0 0 24px;color:#555;font-size:14px">A lista fecha em <strong>${deadlineLabel}</strong>. Quem confirmar e faltar entra na multa.</p>`
    : '';

  // alt cobre o caso de a imagem nao carregar: o cabecalho continua legivel
  const logo = HAS_LOGO
    ? `<img src="cid:${LOGO_CID}" alt="Gulag System" width="64" height="64"
           style="display:block;border:0;border-radius:8px;margin:0 0 12px">`
    : '';

  const html = `
  <div style="background:#f4f5f7;padding:24px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
      ${logo}
      <p style="margin:0 0 4px;color:#0f766e;font-size:13px;letter-spacing:1px;text-transform:uppercase">Gulag System</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#111">Nova pelada marcada</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#333">Fala, ${name}!</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333">
        Saiu a lista da pelada de <strong>${quando}</strong>. ${comoEntra}
      </p>
      ${prazo}
      <p style="margin:0 0 24px">
        <a href="${url}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:16px;font-weight:bold">
          Confirmar presença
        </a>
      </p>
      <p style="margin:0;color:#777;font-size:12px">
        Se o botão não abrir, copie este endereço no navegador:<br>
        <a href="${url}" style="color:#0f766e">${url}</a>
      </p>
    </div>
  </div>`;

  const text = [
    `Fala, ${name}!`,
    '',
    `Saiu a lista da pelada de ${quando}. ${comoEntra}`,
    deadlineLabel ? `A lista fecha em ${deadlineLabel}.` : null,
    '',
    `Confirmar presença: ${url}`,
  ].filter((line) => line !== null).join('\n');

  return { html, text };
}

// Quem recebe o aviso: o elenco inteiro — mensalistas, goleiros e diaristas.
// Diarista nao entra na ata sozinho e pega vaga por ordem de inscricao, entao
// precisa saber da pelada tanto quanto (ou mais que) o resto.
async function inviteRecipients() {
  const { rows } = await pool.query(
    `SELECT p.id, ${displayNameSql('p')} AS name, p.email, p.player_type
     FROM players p
     WHERE p.active AND NOT p.blocked AND p.email IS NOT NULL AND p.email <> ''
     ORDER BY p.player_type, p.mensalista_number NULLS LAST, ${displayNameSql('p')}`
  );
  return rows;
}

// Dispara o aviso de confirmacao. Um e-mail por jogador (nao expoe o endereco
// dos outros) e uma falha individual nao interrompe o resto da lista.
async function sendMatchdayInvites(matchdayId, baseUrl) {
  const { rows: matchdays } = await pool.query(
    'SELECT id, match_date, confirmation_deadline FROM matchdays WHERE id = $1',
    [matchdayId]
  );
  const matchday = matchdays[0];
  if (!matchday) return { configured: MAIL_CONFIGURED, recipients: 0, sent: 0, failed: 0 };

  const recipients = await inviteRecipients();
  const transport = getTransporter();
  if (!transport) {
    return { configured: false, recipients: recipients.length, sent: 0, failed: 0 };
  }

  const settings = await getSettings();
  const dateLabel = formatDate(matchday.match_date);
  const timeLabel = settings?.match_time ? String(settings.match_time).slice(0, 5) : null;
  const deadlineLabel = formatDeadline(matchday.confirmation_deadline);
  const url = `${baseUrl}/peladas/${matchdayId}`;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  let sent = 0;
  let failed = 0;
  for (const player of recipients) {
    const { html, text } = inviteTemplate({
      name: player.name, playerType: player.player_type,
      dateLabel, timeLabel, deadlineLabel, url,
    });
    try {
      await transport.sendMail({
        from,
        to: player.email,
        subject: `Pelada ${dateLabel} — confirme sua presença`,
        html,
        text,
        attachments: HAS_LOGO
          ? [{ filename: 'logo.jpeg', path: LOGO_PATH, cid: LOGO_CID }]
          : [],
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`Falha ao avisar ${player.email}:`, err.message);
    }
  }

  return { configured: true, recipients: recipients.length, sent, failed };
}

module.exports = { sendMatchdayInvites, inviteRecipients, appBaseUrl, MAIL_CONFIGURED };
