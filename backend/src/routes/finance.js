const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/financeController');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/monthly', controller.monthlyOverview);
router.post('/monthly', controller.setMonthlyStatus);
router.get('/pending', controller.pendingByMatchday);
router.get('/players/:playerId/history', controller.historyByPlayer);
router.patch('/:id/pay', controller.markPaid);
router.patch('/:id/unpay', controller.markPending);

module.exports = router;
