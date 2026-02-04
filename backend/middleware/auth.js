const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { query } = require('../database/db');

// Middleware для проверки JWT токена
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Требуется авторизация' 
    });
  }

  // Явно указываем алгоритм для защиты от algorithm confusion атак
  jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }, (err, user) => {
    if (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Токен истек, выполните вход заново'
        : 'Недействительный токен';
      return res.status(403).json({
        error: 'Forbidden',
        message
      });
    }

    req.user = user; // Сохраняем данные пользователя в request
    next();
  });
};

// Middleware для проверки роли администратора
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Требуются права администратора'
    });
  }
  next();
};

// Middleware для проверки access_token комплекса (для пациентов) или JWT (для инструкторов)
// Используется для endpoints прогресса
const authenticateProgressAccess = async (req, res, next) => {
  // 1. Сначала проверяем JWT (для инструкторов)
  const authHeader = req.headers['authorization'];
  const jwtToken = authHeader && authHeader.split(' ')[1];

  if (jwtToken) {
    try {
      const user = jwt.verify(jwtToken, config.jwt.secret, { algorithms: ['HS256'] });
      req.user = user;
      req.authType = 'jwt';
      return next();
    } catch (err) {
      // JWT недействителен, продолжаем проверку access_token
    }
  }

  // 2. Проверяем access_token комплекса (для пациентов)
  const accessToken = req.headers['x-access-token'] || req.query.access_token || req.body?.access_token;

  if (!accessToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Требуется авторизация (JWT токен или access_token комплекса)'
    });
  }

  try {
    const result = await query(
      'SELECT id, patient_id FROM complexes WHERE access_token = $1 AND is_active = true',
      [accessToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Недействительный или неактивный access_token'
      });
    }

    req.complex = result.rows[0];
    req.authType = 'access_token';
    next();
  } catch (error) {
    console.error('Auth progress access error:', error.message);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка проверки авторизации'
    });
  }
};

module.exports = {
  authenticateToken,
  requireAdmin,
  authenticateProgressAccess
};
