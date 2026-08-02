-- Os mensalistas foram importados no fim de julho/26, mas ja eram mensalistas
-- muito antes. Sem uma data de inicio verdadeira, a regra de "so cobra a partir
-- de quando virou mensalista" apagaria a divida dos meses anteriores.
-- Marco/26 e o mes mais antigo do acerto informado pelo organizador.
--
-- Roda uma vez so: depois disso, uma promocao futura com data verdadeira nao
-- pode ser reescrita para marco por um deploy.

CREATE TABLE IF NOT EXISTS one_off_fixes (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $desde$
DECLARE
  qtd INT;
BEGIN
  IF EXISTS (SELECT 1 FROM one_off_fixes WHERE name = 'mensalista_desde_marco_2026') THEN
    RETURN;
  END IF;

  -- Recua o primeiro registro de mensalista para marco/26. So de quem e
  -- mensalista HOJE: mexer no historico de ex-mensalista ressuscitaria cobranca
  -- de quem ja foi acertado.
  UPDATE player_status_history
  SET start_date = DATE '2026-03-01'
  WHERE player_type = 'mensalista'
    AND start_date > DATE '2026-03-01'
    AND EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_status_history.player_id
        AND p.player_type = 'mensalista' AND p.active
    )
    AND id IN (
      SELECT DISTINCT ON (player_id) id
      FROM player_status_history
      WHERE player_type = 'mensalista'
      ORDER BY player_id, start_date
    );
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RAISE NOTICE 'Inicio de mensalista recuado para marco/26: % registro(s)', qtd;

  -- Mensalista atual que nunca passou pelo botao nao tem registro nenhum
  INSERT INTO player_status_history (player_id, player_type, start_date)
  SELECT p.id, 'mensalista', DATE '2026-03-01'
  FROM players p
  WHERE p.player_type = 'mensalista' AND p.active
    AND NOT EXISTS (
      SELECT 1 FROM player_status_history h
      WHERE h.player_id = p.id AND h.player_type = 'mensalista'
    );
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RAISE NOTICE 'Mensalistas sem historico que ganharam registro: %', qtd;

  INSERT INTO one_off_fixes (name) VALUES ('mensalista_desde_marco_2026');
END
$desde$;
