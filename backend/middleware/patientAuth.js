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
 * Проверяет JWT-токен пациента
 * Устанавливает req.patient = { id, email, full_name }
 */
const authenticatePatient = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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
