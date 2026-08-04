-- Ate agora todo goleiro cadastrado entrava sozinho na ata. Passa a entrar so
-- quem for marcado como fixo; os demais colocam o nome como goleiro avulso,
-- do mesmo jeito que um diarista.
-- Comeca desmarcado de proposito: quem entra automatico e escolha do organizador.
ALTER TABLE players ADD COLUMN IF NOT EXISTS auto_roster BOOLEAN NOT NULL DEFAULT FALSE;
