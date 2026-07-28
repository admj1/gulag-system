const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const controller = require('../controllers/playersController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/me', controller.getMe);
router.put('/me', controller.updateMe);
router.post('/me/photo', upload.single('photo'), (req, res) => {
  res.status(201).json({ photo_url: `/uploads/${req.file.filename}` });
});
router.get('/:id', controller.getById);
router.post('/', requireAdmin, controller.create);
router.put('/:id', requireAdmin, controller.update);
router.patch('/:id/block', requireAdmin, controller.setBlock);
router.patch('/:id/status', requireAdmin, controller.changeStatus);

module.exports = router;
