const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/statsController');

const router = express.Router();

router.use(authenticate);

router.get('/rankings', controller.rankings);
router.get('/rankings/periods', controller.rankingPeriods);
router.get('/compare', controller.comparePlayers);
router.get('/star-suggestions', requireAdmin, controller.starSuggestions);
router.get('/players/:id', controller.playerProfile);

module.exports = router;
