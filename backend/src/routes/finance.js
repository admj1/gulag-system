const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/financeController');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/pending', controller.listPending);
router.get('/players/:playerId/history', controller.historyByPlayer);
router.patch('/:id/pay', controller.markPaid);
router.post('/monthly-fees', controller.generateMonthlyFees);
router.post('/matchdays/:matchdayId/daily-fees', controller.chargeDailyFee);

module.exports = router;
