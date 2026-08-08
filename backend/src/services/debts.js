const pool = require('../config/db');
const { getSettings } = require('../config/settings');

// Quem entra na cobranca de um mes: quem ERA mensalista naquele mes, pelo
// historico de promocao/rebaixamento. Fica aqui porque tanto o financeiro
// quanto a confirmacao de presenca precisam da MESMA regra.
function monthlyMemberSql(inicioMes, fimMes) {
  return `
  EXISTS (
    SELECT 1 FROM player_status_history h
    WHERE h.player_id = p.id AND h.player_type = 'mensalista'
      AND h.start_date <= ${fimMes}
      AND (h.end_date IS NULL OR h.end_date >= ${inicioMes})
  )
  -- Reserva para cadastro que nunca passou pelo botao de promover
  OR (p.player_type = 'mensalista' AND p.active AND NOT EXISTS (
    SELECT 1 FROM player_status_history h2
    WHERE h2.player_id = p.id AND h2.player_type = 'mensalista'
  ))
`;
}

// O que um jogador deve: meses de mensalidade em aberto e as diarias/multas
// ainda nao pagas. Mesma varredura do painel do admin, limitada a uma pessoa.
async function openDebtsFor(playerId) {
  const settings = await getSettings();

  const { rows: months } = await pool.query(
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
     )
     SELECT EXTRACT(YEAR FROM m.mes)::int AS year,
            EXTRACT(MONTH FROM m.mes)::int AS month
     FROM meses m
     CROSS JOIN players p
     LEFT JOIN payments pay
       ON pay.player_id = p.id AND pay.type = 'mensalidade'
      AND pay.reference_month = EXTRACT(MONTH FROM m.mes)::int
      AND pay.reference_year = EXTRACT(YEAR FROM m.mes)::int
     WHERE p.id = $1
       AND (pay.id IS NULL OR pay.status = 'pending')
       AND NOT p.exempt_monthly
       AND (
         pay.id IS NOT NULL
         OR ${monthlyMemberSql('m.mes', "(m.mes + INTERVAL '1 month' - INTERVAL '1 day')::date")}
       )
     ORDER BY m.mes`,
    [playerId]
  );

  const { rows: charges } = await pool.query(
    `SELECT pay.id, pay.type, pay.amount, m.match_date
     FROM payments pay
     LEFT JOIN matchdays m ON m.id = pay.matchday_id
     WHERE pay.player_id = $1 AND pay.type IN ('diaria', 'multa') AND pay.status = 'pending'
     ORDER BY m.match_date DESC NULLS LAST`,
    [playerId]
  );

  return { months, charges, fee: Number(settings.monthly_fee) };
}

// Diaria ou multa em aberto ja impede; mensalidade so a partir da segunda,
// porque o mes corrente entra em aberto para todo mundo assim que vira.
const MAX_MENSALIDADES_ABERTAS = 1;

function blockingReason({ months, charges }) {
  const diarias = charges.filter((c) => c.type === 'diaria').length;
  const multas = charges.filter((c) => c.type === 'multa').length;
  const mensalidades = months.length;

  const pendencias = [];
  if (diarias) pendencias.push(`${diarias} diária(s)`);
  if (multas) pendencias.push(`${multas} multa(s)`);
  if (mensalidades > MAX_MENSALIDADES_ABERTAS) pendencias.push(`${mensalidades} mensalidades`);

  if (pendencias.length === 0) return null;
  return `Pendência no financeiro: ${pendencias.join(', ')}.`
    + ' Regularize com o organizador para confirmar presença — a sua situação está na aba Financeiro.';
}

// Motivo do bloqueio, ou null quando esta liberado
async function confirmationBlock(playerId) {
  const debts = await openDebtsFor(playerId);
  return blockingReason(debts);
}

module.exports = { monthlyMemberSql, openDebtsFor, confirmationBlock };
