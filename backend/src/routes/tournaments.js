const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const c = require('../controllers/tournamentsController');

const router = express.Router();

router.use(authenticate);

// Partidas (antes de /:id para nao confundir "matches" com um id)
router.get('/matches/:matchId', c.getMatch);
router.post('/matches/:matchId/events', requireAdmin, c.pushEvents);
router.post('/matches/:matchId/finish', requireAdmin, c.finishMatch);
router.post('/matches/:matchId/reopen', requireAdmin, c.reopenMatch);

router.get('/', c.list);
router.post('/', requireAdmin, c.create);
router.get('/:id', c.getById);
router.put('/:id', requireAdmin, c.update);
router.delete('/:id', requireAdmin, c.remove);

// Inscricao: o proprio jogador se inscreve/sai; o admin inscreve/tira qualquer um
router.post('/:id/registrations', c.register);
router.delete('/:id/registrations/me', c.unregister);
router.delete('/:id/registrations/:playerId', requireAdmin, c.unregister);
router.patch('/:id/registrations/:playerId/fee', requireAdmin, c.setFee);

// Draft
router.post('/:id/start-draft', requireAdmin, c.startDraft);
router.post('/:id/captains', requireAdmin, c.setCaptains);
router.post('/:id/draft-order', requireAdmin, c.setDraftOrder);
router.post('/:id/picks', requireAdmin, c.pick);
router.delete('/:id/picks/last', requireAdmin, c.undoPick);
router.post('/:id/finish-draft', requireAdmin, c.finishDraft);

router.put('/:id/awards', requireAdmin, c.setAwards);

module.exports = router;
