// =====================================================
// EMAIL UTILITY — заглушка для разработки
// Спринт 0.1
//
// Пока логирует в консоль. Интерфейс готов для замены
// на Nodemailer, Resend, SendGrid и т.д.
// =====================================================

const config = require('../config/config');

/**
 * Отправка email для сброса пароля
 * @param {string} email - адрес получателя
 * @param {string} resetToken - токен сброса
 */
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${config.frontendUrl}/patient-reset-password/${resetToken}`;

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  📧 EMAIL STUB — Сброс пароля                        ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║  To:      ${email}`);
  console.log('║  Subject: Azarean — Сброс пароля');
  console.log(`║  Link:    ${resetLink}`);
  console.log('║  Expires: 1 час');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  return { success: true, message: 'Email logged to console (dev mode)' };
};

/**
 * Отправка email для подтверждения адреса
 * @param {string} email - адрес получателя
 * @param {string} verificationToken - токен подтверждения
 */
const sendVerificationEmail = async (email, verificationToken) => {
  const verifyLink = `${config.frontendUrl}/patient-verify-email/${verificationToken}`;

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  📧 EMAIL STUB — Подтверждение email                  ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║  To:      ${email}`);
  console.log('║  Subject: Azarean — Подтвердите email');
  console.log(`║  Link:    ${verifyLink}`);
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  return { success: true, message: 'Email logged to console (dev mode)' };
};

module.exports = { sendPasswordResetEmail, sendVerificationEmail };
