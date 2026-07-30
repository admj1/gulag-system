-- Sumula ao vivo: cada toque na tela do celular vira um evento com id gerado no
-- proprio aparelho. Como o id repetido e ignorado, reenviar a fila depois de uma
-- queda de sinal nao conta o mesmo gol duas vezes.
CREATE TABLE IF NOT EXISTS match_events (
  id SERIAL PRIMARY KEY,
  matchday_id INT NOT NULL REFERENCES matchdays(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  stat VARCHAR(20) NOT NULL,
  delta INT NOT NULL,
  client_id VARCHAR(60) NOT NULL UNIQUE,
  created_by INT REFERENCES players(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_events_matchday ON match_events(matchday_id);
