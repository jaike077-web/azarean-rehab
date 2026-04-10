// =====================================================
// MIDDLEWARE: Загрузка файлов (Multer + Sharp)
// Спринт 2 — Профиль пациента
//
// Принимает фото до 10 МБ, пережимает через sharp
// в JPEG 400×400 (quality 80%). Итог: <100 КБ.
// =====================================================

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const sharp = require('sharp');

// Директория для аватаров
const avatarsDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// Memory storage — файл в buffer, sharp обработает перед сохранением
const avatarStorage = multer.memoryStorage();

// Фильтр: только изображения
const imageFilter = (_req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неверный формат файла. Разрешены: JPEG, PNG, WEBP'), false);
  }
};

// Multer: принимает до 10 МБ в память
const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 МБ (сжатие произойдёт после)
  },
});

/**
 * Middleware: сжимает загруженный аватар через sharp.
 * Вызывается ПОСЛЕ multer (req.file.buffer содержит raw данные).
 * Результат: JPEG 400×400, quality 80%, сохраняется на диск.
 * Устанавливает req.file.filename и req.file.path для дальнейшей обработки.
 */
const processAvatar = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const patientId = req.patient.id;
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const filename = `patient_${patientId}_${timestamp}_${random}.jpg`;
    const outputPath = path.join(avatarsDir, filename);

    await sharp(req.file.buffer)
      .resize(400, 400, {
        fit: 'cover',      // обрезка по центру (квадрат)
        position: 'centre',
      })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    // Устанавливаем данные как будто multer сохранил на диск
    req.file.filename = filename;
    req.file.path = outputPath;
    req.file.size = fs.statSync(outputPath).size;

    next();
  } catch (error) {
    console.error('Sharp processing error:', error.message);
    return res.status(400).json({
      error: 'Processing Error',
      message: 'Не удалось обработать изображение. Попробуйте другой файл.'
    });
  }
};

module.exports = { avatarUpload, processAvatar };
