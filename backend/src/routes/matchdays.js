const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/matchdaysController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', requireAdmin, controller.create);
router.get('/:id/confirmations', controller.getConfirmations);
router.post('/:id/confirmations', controller.confirm);
router.post('/:id/close', requireAdmin, controller.closeList);
router.post('/:id/draw-teams', requireAdmin, controller.drawTeams);
router.post('/:id/summary', requireAdmin, controller.submitSummary);

module.exports = router;
