-- Pedido de cadastro: quem se inscreve pela tela publica nao entra direto
-- mais, cria um pedido que fica esperando um admin aprovar ou recusar (ver
-- controllers/authController.js e controllers/registrationRequestsController.js).
-- A senha ja fica com hash pronto desde a hora do pedido, para nao precisar
-- pedir de novo na aprovacao.
CREATE TABLE IF NOT EXISTS registration_requests (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  nickname VARCHAR(60),
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(160),
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by INT REFERENCES players(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_player_id INT REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status, created_at DESC);
