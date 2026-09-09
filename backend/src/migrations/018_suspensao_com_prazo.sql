-- Ajuste do bloqueio existente para virar suspensão de verdade: adiciona um
-- prazo opcional. Sem prazo continua servindo para bloqueio por débito (só
-- sai desbloqueando na mão); com prazo, é suspensão disciplinar e o sistema
-- libera sozinho quando o prazo passa (ver jobs/expireSuspensions.js).
ALTER TABLE players ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;
