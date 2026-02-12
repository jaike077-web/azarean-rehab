// =====================================================
// MIDDLEWARE: Загрузка файлов (Multer)
// Спринт 2 — Профиль пациента
// =====================================================

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Директория для аватаров
const avatarsDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// Disk storage — файлы сохраняются на диск
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const patientId = req.patient.id;
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `patient_${patientId}_${timestamp}_${random}${ext}`);
  },
});

// Фильтр: только изображения
const imageFilter = (_req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неверный формат файла. Разрешены: JPEG, PNG, WEBP'), false);
  }
};

// Multer для аватаров: 2MB, только картинки
const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

module.exports = { avatarUpload };
