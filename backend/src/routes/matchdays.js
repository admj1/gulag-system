const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/matchdaysController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', requireAdmin, controller.create);
router.get('/roster-preview', requireAdmin, controller.rosterPreview);
router.post('/from-roster', requireAdmin, controller.createFromRoster);
router.post('/retroactive', requireAdmin, controller.createRetroactive);
router.get('/:id', controller.getById);
router.delete('/:id', requireAdmin, controller.remove);
router.get('/:id/confirmations', controller.getConfirmations);
router.post('/:id/confirmations', controller.confirm);
router.post('/:id/invites', controller.invitePlayer);
router.post('/:id/decline', controller.declineOwn);
router.delete('/:id/confirmations/me', controller.cancelOwnConfirmation);
router.patch('/:id/confirmations/:playerId', requireAdmin, controller.setConfirmation);
// Autorizacao no controller: admin sempre, ou quem convidou a pessoa
router.delete('/:id/confirmations/:playerId', controller.removeConfirmation);
router.post('/:id/notify', requireAdmin, controller.notifyMatchday);
router.post('/:id/close', requireAdmin, controller.closeList);
router.post('/:id/draw-teams', requireAdmin, controller.drawTeams);
router.get('/:id/teams', controller.getTeams);
router.patch('/:id/teams/assign', requireAdmin, controller.moveTeamPlayer);
router.patch('/:id/teams/:teamId', requireAdmin, controller.renameTeam);
router.get('/:id/live', requireAdmin, controller.getLive);
router.post('/:id/events', requireAdmin, controller.pushEvents);
router.get('/:id/summary', controller.getSummary);
router.post('/:id/summary', requireAdmin, controller.submitSummary);

module.exports = router;
