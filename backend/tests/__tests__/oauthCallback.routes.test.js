// =====================================================
// Boundary-тесты OAuth match-flow (Telegram OIDC + Yandex OAuth 2.0)
//
// Покрывают ветки match-flow в [routes/patientAuth.js]:
//   1) Returning login (provider_id уже привязан)
//   2) Phone-autolink — single match → autolink
//      (Wave 1 hot-fix #5: фильтр `password_hash IS NULL` убран, добавлен `is_active = true`)
//   3) Phone-autolink — нет совпадений → редирект на /patient-register
//   4) Phone-autolink — multi-match → НЕ автолинкует (anti-misroute через rows.length === 1)
//   5) Phone-match с password-protected account → autolink (Wave 1 hot-fix #5
//      инвертировал семантику: invite-flow допускает multi-auth, password_hash не затирается)
//   6) State expired → fail с redirect на /patient-login
//   7) Deactivated patient (is_active=false) → отсёкся на SQL-уровне (Wave 1 hot-fix #5)
//   8) Phone format normalization (legacy 8... → +7...)
//   9) Email-autolink fallback (Yandex only — Telegram OIDC не возвращает email)
//  10) Email-match multi → anti-misroute
//  11) Anti-regression: SQL НЕ содержит password_hash IS NULL
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

  test('2) Phone-autolink: single match → autolink + audit OAUTH_AUTOLINK + НЕТ password_hash в SQL', async () => {
    // Wave 1 hot-fix #5 (2026-05-15): фильтр `password_hash IS NULL` убран.
    // Phone-match теперь срабатывает для local-registered пациентов тоже.
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    let updateCalled = false;
    let auditAction = null;
    let auditDetails = null;
    let updatePasswordHashCalled = false;
    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1[\s\S]*AND is_active = true/i, {
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
      [/UPDATE patients\s+SET[\s\S]*password_hash/i, () => { updatePasswordHashCalled = true; return { rowCount: 1 }; }],
      [/UPDATE patients\s+SET auth_provider = 'telegram'/i, () => { updateCalled = true; return { rowCount: 1 }; }],
      [/INSERT INTO audit_logs/i, (sql, params) => {
        auditAction = params[0];
        auditDetails = JSON.parse(params[5]);
        return { rowCount: 1 };
      }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(updateCalled).toBe(true);
    expect(auditAction).toBe('OAUTH_AUTOLINK');
    expect(auditDetails.link_type).toBe('phone_autolink');
    // Anti-regression: password_hash НЕ обновляется в OAuth flow
    expect(updatePasswordHashCalled).toBe(false);
    // Anti-regression: SQL не содержит литерала password_hash IS NULL
    const phoneSelectCall = query.mock.calls.find(([sql]) =>
      /phone = \$1[\s\S]*AND is_active = true/i.test(sql)
    );
    expect(phoneSelectCall).toBeDefined();
    expect(phoneSelectCall[0]).not.toMatch(/password_hash IS NULL/i);
  });

  test('3) Phone-autolink: нет совпадений → 302 на /patient-register с pre-fill', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims({ phone_number: '+79007777777', name: 'Новый Пациент' });

    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1[\s\S]*AND is_active = true/i, { rows: [] }],
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
      [/phone = \$1[\s\S]*AND is_active = true/i, {
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

  test('5) Phone-match с password-protected account → autolink (Wave 1 invite-flow allows multi-auth, hot-fix #5)', async () => {
    // Wave 1 hot-fix #5 инвертировал семантику этого кейса. До:
    //   `password_hash IS NOT NULL` отсекался SQL-фильтром → redirect register.
    // После:
    //   Pаспределение auth methods — пациент может иметь и password (через
    //   invite-flow registration), и OAuth — оба легитимны. password_hash
    //   при OAuth-логине НЕ затирается → classical login остаётся работающим.
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    let auditAction = null;
    let updatePasswordHashCalled = false;
    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1[\s\S]*AND is_active = true/i, {
        rows: [{
          id: 14,
          email: 'patient@example.com',
          full_name: 'Вадим (password-protected)',
          phone: '+79001234567',
          is_active: true,
          // password_hash есть, но SELECT его не возвращает — нормально
        }],
      }],
      [/UPDATE patients\s+SET[\s\S]*password_hash/i, () => { updatePasswordHashCalled = true; return { rowCount: 1 }; }],
      [/UPDATE patients/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, (sql, params) => { auditAction = params[0]; return { rowCount: 1 }; }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(auditAction).toBe('OAUTH_AUTOLINK');
    // КРИТИЧНО: password_hash НЕ должен быть затронут OAuth-флоу
    expect(updatePasswordHashCalled).toBe(false);
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
      [/phone = \$1[\s\S]*AND is_active = true/i, (sql, params) => {
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

  test('NEW: Post-invite-flow Telegram phone-autolink (Wave 1 invite-code пациент)', async () => {
    // Сценарий из реального flow: инструктор создал пациента → пациент
    // зарегистрировался по invite-code (получил password_hash) → через
    // неделю кликает «Войти через Telegram». До hot-fix #5 — тупик.
    // После — autolink с сохранением password_hash.
    const client = makeMockClient();
    wireStateClient(client, validStateRow());
    getClient.mockResolvedValue(client);
    setTelegramClaims();

    let auditAction = null;
    let auditDetails = null;
    routeQueries([
      [/auth_provider = 'telegram' AND provider_id/i, { rows: [] }],
      [/phone = \$1[\s\S]*AND is_active = true/i, {
        rows: [{
          id: 42,
          email: 'invited@example.com',
          full_name: 'Иван (через invite-code)',
          phone: '+79001234567',
          is_active: true,
        }],
      }],
      [/UPDATE patients/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, (sql, params) => {
        auditAction = params[0];
        auditDetails = JSON.parse(params[5]);
        return { rowCount: 1 };
      }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/telegram/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(auditAction).toBe('OAUTH_AUTOLINK');
    expect(auditDetails.link_type).toBe('phone_autolink');
    expect(auditDetails.has_phone).toBe(true);
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

  test('2) Yandex phone-autolink: silent linking single match + НЕТ password_hash UPDATE', async () => {
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo();

    let auditAction = null;
    let auditDetails = null;
    let updatePasswordHashCalled = false;
    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
      [/phone = \$1[\s\S]*AND is_active = true/i, {
        rows: [{
          id: 14, email: null, full_name: 'Вадим',
          phone: '+79001234567', is_active: true,
        }],
      }],
      [/UPDATE patients\s+SET[\s\S]*password_hash/i, () => { updatePasswordHashCalled = true; return { rowCount: 1 }; }],
      [/UPDATE patients\s+SET auth_provider = 'yandex'/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, (sql, params) => {
        auditAction = params[0];
        auditDetails = JSON.parse(params[5]);
        return { rowCount: 1 };
      }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(auditAction).toBe('OAUTH_AUTOLINK');
    expect(auditDetails.link_type).toBe('phone_autolink');
    expect(updatePasswordHashCalled).toBe(false);
    // Anti-regression: SQL не содержит литерала password_hash IS NULL (Wave 1 hot-fix #5)
    const phoneSelectCall = query.mock.calls.find(([sql]) =>
      /phone = \$1[\s\S]*AND is_active = true/i.test(sql)
    );
    expect(phoneSelectCall[0]).not.toMatch(/password_hash IS NULL/i);
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
      [/phone = \$1[\s\S]*AND is_active = true/i, { rows: [] }],
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

  test('6) Yandex без default_phone → email-fallback автолинк (если email совпал)', async () => {
    // Wave 1 hot-fix #5: Yandex всегда возвращает email (scope login:email).
    // Если phone не пришёл / не совпал — пробуем email-match как fallback.
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo({
      id: '999',
      default_phone: undefined, // юзер не дал phone scope
      default_email: 'matched@example.com',
    });

    let auditAction = null;
    let auditDetails = null;
    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
      [/LOWER\(email\) = \$1[\s\S]*AND is_active = true/i, {
        rows: [{
          id: 20, email: 'matched@example.com', full_name: 'Иван',
          phone: null, is_active: true,
        }],
      }],
      [/UPDATE patients/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, (sql, params) => {
        auditAction = params[0];
        auditDetails = JSON.parse(params[5]);
        return { rowCount: 1 };
      }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(auditAction).toBe('OAUTH_AUTOLINK');
    expect(auditDetails.link_type).toBe('email_autolink');
    // Phone-match не вызывался — phone отсутствовал
    const phoneQueryCalls = query.mock.calls.filter(([sql]) =>
      /phone = \$1[\s\S]*AND is_active = true/i.test(sql)
    );
    expect(phoneQueryCalls).toHaveLength(0);
  });

  test('NEW 7) Yandex email-match multi (2 пациента с одним email) → НЕ autolink (anti-misroute)', async () => {
    // Email coincidence — два разных пациента с одинаковым email (legacy data,
    // family share, ошибочно введённый email). Single-match check блокирует.
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo({
      id: '888',
      default_phone: undefined, // нет phone → попадём в email-fallback
      default_email: 'shared@example.com',
    });

    let updateAuthProviderCalled = false;
    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
      [/LOWER\(email\) = \$1[\s\S]*AND is_active = true/i, {
        rows: [
          { id: 50, email: 'shared@example.com', full_name: 'Папа', phone: '+71111111111', is_active: true },
          { id: 51, email: 'shared@example.com', full_name: 'Сын', phone: '+72222222222', is_active: true },
        ],
      }],
      [/UPDATE patients\s+SET auth_provider = 'yandex'/i, () => { updateAuthProviderCalled = true; return { rowCount: 1 }; }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/patient-register');
    expect(updateAuthProviderCalled).toBe(false); // anti-misroute сработал
  });

  test('NEW 8) Yandex email-match для password-protected пациента → autolink + password_hash сохранён', async () => {
    // Аналог Telegram test 5: пациент с password (через invite-flow) логинится
    // через Yandex first time. phone в Yandex не совпал — email-fallback срабатывает.
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo({
      id: '777',
      default_phone: { id: 1, number: '+79007777777' }, // НЕ совпадает с пациентом
      default_email: 'invited@example.com',
    });

    let auditAction = null;
    let updatePasswordHashCalled = false;
    routeQueries([
      [/auth_provider = 'yandex' AND provider_id/i, { rows: [] }],
      // Phone match — 0 rows (phone в Yandex не совпадает)
      [/phone = \$1[\s\S]*AND is_active = true/i, { rows: [] }],
      // Email match — single result (password-protected пациент)
      [/LOWER\(email\) = \$1[\s\S]*AND is_active = true/i, {
        rows: [{
          id: 60,
          email: 'invited@example.com',
          full_name: 'Иван (invite-flow + password)',
          phone: '+71234567890',
          is_active: true,
        }],
      }],
      [/UPDATE patients\s+SET[\s\S]*password_hash/i, () => { updatePasswordHashCalled = true; return { rowCount: 1 }; }],
      [/UPDATE patients/i, { rowCount: 1 }],
      [/INSERT INTO audit_logs/i, (sql, params) => { auditAction = params[0]; return { rowCount: 1 }; }],
    ]);

    const res = await request(app)
      .get('/api/patient-auth/oauth/yandex/callback')
      .query({ state: 'fake-state', code: 'fake-code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/patient-dashboard');
    expect(auditAction).toBe('OAUTH_AUTOLINK');
    expect(updatePasswordHashCalled).toBe(false);
  });

  test('NEW 9) Yandex без phone И без email → redirect на /patient-register (нет fallback)', async () => {
    // Edge case: scope login:email не gave (юзер отказал в email) и phone тоже нет.
    // Не должно зацикливаться или 5xx — просто redirect.
    const client = makeMockClient();
    wireStateClient(client, validStateRow({ nonce: null }));
    getClient.mockResolvedValue(client);
    setYandexUserInfo({
      id: '666',
      default_phone: undefined,
      default_email: null,
      emails: [], // ни email
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
    expect(url.searchParams.has('email')).toBe(false);
    // Ни phone-query, ни email-query не должны выполняться
    const phoneCalls = query.mock.calls.filter(([sql]) =>
      /phone = \$1[\s\S]*AND is_active = true/i.test(sql)
    );
    const emailCalls = query.mock.calls.filter(([sql]) =>
      /LOWER\(email\) = \$1[\s\S]*AND is_active = true/i.test(sql)
    );
    expect(phoneCalls).toHaveLength(0);
    expect(emailCalls).toHaveLength(0);
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
