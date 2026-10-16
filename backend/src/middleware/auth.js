const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// O token vale por dias, mas a situacao da pessoa muda nesse meio-tempo: o
// admin pode bloquear, desativar ou rebaixar alguem. Por isso cada requisicao
// confere o cadastro no banco — o papel (admin/jogador) vem de la, nao do
// token — e a pessoa e desconectada na hora, com a mesma regra do login:
// cadastro inativo, bloqueado ou com a senha travada nao entra.
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não informado' });
  }

  let payload;
  try {
    payload = jwt.verify(header.slice('Bearer '.length), process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT role, active, blocked, login_locked FROM players WHERE id = $1',
      [payload.id]
    );
    const atual = rows[0];
    if (!atual || !atual.active || atual.blocked || atual.login_locked) {
      return res.status(401).json({ error: 'Sessão encerrada. Entre de novo ou procure o organizador.' });
    }
    req.user = { ...payload, role: atual.role };
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
