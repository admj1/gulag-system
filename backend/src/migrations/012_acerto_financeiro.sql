-- Acerto unico do financeiro: ate agora o controle era feito em planilha e o
-- sistema estava desatualizado. Deixa em aberto exatamente o que o organizador
-- informou e da baixa em todo o resto.
--
-- Roda UMA VEZ so. O marcador em one_off_fixes existe porque as migrations sao
-- reaplicadas a cada deploy: sem ele, um deploy futuro desfaria as baixas que o
-- organizador tivesse dado depois.

CREATE TABLE IF NOT EXISTS one_off_fixes (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $acerto$
DECLARE
  item RECORD;
  mes DATE;
  qtd INT;
  fee NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM one_off_fixes WHERE name = 'acerto_financeiro_2026_08') THEN
    RAISE NOTICE 'Acerto financeiro ja aplicado antes; nada a fazer.';
    RETURN;
  END IF;

  SELECT monthly_fee INTO fee FROM settings WHERE id = 1;

  -- 1. Diretoria nao paga mensalidade
  UPDATE players SET exempt_monthly = TRUE
  WHERE TRIM(COALESCE(NULLIF(nickname, ''), first_name || ' ' || last_name))
        ILIKE ANY (ARRAY['Adema', 'Mateta', 'Barba']);
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RAISE NOTICE 'Diretoria isenta de mensalidade: % cadastro(s)', qtd;

  -- 2. Diarias e multas: baixa em tudo, com a data da propria pelada
  UPDATE payments pay SET status = 'paid', paid_at = m.match_date + TIME '12:00'
  FROM matchdays m
  WHERE m.id = pay.matchday_id AND pay.type IN ('diaria', 'multa') AND pay.status = 'pending';
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RAISE NOTICE 'Diarias/multas quitadas: %', qtd;

  -- As que nao tem pelada vinculada ficam com a data de hoje
  UPDATE payments SET status = 'paid', paid_at = now()
  WHERE type IN ('diaria', 'multa') AND status = 'pending';

  -- 3. Reabre as que continuam devendo
  FOR item IN
    SELECT * FROM (VALUES
      (DATE '2026-05-09', 'Kenner',   'diaria'),
      (DATE '2026-06-13', 'Davi',     'diaria'),
      (DATE '2026-06-13', 'Sapo',     'diaria'),
      (DATE '2026-06-20', 'Davi',     'multa'),
      (DATE '2026-07-11', 'Bruno',    'multa'),
      (DATE '2026-07-25', 'Galo',     'diaria'),
      (DATE '2026-08-01', 'Gian',     'multa'),
      (DATE '2026-08-01', 'Thiago',   'multa'),
      (DATE '2026-08-01', 'Anderson', 'multa')
    ) AS t(dia, quem, tipo)
  LOOP
    UPDATE payments pay SET status = 'pending', paid_at = NULL
    FROM matchdays m, players p
    WHERE m.id = pay.matchday_id AND p.id = pay.player_id
      AND m.match_date = item.dia AND pay.type = item.tipo
      AND (
        TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)) ILIKE item.quem
        OR TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)) ILIKE item.quem || ' %'
        OR p.first_name ILIKE item.quem
      );
    GET DIAGNOSTICS qtd = ROW_COUNT;
    IF qtd = 0 THEN
      RAISE NOTICE 'ATENCAO: nao achei % (%) em %', item.quem, item.tipo, item.dia;
    ELSIF qtd > 1 THEN
      RAISE NOTICE 'ATENCAO: % (%) em % bateu com % cobrancas', item.quem, item.tipo, item.dia, qtd;
    END IF;
  END LOOP;

  -- 4. Mensalidades: quita todo mes ate julho/26.
  -- Comeca em marco/26 no minimo: "em aberto" e a AUSENCIA de cobranca, entao um
  -- mes que ficasse de fora do laco apareceria com todo mundo devendo.
  FOR mes IN
    SELECT generate_series(
      LEAST(
        COALESCE((SELECT date_trunc('month', MIN(match_date))::date FROM matchdays), DATE '2026-03-01'),
        DATE '2026-03-01'
      ),
      DATE '2026-07-01',
      INTERVAL '1 month'
    )::date
  LOOP
    INSERT INTO payments (player_id, type, reference_month, reference_year, amount, status, paid_at)
    SELECT p.id, 'mensalidade',
           EXTRACT(MONTH FROM mes)::int, EXTRACT(YEAR FROM mes)::int,
           fee, 'paid',
           (mes + INTERVAL '1 month' - INTERVAL '1 day')::date + TIME '12:00'
    FROM players p
    WHERE NOT p.exempt_monthly
      AND (
        (p.player_type = 'mensalista' AND p.active
         AND mes >= date_trunc('month', COALESCE(
              (SELECT MIN(h.start_date) FROM player_status_history h
               WHERE h.player_id = p.id AND h.player_type = 'mensalista'),
              p.created_at::date))::date)
        OR EXISTS (
          SELECT 1 FROM player_status_history h
          WHERE h.player_id = p.id AND h.player_type = 'mensalista'
            AND h.start_date <= (mes + INTERVAL '1 month' - INTERVAL '1 day')::date
            AND (h.end_date IS NULL OR h.end_date >= mes)
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments pay
        WHERE pay.player_id = p.id AND pay.type = 'mensalidade'
          AND pay.reference_month = EXTRACT(MONTH FROM mes)::int
          AND pay.reference_year = EXTRACT(YEAR FROM mes)::int
      );

    UPDATE payments SET status = 'paid',
           paid_at = (mes + INTERVAL '1 month' - INTERVAL '1 day')::date + TIME '12:00'
    WHERE type = 'mensalidade' AND status <> 'paid'
      AND reference_month = EXTRACT(MONTH FROM mes)::int
      AND reference_year = EXTRACT(YEAR FROM mes)::int;
  END LOOP;

  -- 5. Mensalidades que continuam devendo. Gravadas como cobranca 'pending' em
  -- vez de simplesmente nao existir: os cadastros so foram criados em julho/26 e
  -- o sistema nao cobra ninguem antes do proprio cadastro, entao a divida de
  -- marco a junho nao teria onde aparecer se dependesse da ausencia de registro.
  FOR item IN
    SELECT * FROM (VALUES
      (2026, 3, 'Andre Lucas'),
      (2026, 4, 'Andre Lucas'),
      (2026, 5, 'Andre Lucas'), (2026, 5, 'Bruno'),
      (2026, 6, 'Andre Lucas'), (2026, 6, 'Anderson'), (2026, 6, 'Bruno'), (2026, 6, 'Nicolas'),
      (2026, 7, 'Wasley'), (2026, 7, 'Felix'), (2026, 7, 'Andre Lucas'), (2026, 7, 'Filipe'),
      (2026, 7, 'Igor Cordeiro'), (2026, 7, 'Juninho'), (2026, 7, 'Caio Solano'),
      (2026, 7, 'Anderson'), (2026, 7, 'Bruno'), (2026, 7, 'Nicolas')
    ) AS t(ano, mes, quem)
  LOOP
    -- Tira o que porventura tenha sido lancado como pago no passo 4
    DELETE FROM payments pay USING players p
    WHERE p.id = pay.player_id AND pay.type = 'mensalidade'
      AND pay.reference_year = item.ano AND pay.reference_month = item.mes
      AND (
        TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)) ILIKE item.quem
        OR TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)) ILIKE item.quem || ' %'
        OR p.first_name ILIKE item.quem
      );

    INSERT INTO payments (player_id, type, reference_month, reference_year, amount, status)
    SELECT p.id, 'mensalidade', item.mes, item.ano, fee, 'pending'
    FROM players p
    WHERE NOT p.exempt_monthly
      AND (
        TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)) ILIKE item.quem
        OR TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)) ILIKE item.quem || ' %'
        OR p.first_name ILIKE item.quem
      );
    GET DIAGNOSTICS qtd = ROW_COUNT;
    IF qtd = 0 THEN
      RAISE NOTICE 'ATENCAO: nao achei o cadastro de % (mensalidade %/%)', item.quem, item.mes, item.ano;
    ELSIF qtd > 1 THEN
      RAISE NOTICE 'ATENCAO: % bateu com % cadastros na mensalidade %/%', item.quem, qtd, item.mes, item.ano;
    END IF;
  END LOOP;

  -- 6. Agosto/26: ninguem pagou ainda
  DELETE FROM payments WHERE type = 'mensalidade' AND reference_year = 2026 AND reference_month = 8;

  INSERT INTO one_off_fixes (name) VALUES ('acerto_financeiro_2026_08');
  RAISE NOTICE 'Acerto financeiro aplicado.';
END
$acerto$;
