-- Ate agora, salvar a sumula gravava uma linha para TODO confirmado na ata,
-- inclusive quem ficou de fora dos times — zerada e marcada como presente.
-- Essa linha fantasma contava como pelada jogada: aparecia no historico
-- "Ultimas peladas" do jogador, somava presenca no Ranking Geral (+2) e
-- gerava diaria para diarista, num dia em que a pessoa nem entrou em campo.
--
-- Caso real: pelada de 19/09/2026 (3 times de 5 = 15 jogando, 17
-- confirmados). Barba e Carioca ficaram sem time e ganharam presenca; o
-- Carioca ainda ficou com uma diaria pendente de R$15 por um dia que nao
-- jogou.
--
-- O codigo ja foi corrigido (so entra na sumula quem esta em algum time —
-- ver submitSummary em controllers/matchdaysController.js). Este ajuste faz
-- com o historico exatamente o que o sistema faria se cada uma dessas
-- sumulas fosse salva de novo:
--   1) cobranca PENDENTE de diaria/multa dessas linhas some (paga nunca e
--      tocada — isso e historico financeiro);
--   2) a linha zerada sai da sumula.
-- So mexe em linha sem nenhum gol, assistencia ou cartao lancado: se um dia
-- aparecer alguem sem time COM numero, fica como esta e e avisado aqui.
-- Roda uma vez so.

CREATE TABLE IF NOT EXISTS one_off_fixes (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $sem_time$
DECLARE
  fantasma RECORD;
  qtd_linhas INT := 0;
  qtd_cobrancas INT := 0;
  qtd_apagadas INT;
  qtd_com_numero INT;
BEGIN
  IF EXISTS (SELECT 1 FROM one_off_fixes WHERE name = 'remove_presenca_sem_time_2026_09') THEN
    RAISE NOTICE 'Remocao de presenca sem time ja aplicada antes; nada a fazer.';
    RETURN;
  END IF;

  -- Aviso (nao mexe): alguem sem time mas com numero lancado. Nao deveria
  -- existir — a sumula nem mostra campo para quem nao esta em time.
  SELECT COUNT(*) INTO qtd_com_numero
  FROM player_match_stats s
  WHERE NOT EXISTS (
          SELECT 1 FROM team_players tp JOIN teams t ON t.id = tp.team_id
          WHERE t.matchday_id = s.matchday_id AND tp.player_id = s.player_id)
    AND s.goals + s.assists + s.yellow_cards + s.blue_cards + s.red_cards > 0;
  IF qtd_com_numero > 0 THEN
    RAISE NOTICE 'ATENCAO: % linha(s) de sumula sem time COM numero lancado — mantidas como estao', qtd_com_numero;
  END IF;

  FOR fantasma IN
    SELECT s.id, s.matchday_id, s.player_id, m.match_date,
           TRIM(COALESCE(NULLIF(p.nickname, ''), p.first_name || ' ' || p.last_name)) AS nome
    FROM player_match_stats s
    JOIN matchdays m ON m.id = s.matchday_id
    JOIN players p ON p.id = s.player_id
    WHERE NOT EXISTS (
            SELECT 1 FROM team_players tp JOIN teams t ON t.id = tp.team_id
            WHERE t.matchday_id = s.matchday_id AND tp.player_id = s.player_id)
      AND s.goals + s.assists + s.yellow_cards + s.blue_cards + s.red_cards = 0
  LOOP
    DELETE FROM payments
    WHERE matchday_id = fantasma.matchday_id AND player_id = fantasma.player_id
      AND type IN ('diaria', 'multa') AND status = 'pending';
    GET DIAGNOSTICS qtd_apagadas = ROW_COUNT;
    qtd_cobrancas := qtd_cobrancas + qtd_apagadas;

    DELETE FROM player_match_stats WHERE id = fantasma.id;
    qtd_linhas := qtd_linhas + 1;

    RAISE NOTICE 'Pelada de % (id %): % estava sem time — saiu da sumula (% cobranca(s) pendente(s) removida(s))',
      fantasma.match_date, fantasma.matchday_id, fantasma.nome, qtd_apagadas;
  END LOOP;

  INSERT INTO one_off_fixes (name) VALUES ('remove_presenca_sem_time_2026_09');
  RAISE NOTICE 'Concluido: % linha(s) fantasma removida(s), % cobranca(s) pendente(s) indevida(s) removida(s).',
    qtd_linhas, qtd_cobrancas;
END
$sem_time$;
