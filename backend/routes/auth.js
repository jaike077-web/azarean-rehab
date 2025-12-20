const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Регистрация нового пользователя (инструктора/админа)
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, role = 'instructor' } = req.body;

    // Валидация
    if (!email || !password || !full_name) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Email, пароль и ФИО обязательны' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Пароль должен быть минимум 6 символов' 
      });
    }

    // Проверяем существует ли пользователь
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Пользователь с таким email уже существует' 
      });
    }

    // Хешируем пароль
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Создаем пользователя
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, full_name, role, created_at`,
      [email, password_hash, full_name, role]
    );

    const user = result.rows[0];

    // Генерируем JWT токен
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'Пользователь успешно зарегистрирован',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('Ошибка регистрации:', error);
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

    // Ищем пользователя
    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Authentication Error',
        message: 'Неверный email или пароль' 
      });
    }

    const user = result.rows[0];

    // Проверяем пароль
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Authentication Error',
        message: 'Неверный email или пароль' 
      });
    }

    // Генерируем JWT токен
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      },
      token
    });

  } catch (error) {
    console.error('Ошибка входа:', error);
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
    console.error('Ошибка получения данных пользователя:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении данных пользователя' 
    });
  }
});

module.exports = router;