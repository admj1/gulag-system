const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/playersController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', requireAdmin, controller.create);
router.put('/:id', requireAdmin, controller.update);
router.patch('/:id/block', requireAdmin, controller.setBlock);
router.patch('/:id/status', requireAdmin, controller.changeStatus);

module.exports = router;
