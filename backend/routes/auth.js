const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const config = require('../config/config');

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

// Валидация email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Валидация пароля (минимум 8 символов, заглавная, строчная, цифра)
const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) {
    errors.push('минимум 8 символов');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('заглавная буква');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('строчная буква');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('цифра');
  }
  return errors;
};

// Генерация refresh token
const generateRefreshToken = async (userId) => {
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 дней

  await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3, created_at = NOW()`,
    [userId, refreshToken, expiresAt]
  );

  return refreshToken;
};

// =====================================================
// ROUTES
// =====================================================

// Регистрация нового пользователя (инструктора/админа)
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, role = 'instructor' } = req.body;

    // Валидация обязательных полей
    if (!email || !password || !full_name) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email, пароль и ФИО обязательны'
      });
    }

    // Валидация email
    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Некорректный формат email'
      });
    }

    // Валидация пароля
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Пароль должен содержать: ${passwordErrors.join(', ')}`
      });
    }

    // Валидация роли
    if (!['instructor', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Недопустимая роль'
      });
    }

    // Проверяем существует ли пользователь
    const existingUser = await query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Пользователь с таким email уже существует'
      });
    }

    // Хешируем пароль (salt 12 для большей безопасности)
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Создаем пользователя
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES (LOWER($1), $2, $3, $4)
       RETURNING id, email, full_name, role, created_at`,
      [email, password_hash, full_name, role]
    );

    const user = result.rows[0];

    // Генерируем JWT токен с явным указанием алгоритма
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      { algorithm: 'HS256', expiresIn: config.jwt.expiresIn }
    );

    // Генерируем refresh token
    const refreshToken = await generateRefreshToken(user.id);

    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at
      },
      token,
      refresh_token: refreshToken
    });

  } catch (error) {
    console.error('Ошибка регистрации:', error.message);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при регистрации пользователя'
    });
  }
});

// Вход в систему
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Валидация
    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email и пароль обязательны'
      });
    }

    // Ищем пользователя (включая заблокированных для проверки блокировки)
    const result = await query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: 'Неверный email или пароль'
      });
    }

    const user = result.rows[0];

    // Проверяем блокировку аккаунта
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        error: 'Account Locked',
        message: `Аккаунт заблокирован. Попробуйте через ${minutesLeft} минут.`
      });
    }

    // Проверяем пароль
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      // Увеличиваем счетчик неудачных попыток
      const attempts = (user.failed_login_attempts || 0) + 1;

      if (attempts >= 5) {
        // Блокируем на 15 минут после 5 неудачных попыток
        await query(
          `UPDATE users SET
           failed_login_attempts = $1,
           locked_until = NOW() + INTERVAL '15 minutes'
           WHERE id = $2`,
          [attempts, user.id]
        );
        return res.status(423).json({
          error: 'Account Locked',
          message: 'Слишком много неудачных попыток. Аккаунт заблокирован на 15 минут.'
        });
      } else {
        await query(
          'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
          [attempts, user.id]
        );
        return res.status(401).json({
          error: 'Authentication Error',
          message: `Неверный email или пароль. Осталось попыток: ${5 - attempts}`
        });
      }
    }

    // Сбрасываем счетчик при успешном входе
    if (user.failed_login_attempts > 0 || user.locked_until) {
      await query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );
    }

    // Генерируем JWT токен с явным указанием алгоритма
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      { algorithm: 'HS256', expiresIn: config.jwt.expiresIn }
    );

    // Генерируем refresh token
    const refreshToken = await generateRefreshToken(user.id);

    res.json({
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      },
      token,
      refresh_token: refreshToken
    });

  } catch (error) {
    console.error('Ошибка входа:', error.message);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при входе в систему'
    });
  }
});

// Получить информацию о текущем пользователе
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, full_name, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пользователь не найден'
      });
    }

    res.json({
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Ошибка получения данных пользователя:', error.message);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении данных пользователя'
    });
  }
});

// Обновление токена через refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'refresh_token обязателен'
      });
    }

    // Проверяем refresh token
    const tokenResult = await query(
      `SELECT user_id FROM refresh_tokens
       WHERE token = $1 AND expires_at > NOW()`,
      [refresh_token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Недействительный или истекший refresh token'
      });
    }

    const userId = tokenResult.rows[0].user_id;

    // Получаем пользователя
    const userResult = await query(
      'SELECT id, email, role, full_name FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Пользователь не найден или деактивирован'
      });
    }

    const user = userResult.rows[0];

    // Генерируем новый JWT токен
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      { algorithm: 'HS256', expiresIn: config.jwt.expiresIn }
    );

    // Генерируем новый refresh token (ротация)
    const newRefreshToken = await generateRefreshToken(user.id);

    res.json({
      message: 'Токен обновлен',
      token,
      refresh_token: newRefreshToken
    });

  } catch (error) {
    console.error('Ошибка обновления токена:', error.message);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при обновлении токена'
    });
  }
});

// Выход из системы (отзыв refresh token)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      message: 'Выход выполнен успешно'
    });

  } catch (error) {
    console.error('Ошибка выхода:', error.message);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при выходе из системы'
    });
  }
});

module.exports = router;
