// =====================================================
// Invite-code helper — генерация и нормализация
// =====================================================
//
// Алфавит без визуально неоднозначных символов: 0/O, 1/I/l исключены.
// Длина 8 → ~6.6×10^11 комбинаций. Used-once + 24h TTL + brute-force
// защита через rate-limiter на /api/patient-auth/register делает
// угадывание невозможным.
// =====================================================

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

const generateInviteCode = () => {
  let code = '';
  // crypto.randomInt равномерное распределение, без bias модуло
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
};

// Юзер может ввести код в любом регистре, с пробелами / дефисами.
// Сохраняем в БД хэш от нормализованного — UPPERCASE без разделителей.
const normalizeInviteCode = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, '');
};

const isValidCodeFormat = (normalized) => {
  if (normalized.length !== CODE_LENGTH) return false;
  for (let i = 0; i < normalized.length; i++) {
    if (!ALPHABET.includes(normalized[i])) return false;
  }
  return true;
};

module.exports = {
  generateInviteCode,
  normalizeInviteCode,
  isValidCodeFormat,
  CODE_LENGTH,
};
