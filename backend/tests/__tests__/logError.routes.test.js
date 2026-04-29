// =====================================================
// Тесты на POST /api/log-error
// =====================================================

const request = require('supertest');
const express = require('express');

// Мокаем sendOpsAlert чтобы не лезть в реальный Telegram API,
// но formatFrontendAlertBody оставляем реальным (через requireActual)
jest.mock('../../utils/opsAlert', () => {
  const actual = jest.requireActual('../../utils/opsAlert');
  return {
    ...actual,
    sendOpsAlert: jest.fn(async () => {}),
  };
});

const { sendOpsAlert } = require('../../utils/opsAlert');
const logErrorRouter = require('../../routes/log-error');

describe('POST /api/log-error', () => {
  let app;

  beforeEach(() => {
    sendOpsAlert.mockClear();
    app = express();
    app.use(express.json());
    app.use('/api/log-error', logErrorRouter);
  });

  it('returns 204 на валидный payload + body содержит ключевые поля', async () => {
    const res = await request(app)
      .post('/api/log-error')
      .send({
        message: 'TypeError: Cannot read property X of undefined',
        stack: 'at Foo.bar (/app.js:10:5)\n  at Baz.qux (/main.js:20:3)',
        url: 'http://localhost:3000/patient-dashboard',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/144.0.0.0',
        context: { source: 'ErrorBoundary' },
      });
    expect(res.status).toBe(204);
    expect(sendOpsAlert).toHaveBeenCalledTimes(1);
    const [title, body] = sendOpsAlert.mock.calls[0];
    // Title теперь короткий — сообщение для дедупа
    expect(title).toBe('TypeError: Cannot read property X of undefined');
    // Body — структурированный текст
    expect(body).toContain('Тип: Frontend');
    expect(body).toContain('БАГ В UI'); // категоризация по «Cannot read prop»
    expect(body).toContain('Где: личный кабинет пациента'); // page mapping
    expect(body).toContain('Браузер: Chrome 144 / Windows');
    expect(body).toContain('Что делать');
    expect(body).toContain('Источник: ErrorBoundary');
    expect(body).toContain('at Foo.bar');
  });

  it('обрезает слишком длинные поля', async () => {
    const longMsg = 'X'.repeat(2000);
    const longStack = 'Y'.repeat(5000);

    await request(app)
      .post('/api/log-error')
      .send({ message: longMsg, stack: longStack, url: 'http://x', userAgent: 'ua' });

    expect(sendOpsAlert).toHaveBeenCalled();
    const [title, body] = sendOpsAlert.mock.calls[0];
    // Title — clipped до 500
    expect(title.length).toBeLessThanOrEqual(500);
    // Body suite — общая длина под лимитом Telegram (~4096)
    expect(body.length).toBeLessThan(4000);
  });

  it('не падает при пустом body', async () => {
    const res = await request(app).post('/api/log-error').send({});
    expect(res.status).toBe(204);
    expect(sendOpsAlert).toHaveBeenCalled();
  });

  it('smoke-message получает тэг ТЕСТ', async () => {
    await request(app)
      .post('/api/log-error')
      .send({
        message: 'Manual frontend smoke 1234567890',
        url: 'https://my.azarean.ru/patient-dashboard',
        userAgent: 'Mozilla/5.0',
        context: { source: 'window.error', filename: '<anonymous>' },
      });
    const [, body] = sendOpsAlert.mock.calls[0];
    expect(body).toContain('ТЕСТ');
    expect(body).toContain('игнор'); // в advice
  });
});
