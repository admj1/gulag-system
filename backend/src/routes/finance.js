const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/financeController');

const router = express.Router();

router.use(authenticate);

// Cada jogador ve a propria situacao; o resto do financeiro e so do admin
router.get('/me', controller.myDebts);

router.use(requireAdmin);

router.get('/monthly', controller.monthlyOverview);
router.get('/monthly/open', controller.openMonthlyDebts);
router.post('/monthly', controller.setMonthlyStatus);
router.post('/monthly/all', controller.setMonthlyStatusForAll);
router.get('/pending', controller.pendingByMatchday);
router.get('/players/:playerId/history', controller.historyByPlayer);
router.post('/pending/pay-all', controller.payAllPending);
router.patch('/:id/pay', controller.markPaid);
router.patch('/:id/unpay', controller.markPending);

module.exports = router;
