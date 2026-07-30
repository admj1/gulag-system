-- Corpo do e-mail de convite, editavel pelo admin nas Configuracoes.
-- Vazio (NULL) significa "usar o modelo padrao do sistema".
ALTER TABLE settings ADD COLUMN IF NOT EXISTS invite_html TEXT;
