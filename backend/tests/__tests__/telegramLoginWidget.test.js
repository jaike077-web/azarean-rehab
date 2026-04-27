// =====================================================
// Тесты на services/telegramLoginWidget.js
// =====================================================

const crypto = require('crypto');

// Фиксируем bot_token до загрузки config
process.env.TELEGRAM_BOT_TOKEN = '12345:TEST_BOT_TOKEN_FOR_TESTS_ONLY';

const { buildAuthUrl, verifyAuthData } = require('../../services/telegramLoginWidget');

// Хелпер: построить валидный набор query-параметров (с правильным HMAC).
// Поля со значением '' трактуются как «не отправлено Telegram'ом» — не
// включаем их ни в data_check_string, ни в результат (но возвращаем в overrides
// для явных тестов на пустые значения).
const makeValidPayload = (overrides = {}) => {
  const merged = {
    id: '123456789',
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    photo_url: 'https://t.me/i/userpic/abc.jpg',
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  };
  // Только непустые поля идут в подпись (как делает Telegram)
  const signed = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== '' && v !== undefined && v !== null) signed[k] = v;
  }
  const dataCheckString = Object.keys(signed).sort().map((k) => `${k}=${signed[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return { ...signed, hash };
};

describe('buildAuthUrl', () => {
  it('возвращает oauth.telegram.org URL c bot_id из bot_token', () => {
    const url = buildAuthUrl('https://my.azarean.ru/api/cb', 'https://my.azarean.ru');
    expect(url).toMatch(/^https:\/\/oauth\.telegram\.org\/auth\?/);
    expect(url).toContain('bot_id=12345');
    expect(url).toContain('origin=https%3A%2F%2Fmy.azarean.ru');
    expect(url).toContain('return_to=https%3A%2F%2Fmy.azarean.ru%2Fapi%2Fcb');
    expect(url).toContain('request_access=write');
  });
});

describe('verifyAuthData', () => {
  describe('Valid signatures', () => {
    it('пропускает корректную подпись с минимальным набором полей', () => {
      const payload = makeValidPayload({ last_name: '', username: '', photo_url: '' });
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(true);
      expect(result.data.id).toBe('123456789');
    });

    it('пропускает полный набор полей и возвращает их в data', () => {
      const payload = makeValidPayload();
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({
        id: '123456789',
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        photo_url: 'https://t.me/i/userpic/abc.jpg',
        auth_date: payload.auth_date,
      });
    });

    it('игнорирует посторонние поля в query (анти-инъекция)', () => {
      const payload = makeValidPayload();
      payload.evil = 'injection-attempt';
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(true);
      expect(result.data.evil).toBeUndefined();
    });
  });

  describe('Invalid signatures', () => {
    it('режект если hash не совпадает', () => {
      const payload = makeValidPayload();
      payload.hash = 'a'.repeat(64);
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/подпись/i);
    });

    it('режект если поле подменено после генерации hash', () => {
      const payload = makeValidPayload();
      payload.id = '999';
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(false);
    });

    it('режект если hash отсутствует', () => {
      const payload = makeValidPayload();
      delete payload.hash;
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/hash/i);
    });

    it('режект если id отсутствует', () => {
      const payload = makeValidPayload();
      delete payload.id;
      // Пере-подписать без id
      const dataCheckString = Object.keys(payload).filter((k) => k !== 'hash').sort()
        .map((k) => `${k}=${payload[k]}`).join('\n');
      const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest();
      payload.hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/id|auth_date/i);
    });

    it('режект если auth_date старше 24 часов', () => {
      const payload = makeValidPayload({
        auth_date: String(Math.floor(Date.now() / 1000) - 25 * 60 * 60),
      });
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/срок|истёк/i);
    });

    it('режект если auth_date в будущем (сильно)', () => {
      const payload = makeValidPayload({
        auth_date: String(Math.floor(Date.now() / 1000) + 60 * 60),
      });
      const result = verifyAuthData(payload);
      expect(result.valid).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('режект если query пустой', () => {
      expect(verifyAuthData({}).valid).toBe(false);
      expect(verifyAuthData(null).valid).toBe(false);
      expect(verifyAuthData(undefined).valid).toBe(false);
    });
  });
});
