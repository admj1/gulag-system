-- Cadastro feito errado pode ser inativado (sai das listas, mantem o historico)
ALTER TABLE players ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Dono do sistema: unico que pode promover ou rebaixar administradores
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE players SET is_owner = TRUE, role = 'admin'
WHERE email = 'ademariocmjunior@gmail.com';

-- Se ninguem tiver o e-mail acima, o admin mais antigo assume como dono
UPDATE players SET is_owner = TRUE
WHERE id = (SELECT id FROM players WHERE role = 'admin' ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM players WHERE is_owner);

CREATE INDEX IF NOT EXISTS idx_players_active ON players(active);
