const express = require('express');
const { authenticate } = require('../middleware/auth');
const controller = require('../controllers/statsController');

const router = express.Router();

router.use(authenticate);

router.get('/rankings', controller.rankings);
router.get('/players/:id', controller.playerProfile);

module.exports = router;
