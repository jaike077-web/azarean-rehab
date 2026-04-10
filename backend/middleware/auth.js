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
  jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }, async (err, user) => {
    if (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Токен истек, выполните вход заново'
        : 'Недействительный токен';
      return res.status(403).json({
        error: 'Forbidden',
        message
      });
    }

    // Проверяем что пользователь не деактивирован
    try {
      const result = await query(
        'SELECT is_active FROM users WHERE id = $1',
        [user.id]
      );
      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Аккаунт деактивирован'
        });
      }
    } catch (dbError) {
      console.error('Ошибка проверки статуса пользователя:', dbError.message);
      return res.status(500).json({ error: 'Server Error' });
    }

    req.user = user;
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

// Composite middleware: принимает либо JWT инструктора, либо JWT пациента
// (из cookie patient_access_token или Authorization Bearer header).
// Используется для /api/progress где обе роли легитимны.
//
// После успеха:
//   - Инструктор: req.user, req.authType = 'jwt'
//   - Пациент:    req.patient, req.authType = 'patient'
const authenticatePatientOrInstructor = async (req, res, next) => {
  // 1. Пациент: сначала cookie, потом Bearer
  const patientCookie = req.cookies && req.cookies.patient_access_token;
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];

  if (patientCookie) {
    try {
      const decoded = jwt.verify(patientCookie, config.patient.jwtSecret, { algorithms: ['HS256'] });
      req.patient = decoded;
      req.authType = 'patient';
      return next();
    } catch (_) { /* переходим дальше */ }
  }

  if (bearerToken) {
    // 2a. Пробуем как JWT инструктора
    try {
      const user = jwt.verify(bearerToken, config.jwt.secret, { algorithms: ['HS256'] });
      // Проверяем что инструктор активен
      const result = await query('SELECT is_active FROM users WHERE id = $1', [user.id]);
      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return res.status(403).json({ error: 'Forbidden', message: 'Аккаунт деактивирован' });
      }
      req.user = user;
      req.authType = 'jwt';
      return next();
    } catch (_) { /* переходим дальше */ }

    // 2b. Пробуем как JWT пациента (fallback для тестов/API-клиентов)
    try {
      const decoded = jwt.verify(bearerToken, config.patient.jwtSecret, { algorithms: ['HS256'] });
      req.patient = decoded;
      req.authType = 'patient';
      return next();
    } catch (_) { /* переходим дальше */ }
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Требуется авторизация'
  });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  authenticatePatientOrInstructor
};
