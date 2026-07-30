-- Protecao contra tentativa de adivinhar a senha: apos 5 erros a senha e bloqueada
-- e so o organizador libera, cadastrando uma nova.
ALTER TABLE players ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS login_locked BOOLEAN NOT NULL DEFAULT FALSE;
