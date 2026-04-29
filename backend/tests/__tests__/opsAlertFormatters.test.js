// =====================================================
// Тесты форматтеров алертов: categorize* + format*Body + describe*
// =====================================================

const {
  describePage,
  describeUA,
  categorizeFrontendError,
  categorizeBackendError,
  formatFrontendAlertBody,
  formatBackendAlertBody,
} = require('../../utils/opsAlert');

describe('describePage', () => {
  test('распознаёт основные роуты пациента', () => {
    expect(describePage('https://my.azarean.ru/patient-dashboard')).toBe('личный кабинет пациента');
    expect(describePage('https://my.azarean.ru/patient-login')).toBe('экран входа пациента');
    expect(describePage('https://my.azarean.ru/patient-register?invite=AB')).toBe('регистрация пациента');
  });

  test('распознаёт инструкторские роуты', () => {
    expect(describePage('https://my.azarean.ru/dashboard')).toBe('кабинет инструктора');
    expect(describePage('https://my.azarean.ru/admin')).toBe('админ-панель');
    expect(describePage('https://my.azarean.ru/exercises/123')).toBe('библиотека упражнений');
  });

  test('возвращает null для незнакомых URL', () => {
    expect(describePage('https://my.azarean.ru/whatever')).toBeNull();
    expect(describePage('')).toBeNull();
    expect(describePage(null)).toBeNull();
  });
});

describe('describeUA', () => {
  test('Chrome на Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36';
    expect(describeUA(ua)).toBe('Chrome 144 / Windows');
  });

  test('Yandex Browser на iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 YaBrowser/26.3.0.0';
    expect(describeUA(ua)).toBe('Yandex Browser 26 / iOS');
  });

  test('Safari на iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(describeUA(ua)).toBe('Safari 17 / iOS');
  });

  test('Firefox на Linux', () => {
    expect(describeUA('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Firefox/120.0')).toBe('Firefox 120 / Linux');
  });

  test('пустой UA → null', () => {
    expect(describeUA('')).toBeNull();
    expect(describeUA(null)).toBeNull();
  });
});

describe('categorizeFrontendError', () => {
  test('smoke-test пометить тэгом ТЕСТ', () => {
    const r = categorizeFrontendError('Manual frontend smoke 12345', { source: 'window.error' });
    expect(r.tag).toBe('ТЕСТ');
    expect(r.advice).toContain('игнор');
  });

  test('filename <anonymous> тоже считается smoke', () => {
    const r = categorizeFrontendError('whatever', { filename: '<anonymous>' });
    expect(r.tag).toBe('ТЕСТ');
  });

  test('ChunkLoadError → СТАРЫЙ БАНДЛ + советует hard-refresh', () => {
    const r = categorizeFrontendError('ChunkLoadError: Loading chunk 42 failed', {});
    expect(r.tag).toBe('СТАРЫЙ БАНДЛ');
    expect(r.advice).toMatch(/refresh|обновлен/i);
  });

  test('Failed to fetch → СВЯЗЬ', () => {
    const r = categorizeFrontendError('TypeError: Failed to fetch', {});
    expect(r.tag).toBe('СВЯЗЬ');
    expect(r.advice).toContain('backend');
  });

  test('Cannot read property → БАГ В UI', () => {
    const r = categorizeFrontendError('TypeError: Cannot read properties of undefined (reading "x")', {});
    expect(r.tag).toBe('БАГ В UI');
    expect(r.advice).toContain('guard');
  });

  test('неизвестная ошибка → ОШИБКА UI', () => {
    const r = categorizeFrontendError('SyntaxError: foo', {});
    expect(r.tag).toBe('ОШИБКА UI');
  });
});

describe('categorizeBackendError', () => {
  test('PG 22003 (out of range) → БД с упоминанием схемы', () => {
    const r = categorizeBackendError({ code: '22003', message: 'value out of range for bigint' });
    expect(r.tag).toBe('БД');
    expect(r.advice).toContain('схеме');
  });

  test('PG 23505 (unique violation) → БД constraint', () => {
    const r = categorizeBackendError({ code: '23505' });
    expect(r.tag).toBe('БД');
    expect(r.advice).toMatch(/constraint|UNIQUE/);
  });

  test('ECONNREFUSED → СЕРВИС НЕДОСТУПЕН', () => {
    const r = categorizeBackendError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' });
    expect(r.tag).toBe('СЕРВИС НЕДОСТУПЕН');
  });

  test('ETIMEDOUT → ТАЙМАУТ', () => {
    const r = categorizeBackendError({ code: 'ETIMEDOUT' });
    expect(r.tag).toBe('ТАЙМАУТ');
  });

  test('JWT в сообщении → AUTH', () => {
    const r = categorizeBackendError({ message: 'invalid JWT signature' });
    expect(r.tag).toBe('AUTH');
  });

  test('неизвестная ошибка → ОШИБКА БЭКЕНДА', () => {
    const r = categorizeBackendError({ message: 'something weird' });
    expect(r.tag).toBe('ОШИБКА БЭКЕНДА');
  });
});

describe('formatFrontendAlertBody', () => {
  test('собирает читаемый body для типичной ошибки UI', () => {
    const body = formatFrontendAlertBody({
      message: 'TypeError: Cannot read properties of undefined (reading "phase")',
      stack: 'at HomeScreen (/app.js:42:15)\nat PatientDashboard (/dash.js:78:5)',
      url: 'https://my.azarean.ru/patient-dashboard',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/144.0.0.0',
      context: { source: 'ErrorBoundary' },
    });

    expect(body).toContain('Тип: Frontend · БАГ В UI');
    expect(body).toContain('Где: личный кабинет пациента');
    expect(body).toContain('Что:');
    expect(body).toContain('Браузер: Chrome 144 / Windows');
    expect(body).toContain('Что делать:');
    expect(body).toContain('Источник: ErrorBoundary');
    expect(body).toContain('HomeScreen');
  });

  test('обрезает stack до первых 6 строк', () => {
    const longStack = Array.from({ length: 20 }, (_, i) => `at frame${i} (/app.js:${i})`).join('\n');
    const body = formatFrontendAlertBody({
      message: 'oops',
      stack: longStack,
      url: 'https://my.azarean.ru/whatever',
    });
    expect(body).toContain('frame0');
    expect(body).toContain('frame5');
    expect(body).not.toContain('frame10');
  });
});

describe('formatBackendAlertBody', () => {
  test('собирает body для PG-ошибки', () => {
    const err = new Error('value "10399974012659476296" is out of range for type bigint');
    err.code = '22003';
    err.stack = `Error: value "..." is out of range\n    at /opt/azarean-rehab/backend/database/db.js:22\n    at routes/patientAuth.js:1313`;

    const req = { method: 'GET', path: '/api/patient-auth/oauth/telegram/callback' };
    const body = formatBackendAlertBody(err, req);

    expect(body).toContain('Тип: Backend · БД');
    expect(body).toContain('Где: GET /api/patient-auth/oauth/telegram/callback');
    expect(body).toContain('out of range');
    expect(body).toContain('Код: 22003');
    expect(body).toContain('Что делать');
    expect(body).toContain('database/db.js');
  });

  test('работает без req (uncaughtException flow)', () => {
    const err = new Error('cannot connect to redis');
    err.code = 'ECONNREFUSED';
    const body = formatBackendAlertBody(err, null);

    expect(body).toContain('СЕРВИС НЕДОСТУПЕН');
    expect(body).not.toContain('Где:'); // нет req — секция skipped
  });
});
