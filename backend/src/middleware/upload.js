const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Em producao as fotos vao para o Cloudinary, porque o disco do servidor e
// descartado a cada deploy. Sem credenciais (uso local), cai para o disco.
const CLOUD_CONFIGURED = !!(
  process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
);

if (CLOUD_CONFIGURED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!CLOUD_CONFIGURED) fs.mkdirSync(uploadDir, { recursive: true });

const cloudStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'gulag/jogadores',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ width: 600, height: 600, crop: 'limit', quality: 'auto' }],
  },
});

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `player-${req.user.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage: CLOUD_CONFIGURED ? cloudStorage : diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Envie uma imagem (jpg, png, webp ou gif)'));
    }
    cb(null, true);
  },
});

// No Cloudinary o path ja e a URL final; no disco monta a rota servida pelo Express
function fileUrl(file) {
  return CLOUD_CONFIGURED ? file.path : `/uploads/${file.filename}`;
}

module.exports = { upload, uploadDir, fileUrl, CLOUD_CONFIGURED };
