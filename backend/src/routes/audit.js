const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/auditController');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/', controller.list);

module.exports = router;
