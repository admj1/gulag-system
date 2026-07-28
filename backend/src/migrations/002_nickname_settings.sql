ALTER TABLE players ADD COLUMN IF NOT EXISTS first_name VARCHAR(60);
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_name VARCHAR(60);
ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname VARCHAR(60);

-- Migra o campo antigo "name" para first_name/last_name e o remove
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'name') THEN
    UPDATE players
    SET first_name = COALESCE(first_name, split_part(name, ' ', 1)),
        last_name = COALESCE(last_name, NULLIF(substring(name from position(' ' in name) + 1), name))
    WHERE first_name IS NULL OR last_name IS NULL;

    ALTER TABLE players DROP COLUMN name;
  END IF;
END $$;

UPDATE players SET last_name = '' WHERE last_name IS NULL;
UPDATE players SET first_name = 'Jogador' WHERE first_name IS NULL;

ALTER TABLE players ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE players ALTER COLUMN last_name SET NOT NULL;

-- Cobrancas sao por mes/ano, nao por temporada
ALTER TABLE payments ALTER COLUMN season_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 50,
  daily_fee NUMERIC(10,2) NOT NULL DEFAULT 15,
  absence_fine NUMERIC(10,2) NOT NULL DEFAULT 15,
  match_time TIME NOT NULL DEFAULT '07:00',
  CONSTRAINT settings_singleton CHECK (id = 1)
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference_year, reference_month);
