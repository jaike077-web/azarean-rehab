// =====================================================
// SENTRY OBSERVABILITY — backend instrumentation
// =====================================================
// Файл подключается первой строкой в server.js:
//   require('./instrument');
//
// Sentry v10 использует OpenTelemetry под капотом и должен инициализироваться
// ДО require'ов модулей, которые он инструментирует (express, http, pg).
// Если SENTRY_DSN не задан — SDK работает в noop-режиме, никакие события
// не отправляются. Это нужно для dev-окружения и тестов.
// =====================================================

const Sentry = require('@sentry/node');

const DSN = process.env.SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || 'development',

    // 10% трафика трассируется в проде, 0 в dev (только errors).
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

    // Не отправлять IP, headers, cookies автоматически.
    // Минимизируем PII в событиях.
    sendDefaultPii: false,

    // Дополнительный ручной scrubber на случай если что-то проскочит.
    // Список покрывает всё что у нас передаётся в body на auth-эндпоинтах.
    beforeSend(event) {
      const SENSITIVE_KEYS = [
        'password',
        'passwordHash',
        'password_hash',
        'currentPassword',
        'newPassword',
        'token',
        'refresh_token',
        'access_token',
        'code',
        'code_hash',
        'code_verifier',
        'invite_code',
        'nonce',
      ];

      const scrubObject = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
          if (SENSITIVE_KEYS.includes(key)) {
            obj[key] = '[REDACTED]';
          } else if (typeof obj[key] === 'object') {
            scrubObject(obj[key]);
          }
        }
      };

      if (event.request) {
        scrubObject(event.request.data);
        scrubObject(event.request.cookies);
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
        }
      }
      scrubObject(event.extra);

      return event;
    },
  });

  // eslint-disable-next-line no-console
  console.log(`✓ Sentry initialized (env: ${process.env.NODE_ENV || 'development'})`);
}

module.exports = Sentry;
