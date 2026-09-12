const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/registrationRequestsController');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/', controller.list);
router.post('/:id/approve', controller.approve);
router.post('/:id/reject', controller.reject);

module.exports = router;
