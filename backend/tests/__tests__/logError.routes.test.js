// =====================================================
// Тесты на POST /api/log-error
// =====================================================

const request = require('supertest');
const express = require('express');

// Мокаем opsAlert чтобы не лезть в реальный Telegram API
jest.mock('../../utils/opsAlert', () => ({
  sendOpsAlert: jest.fn(async () => {}),
  _resetState: jest.fn(),
}));

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

  it('returns 204 на валидный payload', async () => {
    const res = await request(app)
      .post('/api/log-error')
      .send({
        message: 'TypeError: Cannot read property X of undefined',
        stack: 'at Foo.bar (/app.js:10:5)\n  at Baz.qux (/main.js:20:3)',
        url: 'http://localhost:3000/patient-dashboard',
        userAgent: 'Mozilla/5.0',
        context: { source: 'ErrorBoundary' },
      });
    expect(res.status).toBe(204);
    expect(sendOpsAlert).toHaveBeenCalledTimes(1);
    const [title, body] = sendOpsAlert.mock.calls[0];
    expect(title).toContain('[Frontend]');
    expect(title).toContain('TypeError');
    expect(body).toContain('http://localhost:3000/patient-dashboard');
    expect(body).toContain('Mozilla/5.0');
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
    // Title содержит max 500 chars сообщения + префикс
    expect(title.length).toBeLessThan(600);
    // Stack обрезан до 2500
    expect(body.length).toBeLessThan(4000);
  });

  it('не падает при пустом body', async () => {
    const res = await request(app).post('/api/log-error').send({});
    expect(res.status).toBe(204);
    expect(sendOpsAlert).toHaveBeenCalled();
  });

  it('сериализует context-объект безопасно', async () => {
    await request(app)
      .post('/api/log-error')
      .send({
        message: 'oops',
        context: { foo: 'bar', nested: { deep: 'value' } },
      });
    const [, body] = sendOpsAlert.mock.calls[0];
    expect(body).toContain('Ctx:');
    expect(body).toContain('foo');
  });
});
