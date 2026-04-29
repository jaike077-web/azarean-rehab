const express = require('express');
const request = require('supertest');

jest.mock('../../database/db', () => ({
  testConnection: jest.fn(),
  query: jest.fn(),
  getClient: jest.fn(),
}));

const { testConnection } = require('../../database/db');

const buildApp = () => {
  const app = express();
  app.use('/api/health', require('../../routes/health'));
  return app;
};

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('возвращает 200 + status:ok когда БД отвечает', async () => {
    testConnection.mockResolvedValue(true);
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db.alive).toBe(true);
    expect(typeof res.body.uptime_sec).toBe('number');
    expect(typeof res.body.db.ms).toBe('number');
    // НЕ должно быть PII / reconnaissance leak
    expect(res.body.version).toBeUndefined();
    expect(res.body.memory).toBeUndefined();
    expect(res.body.environment).toBeUndefined();
  });

  it('возвращает 503 + status:degraded когда БД не отвечает', async () => {
    testConnection.mockResolvedValue(false);
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db.alive).toBe(false);
  });

  it('возвращает 503 при таймауте db probe', async () => {
    // Зависший вызов testConnection — Promise.race должен сработать
    testConnection.mockImplementation(() => new Promise(() => {}));
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db.alive).toBe(false);
  }, 5000);

  it('возвращает 503 если testConnection бросает', async () => {
    testConnection.mockRejectedValue(new Error('connection refused'));
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.db.alive).toBe(false);
  });
});
