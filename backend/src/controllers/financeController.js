const pool = require('../config/db');
const { displayNameSql, getSettings } = require('../config/settings');

// Quem entra na cobranca de um mes. Alem do mensalista de hoje, entra quem ERA
// mensalista naquele mes: rebaixar alguem em julho nao apaga o que ele devia em
// maio, e sem isso a divida sumia da tela. Espera $1 = mes e $2 = ano.
const MONTHLY_MEMBER_SQL = `
  (p.player_type = 'mensalista' AND p.active)
  OR EXISTS (
    SELECT 1 FROM player_status_history h
    WHERE h.player_id = p.id AND h.player_type = 'mensalista'
      AND h.start_date <= (make_date($2::int, $1::int, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date
      AND (h.end_date IS NULL OR h.end_date >= make_date($2::int, $1::int, 1))
  )
  OR EXISTS (
    SELECT 1 FROM payments lancada
    WHERE lancada.player_id = p.id AND lancada.type = 'mensalidade'
      AND lancada.reference_month = $1 AND lancada.reference_year = $2
  )
`;

// Quem efetivamente gera cobranca: a diretoria e isenta, mas continua
// aparecendo na lista do mes — so que marcada e sem botao de pagar.
const MONTHLY_PAYER_SQL = `NOT p.exempt_monthly AND (${MONTHLY_MEMBER_SQL})`;

// Mensalidades de um mes/ano: lista quem deve com status pago/em aberto
async function monthlyOverview(req, res, next) {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) {
      return res.status(400).json({ error: 'Informe mês e ano' });
    }

    const { rows } = await pool.query(
      `SELECT p.id AS player_id, ${displayNameSql('p')} AS name, p.mensalista_number,
              pay.id AS payment_id, pay.amount, pay.status, pay.paid_at,
              (p.player_type = 'mensalista' AND p.active) AS current_mensalista,
              p.exempt_monthly
       FROM players p
       LEFT JOIN payments pay
         ON pay.player_id = p.id AND pay.type = 'mensalidade'
        AND pay.reference_month = $1 AND pay.reference_year = $2
       WHERE ${MONTHLY_MEMBER_SQL}
       -- Mesma ordem da ata: numeracao do mensalista, ex-mensalistas no fim
       ORDER BY (p.player_type = 'mensalista' AND p.active) DESC,
                p.mensalista_number NULLS LAST, ${displayNameSql('p')}`,
      [month, year]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// Marca a mensalidade do mes como paga ou em aberto (cria o registro na primeira baixa)
async function setMonthlyStatus(req, res, next) {
  try {
    const { player_id, month, year, paid, paid_at } = req.body;
    const settings = await getSettings();

    if (!paid) {
      await pool.query(
        `DELETE FROM payments WHERE player_id = $1 AND type = 'mensalidade'
         AND reference_month = $2 AND reference_year = $3`,
        [player_id, month, year]
      );
      return res.json({ status: 'pending' });
    }

    const { rows } = await pool.query(
      `INSERT INTO payments (player_id, type, reference_month, reference_year, amount, status, paid_at)
       SELECT $1, 'mensalidade', $2, $3, $4, 'paid', COALESCE($5::timestamptz, now())
       WHERE NOT EXISTS (
         SELECT 1 FROM payments WHERE player_id = $1 AND type = 'mensalidade'
         AND reference_month = $2 AND reference_year = $3
       )
       RETURNING *`,
      [player_id, month, year, settings.monthly_fee, paid_at || null]
    );

    if (rows[0]) return res.json(rows[0]);

    const { rows: updated } = await pool.query(
      `UPDATE payments SET status = 'paid', paid_at = COALESCE($4::timestamptz, now())
       WHERE player_id = $1 AND type = 'mensalidade'
       AND reference_month = $2 AND reference_year = $3
       RETURNING *`,
      [player_id, month, year, paid_at || null]
    );
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
}

// Todas as mensalidades em aberto, de todos os meses, agrupadas por jogador.
// "Em aberto" nao tem registro proprio: e a ausencia da cobranca no mes, entao
// o mes so existe aqui se alguem deveria ter pago e nao ha linha lancada.
// A varredura comeca no mes mais antigo com movimento e vai ate o mes atual,
// e nunca cobra de alguem antes do cadastro dele existir.
async function openMonthlyDebts(req, res, next) {
  try {
    const settings = await getSettings();
    const { rows } = await pool.query(
      `WITH limites AS (
         SELECT COALESCE(
           LEAST(
             (SELECT MIN(make_date(reference_year, reference_month, 1))
              FROM payments WHERE type = 'mensalidade'),
             (SELECT MIN(date_trunc('month', match_date))::date FROM matchdays)
           ),
           date_trunc('month', CURRENT_DATE)::date
         ) AS primeiro
       ),
       meses AS (
         SELECT generate_series(
           (SELECT primeiro FROM limites),
           date_trunc('month', CURRENT_DATE)::date,
           INTERVAL '1 month'
         )::date AS mes
       ),
       entrada AS (
         SELECT p.id AS player_id,
                date_trunc('month', COALESCE(
                  (SELECT MIN(h.start_date) FROM player_status_history h
                   WHERE h.player_id = p.id AND h.player_type = 'mensalista'),
                  p.created_at::date
                ))::date AS desde
         FROM players p
       )
       SELECT p.id AS player_id, ${displayNameSql('p')} AS name,
              (p.player_type = 'mensalista' AND p.active) AS current_mensalista,
              EXTRACT(YEAR FROM m.mes)::int AS year,
              EXTRACT(MONTH FROM m.mes)::int AS month
       FROM meses m
       CROSS JOIN players p
       JOIN entrada e ON e.player_id = p.id
       LEFT JOIN payments pay
         ON pay.player_id = p.id AND pay.type = 'mensalidade'
        AND pay.reference_month = EXTRACT(MONTH FROM m.mes)::int
        AND pay.reference_year = EXTRACT(YEAR FROM m.mes)::int
       -- Sem registro nenhum ou com cobranca lancada e ainda nao paga
       WHERE (pay.id IS NULL OR pay.status = 'pending')
         AND NOT p.exempt_monthly
         AND (
           pay.id IS NOT NULL
           OR (p.player_type = 'mensalista' AND p.active AND m.mes >= e.desde)
           OR EXISTS (
             SELECT 1 FROM player_status_history h
             WHERE h.player_id = p.id AND h.player_type = 'mensalista'
               AND h.start_date <= (m.mes + INTERVAL '1 month' - INTERVAL '1 day')::date
               AND (h.end_date IS NULL OR h.end_date >= m.mes)
           )
         )
       ORDER BY ${displayNameSql('p')}, m.mes`
    );

    const fee = Number(settings.monthly_fee);
    const players = [];
    for (const row of rows) {
      let player = players.find((p) => p.player_id === row.player_id);
      if (!player) {
        player = {
          player_id: row.player_id,
          name: row.name,
          current_mensalista: row.current_mensalista,
          months: [],
          total: 0,
        };
        players.push(player);
      }
      player.months.push({ year: row.year, month: row.month });
      player.total += fee;
    }

    // Quem deve mais primeiro: e a lista de cobranca do organizador
    players.sort((a, b) => b.months.length - a.months.length || a.name.localeCompare(b.name));

    res.json({
      players,
      fee,
      total: players.reduce((sum, p) => sum + p.total, 0),
      months: players.reduce((sum, p) => sum + p.months.length, 0),
    });
  } catch (err) {
    next(err);
  }
}

// Acerto do mes inteiro de uma vez, para bater o sistema com um controle feito
// por fora. Depois o admin reabre no "Desfazer" quem continua devendo.
// "Em aberto" nao tem registro proprio: e a ausencia da cobranca, como no
// lancamento individual — por isso o caminho de reabrir e apagar a linha.
async function setMonthlyStatusForAll(req, res, next) {
  try {
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    const { paid, paid_at } = req.body || {};
    if (!month || !year) return res.status(400).json({ error: 'Informe mês e ano' });

    // Toda cobranca do mes pertence a alguem que aparece na tela, entao apagar
    // por mes/ano ja corresponde ao que o admin esta vendo
    if (!paid) {
      const { rows } = await pool.query(
        `DELETE FROM payments
         WHERE type = 'mensalidade' AND reference_month = $1 AND reference_year = $2
         RETURNING id`,
        [month, year]
      );
      return res.json({ changed: rows.length });
    }

    const settings = await getSettings();
    const { rows: created } = await pool.query(
      `INSERT INTO payments (player_id, type, reference_month, reference_year, amount, status, paid_at)
       SELECT p.id, 'mensalidade', $1, $2, $3, 'paid', COALESCE($4::timestamptz, now())
       FROM players p
       WHERE (${MONTHLY_PAYER_SQL})
         AND NOT EXISTS (
           SELECT 1 FROM payments pay
           WHERE pay.player_id = p.id AND pay.type = 'mensalidade'
             AND pay.reference_month = $1 AND pay.reference_year = $2
         )
       RETURNING id`,
      [month, year, settings.monthly_fee, paid_at || null]
    );

    // Quem ja tinha cobranca lancada e continuava em aberto
    const { rows: updated } = await pool.query(
      `UPDATE payments SET status = 'paid', paid_at = COALESCE($3::timestamptz, now())
       WHERE type = 'mensalidade' AND reference_month = $1 AND reference_year = $2
         AND status <> 'paid'
       RETURNING id`,
      [month, year, paid_at || null]
    );

    res.json({ changed: created.length + updated.length });
  } catch (err) {
    next(err);
  }
}

// Diarias e multas agrupadas pela data da pelada. Por padrao mostra so o que
// esta em aberto: depois de um tempo a lista de quitadas nao cabe na tela e o
// que interessa no dia a dia e quem ainda deve. Com status=all vem o historico.
async function pendingByMatchday(req, res, next) {
  try {
    const somenteAbertas = req.query.status !== 'all';
    const { rows } = await pool.query(
      `SELECT pay.id, pay.type, pay.amount, pay.status, pay.paid_at,
              ${displayNameSql('p')} AS name, m.match_date
       FROM payments pay
       JOIN players p ON p.id = pay.player_id
       LEFT JOIN matchdays m ON m.id = pay.matchday_id
       WHERE pay.type IN ('diaria', 'multa')
         ${somenteAbertas ? "AND pay.status = 'pending'" : ''}
       ORDER BY m.match_date DESC NULLS LAST, pay.type, ${displayNameSql('p')}`
    );

    const grouped = [];
    for (const row of rows) {
      const key = row.match_date || 'sem-data';
      let group = grouped.find((g) => g.date === key);
      if (!group) {
        group = { date: key, match_date: row.match_date, items: [] };
        grouped.push(group);
      }
      group.items.push(row);
    }
    res.json(grouped);
  } catch (err) {
    next(err);
  }
}

async function historyByPlayer(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT pay.*, m.match_date FROM payments pay
       LEFT JOIN matchdays m ON m.id = pay.matchday_id
       WHERE pay.player_id = $1 ORDER BY pay.created_at DESC`,
      [req.params.playerId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// paid_at aceita uma data informada pelo admin, que pode dar baixa dias depois
async function markPaid(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE payments SET status = 'paid', paid_at = COALESCE($2::timestamptz, now())
       WHERE id = $1 RETURNING *`,
      [req.params.id, req.body?.paid_at || null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cobrança não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Baixa em massa das diarias e multas em aberto. Serve para acertar o sistema
// com um controle feito por fora (planilha): quita tudo de uma vez e depois o
// admin reabre com "Desfazer" as poucas que continuam devendo.
// Mensalidade fica de fora de proposito — ela tem a propria tela, por mes.
async function payAllPending(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE payments SET status = 'paid', paid_at = COALESCE($1::timestamptz, now())
       WHERE type IN ('diaria', 'multa') AND status = 'pending'
       RETURNING id`,
      [req.body?.paid_at || null]
    );
    res.json({ paid: rows.length });
  } catch (err) {
    next(err);
  }
}

async function markPending(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE payments SET status = 'pending', paid_at = NULL WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cobrança não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  monthlyOverview, openMonthlyDebts, setMonthlyStatus, setMonthlyStatusForAll,
  pendingByMatchday, historyByPlayer, markPaid, markPending, payAllPending,
};
