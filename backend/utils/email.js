// =====================================================
// EMAIL UTILITY — Resend integration с dev-fallback
// =====================================================
// Если RESEND_API_KEY задан — отправка через resend.com (3000/мес free).
// Иначе — fallback на console.log (для dev/test без интеграции).
//
// Domain verification на Resend нужен ОДНОКРАТНО для my.azarean.ru:
// добавить SPF/DKIM/DMARC в DNS Reg.ru. До верификации Resend позволяет
// слать только на email того же домена что у sender'а (test mode).
// =====================================================

const config = require('../config/config');
const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Azarean <noreply@my.azarean.ru>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

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
// Универсальный sender — Resend если ключ есть, иначе console.log
// =====================================================

const send = async (to, template) => {
  if (!resend) {
    // Fallback для dev / test без RESEND_API_KEY.
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║  📧 EMAIL STUB (нет RESEND_API_KEY)                  ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║  To:      ${to}`);
    console.log(`║  Subject: ${template.subject}`);
    console.log('║  --- text ---');
    template.text.split('\n').forEach((line) => console.log(`║  ${line}`));
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    return { success: true, message: 'Email logged to console (no API key)', stub: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (error) {
      console.error('❌ Resend error:', error.message || error);
      return { success: false, message: error.message || 'Resend send failed' };
    }

    return { success: true, message: 'Email sent', id: data?.id };
  } catch (err) {
    console.error('❌ Email send exception:', err.message);
    return { success: false, message: err.message };
  }
};

// =====================================================
// Public API
// =====================================================

const sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${config.frontendUrl}/patient-reset-password/${resetToken}`;
  return send(email, passwordResetTemplate(resetLink));
};

const sendVerificationEmail = async (email, verificationToken) => {
  const verifyLink = `${config.frontendUrl}/patient-verify-email/${verificationToken}`;
  return send(email, verificationTemplate(verifyLink));
};

module.exports = { sendPasswordResetEmail, sendVerificationEmail };
