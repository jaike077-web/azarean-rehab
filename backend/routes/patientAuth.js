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
const { authenticatePatient } = require('../middleware/patientAuth');
const { sendPasswordResetEmail } = require('../utils/email');
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
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 дней

  // Удаляем старый refresh token и создаём новый
  await query(
    `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
    [patientId]
  );

  await query(
    `INSERT INTO patient_refresh_tokens (patient_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [patientId, token, expiresAt]
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

    // Устанавливаем refresh cookie
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      token: accessToken,
      patient: {
        id: patient.id,
        email: patient.email,
        full_name: patient.full_name,
        phone: patient.phone,
        birth_date: patient.birth_date,
        avatar_url: patient.avatar_url
      }
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
      `SELECT id, email, full_name, phone, birth_date, avatar_url, password_hash, is_active
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
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Неверный email или пароль'
      });
    }

    // Обновляем last_login_at
    await query(
      `UPDATE patients SET last_login_at = NOW() WHERE id = $1`,
      [patient.id]
    );

    // Генерируем токены
    const accessToken = generateAccessToken(patient);
    const refreshToken = await generateRefreshToken(patient.id);

    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      token: accessToken,
      patient: {
        id: patient.id,
        email: patient.email,
        full_name: patient.full_name,
        phone: patient.phone,
        birth_date: patient.birth_date,
        avatar_url: patient.avatar_url
      }
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

    clearRefreshCookie(res);

    res.json({ success: true, message: 'Вы вышли из системы' });

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

    // Проверяем в БД
    const result = await query(
      `SELECT rt.*, p.id as patient_id, p.email, p.full_name
       FROM patient_refresh_tokens rt
       JOIN patients p ON p.id = rt.patient_id
       WHERE rt.token = $1 AND rt.expires_at > NOW()`,
      [refreshToken]
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

    setRefreshCookie(res, newRefreshToken);

    res.json({
      success: true,
      token: newAccessToken
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
        success: true,
        message: 'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля'
      });
    }

    const patient = result.rows[0];

    // Инвалидируем старые токены
    await query(
      `UPDATE patient_password_resets SET used = true WHERE patient_id = $1 AND used = false`,
      [patient.id]
    );

    // Создаём новый токен
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await query(
      `INSERT INTO patient_password_resets (patient_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [patient.id, resetToken, expiresAt]
    );

    // Отправляем email (пока заглушка)
    await sendPasswordResetEmail(patient.email, resetToken);

    res.json({
      success: true,
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

    // Проверяем токен
    const result = await query(
      `SELECT pr.*, p.id as patient_id
       FROM patient_password_resets pr
       JOIN patients p ON p.id = pr.patient_id
       WHERE pr.token = $1 AND pr.used = false AND pr.expires_at > NOW()`,
      [token]
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
      success: true,
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
// POST /link-token — Привязка ссылки-токена к аккаунту
// =====================================================
router.post('/link-token', authenticatePatient, async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'access_token обязателен'
      });
    }

    // Ищем комплекс по токену
    const complexResult = await query(
      `SELECT id, patient_id FROM complexes WHERE access_token = $1 AND is_active = true`,
      [access_token]
    );

    if (complexResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Комплекс с таким токеном не найден'
      });
    }

    const complex = complexResult.rows[0];

    // Если комплекс уже привязан к другому пациенту — ошибка
    if (complex.patient_id && complex.patient_id !== req.patient.id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Этот комплекс уже привязан к другому пациенту'
      });
    }

    // Привязываем к текущему пациенту (если ещё не привязан)
    if (!complex.patient_id) {
      await query(
        `UPDATE complexes SET patient_id = $1 WHERE id = $2`,
        [req.patient.id, complex.id]
      );
    }

    res.json({
      success: true,
      message: 'Комплекс успешно привязан к аккаунту',
      complex_id: complex.id
    });

  } catch (error) {
    console.error('Patient link-token error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при привязке токена'
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
      success: true,
      patient: result.rows[0]
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
    const { full_name, phone, birth_date, avatar_url } = req.body;

    const result = await query(
      `UPDATE patients
       SET full_name = COALESCE(NULLIF($1, ''), full_name),
           phone = COALESCE($2, phone),
           birth_date = COALESCE($3, birth_date),
           avatar_url = COALESCE($4, avatar_url)
       WHERE id = $5 AND is_active = true
       RETURNING id, email, full_name, phone, birth_date, avatar_url, email_verified, auth_provider`,
      [full_name || null, phone || null, birth_date || null, avatar_url || null, req.patient.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    res.json({
      success: true,
      patient: result.rows[0]
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
