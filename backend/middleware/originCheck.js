// =====================================================
// MIDDLEWARE: Origin check (CSRF-защита для cookie auth)
// =====================================================
//
// После миграции Patient JWT в httpOnly cookie (баг #11)
// используется SameSite=Strict + Origin check для защиты от CSRF.
//
// Логика:
//  - GET / HEAD / OPTIONS пропускаем без проверки (read-only)
//  - Для POST/PUT/DELETE/PATCH требуем Origin или Referer header
//    и сверяем с config.corsOrigins
//  - Запросы без Origin (например, curl без флага) отклоняются
//    это защищает от side-channel атак через HTML-формы
//
// ВАЖНО: middleware применяется ТОЛЬКО к приватным pattern'ам
// (см. server.js), чтобы не ломать webhook'и или публичные endpoints.

const config = require('../config/config');

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const requireSameOrigin = (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  // В тест-режиме пропускаем (тесты supertest не шлют Origin header).
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;

  // В dev режиме CRA proxy не пробрасывает Origin header.
  // Пропускаем запросы без Origin в dev (CORS middleware уже
  // блокирует cross-origin запросы от браузера).
  // В production Origin обязателен.
  if (!origin) {
    if (config.nodeEnv === 'production') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Origin header required'
      });
    }
    return next();
  }

  const allowed = (config.corsOrigins || []).some((allowedOrigin) =>
    origin === allowedOrigin || origin.startsWith(allowedOrigin + '/') || origin.startsWith(allowedOrigin + '?')
  );

  if (!allowed) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid origin'
    });
  }

  next();
};

module.exports = { requireSameOrigin };
