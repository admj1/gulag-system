-- Defeito corrigido no codigo: reeditar a sumula (ex.: corrigir um cartao)
-- inseria uma diaria/multa pendente nova mesmo quando aquela cobranca ja
-- tinha sido paga, porque o codigo so verificava se havia uma paga; ao
-- reeditar, o codigo inseria de novo sem checar. Isso deixou pares
-- duplicados no banco: uma linha 'paid' (a baixa real) e uma 'pending' extra
-- (o fantasma que reaparecia como em aberto).
--
-- Remove so a metade fantasma: a pendente que tem uma paga irma, do mesmo
-- jogador, mesma pelada, mesmo tipo. A paga nunca e tocada. Roda uma vez so.

DO $limpeza$
DECLARE
  qtd INT;
BEGIN
  IF EXISTS (SELECT 1 FROM one_off_fixes WHERE name = 'limpa_diarias_duplicadas_2026_08') THEN
    RETURN;
  END IF;

  DELETE FROM payments fantasma
  WHERE fantasma.status = 'pending'
    AND fantasma.type IN ('diaria', 'multa')
    AND EXISTS (
      SELECT 1 FROM payments paga
      WHERE paga.status = 'paid'
        AND paga.type = fantasma.type
        AND paga.matchday_id = fantasma.matchday_id
        AND paga.player_id = fantasma.player_id
    );
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RAISE NOTICE 'Diarias/multas duplicadas removidas (ja estavam pagas): %', qtd;

  INSERT INTO one_off_fixes (name) VALUES ('limpa_diarias_duplicadas_2026_08');
END
$limpeza$;
