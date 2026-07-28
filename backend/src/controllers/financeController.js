const pool = require('../config/db');
const { displayNameSql, getSettings } = require('../config/settings');

// Mensalidades de um mes/ano: lista todos os mensalistas com status pago/em aberto
async function monthlyOverview(req, res, next) {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) {
      return res.status(400).json({ error: 'Informe mês e ano' });
    }

    const { rows } = await pool.query(
      `SELECT p.id AS player_id, ${displayNameSql('p')} AS name,
              pay.id AS payment_id, pay.amount, pay.status, pay.paid_at
       FROM players p
       LEFT JOIN payments pay
         ON pay.player_id = p.id AND pay.type = 'mensalidade'
        AND pay.reference_month = $1 AND pay.reference_year = $2
       WHERE p.player_type = 'mensalista'
       ORDER BY ${displayNameSql('p')}`,
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

// Diarias e multas em aberto, agrupadas pela data da pelada
async function pendingByMatchday(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT pay.id, pay.type, pay.amount, pay.status, pay.paid_at,
              ${displayNameSql('p')} AS name, m.match_date
       FROM payments pay
       JOIN players p ON p.id = pay.player_id
       LEFT JOIN matchdays m ON m.id = pay.matchday_id
       WHERE pay.type IN ('diaria', 'multa')
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

async function markPaid(req, res, next) {
  try {
    const { rows } = await pool.query(
      `UPDATE payments SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cobrança não encontrada' });
    res.json(rows[0]);
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
  monthlyOverview, setMonthlyStatus, pendingByMatchday, historyByPlayer, markPaid, markPending,
};
