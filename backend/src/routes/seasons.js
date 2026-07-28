const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/seasonsController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', requireAdmin, controller.create);

module.exports = router;
