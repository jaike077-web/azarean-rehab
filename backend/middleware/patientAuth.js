// =====================================================
// MIDDLEWARE: Авторизация пациентов (JWT)
// Спринт 0.1
//
// ОТДЕЛЬНЫЙ от инструкторского middleware!
// Использует PATIENT_JWT_SECRET
// =====================================================

const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * Проверяет JWT-токен пациента.
 * Источники токена (в порядке приоритета):
 *   1. Cookie `patient_access_token` (основной, после миграции #11)
 *   2. Authorization: Bearer <token> (fallback для тестов и API-клиентов)
 * Устанавливает req.patient = { id, email, full_name }
 */
const authenticatePatient = (req, res, next) => {
  let token = req.cookies && req.cookies.patient_access_token;
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Требуется авторизация'
    });
  }

  jwt.verify(token, config.patient.jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Токен истек, выполните вход заново'
        });
      }
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Недействительный токен'
      });
    }

    req.patient = decoded;
    next();
  });
};

module.exports = { authenticatePatient };
