-- O fluxo antigo permitia numero solto do tipo, deixando diarista ocupando vaga
-- de mensalista e mensalista sem numero. Normaliza e mantem consistente.

-- Quem nao e mensalista nao ocupa numero
UPDATE players SET mensalista_number = NULL
WHERE mensalista_number IS NOT NULL AND player_type <> 'mensalista';

-- Mensalista ativo sem numero recebe a primeira vaga livre
DO $$
DECLARE
  target INT;
  free_number INT;
BEGIN
  LOOP
    SELECT id INTO target FROM players
    WHERE player_type = 'mensalista' AND active AND mensalista_number IS NULL
    ORDER BY id LIMIT 1;
    EXIT WHEN target IS NULL;

    SELECT n INTO free_number FROM generate_series(1, 99) AS n
    WHERE n NOT IN (SELECT mensalista_number FROM players WHERE mensalista_number IS NOT NULL)
    ORDER BY n LIMIT 1;
    EXIT WHEN free_number IS NULL;

    UPDATE players SET mensalista_number = free_number WHERE id = target;
  END LOOP;
END $$;
