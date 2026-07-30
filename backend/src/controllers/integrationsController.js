const pool = require('../config/db');
const { displayNameSql } = require('../config/settings');

// Confirmacao vinda de fora do sistema (ex.: bot do grupo do WhatsApp).
// Identifica o jogador pelo telefone e marca presenca na pelada com lista aberta.

// Compara apenas os digitos e pelos 8 ultimos, para tolerar +55, DDD e o 9 extra
function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function findPlayerByPhone(client, phone) {
  const digits = onlyDigits(phone);
  if (digits.length < 8) return null;
  const tail = digits.slice(-8);

  const { rows } = await client.query(
    `SELECT id, ${displayNameSql()} AS name, player_type, blocked, block_reason
     FROM players
     WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 8) = $1
       AND length(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g')) >= 8
     ORDER BY id
     LIMIT 2`,
    [tail]
  );
  if (rows.length !== 1) return null; // nenhum ou ambiguo
  return rows[0];
}

async function openMatchday(client) {
  const { rows } = await client.query(
    `SELECT id FROM matchdays WHERE status = 'open' ORDER BY match_date LIMIT 1`
  );
  return rows[0] || null;
}

// POST /api/integrations/whatsapp/confirm  { phone, matchday_id? }
// Protegido por token proprio, para poder ser chamado por um bot sem login.
async function confirmByPhone(req, res, next) {
  const client = await pool.connect();
  try {
    const { phone, matchday_id } = req.body;
    if (!phone) return res.status(400).json({ error: 'Informe o telefone' });

    const player = await findPlayerByPhone(client, phone);
    if (!player) {
      return res.status(404).json({
        error: 'Nenhum jogador cadastrado com este telefone (ou mais de um com o mesmo final)',
      });
    }
    if (player.blocked) {
      return res.status(403).json({ error: player.block_reason || 'Cadastro bloqueado' });
    }

    let matchdayId = matchday_id;
    if (!matchdayId) {
      const matchday = await openMatchday(client);
      if (!matchday) return res.status(409).json({ error: 'Nenhuma pelada com lista aberta' });
      matchdayId = matchday.id;
    }

    const queuePosition = player.player_type === 'diarista'
      ? (await client.query(
          `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next FROM confirmations WHERE matchday_id = $1`,
          [matchdayId]
        )).rows[0].next
      : null;

    const { rows } = await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, queue_position, status)
       VALUES ($1, $2, $3, 'confirmed')
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET
         status = 'confirmed',
         queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position),
         confirmed_at = now()
       RETURNING status, queue_position`,
      [matchdayId, player.id, queuePosition]
    );

    res.status(201).json({
      player: { id: player.id, name: player.name, player_type: player.player_type },
      matchday_id: matchdayId,
      ...rows[0],
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

// Admin cola o texto do grupo e o sistema confirma quem reconhecer pelo telefone
async function confirmBatch(req, res, next) {
  const client = await pool.connect();
  try {
    const { text, matchday_id } = req.body;
    if (!text) return res.status(400).json({ error: 'Cole o texto com os telefones' });

    let matchdayId = matchday_id;
    if (!matchdayId) {
      const matchday = await openMatchday(client);
      if (!matchday) return res.status(409).json({ error: 'Nenhuma pelada com lista aberta' });
      matchdayId = matchday.id;
    }

    // Sequencias de 8 a 15 digitos, ignorando pontuacao usada em telefones
    const candidates = [...new Set(
      (String(text).match(/[+()\d][\d\s().-]{7,}/g) || [])
        .map(onlyDigits)
        .filter((d) => d.length >= 8 && d.length <= 15)
    )];

    const confirmed = [];
    const notFound = [];

    for (const phone of candidates) {
      const player = await findPlayerByPhone(client, phone);
      if (!player || player.blocked) {
        // Numeracao da lista ("3 - ...") pode colar no telefone; mostra so a parte util
        notFound.push(phone.slice(-11));
        continue;
      }

      const queuePosition = player.player_type === 'diarista'
        ? (await client.query(
            `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next FROM confirmations WHERE matchday_id = $1`,
            [matchdayId]
          )).rows[0].next
        : null;

      await client.query(
        `INSERT INTO confirmations (matchday_id, player_id, queue_position, status)
         VALUES ($1, $2, $3, 'confirmed')
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET
           status = 'confirmed',
           queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position),
           confirmed_at = now()`,
        [matchdayId, player.id, queuePosition]
      );
      confirmed.push({ id: player.id, name: player.name });
    }

    res.json({ matchday_id: matchdayId, confirmed, notFound });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { confirmByPhone, confirmBatch };
