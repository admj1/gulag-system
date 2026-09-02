const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/settingsController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.get);
router.put('/', requireAdmin, controller.update);
router.post('/backup-now', requireAdmin, controller.backupNow);

module.exports = router;
