const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { upload, fileUrl } = require('../middleware/upload');
const controller = require('../controllers/playersController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/me', controller.getMe);
router.put('/me', controller.updateMe);
router.put('/me/password', controller.changeMyPassword);
router.post('/me/photo', upload.single('photo'), (req, res) => {
  res.status(201).json({ photo_url: fileUrl(req.file) });
});
router.get('/:id', controller.getById);
router.post('/', requireAdmin, controller.create);
// Admin troca a foto de qualquer jogador (muitos nao mexem no proprio perfil)
router.post('/:id/photo', requireAdmin, upload.single('photo'), (req, res) => {
  res.status(201).json({ photo_url: fileUrl(req.file) });
});
router.put('/:id', requireAdmin, controller.update);
router.delete('/:id', requireAdmin, controller.remove);
router.patch('/:id/block', requireAdmin, controller.setBlock);
router.patch('/:id/status', requireAdmin, controller.changeStatus);
router.patch('/:id/active', requireAdmin, controller.setActive);
router.patch('/:id/unlock', requireAdmin, controller.unlockLogin);
// Autorizacao no controller: somente o dono do sistema
router.patch('/:id/role', requireAdmin, controller.setRole);

module.exports = router;
