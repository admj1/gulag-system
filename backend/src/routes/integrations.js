const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/integrationsController');

const router = express.Router();

// Chamada por um bot/servico externo: autentica por token proprio, sem login de usuario
function requireIntegrationToken(req, res, next) {
  const expected = process.env.INTEGRATION_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: 'Integração não configurada (defina INTEGRATION_TOKEN)' });
  }
  const provided = req.headers['x-integration-token'];
  if (provided !== expected) {
    return res.status(401).json({ error: 'Token de integração inválido' });
  }
  next();
}

router.post('/whatsapp/confirm', requireIntegrationToken, controller.confirmByPhone);
router.post('/whatsapp/confirm-batch', authenticate, requireAdmin, controller.confirmBatch);

module.exports = router;
