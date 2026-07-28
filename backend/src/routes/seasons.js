const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/seasonsController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', requireAdmin, controller.create);
router.put('/:id', requireAdmin, controller.update);
router.delete('/:id', requireAdmin, controller.remove);

module.exports = router;
