CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(160) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  photo_url TEXT,
  position VARCHAR(40),
  stars NUMERIC(3,1) NOT NULL DEFAULT 3,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
  player_type VARCHAR(20) NOT NULL DEFAULT 'diarista' CHECK (player_type IN ('mensalista', 'diarista', 'goleiro')),
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  block_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  year INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico de promoção/rebaixamento mensalista <-> diarista
CREATE TABLE IF NOT EXISTS player_status_history (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_type VARCHAR(20) NOT NULL CHECK (player_type IN ('mensalista', 'diarista', 'goleiro')),
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matchdays (
  id SERIAL PRIMARY KEY,
  season_id INT NOT NULL REFERENCES seasons(id),
  match_date DATE NOT NULL,
  confirmation_deadline TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'played')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS confirmations (
  id SERIAL PRIMARY KEY,
  matchday_id INT NOT NULL REFERENCES matchdays(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  invited_by_player_id INT REFERENCES players(id),
  queue_position INT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'waitlist', 'absent')),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (matchday_id, player_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  matchday_id INT NOT NULL REFERENCES matchdays(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  result VARCHAR(10) CHECK (result IN ('win', 'draw', 'loss'))
);

CREATE TABLE IF NOT EXISTS team_players (
  team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  PRIMARY KEY (team_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_match_stats (
  id SERIAL PRIMARY KEY,
  matchday_id INT NOT NULL REFERENCES matchdays(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  team_id INT REFERENCES teams(id),
  goals INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  yellow_cards INT NOT NULL DEFAULT 0,
  blue_cards INT NOT NULL DEFAULT 0,
  red_cards INT NOT NULL DEFAULT 0,
  absent BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (matchday_id, player_id)
);

CREATE TABLE IF NOT EXISTS goalkeeper_match_stats (
  id SERIAL PRIMARY KEY,
  matchday_id INT NOT NULL REFERENCES matchdays(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  opponent_team_id INT REFERENCES teams(id),
  result VARCHAR(10) CHECK (result IN ('win', 'draw', 'loss')),
  penalties_saved INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  goals INT NOT NULL DEFAULT 0,
  UNIQUE (matchday_id, player_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  player_id INT NOT NULL REFERENCES players(id),
  season_id INT NOT NULL REFERENCES seasons(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('mensalidade', 'diaria', 'multa')),
  reference_month INT,
  reference_year INT,
  matchday_id INT REFERENCES matchdays(id),
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confirmations_matchday ON confirmations(matchday_id);
CREATE INDEX IF NOT EXISTS idx_payments_player ON payments(player_id);
CREATE INDEX IF NOT EXISTS idx_player_match_stats_player ON player_match_stats(player_id);
