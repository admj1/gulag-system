const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const pool = require('../config/db');
const { displayNameSql, getSettings } = require('../config/settings');

// No SMTP o logo vai embutido na mensagem (cid), porque cliente de e-mail
// costuma bloquear imagem de fora. Pela API o anexo inline nao existe do mesmo
// jeito, entao ali ele vira link para o proprio sistema.
const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'logo.jpeg');
const LOGO_CID = 'gulag-logo';
const HAS_LOGO = fs.existsSync(LOGO_PATH);

// Hospedagem costuma bloquear as portas de SMTP para conter spam — no Railway a
// conexao com o Gmail da timeout. Por isso o caminho preferido e a API HTTPS do
// Brevo (porta 443, nunca bloqueada); o SMTP fica para quem puder usar.
// Sem nenhum dos dois o sistema continua funcionando: o aviso so nao sai.
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const HAS_SMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
// A API exige remetente proprio: nao ha login de e-mail de onde deduzi-lo
const HAS_BREVO = !!(BREVO_API_KEY && process.env.MAIL_FROM);
const MAIL_CONFIGURED = HAS_BREVO || HAS_SMTP;

let transporter = null;
function getTransporter() {
  if (!HAS_SMTP) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 abre TLS direto; 587 sobe com STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Sem limite proprio, uma porta bloqueada deixa o admin uns 2 minutos
      // olhando para "Enviando..." sem resposta nenhuma
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

// "Gulag System <x@y.com>" ou so o endereco
function parseSender(from) {
  const match = /^\s*(.*?)\s*<(.+)>\s*$/.exec(String(from || ''));
  return match ? { name: match[1] || undefined, email: match[2] } : { email: String(from || '') };
}

async function sendViaBrevo({ from, to, subject, html, text }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseSender(from),
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!response.ok) {
    // A resposta traz o motivo (remetente nao validado, chave errada, cota...)
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`Brevo respondeu ${response.status}: ${detail}`);
  }
}

// Entrega uma mensagem pelo caminho disponivel
async function deliver(message) {
  if (HAS_BREVO) return sendViaBrevo(message);
  return getTransporter().sendMail({
    ...message,
    attachments: HAS_LOGO ? [{ filename: 'logo.jpeg', path: LOGO_PATH, cid: LOGO_CID }] : [],
  });
}

// Link do aviso. Em producao vale o APP_URL; sem ele, usa o proprio endereco
// pelo qual o admin lancou a ATA, que e o mesmo que os jogadores acessam.
function appBaseUrl(req) {
  const url = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return url.replace(/\/+$/, '');
}

// No e-mail a data vai por extenso: quem le esta fora do sistema, as vezes dias
// depois, e o "sabado" ajuda a situar. Nas telas o formato e curto (25/07/26).
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

// Modelo padrao do convite. O admin pode trocar por outro nas Configuracoes;
// os {{campos}} sao preenchidos na hora do envio, um e-mail por jogador.
// Estilo em linha porque cliente de e-mail ignora folha de estilo.
// Mesmas cores do sistema: fundo escuro, cartao cinza-chumbo e o ciano dos botoes.
// Layout em tabela com bgcolor porque Outlook ignora background em div.
const DEFAULT_INVITE_HTML = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0d10" style="background:#0b0d10;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <tr>
    <td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#16191e" style="width:100%;max-width:520px;background:#16191e;border:1px solid #262b33;border-radius:10px">
        <tr>
          <td style="padding:24px">
            {{logo}}
            <p style="margin:0 0 4px;color:#2dd8d3;font-size:13px;letter-spacing:1px;text-transform:uppercase">Gulag System</p>
            <h1 style="margin:0 0 16px;font-size:20px;color:#f3f4f6">Nova pelada marcada</h1>
            <p style="margin:0 0 8px;font-size:15px;color:#e5e7eb">Fala, {{nome}}!</p>
            <p style="margin:0 0 16px;font-size:15px;color:#e5e7eb">
              Saiu a lista da pelada de <strong style="color:#ffffff">{{data}}, às {{horario}}</strong>. {{como_entra}}
            </p>
            <p style="margin:0 0 24px;color:#9ca3af;font-size:14px">
              A lista fecha em <strong style="color:#e5e7eb">{{prazo}}</strong>. Quem confirmar e faltar entra na multa.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
              <tr>
                <td bgcolor="#2dd8d3" style="background:#2dd8d3;border-radius:6px">
                  <a href="{{link}}" style="display:inline-block;padding:14px 28px;color:#0b0d10;font-size:16px;font-weight:bold;text-decoration:none">
                    Confirmar presença
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;color:#6b7280;font-size:12px">
              Se o botão não abrir, copie este endereço no navegador:<br>
              <a href="{{link}}" style="color:#2dd8d3">{{link}}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Troca {{campo}} pelo valor. Campo desconhecido fica como esta, para um erro
// de digitacao no modelo aparecer no e-mail em vez de sumir calado.
function renderTemplate(template, values) {
  return String(template).replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (original, key) => (key in values ? values[key] : original)
  );
}

function inviteTemplate({
  name, playerType, dateLabel, timeLabel, deadlineLabel, url, template, logoSrc,
}) {
  const quando = `${dateLabel}${timeLabel ? `, às ${timeLabel}` : ''}`;
  // Diarista disputa as vagas que sobram, por ordem de inscricao
  const comoEntra = playerType === 'diarista'
    ? 'Diarista entra nas vagas que sobrarem, por ordem de inscrição — quanto antes confirmar, melhor sua posição na fila.'
    : 'Confirme seu nome para garantir a vaga.';

  // alt cobre o caso de a imagem nao carregar: o cabecalho continua legivel
  const logo = logoSrc
    ? `<img src="${logoSrc}" alt="Gulag System" width="64" height="64" style="display:block;border:0;border-radius:8px;margin:0 0 12px">`
    : '';

  const html = renderTemplate(template || DEFAULT_INVITE_HTML, {
    logo,
    nome: escapeHtml(name),
    data: escapeHtml(dateLabel),
    horario: escapeHtml(timeLabel || ''),
    prazo: escapeHtml(deadlineLabel || ''),
    como_entra: escapeHtml(comoEntra),
    link: escapeHtml(url),
  });

  // A versao em texto puro acompanha toda mensagem e nao e editavel:
  // serve de reserva para cliente antigo ou leitura em modo simples.
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
// Com onlyPlayerId, manda so para essa pessoa — e o teste do admin antes de
// disparar para o grupo inteiro.
async function sendMatchdayInvites(matchdayId, baseUrl, { onlyPlayerId = null } = {}) {
  const { rows: matchdays } = await pool.query(
    'SELECT id, match_date, confirmation_deadline FROM matchdays WHERE id = $1',
    [matchdayId]
  );
  const matchday = matchdays[0];
  if (!matchday) {
    return { configured: MAIL_CONFIGURED, recipients: 0, sent: 0, failed: 0, elenco: 0 };
  }

  const elenco = await inviteRecipients();
  const recipients = onlyPlayerId
    ? elenco.filter((p) => p.id === Number(onlyPlayerId))
    : elenco;

  if (!MAIL_CONFIGURED) {
    return {
      configured: false, recipients: recipients.length, sent: 0, failed: 0, elenco: elenco.length,
    };
  }

  const settings = await getSettings();
  const dateLabel = formatDate(matchday.match_date);
  const timeLabel = settings?.match_time ? String(settings.match_time).slice(0, 5) : null;
  const deadlineLabel = formatDeadline(matchday.confirmation_deadline);
  const url = `${baseUrl}/peladas/${matchdayId}`;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  // Pela API o logo vem do proprio sistema; pelo SMTP vai embutido na mensagem
  const logoSrc = HAS_BREVO
    ? `${baseUrl}/logo.jpeg`
    : (HAS_LOGO ? `cid:${LOGO_CID}` : null);

  let sent = 0;
  let failed = 0;
  let lastError = null;
  for (const player of recipients) {
    const { html, text } = inviteTemplate({
      name: player.name, playerType: player.player_type,
      dateLabel, timeLabel, deadlineLabel, url, logoSrc,
      template: settings?.invite_html,
    });
    try {
      await deliver({
        from,
        to: player.email,
        subject: `Pelada ${dateLabel} — confirme sua presença`,
        html,
        text,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      lastError = err.message;
      console.error(`Falha ao avisar ${player.email}:`, err.message);
    }
  }

  return {
    configured: true, recipients: recipients.length, sent, failed, lastError,
    elenco: elenco.length,
  };
}

module.exports = {
  sendMatchdayInvites, inviteRecipients, appBaseUrl, MAIL_CONFIGURED, DEFAULT_INVITE_HTML,
};
