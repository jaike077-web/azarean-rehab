// =====================================================
// EMAIL UTILITY — two-tier с автоматическим fallback
// =====================================================
// Tier 1 — Yandex 360 SMTP (smtp.yandex.ru:465).
//   Основной канал. Серверы в РФ → нет трансграничной передачи (152-ФЗ).
//   Лучшая deliverability в .ru-боксы (yandex.ru, mail.ru). Платный
//   тариф 149₽/мес за ящик, 30 писем/мин лимит.
//
// Tier 2 — Resend API (resend.com).
//   Резерв на случай если Y360 SMTP упал, заблокирован, или адресат
//   в зарубежном/проблемном домене (gmail/icloud периодически режут
//   .ru-отправителей). Free 3000/мес. ⚠️ Трансграничная передача —
//   сервер в США, при коммерческом запуске нужно уведомление РКН +
//   согласие пациента. Пока пилот без живых пациентов — резерв OK.
//
// Tier 3 — console.log stub.
//   Когда оба провайдера не сконфигурены (dev/test). Письмо логируется
//   в консоль, текст и subject видны для проверки flow без реальной
//   отправки.
//
// Поведение:
//   send() пытается Y360 → если падает (throw / network), пытается Resend
//   → если оба упали, возвращает { success: false, errors: [...] }.
//   ❗ В контракт API роутов мы возвращаем 200 даже при fail email — иначе
//   утечка информации (атакующий может проверить «есть ли email в БД»
//   по разнице в response). См. routes/patientAuth.js → /forgot-password.
//
// SPF в DNS должен включать обоих:
//   v=spf1 include:_spf.yandex.net include:_spf.resend.com ~all
// DKIM — записи у каждого свои, не конфликтуют.
// =====================================================

const config = require('../config/config');

const Y360_USER = process.env.YANDEX_SMTP_USER || '';
const Y360_PASSWORD = process.env.YANDEX_SMTP_PASSWORD || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Azarean <noreply@my.azarean.ru>';

// Lazy-init для providers — не подключаем SDK / SMTP пока кто-то не отправит.
// nodemailer тяжёлый, Resend SDK тоже. В test-режиме обычно оба пусты — noop без cost.
let y360Transporter = null;
let resendClient = null;

function getY360() {
  if (!Y360_USER || !Y360_PASSWORD) return null;
  if (!y360Transporter) {
    const nodemailer = require('nodemailer');
    y360Transporter = nodemailer.createTransport({
      host: 'smtp.yandex.ru',
      port: 465,
      secure: true, // TLS
      auth: { user: Y360_USER, pass: Y360_PASSWORD },
      // Connection timeout — Y360 SMTP обычно отвечает за 1-2 сек.
      // Ставим 10 сек чтобы не висеть на зависшей сети.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return y360Transporter;
}

function getResend() {
  if (!RESEND_API_KEY) return null;
  if (!resendClient) {
    const { Resend } = require('resend');
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

// =====================================================
// HTML / plain text шаблоны
// =====================================================

const passwordResetTemplate = (resetLink) => ({
  subject: 'Azarean — сброс пароля',
  html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #2d3748;">
  <h2 style="color: #2b6cb0;">Сброс пароля</h2>
  <p>Вы запросили сброс пароля для своей учётной записи в Azarean.</p>
  <p>
    <a href="${resetLink}" style="display: inline-block; background: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      Сбросить пароль
    </a>
  </p>
  <p style="color: #718096; font-size: 13px;">
    Ссылка действительна <strong>1 час</strong>. Если кнопка не работает,
    скопируйте адрес: <br>
    <code style="font-size: 12px;">${resetLink}</code>
  </p>
  <p style="color: #718096; font-size: 13px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
    Если вы не запрашивали сброс — просто проигнорируйте это письмо.
    Никто не получит доступ к вашему аккаунту без перехода по ссылке.
  </p>
</body>
</html>`,
  text: `Azarean — сброс пароля

Вы запросили сброс пароля для своей учётной записи.

Ссылка для сброса (действительна 1 час):
${resetLink}

Если вы не запрашивали сброс — просто проигнорируйте это письмо.`,
});

// Экранирование для вставки произвольного текста алерта в HTML.
const escapeHtml = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Шаблон критического (red-flag) алерта — резервный канал к Telegram.
const opsAlertTemplate = (title, body) => ({
  subject: `🚨 ${title}`.slice(0, 200),
  html: `<pre style="font-family:monospace;white-space:pre-wrap;font-size:14px">${escapeHtml(title)}\n\n${escapeHtml(body)}</pre>`,
  text: `${title}\n\n${body}`,
});

const verificationTemplate = (verifyLink) => ({
  subject: 'Azarean — подтвердите email',
  html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #2d3748;">
  <h2 style="color: #2b6cb0;">Подтвердите email</h2>
  <p>Спасибо за регистрацию в Azarean. Подтвердите ваш email:</p>
  <p>
    <a href="${verifyLink}" style="display: inline-block; background: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      Подтвердить email
    </a>
  </p>
  <p style="color: #718096; font-size: 13px;">
    Если кнопка не работает, скопируйте адрес: <br>
    <code style="font-size: 12px;">${verifyLink}</code>
  </p>
</body>
</html>`,
  text: `Azarean — подтвердите email

Спасибо за регистрацию в Azarean. Подтвердите ваш email:
${verifyLink}`,
});

// =====================================================
// Provider implementations
// =====================================================

async function sendViaY360(to, template) {
  const transporter = getY360();
  if (!transporter) throw new Error('Y360 not configured');
  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
  return { provider: 'y360', id: info.messageId };
}

async function sendViaResend(to, template) {
  const client = getResend();
  if (!client) throw new Error('Resend not configured');
  const { data, error } = await client.emails.send({
    from: EMAIL_FROM,
    to: [to],
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
  if (error) {
    throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  }
  return { provider: 'resend', id: data && data.id };
}

function logStub(to, template) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  📧 EMAIL STUB (нет ни Y360 ни Resend в env)         ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║  To:      ${to}`);
  console.log(`║  Subject: ${template.subject}`);
  console.log('║  --- text ---');
  template.text.split('\n').forEach((line) => console.log(`║  ${line}`));
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
}

// =====================================================
// Универсальный send — two-tier с fallback
// =====================================================

async function send(to, template) {
  const errors = [];
  const y360 = getY360();
  const resend = getResend();

  // Tier 1: Y360
  if (y360) {
    try {
      const result = await sendViaY360(to, template);
      return { success: true, message: 'Email sent via Y360', ...result };
    } catch (err) {
      errors.push({ provider: 'y360', error: err.message });
      console.warn(`[email] Y360 failed: ${err.message} — пробую Resend`);
    }
  }

  // Tier 2: Resend
  if (resend) {
    try {
      const result = await sendViaResend(to, template);
      return {
        success: true,
        message: 'Email sent via Resend (fallback)',
        ...result,
      };
    } catch (err) {
      errors.push({ provider: 'resend', error: err.message });
      console.warn(`[email] Resend failed: ${err.message}`);
    }
  }

  // Tier 3: Никто не сконфигурен → stub
  if (!y360 && !resend) {
    logStub(to, template);
    return { success: true, message: 'Email logged to console (no providers)', stub: true };
  }

  // Оба провайдера упали
  console.error('[email] All providers failed:', errors);
  return { success: false, message: 'All email providers failed', errors };
}

// =====================================================
// Public API — сохраняем backward compat для роутов
// =====================================================

const sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${config.frontendUrl}/patient-reset-password/${resetToken}`;
  return send(email, passwordResetTemplate(resetLink));
};

const sendVerificationEmail = async (email, verificationToken) => {
  const verifyLink = `${config.frontendUrl}/patient-verify-email/${verificationToken}`;
  return send(email, verificationTemplate(verifyLink));
};

// Резервный канал для критических алертов (red-flag), когда Telegram не доставил.
// Получатель — config.opsBot.email (OPS_EMAIL). Не задан → skipped (fallback выключен).
const sendOpsAlertEmail = async (title, body) => {
  const to = config.opsBot && config.opsBot.email;
  if (!to) return { success: false, skipped: 'no_ops_email' };
  return send(to, opsAlertTemplate(title, body));
};

module.exports = {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendOpsAlertEmail,
  // экспортированы для тестов
  send,
  passwordResetTemplate,
  verificationTemplate,
  opsAlertTemplate,
};
