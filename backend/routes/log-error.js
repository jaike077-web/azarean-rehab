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
const { sendOpsAlert } = require('../utils/opsAlert');

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

  const cleanMsg = clip(message, 500) || 'unknown';
  const cleanStack = clip(stack, 2500);
  const cleanUrl = clip(url, 300);
  const cleanUa = clip(userAgent, 250);
  let cleanCtx = '';
  if (context && typeof context === 'object') {
    try {
      cleanCtx = clip(JSON.stringify(context), 600);
    } catch {
      cleanCtx = '[unserializable context]';
    }
  }

  const title = `[Frontend] ${cleanMsg}`;
  const bodyLines = [
    cleanUrl && `URL: ${cleanUrl}`,
    cleanUa && `UA: ${cleanUa}`,
    cleanCtx && `Ctx: ${cleanCtx}`,
    cleanStack && '',
    cleanStack && cleanStack,
  ].filter(Boolean);

  // fire-and-forget — клиенту незачем ждать Telegram API
  sendOpsAlert(title, bodyLines.join('\n')).catch(() => {});
  res.status(204).end();
});

module.exports = router;
