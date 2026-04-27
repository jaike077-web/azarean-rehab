// =====================================================
// Тесты на utils/phone.js — нормализация телефонов
// =====================================================

const { normalizePhone, phonesEqual } = require('../../utils/phone');

describe('normalizePhone', () => {
  describe('Russian numbers', () => {
    it('handles +7 with parens and dashes', () => {
      expect(normalizePhone('+7 (900) 123-45-67')).toBe('+79001234567');
    });

    it('handles 8 prefix (РФ local) → +7', () => {
      expect(normalizePhone('8 900 123 45 67')).toBe('+79001234567');
      expect(normalizePhone('89001234567')).toBe('+79001234567');
      expect(normalizePhone('8(900)123-45-67')).toBe('+79001234567');
    });

    it('handles 7 prefix without + → +7', () => {
      expect(normalizePhone('79001234567')).toBe('+79001234567');
    });

    it('handles 10 digits without prefix → assume РФ', () => {
      expect(normalizePhone('9001234567')).toBe('+79001234567');
    });

    it('handles already-normalized E.164', () => {
      expect(normalizePhone('+79001234567')).toBe('+79001234567');
    });

    it('strips spaces and dots', () => {
      expect(normalizePhone(' +7.900.123.45.67 ')).toBe('+79001234567');
    });
  });

  describe('Foreign numbers', () => {
    it('keeps US E.164', () => {
      expect(normalizePhone('+12025551234')).toBe('+12025551234');
    });

    it('keeps UK E.164', () => {
      expect(normalizePhone('+442012345678')).toBe('+442012345678');
    });

    it('treats 11-15 digits without + as E.164', () => {
      expect(normalizePhone('12025551234')).toBe('+12025551234');
    });
  });

  describe('Invalid inputs', () => {
    it('returns null for empty/null/undefined', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
    });

    it('returns null for too short', () => {
      expect(normalizePhone('123')).toBeNull();
      expect(normalizePhone('123456789')).toBeNull();
    });

    it('returns null for too long', () => {
      expect(normalizePhone('+1234567890123456')).toBeNull();
    });

    it('returns null for non-digit garbage', () => {
      expect(normalizePhone('abc')).toBeNull();
      expect(normalizePhone('---')).toBeNull();
    });

    it('coerces non-string input then normalizes', () => {
      // На случай если из БД pg вернёт number
      expect(normalizePhone(79001234567)).toBe('+79001234567');
    });
  });
});

describe('phonesEqual', () => {
  it('matches Russian variants', () => {
    expect(phonesEqual('+7 (900) 123-45-67', '89001234567')).toBe(true);
    expect(phonesEqual('+79001234567', '+7 900 123 45 67')).toBe(true);
    expect(phonesEqual('9001234567', '+79001234567')).toBe(true);
  });

  it('rejects different numbers', () => {
    expect(phonesEqual('+79001234567', '+79001234568')).toBe(false);
  });

  it('rejects when either side is invalid', () => {
    expect(phonesEqual(null, '+79001234567')).toBe(false);
    expect(phonesEqual('+79001234567', '')).toBe(false);
    expect(phonesEqual('garbage', '+79001234567')).toBe(false);
  });
});
