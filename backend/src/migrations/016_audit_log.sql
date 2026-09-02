-- Registro de quem fez o que nas acoes destrutivas/sensiveis (excluir pelada,
-- excluir jogador, excluir temporada, bloquear jogador, trocar a senha de
-- outro, promover/rebaixar administrador). Nasceu depois de uma pelada ter
-- sido apagada sem ninguem saber dizer quem clicou.
--
-- actor_name e target_label ficam gravados prontos (nao so os ids) porque o
-- ator ou o alvo podem ser apagados depois — o log tem que continuar legivel
-- mesmo que a pessoa ou a pelada em si ja nao existam mais no sistema.
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES players(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INT,
  target_label TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
