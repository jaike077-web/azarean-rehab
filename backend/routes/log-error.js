// =====================================================
// POST /api/log-error
// =====================================================
// Endpoint для frontend ErrorBoundary и window.onerror — пересылает
// browser-side ошибки в ops-bot. Без auth: ловить ошибки нужно даже
// у незалогиненного юзера (например, краш на /patient-login).
//
// Защита от злоупотребления:
// - rate-limit 30 req/min с одного IP
// - body sanitization: фиксированные max-length для каждого поля
// - дальнейшая защита от спама — внутри opsAlert.js (dedup + hourly cap)
// =====================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { sendOpsAlert, formatFrontendAlertBody } = require('../utils/opsAlert');

const errorReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many error reports', message: 'Слишком много отчётов об ошибках' },
});

function clip(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) : s;
}

router.post('/', errorReportLimiter, async (req, res) => {
  const { message, stack, url, userAgent, context } = req.body || {};

  // Sanitize: фиксированные max-length чтобы юзер не мог раздуть алерт
  const sanitized = {
    message: clip(message, 500) || 'unknown',
    stack: clip(stack, 2500),
    url: clip(url, 300),
    userAgent: clip(userAgent, 250),
    context: (context && typeof context === 'object') ? context : {},
  };

  // Заголовок дедупит по «первой строке» — короткое сообщение даёт лучшую группировку
  const title = sanitized.message;
  const body = formatFrontendAlertBody(sanitized);

  // fire-and-forget — клиенту незачем ждать Telegram API
  sendOpsAlert(title, body).catch(() => {});
  res.status(204).end();
});

module.exports = router;
