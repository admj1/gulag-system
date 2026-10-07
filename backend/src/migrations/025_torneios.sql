-- Modo torneio. Tudo em tabelas proprias: nada daqui entra nas estatisticas
-- da pelada (ranking, perfil, curiosidades) nem no financeiro da pelada — a
-- taxa do torneio tem controle separado (tournament_registrations.fee_paid).
--
-- Fluxo: inscricoes -> draft (capitaes + escolha em cobrinha, depois o draft
-- so dos goleiros) -> grupos -> mata-mata (semifinal e final) -> encerrado.

CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  event_date DATE NOT NULL,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  num_teams INT NOT NULL DEFAULT 6 CHECK (num_teams BETWEEN 2 AND 16),
  -- jogadores de linha por time CONTANDO o capitao (capitao + 5 = 6)
  line_per_team INT NOT NULL DEFAULT 6 CHECK (line_per_team BETWEEN 1 AND 15),
  gk_per_team INT NOT NULL DEFAULT 1 CHECK (gk_per_team BETWEEN 0 AND 3),
  num_groups INT NOT NULL DEFAULT 2 CHECK (num_groups IN (1, 2)),
  status VARCHAR(20) NOT NULL DEFAULT 'inscricoes'
    CHECK (status IN ('inscricoes', 'draft', 'grupos', 'mata_mata', 'encerrado')),
  champion_team_id INT,
  runner_up_team_id INT,
  best_gk_player_id INT REFERENCES players(id) ON DELETE SET NULL,
  mvp_player_id INT REFERENCES players(id) ON DELETE SET NULL,
  created_by INT REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inscricao e, para quem for convocado, a taxa (goleiro e isento)
CREATE TABLE IF NOT EXISTS tournament_registrations (
  id SERIAL PRIMARY KEY,
  tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS tournament_teams (
  id SERIAL PRIMARY KEY,
  tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  captain_id INT NOT NULL REFERENCES players(id),
  draft_position INT,
  group_label CHAR(1),
  UNIQUE (tournament_id, captain_id)
);

-- Elenco: o capitao entra com pick_number NULL; os demais na ordem do draft
CREATE TABLE IF NOT EXISTS tournament_team_players (
  tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id INT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  is_goalkeeper BOOLEAN NOT NULL DEFAULT FALSE,
  pick_number INT,
  PRIMARY KEY (tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id SERIAL PRIMARY KEY,
  tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  stage VARCHAR(10) NOT NULL CHECK (stage IN ('grupo', 'semi', 'final')),
  group_label CHAR(1),
  order_num INT NOT NULL,
  home_team_id INT REFERENCES tournament_teams(id) ON DELETE CASCADE,
  away_team_id INT REFERENCES tournament_teams(id) ON DELETE CASCADE,
  -- placar nos penaltis, so no mata-mata empatado
  home_penalties INT,
  away_penalties INT,
  status VARCHAR(12) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_andamento', 'encerrada'))
);

-- Sumula da partida (o placar e a soma dos gols de cada lado)
CREATE TABLE IF NOT EXISTS tournament_match_stats (
  match_id INT NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  team_id INT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  goals INT NOT NULL DEFAULT 0,
  assists INT NOT NULL DEFAULT 0,
  yellow_cards INT NOT NULL DEFAULT 0,
  blue_cards INT NOT NULL DEFAULT 0,
  red_cards INT NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);

-- Cada toque da sumula ao vivo, com id gerado no aparelho: reenviar a fila
-- depois de perder o sinal nao conta o mesmo gol duas vezes
CREATE TABLE IF NOT EXISTS tournament_events (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  player_id INT NOT NULL REFERENCES players(id),
  stat VARCHAR(20) NOT NULL,
  delta INT NOT NULL,
  client_id VARCHAR(60) NOT NULL UNIQUE,
  created_by INT REFERENCES players(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_regs ON tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches ON tournament_matches(tournament_id);
