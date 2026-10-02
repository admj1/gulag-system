-- Ata reaberta pelo admin deixa de fechar sozinha: quem reabre quer a lista
-- aberta, e o fechamento automatico (que roda de hora em hora depois do
-- prazo) poderia fecha-la de novo logo em seguida. Ata nova nasce com o
-- fechamento automatico ligado.
ALTER TABLE matchdays ADD COLUMN IF NOT EXISTS auto_close BOOLEAN NOT NULL DEFAULT TRUE;
