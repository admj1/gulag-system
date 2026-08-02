-- Diretoria continua na lista de mensalistas (entra na ata, joga, conta nas
-- estatisticas), mas nao gera cobranca de mensalidade.
ALTER TABLE players ADD COLUMN IF NOT EXISTS exempt_monthly BOOLEAN NOT NULL DEFAULT FALSE;
