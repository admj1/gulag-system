const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { displayNameSql, getSettings } = require('../config/settings');
const {
  sendMatchdayInvites, inviteRecipients, appBaseUrl, MAIL_CONFIGURED,
} = require('../services/mailer');
const { confirmationBlock } = require('../services/debts');
const { logAudit } = require('../services/audit');
const { listActivePlayers } = require('./playersController');


async function create(req, res, next) {
  try {
    const { season_id, match_date, confirmation_deadline } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO matchdays (season_id, match_date, confirmation_deadline)
       VALUES ($1, $2, $3) RETURNING *`,
      [season_id, match_date, confirmation_deadline]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Temporada da data informada; cria a do ano se ainda nao existir
async function resolveSeason(client, matchDate) {
  const { rows: existing } = await client.query(
    `SELECT id FROM seasons WHERE year = EXTRACT(YEAR FROM $1::date) ORDER BY id LIMIT 1`,
    [matchDate]
  );
  if (existing[0]) return existing[0].id;

  const { rows } = await client.query(
    `INSERT INTO seasons (name, year, start_date)
     VALUES (EXTRACT(YEAR FROM $1::date)::int::text, EXTRACT(YEAR FROM $1::date)::int, date_trunc('year', $1::date))
     RETURNING id`,
    [matchDate]
  );
  return rows[0].id;
}

// Quem entra na ata sozinho: todo mensalista e o goleiro marcado como fixo.
// Goleiro nao marcado coloca o nome como avulso, igual a um diarista.
const ROSTER_SQL = `
  active AND NOT blocked AND (
    player_type = 'mensalista'
    OR (player_type = 'goleiro' AND auto_roster)
  )
`;

// Admin: previa do elenco padrao da ata (mensalistas numerados + goleiros fixos)
async function rosterPreview(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, ${displayNameSql()} AS name, player_type, stars, mensalista_number
       FROM players
       WHERE ${ROSTER_SQL}
       ORDER BY player_type, mensalista_number NULLS LAST, ${displayNameSql()}`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Admin: cria a ata com todos os mensalistas e goleiros ja relacionados (pendentes de confirmacao).
// Diaristas entram por ordem de confirmacao. Com confirm_all a ata ja nasce confirmada (lancamento retroativo).
async function createFromRoster(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      match_date, diarista_ids = [], season_id, confirm_all = false, notify = true,
    } = req.body;
    if (!match_date) {
      return res.status(400).json({ error: 'Informe a data da pelada' });
    }

    const settings = await getSettings();
    await client.query('BEGIN');

    const seasonId = season_id || await resolveSeason(client, match_date);

    const { rows: matchdayRows } = await client.query(
      `INSERT INTO matchdays (season_id, match_date, confirmation_deadline, status)
       VALUES ($1, $2, ($2::date + $3::time), $4)
       RETURNING *`,
      [seasonId, match_date, settings.match_time, confirm_all ? 'closed' : 'open']
    );
    const matchday = matchdayRows[0];

    // Mensalistas e goleiros fixos ja entram relacionados; ficam verdes conforme confirmam
    await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, status)
       SELECT $1, id, $2 FROM players
       WHERE ${ROSTER_SQL}
       ON CONFLICT (matchday_id, player_id) DO NOTHING`,
      [matchday.id, confirm_all ? 'confirmed' : 'pending']
    );

    let position = 0;
    for (const playerId of diarista_ids) {
      position += 1;
      await client.query(
        `INSERT INTO confirmations (matchday_id, player_id, queue_position, status)
         VALUES ($1, $2, $3, 'confirmed')
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET status = 'confirmed', queue_position = EXCLUDED.queue_position`,
        [matchday.id, playerId, position]
      );
    }

    await client.query('COMMIT');

    // Aviso de confirmacao por e-mail. Vai em segundo plano de proposito: enviar
    // 20 mensagens demora, e a ATA nao pode ficar presa esperando o servidor SMTP.
    // Uma pelada lancada sem aviso continua valendo — da para reenviar depois.
    let notified = { configured: MAIL_CONFIGURED, recipients: 0 };
    if (notify && !confirm_all) {
      const recipients = await inviteRecipients();
      notified = { configured: MAIL_CONFIGURED, recipients: recipients.length };
      sendMatchdayInvites(matchday.id, appBaseUrl(req))
        .then((result) => console.log(
          `Aviso da pelada ${matchday.id}: ${result.sent} enviados, ${result.failed} falhas`
        ))
        .catch((err) => console.error('Falha ao disparar os avisos por e-mail:', err));
    }

    res.status(201).json({ ...matchday, notified });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Admin: reenvia o aviso de confirmacao (SMTP fora do ar na hora do lancamento,
// jogador incluido depois, ou simplesmente para lembrar quem nao confirmou).
// Com test = true manda so para o proprio admin, para conferir antes de
// disparar para o grupo inteiro.
async function notifyMatchday(req, res, next) {
  try {
    const test = req.body?.test === true;
    const result = await sendMatchdayInvites(
      req.params.id, appBaseUrl(req), test ? { onlyPlayerId: req.user.id } : {}
    );

    if (!result.configured) {
      return res.status(503).json({
        error: 'Envio de e-mail não configurado no servidor'
          + ' (BREVO_API_KEY + MAIL_FROM, ou SMTP_HOST/SMTP_USER/SMTP_PASS)',
      });
    }
    if (test && result.recipients === 0) {
      return res.status(400).json({
        error: 'Seu cadastro está sem e-mail. Preencha em "Meu perfil" para receber o teste.',
      });
    }
    res.json({ ...result, test });
  } catch (err) {
    next(err);
  }
}

// Admin: ata retroativa a partir do papel. Cria a pelada ja fechada, marca quem jogou
// e abre os times vazios para o admin montar e preencher a sumula na mao.
async function createRetroactive(req, res, next) {
  const client = await pool.connect();
  try {
    const { match_date, player_ids = [], number_of_teams = 4 } = req.body;
    if (!match_date) return res.status(400).json({ error: 'Informe a data da pelada' });
    if (player_ids.length === 0) {
      return res.status(400).json({ error: 'Selecione quem jogou nesse dia' });
    }

    const settings = await getSettings();
    const teamCount = Math.min(8, Math.max(2, Number(number_of_teams) || 4));
    await client.query('BEGIN');

    const seasonId = await resolveSeason(client, match_date);

    const { rows: matchdayRows } = await client.query(
      `INSERT INTO matchdays (season_id, match_date, confirmation_deadline, status)
       VALUES ($1, $2, ($2::date + $3::time), 'closed')
       RETURNING *`,
      [seasonId, match_date, settings.match_time]
    );
    const matchday = matchdayRows[0];

    let position = 0;
    for (const playerId of player_ids) {
      const { rows: player } = await client.query(
        'SELECT player_type FROM players WHERE id = $1', [playerId]
      );
      if (!player[0]) continue;
      position += 1;
      await client.query(
        `INSERT INTO confirmations (matchday_id, player_id, queue_position, status)
         VALUES ($1, $2, $3, 'confirmed')
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET status = 'confirmed'`,
        [matchday.id, playerId, player[0].player_type === 'diarista' ? position : null]
      );
    }

    // Times vazios: o admin arrasta os jogadores para dentro
    for (let i = 0; i < teamCount; i += 1) {
      await client.query(
        `INSERT INTO teams (matchday_id, name) VALUES ($1, $2)`,
        [matchday.id, `Time ${String.fromCharCode(65 + i)}`]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(matchday);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function list(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM matchdays ORDER BY match_date DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM matchdays WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Mensalistas saem na ordem fixa 1-20; diaristas na ordem em que confirmaram
async function getConfirmations(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, ${displayNameSql('p')} AS name, p.player_type, p.stars, p.photo_url, p.mensalista_number,
              ${displayNameSql('inv')} AS invited_by_name
       FROM confirmations c
       JOIN players p ON p.id = c.player_id
       LEFT JOIN players inv ON inv.id = c.invited_by_player_id
       WHERE c.matchday_id = $1
       ORDER BY p.mensalista_number NULLS LAST, c.queue_position NULLS LAST, c.confirmed_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Jogador avisa que nao vai ("Nao vou"). Mensalista fica marcado como recusado
// na lista; diarista simplesmente sai da fila.
async function declineOwn(req, res, next) {
  try {
    const { rows: matchdayRows } = await pool.query(
      'SELECT status FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    if (matchdayRows[0].status !== 'open' && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
    }

    const { rows: playerRows } = await pool.query(
      'SELECT player_type FROM players WHERE id = $1', [req.user.id]
    );
    if (playerRows[0]?.player_type === 'diarista') {
      await pool.query(
        'DELETE FROM confirmations WHERE matchday_id = $1 AND player_id = $2',
        [req.params.id, req.user.id]
      );
      return res.json({ status: 'removed' });
    }

    const { rows } = await pool.query(
      `INSERT INTO confirmations (matchday_id, player_id, status)
       VALUES ($1, $2, 'declined')
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET status = 'declined', queue_position = NULL
       RETURNING status`,
      [req.params.id, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Jogador desiste da propria vaga. Mensalista continua relacionado (volta a pendente);
// diarista sai da fila, liberando a posicao para os proximos.
async function cancelOwnConfirmation(req, res, next) {
  try {
    const { rows: matchdayRows } = await pool.query(
      'SELECT status FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    if (matchdayRows[0].status !== 'open' && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
    }

    const { rows: playerRows } = await pool.query(
      'SELECT player_type FROM players WHERE id = $1', [req.user.id]
    );

    if (playerRows[0]?.player_type === 'mensalista') {
      await pool.query(
        `UPDATE confirmations SET status = 'pending' WHERE matchday_id = $1 AND player_id = $2`,
        [req.params.id, req.user.id]
      );
    } else {
      await pool.query(
        'DELETE FROM confirmations WHERE matchday_id = $1 AND player_id = $2',
        [req.params.id, req.user.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Qualquer jogador logado pode incluir alguem na lista (diarista ou goleiro convidado).
// Aceita um jogador ja cadastrado ou um nome novo, que entra como diarista.
async function invitePlayer(req, res, next) {
  const client = await pool.connect();
  try {
    const { player_id, first_name, last_name, nickname, player_type } = req.body;

    const { rows: matchdayRows } = await client.query(
      'SELECT status FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    if (matchdayRows[0].status !== 'open' && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
    }

    // Valida antes de abrir a transacao: um retorno no meio dela devolveria a
    // conexao ao pool com a transacao pendurada
    if (!player_id) {
      if (!first_name) {
        return res.status(400).json({ error: 'Informe o nome de quem você quer incluir' });
      }
    } else {
      const { rows } = await client.query(
        'SELECT player_type, blocked, block_reason, active FROM players WHERE id = $1', [player_id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });
      if (!rows[0].active) return res.status(409).json({ error: 'Este cadastro está inativo' });
      if (rows[0].blocked) {
        return res.status(403).json({ error: rows[0].block_reason || 'Jogador bloqueado' });
      }
      if (rows[0].player_type === 'mensalista') {
        return res.status(409).json({ error: 'Mensalistas já entram na lista e confirmam sozinhos' });
      }

      // Nao adianta um terceiro incluir quem esta devendo
      if (req.user.role !== 'admin') {
        const pendencia = await confirmationBlock(player_id);
        if (pendencia) {
          return res.status(403).json({ error: `Não dá para incluir: ${pendencia}` });
        }
      }
    }

    await client.query('BEGIN');

    let invitedId = player_id;
    if (!invitedId) {
      const type = player_type === 'goleiro' ? 'goleiro' : 'diarista';
      const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
      const { rows } = await client.query(
        `INSERT INTO players (first_name, last_name, nickname, password_hash, player_type)
         VALUES ($1, COALESCE($2, ''), $3, $4, $5) RETURNING id`,
        [first_name, last_name, nickname || null, passwordHash, type]
      );
      invitedId = rows[0].id;
    }

    const queuePosition = await nextQueuePosition(client, req.params.id);
    const { rows } = await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET
         status = 'confirmed',
         invited_by_player_id = COALESCE(confirmations.invited_by_player_id, EXCLUDED.invited_by_player_id),
         queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position)
       RETURNING *`,
      [req.params.id, invitedId, req.user.id, queuePosition]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Admin marca/desmarca a presenca de qualquer jogador na ata
async function setConfirmation(req, res, next) {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    if (!['pending', 'confirmed', 'waitlist', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { rows: playerRows } = await client.query(
      'SELECT player_type FROM players WHERE id = $1', [req.params.playerId]
    );
    if (!playerRows[0]) return res.status(404).json({ error: 'Jogador não encontrado' });

    const queuePosition = playerRows[0].player_type === 'diarista' && status === 'confirmed'
      ? await nextQueuePosition(client, req.params.id)
      : null;

    const { rows } = await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, status, queue_position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET
         status = EXCLUDED.status,
         queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position)
       RETURNING *`,
      [req.params.id, req.params.playerId, status, queuePosition]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

// Admin remove um jogador da ata (usado para tirar diarista incluido por engano)
// Retira alguem da lista. Alem do admin, quem convidou pode retirar
// a pessoa que incluiu, caso ela desista.
async function removeConfirmation(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.invited_by_player_id, p.player_type, m.status AS matchday_status
       FROM confirmations c
       JOIN players p ON p.id = c.player_id
       JOIN matchdays m ON m.id = c.matchday_id
       WHERE c.matchday_id = $1 AND c.player_id = $2`,
      [req.params.id, req.params.playerId]
    );
    const entry = rows[0];
    if (!entry) return res.status(404).json({ error: 'Jogador não está nesta lista' });

    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      if (entry.player_type === 'mensalista') {
        return res.status(403).json({ error: 'Mensalistas não podem ser retirados da lista' });
      }
      if (entry.invited_by_player_id !== req.user.id) {
        return res.status(403).json({ error: 'Só quem convidou pode retirar esta pessoa' });
      }
      if (entry.matchday_status !== 'open') {
        return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
      }
    }

    await pool.query(
      'DELETE FROM confirmations WHERE matchday_id = $1 AND player_id = $2',
      [req.params.id, req.params.playerId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function nextQueuePosition(client, matchdayId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next FROM confirmations WHERE matchday_id = $1`,
    [matchdayId]
  );
  return rows[0].next;
}

// Jogador confirma presença. Mensalista confirma a qualquer momento ate o fechamento;
// diarista entra na fila por ordem de confirmacao.
async function confirm(req, res, next) {
  const client = await pool.connect();
  try {
    const playerId = req.body.player_id && req.user.role === 'admin' ? req.body.player_id : req.user.id;
    const { invited_by_player_id } = req.body;

    const { rows: playerRows } = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const player = playerRows[0];
    if (!player) return res.status(404).json({ error: 'Jogador não encontrado' });
    if (player.blocked) {
      return res.status(403).json({ error: player.block_reason || 'Cadastro bloqueado' });
    }

    // Quem esta devendo nao entra na lista. O admin pode confirmar por ele,
    // para o caso de o acerto ter sido feito na hora, em dinheiro.
    if (req.user.role !== 'admin') {
      const pendencia = await confirmationBlock(playerId);
      if (pendencia) return res.status(403).json({ error: pendencia });
    }

    const { rows: matchdayRows } = await client.query(
      'SELECT status FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });
    if (matchdayRows[0].status !== 'open' && req.user.role !== 'admin') {
      return res.status(409).json({ error: 'A lista desta pelada já foi fechada' });
    }

    const queuePosition = player.player_type === 'diarista'
      ? await nextQueuePosition(client, req.params.id)
      : null;

    const { rows } = await client.query(
      `INSERT INTO confirmations (matchday_id, player_id, invited_by_player_id, queue_position, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       ON CONFLICT (matchday_id, player_id) DO UPDATE SET
         status = 'confirmed',
         queue_position = COALESCE(confirmations.queue_position, EXCLUDED.queue_position),
         confirmed_at = now()
       RETURNING *`,
      [req.params.id, playerId, invited_by_player_id || null, queuePosition]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

// Confirma mensalistas/goleiros e completa vagas com diaristas por ordem de fila
async function closeMatchday(matchdayId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Mensalistas tem prioridade e podem confirmar ate o fechamento;
    // quem nao confirmou perde a vaga, que passa para a fila de diaristas.
    const { rows: mensalistasConfirmados } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'mensalista' AND c.status = 'confirmed'`,
      [matchdayId]
    );
    // Quem simplesmente nao respondeu continua 'pending' (aparece como "nao confirmou"),
    // diferente de quem avisou que nao vai, que fica 'declined'.
    const { rows: mensalistasAusentes } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'mensalista'
         AND c.status IN ('pending', 'declined')`,
      [matchdayId]
    );
    const { rows: goleiros } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'goleiro' AND c.status = 'confirmed'`,
      [matchdayId]
    );

    // Nao existe numero fixo de vagas: cada mensalista que nao confirmou libera a sua
    const { rows: totalMensalistas } = await client.query(
      `SELECT COUNT(*)::int AS total FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'mensalista'`,
      [matchdayId]
    );
    const vagas = Math.max(0, totalMensalistas[0].total - mensalistasConfirmados.length);
    const { rows: diaristas } = await client.query(
      `SELECT c.id FROM confirmations c JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'diarista' AND c.status IN ('confirmed', 'waitlist')
       ORDER BY c.queue_position ASC NULLS LAST, c.confirmed_at`,
      [matchdayId]
    );

    const confirmados = diaristas.slice(0, vagas).map((r) => r.id);
    const fila = diaristas.slice(vagas).map((r) => r.id);

    if (confirmados.length) {
      await client.query(`UPDATE confirmations SET status = 'confirmed' WHERE id = ANY($1::int[])`, [confirmados]);
    }
    if (fila.length) {
      await client.query(`UPDATE confirmations SET status = 'waitlist' WHERE id = ANY($1::int[])`, [fila]);
    }

    await client.query(`UPDATE matchdays SET status = 'closed' WHERE id = $1`, [matchdayId]);
    await client.query('COMMIT');
    return {
      mensalistas: mensalistasConfirmados.length,
      mensalistasSemConfirmar: mensalistasAusentes.length,
      goleiros: goleiros.length,
      diaristasConfirmados: confirmados.length,
      fila: fila.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Admin: fecha a lista manualmente (mesma logica do job automatico de sexta 17h)
async function closeList(req, res, next) {
  try {
    const summary = await closeMatchday(req.params.id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

// Admin: sorteia times equilibrados por soma de estrelas (goleiros ficam de fora)
async function drawTeams(req, res, next) {
  try {
    const { numberOfTeams } = req.body;
    const teams = Math.max(2, numberOfTeams || 2);

    const { rows: players } = await pool.query(
      `SELECT p.id, p.stars, ${displayNameSql('p')} AS name FROM confirmations c
       JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND c.status = 'confirmed' AND p.player_type != 'goleiro'
       ORDER BY p.stars DESC`,
      [req.params.id]
    );

    const buckets = Array.from({ length: teams }, () => ({ players: [], totalStars: 0 }));
    for (const player of players) {
      const target = buckets.reduce((min, b) => (b.totalStars < min.totalStars ? b : min), buckets[0]);
      target.players.push(player);
      target.totalStars += Number(player.stars);
    }

    await pool.query('DELETE FROM teams WHERE matchday_id = $1', [req.params.id]);
    const created = [];
    for (let i = 0; i < buckets.length; i += 1) {
      // O time leva o nome de quem foi sorteado primeiro nele (o de mais
      // estrelas), como na pelada: "o time do Fulano". O admin pode trocar.
      const nome = buckets[i].players[0]?.name || `Time ${String.fromCharCode(65 + i)}`;
      const { rows } = await pool.query(
        `INSERT INTO teams (matchday_id, name) VALUES ($1, $2) RETURNING id, name`,
        [req.params.id, nome.slice(0, 40)]
      );
      const team = rows[0];
      for (const player of buckets[i].players) {
        await pool.query('INSERT INTO team_players (team_id, player_id) VALUES ($1, $2)', [team.id, player.id]);
      }
      created.push({ ...team, players: buckets[i].players, totalStars: buckets[i].totalStars });
    }

    res.json(created);
  } catch (err) {
    next(err);
  }
}

async function getTeams(req, res, next) {
  try {
    const { rows: teams } = await pool.query(
      'SELECT * FROM teams WHERE matchday_id = $1 ORDER BY name',
      [req.params.id]
    );
    const { rows: teamPlayers } = await pool.query(
      `SELECT tp.team_id, p.id, ${displayNameSql('p')} AS name, p.stars FROM team_players tp
       JOIN players p ON p.id = tp.player_id
       WHERE tp.team_id = ANY($1::int[])`,
      [teams.map((t) => t.id)]
    );
    const result = teams.map((t) => ({
      ...t,
      players: teamPlayers.filter((p) => p.team_id === t.id),
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Admin: troca o nome do time. O sorteio batiza com o nome de um jogador,
// mas na pelada o time costuma ser conhecido por outro.
async function renameTeam(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: 'Informe o nome do time' });

    const { rows } = await pool.query(
      'UPDATE teams SET name = $1 WHERE id = $2 AND matchday_id = $3 RETURNING id, name',
      [name, req.params.teamId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Time não encontrado nesta pelada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Admin: move um jogador confirmado para outro time do sorteio
async function moveTeamPlayer(req, res, next) {
  try {
    const { player_id, team_id } = req.body;
    await pool.query(
      `DELETE FROM team_players WHERE player_id = $1
       AND team_id IN (SELECT id FROM teams WHERE matchday_id = $2)`,
      [player_id, req.params.id]
    );
    await pool.query('INSERT INTO team_players (team_id, player_id) VALUES ($1, $2)', [team_id, player_id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Apagar uma pelada e irreversivel: some a ata, os times, a sumula e as
// cobrancas dela (nao ha lixeira). Por isso exige a propria senha do admin,
// como redigitar a senha antes de uma acao sem volta — quem chega aqui ja e
// admin, isso nao e sobre permissao, e sobre nao deixar sair no automatico.
// Apagar uma pelada e irreversivel: some a ata, os times, a sumula e as
// cobrancas dela (nao ha lixeira). A trava contra clique acidental fica no
// frontend (digitar "EXCLUIR"); o que garante que da pra saber quem fez, se
// precisar, e o registro de auditoria abaixo.
async function remove(req, res, next) {
  try {
    const { rows: mdRows } = await pool.query(
      'SELECT match_date FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!mdRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });

    await pool.query('DELETE FROM payments WHERE matchday_id = $1', [req.params.id]);
    await pool.query('DELETE FROM matchdays WHERE id = $1', [req.params.id]);

    await logAudit({
      actorId: req.user.id,
      actorName: req.user.name,
      action: 'matchday.delete',
      targetType: 'matchday',
      targetId: Number(req.params.id),
      targetLabel: mdRows[0].match_date,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const { rows: playerStats } = await pool.query(
      'SELECT * FROM player_match_stats WHERE matchday_id = $1', [req.params.id]
    );
    const { rows: goalkeeperStats } = await pool.query(
      'SELECT * FROM goalkeeper_match_stats WHERE matchday_id = $1', [req.params.id]
    );
    res.json({ playerStats, goalkeeperStats });
  } catch (err) {
    next(err);
  }
}

// Tudo que a tela da pelada precisa numa unica chamada. Antes eram 5
// requisicoes por navegacao (pelada, confirmacoes, times, sumula, elenco) —
// multiplicado por gente entrando ao mesmo tempo, foi isso que sobrecarregou
// o servidor no dia do lancamento da ATA. Usada tanto pela tela do jogador
// quanto pela do admin, que buscavam exatamente as mesmas cinco coisas.
async function getFull(req, res, next) {
  try {
    const { rows: matchdayRows } = await pool.query(
      'SELECT * FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });

    const [
      { rows: confirmations },
      { rows: teamRows },
      { rows: playerStats },
      { rows: goalkeeperStats },
      players,
    ] = await Promise.all([
      pool.query(
        `SELECT c.*, ${displayNameSql('p')} AS name, p.player_type, p.stars, p.photo_url, p.mensalista_number,
                ${displayNameSql('inv')} AS invited_by_name
         FROM confirmations c
         JOIN players p ON p.id = c.player_id
         LEFT JOIN players inv ON inv.id = c.invited_by_player_id
         WHERE c.matchday_id = $1
         ORDER BY p.mensalista_number NULLS LAST, c.queue_position NULLS LAST, c.confirmed_at`,
        [req.params.id]
      ),
      pool.query('SELECT * FROM teams WHERE matchday_id = $1 ORDER BY name', [req.params.id]),
      pool.query('SELECT * FROM player_match_stats WHERE matchday_id = $1', [req.params.id]),
      pool.query('SELECT * FROM goalkeeper_match_stats WHERE matchday_id = $1', [req.params.id]),
      listActivePlayers(),
    ]);

    const { rows: teamPlayers } = await pool.query(
      `SELECT tp.team_id, p.id, ${displayNameSql('p')} AS name, p.stars FROM team_players tp
       JOIN players p ON p.id = tp.player_id
       WHERE tp.team_id = ANY($1::int[])`,
      [teamRows.map((t) => t.id)]
    );
    const teams = teamRows.map((t) => ({
      ...t,
      players: teamPlayers.filter((p) => p.team_id === t.id),
    }));

    res.json({
      matchday: matchdayRows[0],
      confirmations,
      teams,
      summary: { playerStats, goalkeeperStats },
      players,
    });
  } catch (err) {
    next(err);
  }
}

// Sumula ao vivo: o que um toque na tela pode somar. Jogador de linha e goleiro
// tem colunas diferentes, como na ata em papel.
const LIVE_LINE_STATS = ['goals', 'assists', 'yellow_cards', 'blue_cards', 'red_cards'];
const LIVE_GK_STATS = ['goals', 'assists', 'penalties_saved', 'yellow_cards', 'red_cards',
  'wins', 'draws', 'losses'];
const LIVE_TEAM_STATS = ['wins', 'draws', 'losses'];

// Admin: tudo que a tela de sumula ao vivo precisa numa unica requisicao,
// porque no campo a conexao costuma ser ruim.
async function getLive(req, res, next) {
  try {
    const { rows: matchdayRows } = await pool.query(
      'SELECT * FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });

    const { rows: teams } = await pool.query(
      'SELECT id, name, wins, draws, losses FROM teams WHERE matchday_id = $1 ORDER BY name',
      [req.params.id]
    );
    const { rows: teamPlayers } = await pool.query(
      `SELECT tp.team_id, p.id, ${displayNameSql('p')} AS name
       FROM team_players tp
       JOIN teams t ON t.id = tp.team_id
       JOIN players p ON p.id = tp.player_id
       WHERE t.matchday_id = $1
       ORDER BY ${displayNameSql('p')}`,
      [req.params.id]
    );
    // Goleiros nao costumam confirmar sozinhos: entram a menos que tenham recusado
    const { rows: goalkeepers } = await pool.query(
      `SELECT p.id, ${displayNameSql('p')} AS name
       FROM confirmations c
       JOIN players p ON p.id = c.player_id
       WHERE c.matchday_id = $1 AND p.player_type = 'goleiro' AND c.status <> 'declined'
       ORDER BY ${displayNameSql('p')}`,
      [req.params.id]
    );
    const { rows: playerStats } = await pool.query(
      'SELECT * FROM player_match_stats WHERE matchday_id = $1', [req.params.id]
    );
    const { rows: goalkeeperStats } = await pool.query(
      'SELECT * FROM goalkeeper_match_stats WHERE matchday_id = $1', [req.params.id]
    );

    res.json({
      matchday: matchdayRows[0],
      teams: teams.map((t) => ({ ...t, players: teamPlayers.filter((p) => p.team_id === t.id) })),
      goalkeepers,
      playerStats,
      goalkeeperStats,
    });
  } catch (err) {
    next(err);
  }
}

// Grava o toque no historico. Devolve false quando o client_id ja tinha subido
// antes, para o mesmo gol nao ser somado duas vezes no reenvio da fila.
async function recordEvent(client, { matchdayId, playerId = null, teamId = null, stat, delta, clientId, userId }) {
  const { rows } = await client.query(
    `INSERT INTO match_events (matchday_id, player_id, team_id, stat, delta, client_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (client_id) DO NOTHING
     RETURNING id`,
    [matchdayId, playerId, teamId, stat, delta, clientId, userId]
  );
  return !!rows[0];
}

// Admin: recebe a fila de toques do celular. Cada evento traz um client_id gerado
// no aparelho; o repetido e ignorado, então reenviar a fila apos perder o sinal e
// seguro. Sao somas de +1/-1 (o "desfazer" manda -1), logo a ordem nao importa.
// O evento aponta para um jogador (gol, assistencia, cartao) ou para um time
// (vitoria/empate/derrota de cada partida do rodizio).
async function pushEvents(req, res, next) {
  const client = await pool.connect();
  try {
    const { events } = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Lista de lançamentos inválida' });
    }
    if (events.length > 200) {
      return res.status(400).json({ error: 'Muitos lançamentos de uma vez' });
    }

    const { rows: matchdayRows } = await client.query(
      'SELECT id FROM matchdays WHERE id = $1', [req.params.id]
    );
    if (!matchdayRows[0]) return res.status(404).json({ error: 'Pelada não encontrada' });

    await client.query('BEGIN');
    let applied = 0;
    let ignored = 0;

    for (const event of events) {
      const clientId = String(event.client_id || '');
      const delta = Number(event.delta);
      if (!clientId || clientId.length > 60 || (delta !== 1 && delta !== -1)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Lançamento inválido' });
      }

      // V/E/D do time em cada partida do rodizio
      if (event.team_id != null) {
        const teamId = Number(event.team_id);
        if (!Number.isInteger(teamId) || !LIVE_TEAM_STATS.includes(event.stat)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Resultado de time inválido' });
        }

        const { rows: teamRows } = await client.query(
          'SELECT id FROM teams WHERE id = $1 AND matchday_id = $2', [teamId, req.params.id]
        );
        if (!teamRows[0]) {
          ignored += 1; // time apagado/refeito depois do lancamento: nao trava a fila
          continue;
        }

        const registered = await recordEvent(client, {
          matchdayId: req.params.id, teamId, stat: event.stat, delta, clientId, userId: req.user.id,
        });
        if (!registered) {
          ignored += 1;
          continue;
        }

        await client.query(
          `UPDATE teams SET ${event.stat} = GREATEST(0, ${event.stat} + $1) WHERE id = $2`,
          [delta, teamId]
        );
        applied += 1;
        continue;
      }

      const playerId = Number(event.player_id);
      if (!Number.isInteger(playerId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Lançamento inválido' });
      }

      const { rows: playerRows } = await client.query(
        'SELECT player_type FROM players WHERE id = $1', [playerId]
      );
      if (!playerRows[0]) {
        ignored += 1; // jogador apagado depois do lancamento: nao trava a fila
        continue;
      }

      const isGoalkeeper = playerRows[0].player_type === 'goleiro';
      const allowed = isGoalkeeper ? LIVE_GK_STATS : LIVE_LINE_STATS;
      if (!allowed.includes(event.stat)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tipo de lançamento inválido para este jogador' });
      }

      const registered = await recordEvent(client, {
        matchdayId: req.params.id, playerId, stat: event.stat, delta, clientId, userId: req.user.id,
      });
      if (!registered) {
        ignored += 1; // esse toque ja tinha subido numa tentativa anterior
        continue;
      }

      if (isGoalkeeper) {
        await client.query(
          `INSERT INTO goalkeeper_match_stats (matchday_id, player_id, ${event.stat})
           VALUES ($1, $2, GREATEST(0, $3))
           ON CONFLICT (matchday_id, player_id) DO UPDATE SET
             ${event.stat} = GREATEST(0, goalkeeper_match_stats.${event.stat} + $3)`,
          [req.params.id, playerId, delta]
        );
      } else {
        await client.query(
          `INSERT INTO player_match_stats (matchday_id, player_id, team_id, ${event.stat})
           VALUES ($1, $2,
             (SELECT tp.team_id FROM team_players tp
              JOIN teams t ON t.id = tp.team_id
              WHERE t.matchday_id = $1 AND tp.player_id = $2 LIMIT 1),
             GREATEST(0, $3))
           ON CONFLICT (matchday_id, player_id) DO UPDATE SET
             ${event.stat} = GREATEST(0, player_match_stats.${event.stat} + $3),
             team_id = COALESCE(player_match_stats.team_id, EXCLUDED.team_id)`,
          [req.params.id, playerId, delta]
        );
      }
      applied += 1;
    }

    await client.query('COMMIT');

    // Devolve os totais do servidor para o celular se acertar com a realidade
    const { rows: playerStats } = await client.query(
      'SELECT * FROM player_match_stats WHERE matchday_id = $1', [req.params.id]
    );
    const { rows: goalkeeperStats } = await client.query(
      'SELECT * FROM goalkeeper_match_stats WHERE matchday_id = $1', [req.params.id]
    );
    const { rows: teams } = await client.query(
      'SELECT id, name, wins, draws, losses FROM teams WHERE matchday_id = $1 ORDER BY name',
      [req.params.id]
    );
    res.json({ applied, ignored, playerStats, goalkeeperStats, teams });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// Admin: lançamento da súmula pós-jogo (gera multas e diarias automaticamente)
async function submitSummary(req, res, next) {
  const client = await pool.connect();
  try {
    const settings = await getSettings();
    await client.query('BEGIN');
    const { playerStats = [], goalkeeperStats = [], teamResults = [] } = req.body;

    const { rows: matchdayRows } = await client.query(
      'SELECT season_id FROM matchdays WHERE id = $1', [req.params.id]
    );
    const seasonId = matchdayRows[0]?.season_id || null;

    for (const t of teamResults) {
      await client.query(
        'UPDATE teams SET wins = $1, draws = $2, losses = $3 WHERE id = $4 AND matchday_id = $5',
        [Number(t.wins) || 0, Number(t.draws) || 0, Number(t.losses) || 0, t.team_id, req.params.id]
      );
    }

    // Recalcula do zero: reeditar a sumula nao pode duplicar cobrancas
    await client.query(
      `DELETE FROM payments WHERE matchday_id = $1 AND type IN ('multa', 'diaria') AND status = 'pending'`,
      [req.params.id]
    );

    for (const s of playerStats) {
      await client.query(
        `INSERT INTO player_match_stats
           (matchday_id, player_id, team_id, goals, assists, yellow_cards, blue_cards, red_cards, absent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET
           team_id = EXCLUDED.team_id, goals = EXCLUDED.goals, assists = EXCLUDED.assists,
           yellow_cards = EXCLUDED.yellow_cards, blue_cards = EXCLUDED.blue_cards,
           red_cards = EXCLUDED.red_cards, absent = EXCLUDED.absent`,
        [req.params.id, s.player_id, s.team_id || null, s.goals || 0, s.assists || 0,
         s.yellow_cards || 0, s.blue_cards || 0, s.red_cards || 0, !!s.absent]
      );

      const { rows: playerRows } = await client.query(
        'SELECT player_type FROM players WHERE id = $1', [s.player_id]
      );
      const playerType = playerRows[0]?.player_type;
      if (playerType === 'goleiro') continue; // goleiros sao isentos de qualquer cobranca

      const chargeType = s.absent ? 'multa' : (playerType === 'diarista' ? 'diaria' : null);
      if (!chargeType) continue;

      // Cobranca ja quitada e historico: reeditar a sumula (corrigir um cartao,
      // por exemplo) nao pode fazer uma diaria/multa ja paga "voltar a dever".
      // O DELETE acima so limpa pendentes; aqui e so nao duplicar em cima do
      // que ja foi baixado.
      const { rows: pagas } = await client.query(
        `SELECT 1 FROM payments
         WHERE matchday_id = $1 AND player_id = $2 AND type = $3 AND status = 'paid'`,
        [req.params.id, s.player_id, chargeType]
      );
      if (pagas.length > 0) continue;

      await client.query(
        `INSERT INTO payments (player_id, season_id, type, matchday_id, amount, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [s.player_id, seasonId, chargeType, req.params.id,
         chargeType === 'multa' ? settings.absence_fine : settings.daily_fee]
      );
    }

    for (const g of goalkeeperStats) {
      await client.query(
        `INSERT INTO goalkeeper_match_stats
           (matchday_id, player_id, wins, draws, losses, penalties_saved, assists, goals, yellow_cards, red_cards)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (matchday_id, player_id) DO UPDATE SET
           wins = EXCLUDED.wins, draws = EXCLUDED.draws, losses = EXCLUDED.losses,
           penalties_saved = EXCLUDED.penalties_saved, assists = EXCLUDED.assists, goals = EXCLUDED.goals,
           yellow_cards = EXCLUDED.yellow_cards, red_cards = EXCLUDED.red_cards`,
        [req.params.id, g.player_id, g.wins || 0, g.draws || 0, g.losses || 0,
         g.penalties_saved || 0, g.assists || 0, g.goals || 0, g.yellow_cards || 0, g.red_cards || 0]
      );
    }

    await client.query(`UPDATE matchdays SET status = 'played' WHERE id = $1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  create, list, getById, getConfirmations, confirm, closeList, closeMatchday,
  drawTeams, submitSummary, getSummary, getTeams, moveTeamPlayer, rosterPreview, createFromRoster, remove,
  setConfirmation, removeConfirmation, invitePlayer, cancelOwnConfirmation,
  declineOwn, createRetroactive, getLive, pushEvents, notifyMatchday, renameTeam,
  getFull,
};
