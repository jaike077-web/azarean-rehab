const jwt = require('jsonwebtoken');
const config = require('../config/config');

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

  jwt.verify(token, config.jwt.secret, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Недействительный токен' 
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

module.exports = {
  authenticateToken,
  requireAdmin
};
