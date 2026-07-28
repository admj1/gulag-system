-- A ata em papel registra a CONTAGEM de vitorias/empates/derrotas de cada time no dia,
-- ja que os times se enfrentam vezes seguidas no rodizio.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS wins INT NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS draws INT NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS losses INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'teams' AND column_name = 'result') THEN
    UPDATE teams SET
      wins = CASE WHEN result = 'win' THEN 1 ELSE 0 END,
      draws = CASE WHEN result = 'draw' THEN 1 ELSE 0 END,
      losses = CASE WHEN result = 'loss' THEN 1 ELSE 0 END
    WHERE result IS NOT NULL;
    ALTER TABLE teams DROP COLUMN result;
  END IF;
END $$;

-- Goleiros tem a propria tabela na ata, com V/D/E e cartoes
ALTER TABLE goalkeeper_match_stats ADD COLUMN IF NOT EXISTS wins INT NOT NULL DEFAULT 0;
ALTER TABLE goalkeeper_match_stats ADD COLUMN IF NOT EXISTS draws INT NOT NULL DEFAULT 0;
ALTER TABLE goalkeeper_match_stats ADD COLUMN IF NOT EXISTS losses INT NOT NULL DEFAULT 0;
ALTER TABLE goalkeeper_match_stats ADD COLUMN IF NOT EXISTS yellow_cards INT NOT NULL DEFAULT 0;
ALTER TABLE goalkeeper_match_stats ADD COLUMN IF NOT EXISTS red_cards INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'goalkeeper_match_stats' AND column_name = 'result') THEN
    UPDATE goalkeeper_match_stats SET
      wins = CASE WHEN result = 'win' THEN 1 ELSE 0 END,
      draws = CASE WHEN result = 'draw' THEN 1 ELSE 0 END,
      losses = CASE WHEN result = 'loss' THEN 1 ELSE 0 END
    WHERE result IS NOT NULL;
    ALTER TABLE goalkeeper_match_stats DROP COLUMN result;
  END IF;
END $$;
