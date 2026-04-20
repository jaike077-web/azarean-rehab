// =====================================================
// РОУТЫ: Авторизация пациентов
// Спринт 0.1
//
// Все эндпоинты /api/patient-auth/*
// ОТДЕЛЬНАЯ система от инструкторской авторизации
// =====================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../database/db');
const path = require('path');
const fs = require('fs');
const { authenticatePatient } = require('../middleware/patientAuth');
const { avatarUpload, processAvatar } = require('../middleware/upload');
const { sendPasswordResetEmail } = require('../utils/email');
const { hashToken } = require('../utils/tokens');
const config = require('../config/config');

// =====================================================
// УТИЛИТЫ
// =====================================================

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const generateAccessToken = (patient) => {
  return jwt.sign(
    { id: patient.id, email: patient.email, full_name: patient.full_name },
    config.patient.jwtSecret,
    { expiresIn: config.patient.jwtExpiresIn, algorithm: 'HS256' }
  );
};

const generateRefreshToken = async (patientId) => {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 дней

  // Удаляем старый refresh token и создаём новый (в БД хранится только хэш)
  await query(
    `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
    [patientId]
  );

  await query(
    `INSERT INTO patient_refresh_tokens (patient_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [patientId, tokenHash, expiresAt]
  );

  return token;
};

const setRefreshCookie = (res, token) => {
  res.cookie('patient_refresh_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
    path: '/api/patient-auth'
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie('patient_refresh_token', {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/patient-auth'
  });
};

// Access cookie — заменяет хранение JWT в localStorage (баг #11).
// SameSite=Strict достаточен для CSRF-защиты т.к. нет сценария
// "открыть страницу по внешней ссылке залогиненным".
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000; // 15 минут

const setAccessCookie = (res, token) => {
  res.cookie('patient_access_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: ACCESS_COOKIE_MAX_AGE_MS,
    path: '/api'
  });
};

const clearAccessCookie = (res) => {
  res.clearCookie('patient_access_token', {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api'
  });
};

// =====================================================
// POST /register — Регистрация пациента
// =====================================================
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone, birth_date } = req.body;

    // Валидация
    if (!email || !password || !full_name) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email, пароль и имя обязательны'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Некорректный формат email'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Пароль должен содержать минимум 8 символов'
      });
    }

    // Проверяем: есть ли пациент с таким email?
    const existingResult = await query(
      `SELECT id, password_hash, is_active FROM patients WHERE email = $1`,
      [email]
    );

    let patient;

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];

      // Если уже зарегистрирован (есть пароль) — ошибка
      if (existing.password_hash) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Пациент с таким email уже зарегистрирован'
        });
      }

      // Если деактивирован — ошибка
      if (existing.is_active === false) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Аккаунт с этим email деактивирован. Обратитесь к специалисту.'
        });
      }

      // Пациент есть (создан инструктором), но без пароля — привязываем
      const password_hash = await bcrypt.hash(password, 10);
      const updateResult = await query(
        `UPDATE patients
         SET password_hash = $1,
             full_name = COALESCE(NULLIF($2, ''), full_name),
             phone = COALESCE(NULLIF($3, ''), phone),
             birth_date = COALESCE($4, birth_date),
             auth_provider = 'local',
             last_login_at = NOW()
         WHERE id = $5
         RETURNING id, email, full_name, phone, birth_date, avatar_url`,
        [password_hash, full_name, phone || null, birth_date || null, existing.id]
      );
      patient = updateResult.rows[0];

    } else {
      // Новый пациент — создаём
      const password_hash = await bcrypt.hash(password, 10);
      const insertResult = await query(
        `INSERT INTO patients (full_name, email, phone, birth_date, password_hash, auth_provider, last_login_at)
         VALUES ($1, $2, $3, $4, $5, 'local', NOW())
         RETURNING id, email, full_name, phone, birth_date, avatar_url`,
        [full_name, email, phone || null, birth_date || null, password_hash]
      );
      patient = insertResult.rows[0];
    }

    // Генерируем токены
    const accessToken = generateAccessToken(patient);
    const refreshToken = await generateRefreshToken(patient.id);

    // Устанавливаем cookies (access + refresh)
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      data: {
        id: patient.id,
        email: patient.email,
        full_name: patient.full_name,
        phone: patient.phone,
        birth_date: patient.birth_date,
        avatar_url: patient.avatar_url
      },
      message: 'Регистрация выполнена успешно'
    });

  } catch (error) {
    console.error('Patient register error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при регистрации'
    });
  }
});

// =====================================================
// POST /login — Вход пациента
// =====================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email и пароль обязательны'
      });
    }

    // Ищем пациента
    const result = await query(
      `SELECT id, email, full_name, phone, birth_date, avatar_url, password_hash, is_active,
              failed_login_attempts, locked_until
       FROM patients WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Неверный email или пароль'
      });
    }

    const patient = result.rows[0];

    // Деактивирован?
    if (patient.is_active === false) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Аккаунт деактивирован. Обратитесь к специалисту.'
      });
    }

    // Проверяем блокировку аккаунта (5 попыток → 15 минут)
    if (patient.locked_until && new Date(patient.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(patient.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        error: 'Account Locked',
        message: `Аккаунт заблокирован. Попробуйте через ${minutesLeft} минут.`
      });
    }

    // Нет пароля? (создан инструктором, ещё не регистрировался)
    if (!patient.password_hash) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Аккаунт не активирован. Пройдите регистрацию.'
      });
    }

    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, patient.password_hash);
    if (!isMatch) {
      // Увеличиваем счётчик неудачных попыток
      const attempts = (patient.failed_login_attempts || 0) + 1;

      if (attempts >= 5) {
        // Блокируем на 15 минут после 5 неудачных попыток
        await query(
          `UPDATE patients SET
             failed_login_attempts = $1,
             locked_until = NOW() + INTERVAL '15 minutes'
           WHERE id = $2`,
          [attempts, patient.id]
        );
        return res.status(423).json({
          error: 'Account Locked',
          message: 'Слишком много неудачных попыток. Аккаунт заблокирован на 15 минут.'
        });
      } else {
        await query(
          `UPDATE patients SET failed_login_attempts = $1 WHERE id = $2`,
          [attempts, patient.id]
        );
        return res.status(401).json({
          error: 'Unauthorized',
          message: `Неверный email или пароль. Осталось попыток: ${5 - attempts}`
        });
      }
    }

    // Сбрасываем счётчик при успешном входе
    if (patient.failed_login_attempts > 0 || patient.locked_until) {
      await query(
        `UPDATE patients SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
        [patient.id]
      );
    }

    // Обновляем last_login_at
    await query(
      `UPDATE patients SET last_login_at = NOW() WHERE id = $1`,
      [patient.id]
    );

    // Генерируем токены
    const accessToken = generateAccessToken(patient);
    const refreshToken = await generateRefreshToken(patient.id);

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    res.json({
      data: {
        id: patient.id,
        email: patient.email,
        full_name: patient.full_name,
        phone: patient.phone,
        birth_date: patient.birth_date,
        avatar_url: patient.avatar_url
      },
      message: 'Вход выполнен успешно'
    });

  } catch (error) {
    console.error('Patient login error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при входе'
    });
  }
});

// =====================================================
// POST /logout — Выход пациента
// =====================================================
router.post('/logout', authenticatePatient, async (req, res) => {
  try {
    // Удаляем refresh token из БД
    await query(
      `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
      [req.patient.id]
    );

    clearAccessCookie(res);
    clearRefreshCookie(res);

    res.json({ message: 'Вы вышли из системы' });

  } catch (error) {
    console.error('Patient logout error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при выходе'
    });
  }
});

// =====================================================
// POST /refresh — Обновление access token
// =====================================================
router.post('/refresh', async (req, res) => {
  try {
    // Читаем refresh token из cookie или body (для гибкости)
    const refreshToken = req.cookies?.patient_refresh_token || req.body?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token не найден'
      });
    }

    // Проверяем в БД по хэшу
    const result = await query(
      `SELECT rt.*, p.id as patient_id, p.email, p.full_name
       FROM patient_refresh_tokens rt
       JOIN patients p ON p.id = rt.patient_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [hashToken(refreshToken)]
    );

    if (result.rows.length === 0) {
      clearRefreshCookie(res);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Недействительный или истекший refresh token'
      });
    }

    const data = result.rows[0];

    // Генерируем новую пару токенов (ротация)
    const patient = { id: data.patient_id, email: data.email, full_name: data.full_name };
    const newAccessToken = generateAccessToken(patient);
    const newRefreshToken = await generateRefreshToken(patient.id);

    setAccessCookie(res, newAccessToken);
    setRefreshCookie(res, newRefreshToken);

    res.json({
      message: 'Токен обновлен'
    });

  } catch (error) {
    console.error('Patient refresh error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка обновления токена'
    });
  }
});

// =====================================================
// POST /forgot-password — Запрос сброса пароля
// =====================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email обязателен'
      });
    }

    // Ищем пациента (не раскрываем существует ли email!)
    const result = await query(
      `SELECT id, email FROM patients WHERE email = $1 AND is_active = true`,
      [email]
    );

    // Всегда отвечаем успехом (защита от перебора email)
    if (result.rows.length === 0) {
      return res.json({
        message: 'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля'
      });
    }

    const patient = result.rows[0];

    // Инвалидируем старые токены
    await query(
      `UPDATE patient_password_resets SET used = true WHERE patient_id = $1 AND used = false`,
      [patient.id]
    );

    // Создаём новый токен (plaintext уходит в email, в БД — только хэш)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await query(
      `INSERT INTO patient_password_resets (patient_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [patient.id, hashToken(resetToken), expiresAt]
    );

    // Отправляем email (пока заглушка)
    await sendPasswordResetEmail(patient.email, resetToken);

    res.json({
      message: 'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля'
    });

  } catch (error) {
    console.error('Patient forgot-password error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при запросе сброса пароля'
    });
  }
});

// =====================================================
// POST /reset-password — Сброс пароля по токену
// =====================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Токен и новый пароль обязательны'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Пароль должен содержать минимум 8 символов'
      });
    }

    // Проверяем токен по хэшу
    const result = await query(
      `SELECT pr.*, p.id as patient_id
       FROM patient_password_resets pr
       JOIN patients p ON p.id = pr.patient_id
       WHERE pr.token_hash = $1 AND pr.used = false AND pr.expires_at > NOW()`,
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid Token',
        message: 'Ссылка для сброса пароля недействительна или истекла'
      });
    }

    const resetData = result.rows[0];

    // Хешируем новый пароль
    const password_hash = await bcrypt.hash(new_password, 10);

    // Обновляем пароль
    await query(
      `UPDATE patients SET password_hash = $1 WHERE id = $2`,
      [password_hash, resetData.patient_id]
    );

    // Отмечаем токен как использованный
    await query(
      `UPDATE patient_password_resets SET used = true WHERE id = $1`,
      [resetData.id]
    );

    // Инвалидируем все refresh токены (выход со всех устройств)
    await query(
      `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
      [resetData.patient_id]
    );

    res.json({
      message: 'Пароль успешно изменён. Войдите с новым паролем.'
    });

  } catch (error) {
    console.error('Patient reset-password error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при сбросе пароля'
    });
  }
});

// =====================================================
// GET /me — Данные текущего пациента
// =====================================================
router.get('/me', authenticatePatient, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, phone, birth_date, avatar_url,
              email_verified, auth_provider, last_login_at, created_at
       FROM patients WHERE id = $1 AND is_active = true`,
      [req.patient.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    res.json({
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Patient me error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении данных профиля'
    });
  }
});

// =====================================================
// PUT /me — Обновление профиля пациента
// =====================================================
router.put('/me', authenticatePatient, async (req, res) => {
  try {
    // Жёсткий allowlist. email/birth_date/diagnosis/surgery_date — read-only
    // (правит только инструктор/админ через свои роуты). avatar_url — через
    // отдельный POST /upload-avatar. Любые лишние поля в req.body тихо
    // игнорируются — это защита от подмены email и т.п.
    const ALLOWED = ['full_name', 'phone'];
    const updates = {};
    for (const key of ALLOWED) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'NO_FIELDS',
        message: 'Нет полей для обновления'
      });
    }

    // Динамический UPDATE через параметризованный запрос — ключи берутся
    // из ALLOWED (фиксированный whitelist), значения через $N. SQL injection = 0.
    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const key of Object.keys(updates)) {
      if (key === 'full_name') {
        // Защита от пустого имени — оставляем старое значение
        setClauses.push(`full_name = COALESCE(NULLIF($${idx}, ''), full_name)`);
        params.push(updates.full_name);
      } else {
        // phone: пустая строка → NULL (сохранить как «не указан»)
        setClauses.push(`${key} = $${idx}`);
        params.push(updates[key] === '' ? null : updates[key]);
      }
      idx += 1;
    }
    params.push(req.patient.id);

    const sql = `
      UPDATE patients
      SET ${setClauses.join(', ')}
      WHERE id = $${idx} AND is_active = true
      RETURNING id, email, full_name, phone, birth_date, avatar_url,
                email_verified, auth_provider, telegram_chat_id,
                last_login_at, created_at, updated_at
    `;
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    res.json({
      data: result.rows[0],
      message: 'Профиль обновлён'
    });

  } catch (error) {
    console.error('Patient update me error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при обновлении профиля'
    });
  }
});

// =====================================================
// POST /change-password — Смена пароля пациента
// Спринт 2 — Профиль
// =====================================================
router.post('/change-password', authenticatePatient, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;

    // Валидация
    if (!old_password || !new_password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Текущий и новый пароль обязательны'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Новый пароль должен содержать минимум 8 символов'
      });
    }

    // Получаем текущий пароль
    const result = await query(
      `SELECT password_hash FROM patients WHERE id = $1 AND is_active = true`,
      [req.patient.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    const patient = result.rows[0];

    // Проверяем старый пароль
    const isMatch = await bcrypt.compare(old_password, patient.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Текущий пароль неверный'
      });
    }

    // Хешируем новый пароль
    const password_hash = await bcrypt.hash(new_password, 10);

    // Обновляем пароль в БД
    await query(
      `UPDATE patients SET password_hash = $1 WHERE id = $2`,
      [password_hash, req.patient.id]
    );

    // Удаляем все refresh tokens (выход со всех устройств)
    await query(
      `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
      [req.patient.id]
    );

    res.json({
      message: 'Пароль успешно изменён. Необходимо войти заново.'
    });

  } catch (error) {
    console.error('Patient change-password error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при смене пароля'
    });
  }
});

// =====================================================
// POST /upload-avatar — Загрузка аватара пациента
// Спринт 2 — Профиль
// =====================================================
router.post('/upload-avatar', authenticatePatient, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File Too Large',
          message: 'Максимальный размер файла — 10MB'
        });
      }
      return res.status(400).json({
        error: 'Upload Error',
        message: err.message || 'Ошибка при загрузке файла'
      });
    }
    next();
  });
}, processAvatar, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Файл не выбран'
      });
    }

    // Получаем текущий avatar_url (для удаления старого файла)
    const currentResult = await query(
      `SELECT avatar_url FROM patients WHERE id = $1`,
      [req.patient.id]
    );

    const oldAvatarUrl = currentResult.rows[0]?.avatar_url;

    // Удаляем старый файл с диска, если он есть
    if (oldAvatarUrl) {
      const oldPath = path.join(__dirname, '..', oldAvatarUrl);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Формируем URL нового аватара
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Обновляем в БД
    await query(
      `UPDATE patients SET avatar_url = $1 WHERE id = $2`,
      [avatarUrl, req.patient.id]
    );

    res.json({
      data: { avatar_url: avatarUrl },
      message: 'Аватар загружен'
    });

  } catch (error) {
    console.error('Patient upload-avatar error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при загрузке аватара'
    });
  }
});

// =====================================================
// DELETE /avatar — Удаление аватара пациента
// Спринт 2 — Профиль
// =====================================================
router.delete('/avatar', authenticatePatient, async (req, res) => {
  try {
    // Получаем текущий avatar_url
    const result = await query(
      `SELECT avatar_url FROM patients WHERE id = $1`,
      [req.patient.id]
    );

    const avatarUrl = result.rows[0]?.avatar_url;

    // Удаляем файл с диска
    if (avatarUrl) {
      const filePath = path.join(__dirname, '..', avatarUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Обнуляем в БД
    await query(
      `UPDATE patients SET avatar_url = NULL WHERE id = $1`,
      [req.patient.id]
    );

    res.json({
      message: 'Аватар удалён'
    });

  } catch (error) {
    console.error('Patient delete-avatar error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при удалении аватара'
    });
  }
});

// =====================================================
// GET /avatar — Отдача аватара текущего пациента
// Заменяет публичный /uploads/avatars/* (HIGH security fix)
// =====================================================
router.get('/avatar', authenticatePatient, async (req, res) => {
  try {
    const result = await query(
      `SELECT avatar_url FROM patients WHERE id = $1 AND is_active = true`,
      [req.patient.id]
    );

    const avatarUrl = result.rows[0]?.avatar_url;
    if (!avatarUrl) {
      return res.status(404).json({ error: 'Not Found', message: 'Аватар не установлен' });
    }

    // avatar_url в БД имеет формат '/uploads/avatars/<filename>'
    // Извлекаем только имя файла, игнорируя путь (защита от traversal даже если БД повреждена)
    const filename = path.basename(avatarUrl);
    const avatarsDir = path.resolve(__dirname, '..', 'uploads', 'avatars');
    const filePath = path.resolve(avatarsDir, filename);

    // Защита: проверяем что итоговый путь действительно внутри avatarsDir
    if (!filePath.startsWith(avatarsDir + path.sep)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Некорректный путь' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not Found', message: 'Файл не найден' });
    }

    // Кешируем у клиента на 5 минут — файлы неизменяемы (новый аватар = новый filename)
    res.set('Cache-Control', 'private, max-age=300');
    return res.sendFile(filePath);

  } catch (error) {
    console.error('Patient get-avatar error:', error);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при получении аватара' });
  }
});

// =====================================================
// GET /my-complexes — Список всех активных комплексов пациента
// Используется новым ExercisesScreen для раздела "Все мои комплексы".
// =====================================================
router.get('/my-complexes', authenticatePatient, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id,
              c.title,
              c.diagnosis_note,
              c.recommendations,
              c.warnings,
              c.created_at,
              d.name as diagnosis_name,
              u.full_name as instructor_name,
              COUNT(ce.id) as exercises_count
       FROM complexes c
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN users u ON c.instructor_id = u.id
       LEFT JOIN complex_exercises ce ON ce.complex_id = c.id
       WHERE c.patient_id = $1 AND c.is_active = true
       GROUP BY c.id, d.name, u.full_name
       ORDER BY c.created_at DESC`,
      [req.patient.id]
    );

    const complexes = result.rows.map(row => ({
      ...row,
      exercises_count: parseInt(row.exercises_count, 10) || 0,
    }));

    res.json({
      data: complexes,
      total: complexes.length
    });
  } catch (error) {
    console.error('Patient my-complexes error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении комплексов'
    });
  }
});

// =====================================================
// GET /my-complexes/:id — Конкретный комплекс со всеми упражнениями
// Возвращает 404 если комплекс не принадлежит пациенту (не 403 —
// чтобы не раскрывать существование чужих записей).
// =====================================================
router.get('/my-complexes/:id', authenticatePatient, async (req, res) => {
  try {
    const complexId = parseInt(req.params.id, 10);
    if (!Number.isFinite(complexId) || complexId <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Некорректный ID комплекса'
      });
    }

    const result = await query(
      `SELECT c.id,
              c.title,
              c.diagnosis_note,
              c.recommendations,
              c.warnings,
              c.created_at,
              d.name as diagnosis_name,
              u.full_name as instructor_name,
              json_agg(
                json_build_object(
                  'id', ce.id,
                  'order_number', ce.order_number,
                  'sets', ce.sets,
                  'reps', ce.reps,
                  'duration_seconds', ce.duration_seconds,
                  'rest_seconds', ce.rest_seconds,
                  'notes', ce.notes,
                  'exercise', json_build_object(
                    'id', e.id,
                    'title', e.title,
                    'description', e.description,
                    'video_url', e.video_url,
                    'thumbnail_url', e.thumbnail_url,
                    'kinescope_id', e.kinescope_id,
                    'exercise_type', e.exercise_type,
                    'difficulty_level', e.difficulty_level,
                    'equipment', e.equipment,
                    'instructions', e.instructions,
                    'contraindications', e.contraindications,
                    'tips', e.tips
                  )
                ) ORDER BY ce.order_number
              ) as exercises
       FROM complexes c
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN users u ON c.instructor_id = u.id
       LEFT JOIN complex_exercises ce ON ce.complex_id = c.id
       LEFT JOIN exercises e ON ce.exercise_id = e.id
       WHERE c.id = $1 AND c.patient_id = $2 AND c.is_active = true
       GROUP BY c.id, d.name, u.full_name`,
      [complexId, req.patient.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Комплекс не найден'
      });
    }

    const row = result.rows[0];
    const exercises = Array.isArray(row.exercises) && row.exercises[0]?.exercise
      ? row.exercises
      : [];

    res.json({
      data: {
        id: row.id,
        title: row.title,
        diagnosis_name: row.diagnosis_name,
        diagnosis_note: row.diagnosis_note,
        recommendations: row.recommendations,
        warnings: row.warnings,
        instructor_name: row.instructor_name,
        created_at: row.created_at,
        exercises,
      }
    });
  } catch (error) {
    console.error('Patient my-complex detail error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении комплекса'
    });
  }
});

// =====================================================
// OAuth — ЗАГЛУШКИ (реализация в будущих спринтах)
// =====================================================

const SUPPORTED_PROVIDERS = ['yandex', 'google', 'telegram', 'vk'];

// GET /oauth/:provider — Редирект на провайдера
router.get('/oauth/:provider', (req, res) => {
  const { provider } = req.params;

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Неизвестный провайдер: ${provider}. Доступны: ${SUPPORTED_PROVIDERS.join(', ')}`
    });
  }

  res.status(501).json({
    error: 'Not Implemented',
    message: `OAuth через ${provider} в разработке`,
    provider
  });
});

// GET /oauth/:provider/callback — Callback от провайдера
router.get('/oauth/:provider/callback', (req, res) => {
  const { provider } = req.params;

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Неизвестный провайдер: ${provider}`
    });
  }

  res.status(501).json({
    error: 'Not Implemented',
    message: `OAuth callback для ${provider} в разработке`,
    provider
  });
});

module.exports = router;
