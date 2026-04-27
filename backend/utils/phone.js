// =====================================================
// Phone normalizer — приводим номер к E.164 (+CCXXXXXXXXX)
//
// Зачем: Telegram OIDC отдаёт verified-телефон в строгом E.164
// (+79001234567). Инструктор в UI вбивает как угодно: "+7 (900)
// 123-45-67", "8 900 123-45-67", "79001234567". Без нормализации
// сравнить нельзя → silent autolink по phone-match не работает.
//
// Применяется на INSERT/UPDATE patient (instructor + patient self-update)
// и при OAuth-callback'е сравнении с patient.phone.
// =====================================================

// Возвращает нормализованный номер в формате E.164 или null если не валиден.
// Поведение:
//  - strip всё кроме цифр и ведущего +
//  - leading "8" + 10 цифр (РФ-формат) → "+7XXXXXXXXXX"
//  - leading "7" + 10 цифр без + → "+7XXXXXXXXXX"
//  - 10 цифр без префикса → assume РФ, prepend "+7"
//  - "+CCXXXX..." с 11-15 итоговыми цифрами → как есть
//  - всё остальное → null
const normalizePhone = (raw) => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') raw = String(raw);

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return null;

  let result;

  if (hasPlus) {
    // Уже в международном формате — оставляем как есть, проверяем длину
    result = '+' + digitsOnly;
  } else if (digitsOnly.length === 11 && digitsOnly[0] === '8') {
    // Russian local format "8 900 ..." → "+7 900 ..."
    result = '+7' + digitsOnly.slice(1);
  } else if (digitsOnly.length === 11 && digitsOnly[0] === '7') {
    // "79001234567" без плюса → "+79001234567"
    result = '+' + digitsOnly;
  } else if (digitsOnly.length === 10) {
    // "9001234567" → assume РФ
    result = '+7' + digitsOnly;
  } else {
    // 11-15 цифр без + и не РФ-паттерн → принимаем как E.164 другой страны
    if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
      result = '+' + digitsOnly;
    } else {
      return null;
    }
  }

  // Финальная валидация E.164: + и 10-15 цифр
  if (!/^\+\d{10,15}$/.test(result)) return null;

  return result;
};

// Сравнение двух номеров. Возвращает true если оба нормализуются в одинаковую
// E.164-строку. Удобно для phone-match при OAuth-callback'е.
const phonesEqual = (a, b) => {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb;
};

module.exports = { normalizePhone, phonesEqual };
