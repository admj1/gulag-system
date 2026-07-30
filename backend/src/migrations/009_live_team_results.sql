-- No rodizio os times se enfrentam varias vezes, entao o placar tambem e lancado
-- ao vivo: um toque em V/E/D vira evento igual ao de gol. O evento passa a poder
-- apontar para um time, em vez de um jogador.
ALTER TABLE match_events ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS team_id INT REFERENCES teams(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_events_target_check') THEN
    ALTER TABLE match_events ADD CONSTRAINT match_events_target_check
      CHECK ((player_id IS NULL) <> (team_id IS NULL));
  END IF;
END $$;
