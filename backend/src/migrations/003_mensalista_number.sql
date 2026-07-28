-- Numeracao fixa de 1 a 20 dos mensalistas, como na ata em papel
ALTER TABLE players ADD COLUMN IF NOT EXISTS mensalista_number INT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_mensalista_number
  ON players(mensalista_number)
  WHERE mensalista_number IS NOT NULL;

-- 'declined' = mensalista que nao confirmou ate o fechamento e liberou a vaga
ALTER TABLE confirmations DROP CONSTRAINT IF EXISTS confirmations_status_check;
ALTER TABLE confirmations ADD CONSTRAINT confirmations_status_check
  CHECK (status IN ('pending', 'confirmed', 'waitlist', 'absent', 'declined'));
