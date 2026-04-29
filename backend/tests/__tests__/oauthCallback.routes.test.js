// =====================================================
// Boundary-тесты OAuth match-flow (Telegram OIDC + Yandex OAuth 2.0)
//
// Покрывают 8 веток match-flow в [routes/patientAuth.js]:
//   1) Returning login (provider_id уже привязан)
//   2) Phone-autolink — single match, password_hash IS NULL
//   3) Phone-autolink — нет совпадений → редирект на /patient-register
//   4) Phone-autolink — multi-match → НЕ автолинкует
//   5) Phone-match с claimed account (password_hash IS NOT NULL) → не сматчит
//   6) State expired → fail с redirect на /patient-login
//   7) Deactivated patient (provider match + is_active=false) → fail
//   8) Phone format normalization (legacy 8... → +7...)
// =====================================================

// === ENV для isTelegramLoginConfigured / isYandexLoginConfigured ДО require ===
process.env.TELEGRAM_OIDC_CLIENT_ID = 'fake-tg-client';
process.env.TELEGRAM_OIDC_CLIENT_SECRET = 'fake-tg-secret';
process.env.TELEGRAM_OIDC_REDIRECT_URI = 'https://example.com/api/patient-auth/oauth/telegram/callback';
process.env.TG_PROXY_URL = 'https://tg-proxy.example.com';
process.env.TG_PROXY_SECRET = 'fake-proxy-secret';
process.env.TELEGRAM_LOGIN_ENABLED = 'true';
process.env.YANDEX_OAUTH_CLIENT_ID = 'fake-yx-client';
process.env.YANDEX_OAUTH_CLIENT_SECRET = 'fake-yx-secret';
process.env.YANDEX_OAUTH_REDIRECT_URI = 'https://example.com/api/patient-auth/oauth/yandex/callback';
process.env.YANDEX_OAUTH_SCOPES = 'login:info login:default_phone';
process.env.YANDEX_LOGIN_ENABLED = 'true';
process.env.FRONTEND_URL = 'https://example.com';

// =====================================================
// MOCKS — DB + OAuth services
// =====================================================
jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

jest.mock('../../services/telegramOidc', () => ({
  buildAuthorizeUrl: jest.fn(),
  handleCallback: jest.fn(),
  isConfigured: jest.fn(() => true),
  TELEGRAM_ISSUER: 'https://oauth.telegram.org',
}));

jest.mock('../../services/yandexOauth', () => {
  const actual = jest.requireActual('../../services/yandexOauth');
  return {
    ...actual,
    buildAuthorizeUrl: jest.fn(),
    handleCallback: jest.fn(),
  };
});

const request = require('supertest');
const app = require('../../server');
const { query, getClient } = require('../../database/db');
const telegramOidc = require('../../services/telegramOidc');
const yandexOauth = require('../../services/yandexOauth');

// =====================================================
// HELPERS
// =====================================================
function makeMockClient() {
  return {
    query: jest.fn(),
    release: jest.fn(),
  };
}

/**
 * Настраивает client.query на типовое поведение state-flow:
 * - BEGIN / COMMIT / ROLLBACK / DELETE → пустой ответ
 * - SELECT FROM patient_oauth_states → возвращает stateRow (или [])
 */
function wireStateClient(client, stateRow) {
  client.query.mockImplementation((sql) => {
    if (typeof sql !== 'string') return Promise.resolve({ rows: [] });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return Promise.resolve();
    }
    if (/FROM\s+patient_oauth_states/i.test(sql)) {
      return Promise.resolve({ rows: stateRow ? [stateRow] : [] });
    }
    if (/DELETE\s+FROM\s+patient_oauth_states/i.test(sql)) {
      return Promise.resolve({ rowCount: 1 });
    }
    return Promise.resolve({ rows: [] });
  });
}

/**
 * Маршрутизация SQL-запросов на топ-level query. Каждое правило: regex → result.
 * Порядок важен — берётся первое совпадение.
 */
function routeQueries(rules) {
  query.mockImplementation((sql, params) => {
    for (const [re, handler] of rules) {
      if (re.test(sql)) {
        return Promise.resolve(typeof handler === 'function' ? handler(sql, params) : handler);
      }
    }
    return Promise.resolve({ rows: [] });
  });
}

const validStateRow = (overrides = {}) => ({
  id: 1,
  code_verifier: 'fake-verifier',
  nonce: 'fake-nonce',
  expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  ...overrides,
});

const expiredStateRow = () => validStateRow({
  expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
});

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// TELEGRAM OIDC callback — 8 веток
// =====================================================
describe('GET /api/patient-auth/oauth/telegram/callback', () => {
  function setTelegramClaims(overrides = {}) {
    telegramOidc.handleCallback.mockResolvedValue({
      sub: '7358444850707888434',
      name: 'Вадим Азарян',
      phone_number: '+79001234567',
      picture: 'https://example.com/avatar.jpg',
      ...overrides,
    });
  }

  test('1) Returning login: provider_id уже привязан → 302 на /patient-dashboard', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, {
        rows: [{
          id: 6,
          email: 'vadim@example.com',
          full_name: 'Вадим',
          phone: '+79001234567',
          birth_date: null,
          avatar_url: null,
          is_active: true,
        }],
      }],
      [/UPDATE patients/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, { rowCount: 1 }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    // НЕ должно быть UPDATE auth_provider — это returning, не autolink
    const updateCalls = query.mock.calls.filter(([sql]) =>
      /UPDATE patients/i.test(sql) && /auth_provider = 'telegram'/i.test(sql)
    );
    expect(updateCalls).toHaveLength(0);
    // Должен быть UPDATE last_login_at
    const lastLoginCalls = query.mock.calls.filter(([sql]) =>
      /last_login_at = NOW\(\)/i.test(sql)
    );
    expect(lastLoginCalls.length).toBeGreaterThan(0);
  });

  test('2) Phone-autolink: single match с password_hash IS NULL → autolink + audit OAUTH_AUTOLINK', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    let updateCalled = false;
    let auditAction = null;
    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1 AND password_hash IS NULL/i, {
        rows: [{
          id: 14,
          email: null,
          full_name: 'Вадим',
          phone: '+79001234567',
          birth_date: null,
          avatar_url: null,
          is_active: true,
        }],
      }],
      [/UPDATE patients\s+SET auth_provider = 'telegram'/i, () => { updateCalled = true; return { rowCount: 1 }; }],
      [/INSERT INTO audit_logs/i, (sql, params) => { auditAction = params[0]; return { rowCount: 1 }; }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(updateCalled).toBe(true);
    expect(auditAction).toBe('OAUTH_AUTOLINK');
  });

  test('3) Phone-autolink: нет совпадений → 302 на /patient-register с pre-fill', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims({ phone_number: '+79007777777', name: 'Новый Пациент' });

    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1 AND password_hash IS NULL/i, { rows: [] }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-register');
    expect(url.searchParams.get('oauth_provider')).toBe('telegram');
    expect(url.searchParams.get('oauth_provider_id')).toBe('7358444850707888434');
    expect(url.searchParams.get('phone')).toBe('+79007777777');
    expect(url.searchParams.get('full_name')).toBe('Новый Пациент');
  });

  test('4) Phone-autolink: multi-match → НЕ автолинкует, 302 на /patient-register (anti-misroute)', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    let updateAuthProviderCalled = false;
    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      // 2 пациента с одним телефоном (родитель + ребёнок) — single-match check падает
      [/phone = \$1 AND password_hash IS NULL/i, {
        rows: [
          { id: 10, email: null, full_name: 'Родитель', phone: '+79001234567', is_active: true },
          { id: 11, email: null, full_name: 'Ребёнок', phone: '+79001234567', is_active: true },
        ],
      }],
      [/UPDATE patients\s+SET auth_provider = 'telegram'/i, () => { updateAuthProviderCalled = true; return { rowCount: 1 }; }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/patient-register');
    expect(updateAuthProviderCalled).toBe(false); // НЕ должен autolink'нуть
  });

  test('5) Claimed account: phone есть но password_hash NOT NULL → query вернёт 0 (фильтр), редирект на /patient-register', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    // Этот тест проверяет что фильтр `password_hash IS NULL` в SQL-запросе
    // действительно отсекает claimed-аккаунты. Если бы фильтра не было —
    // мы бы получили rows=[claimed] и сделали бы misroute autolink.
    let phoneQueryParams = null;
    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1 AND password_hash IS NULL/i, (sql, params) => {
        phoneQueryParams = params;
        return { rows: [] }; // claimed account отсёкся фильтром в SQL
      }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/patient-register');
    // SQL в коде должен буквально содержать `password_hash IS NULL` —
    // если кто-то этот фильтр уберёт в рефакторинге, тест падёт.
    const phoneSelectCall = query.mock.calls.find(([sql]) =>
      /phone = \$1 AND password_hash IS NULL/i.test(sql)
    );
    expect(phoneSelectCall).toBeDefined();
    expect(phoneQueryParams[0]).toBe('+79001234567');
  });

  test('6) State expired → 302 на /patient-login с oauth_error', async () => {
    const client = makeMockClient();
    wireStateClient(client, expiredStateRow());
    getClient.mockResolvedValue(client);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-login');
    expect(url.searchParams.get('oauth_error')).toContain('истекла');
    // OIDC validation НЕ должен вызываться — flow прерван до того
    expect(telegramOidc.handleCallback).not.toHaveBeenCalled();
  });

  test('7) Deactivated patient: provider match + is_active=false → fail с oauth_error', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, {
        rows: [{
          id: 6, email: 'vadim@example.com', full_name: 'Вадим',
          phone: '+79001234567', birth_date: null, avatar_url: null,
          is_active: false, // деактивирован
        }],
      }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-login');
    expect(url.searchParams.get('oauth_error')).toContain('деактивирован');
  });

  test('8) Phone normalization: legacy "89001234567" → +7..., автолинк находит patient с E.164 phone', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    // Telegram возвращает phone в legacy-формате (теоретический edge case)
    setTelegramClaims({ phone_number: '89001234567' });

    let phoneQueryParam = null;
    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1 AND password_hash IS NULL/i, (sql, params) => {
        phoneQueryParam = params[0];
        return {
          rows: [{
            id: 14, email: null, full_name: 'Вадим',
            phone: '+79001234567', is_active: true,
          }],
        };
      }],
      [/UPDATE patients/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, { rowCount: 1 }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    // нормализация сработала: SQL получил +79001234567 а не 89001234567
    expect(phoneQueryParam).toBe('+79001234567');
  });

  test('extra: state не найден в БД → fail с oauth_error', async () => {
    const client = makeMockClient();
    wireStateClient(client, null); // SELECT возвращает rows=[]
    getClient.mockResolvedValue(client);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'never-issued', code: 'fake-code' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-login');
    expect(url.searchParams.get('oauth_error')).toContain('State не найден');
  });

  test('extra: OIDC validation throws → fail без раскрытия деталей', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    telegramOidc.handleCallback.mockRejectedValueOnce(new Error('invalid signature'));

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-login');
    expect(url.searchParams.get('oauth_error')).toContain('Не удалось проверить');
    // Внутренний `invalid signature` не попадает в URL — sanitization
    expect(res.headers.location).not.toContain('invalid signature');
  });

  test('extra: provider error (consent denied) → 302 с error message', async () => {
    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', error: 'access_denied', error_description: 'Доступ запрещён' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-login');
    expect(url.searchParams.get('oauth_error')).toBe('Доступ запрещён');
    // Не лезли в БД на провалившемся consent
    expect(getClient).not.toHaveBeenCalled();
  });
});

// =====================================================
// YANDEX OAuth 2.0 callback
// =====================================================
describe('GET /api/patient-auth/oauth/yandex/callback', () => {
  // Yandex отдаёт плоский userinfo, не OIDC claims
  function setYandexUserInfo(overrides = {}) {
    yandexOauth.handleCallback.mockResolvedValue({
      id: '987654321',
      login: 'vadim',
      real_name: 'Вадим Азарян',
      first_name: 'Вадим',
      last_name: 'Азарян',
      default_email: 'vadim@yandex.ru',
      default_phone: { id: 1, number: '+79001234567' },
      default_avatar_id: 'abc',
      is_avatar_empty: false,
      ...overrides,
    });
  }

  test('1) Returning Yandex login → 302 на /patient-dashboard', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo();

    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, {
        rows: [{
          id: 7, email: 'vadim@yandex.ru', full_name: 'Вадим',
          phone: '+79001234567', is_active: true,
        }],
      }],
      [/UPDATE patients/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, { rowCount: 1 }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
  });

  test('2) Yandex phone-autolink: silent linking single match', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo();

    let auditAction = null;
    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
      [/phone = \$1 AND password_hash IS NULL/i, {
        rows: [{
          id: 14, email: null, full_name: 'Вадим',
          phone: '+79001234567', is_active: true,
        }],
      }],
      [/UPDATE patients\s+SET auth_provider = 'yandex'/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, (sql, params) => { auditAction = params[0]; return { rowCount: 1 }; }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(auditAction).toBe('OAUTH_AUTOLINK');
  });

  test('3) Yandex no-match: redirect на /patient-register с pre-fill (включая email — Yandex specific)', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo({
      id: '999',
      real_name: 'Аноним',
      default_email: 'anon@yandex.ru',
      default_phone: { id: 1, number: '+79008888888' },
    });

    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
      [/phone = \$1 AND password_hash IS NULL/i, { rows: [] }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-register');
    expect(url.searchParams.get('oauth_provider')).toBe('yandex');
    expect(url.searchParams.get('oauth_provider_id')).toBe('999');
    expect(url.searchParams.get('phone')).toBe('+79008888888');
    expect(url.searchParams.get('full_name')).toBe('Аноним');
    // Yandex отдаёт email — он тоже идёт в pre-fill (Telegram не отдаёт)
    expect(url.searchParams.get('email')).toBe('anon@yandex.ru');
  });

  test('4) Yandex без code в query → fail (не пытается обмениваться)', async () => {
    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-login');
    expect(url.searchParams.get('oauth_error')).toContain('code');
    expect(yandexOauth.handleCallback).not.toHaveBeenCalled();
  });

  test('5) Yandex extractClaims корректно парсит default_phone объект', async () => {
    // Этот тест проверяет что extractClaims из реального yandexOauth.js
    // правильно достаёт phone из nested-объекта default_phone: { id, number }
    const { extractClaims } = jest.requireActual('../../services/yandexOauth');

    const claims = extractClaims({
      id: 12345,
      login: 'foo',
      real_name: 'Foo Bar',
      default_email: 'foo@yandex.ru',
      default_phone: { id: 1, number: '+79001234567' },
      default_avatar_id: 'avatar123',
      is_avatar_empty: false,
    });

    expect(claims.providerId).toBe('12345');
    expect(claims.phone).toBe('+79001234567');
    expect(claims.fullName).toBe('Foo Bar');
    expect(claims.email).toBe('foo@yandex.ru');
    expect(claims.avatarUrl).toContain('avatar123');
  });

  test('6) Yandex без default_phone → no phone-autolink, redirect без phone в URL', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo({
      id: '999',
      default_phone: undefined, // юзер не дал phone scope
    });

    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.pathname).toBe('/patient-register');
    expect(url.searchParams.has('phone')).toBe(false);
    // Phone-match запрос не должен был вызываться (phoneNormalized=null)
    const phoneQueryCalls = query.mock.calls.filter(([sql]) =>
      /phone = \$1 AND password_hash IS NULL/i.test(sql)
    );
    expect(phoneQueryCalls).toHaveLength(0);
  });
});

// =====================================================
// /oauth/providers — meta-endpoint
// =====================================================
describe('GET /api/patient-auth/oauth/providers', () => {
  test('возвращает enabled=true для настроенных провайдеров', async () => {
    const res = await request(app).get('/api/patient-auth/oauth/providers');
    expect(res.status).toBe(200);
    expect(res.body.data.telegram.enabled).toBe(true);
    expect(res.body.data.yandex.enabled).toBe(true);
    expect(res.body.data.google.enabled).toBe(false);
    expect(res.body.data.vk.enabled).toBe(false);
  });
});
