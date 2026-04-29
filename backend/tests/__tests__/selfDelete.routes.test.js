// =====================================================
// Тесты на DELETE /api/patient-auth/me
// (152-ФЗ ст.21 / GDPR Art.17 — soft delete + grace period)
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

jest.mock('../../utils/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const { query, getClient } = require('../../database/db');
const jwt = require('jsonwebtoken');

const testPatient = { id: 14, email: 'test@patient.com', full_name: 'Тест Пациент' };
const validToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

function makeMockClient() {
  return { query: jest.fn(), release: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DELETE /api/patient-auth/me', () => {
  it('returns 401 без токена', async () => {
    const res = await request(app)
      .delete('/api/patient-auth/me')
      .send({ confirm: true });
    expect(res.status).toBe(401);
  });

  it('returns 400 если confirm не true', async () => {
    const res = await request(app)
      .delete('/api/patient-auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CONFIRMATION_REQUIRED');
  });

  it('returns 404 если patient не найден', async () => {
    const client = makeMockClient();
    client.query
      .mockResolvedValueOnce()  // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // SELECT - нет пациента
      .mockResolvedValueOnce();  // ROLLBACK
    getClient.mockResolvedValue(client);

    const res = await request(app)
      .delete('/api/patient-auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ confirm: true, current_password: 'whatever' });

    expect(res.status).toBe(404);
  });

  it('returns 200 idempotent если patient уже soft-deleted', async () => {
    const client = makeMockClient();
    client.query
      .mockResolvedValueOnce()  // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 14, password_hash: '$2b$12$fake', is_active: false }],
      })
      .mockResolvedValueOnce();  // ROLLBACK
    getClient.mockResolvedValue(client);

    const res = await request(app)
      .delete('/api/patient-auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('уже в очереди');
  });

  it('returns 400 если patient с password но current_password не передан', async () => {
    const client = makeMockClient();
    client.query
      .mockResolvedValueOnce()  // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 14, password_hash: '$2b$12$realhash', is_active: true }],
      })
      .mockResolvedValueOnce();  // ROLLBACK
    getClient.mockResolvedValue(client);

    const res = await request(app)
      .delete('/api/patient-auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ confirm: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PASSWORD_REQUIRED');
  });

  it('returns 401 если current_password неверный', async () => {
    const fakeHash = await bcrypt.hash('correct-password', 4); // быстрый rounds для теста
    const client = makeMockClient();
    client.query
      .mockResolvedValueOnce()
      .mockResolvedValueOnce({
        rows: [{ id: 14, password_hash: fakeHash, is_active: true }],
      })
      .mockResolvedValueOnce();
    getClient.mockResolvedValue(client);

    const res = await request(app)
      .delete('/api/patient-auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ confirm: true, current_password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_PASSWORD');
  });

  it('успех с правильным паролем: soft delete + insert в queue + force logout', async () => {
    const fakeHash = await bcrypt.hash('correct-password', 4);
    const client = makeMockClient();
    client.query
      .mockResolvedValueOnce()  // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 14, password_hash: fakeHash, is_active: true }],
      })  // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rowCount: 1 })  // UPDATE is_active=false
      .mockResolvedValueOnce({ rowCount: 1 })  // INSERT patient_deletion_queue
      .mockResolvedValueOnce({ rowCount: 1 })  // DELETE refresh tokens
      .mockResolvedValueOnce();  // COMMIT
    getClient.mockResolvedValue(client);

    // top-level query — для audit INSERT (fire-and-forget)
    query.mockResolvedValue({ rowCount: 1 });

    const res = await request(app)
      .delete('/api/patient-auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ confirm: true, current_password: 'correct-password', reason: 'не нужно больше' });

    expect(res.status).toBe(200);
    expect(res.body.data.scheduled_for).toBeDefined();
    // scheduled_for ~30 дней вперёд
    const scheduled = new Date(res.body.data.scheduled_for);
    const expectedMin = Date.now() + 29 * 24 * 60 * 60 * 1000;
    const expectedMax = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(scheduled.getTime()).toBeGreaterThan(expectedMin);
    expect(scheduled.getTime()).toBeLessThan(expectedMax);

    // SQL последовательность: BEGIN, SELECT, UPDATE, INSERT queue, DELETE tokens, COMMIT
    // /s флаг — `.` matches newlines (наш SQL multi-line форматтированный)
    const sqlSequence = client.query.mock.calls.map((c) => c[0]).filter((s) => typeof s === 'string');
    expect(sqlSequence[0]).toBe('BEGIN');
    expect(sqlSequence[1]).toMatch(/SELECT.*FROM patients.*FOR UPDATE/is);
    expect(sqlSequence[2]).toMatch(/UPDATE patients SET is_active = false/is);
    expect(sqlSequence[3]).toMatch(/INSERT INTO patient_deletion_queue/is);
    expect(sqlSequence[4]).toMatch(/DELETE FROM patient_refresh_tokens/is);
    expect(sqlSequence[5]).toBe('COMMIT');

    // Cookies очищены — Set-Cookie с истечением в прошлом
    const setCookies = res.headers['set-cookie'] || [];
    const accessCleared = setCookies.find((c) => /patient_access_token=.*Expires|patient_access_token=;/i.test(c));
    const refreshCleared = setCookies.find((c) => /patient_refresh_token=.*Expires|patient_refresh_token=;/i.test(c));
    expect(accessCleared || refreshCleared).toBeDefined();

    // Audit ACCOUNT_DELETE_REQUESTED записан
    const auditCall = query.mock.calls.find((c) => /audit_logs/i.test(c[0]));
    expect(auditCall).toBeDefined();
    expect(auditCall[1][0]).toBe('ACCOUNT_DELETE_REQUESTED');
  });

  it('OAuth-only пациент (password_hash=NULL) проходит без current_password', async () => {
    const client = makeMockClient();
    client.query
      .mockResolvedValueOnce()
      .mockResolvedValueOnce({
        rows: [{ id: 14, password_hash: null, is_active: true }],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce();
    getClient.mockResolvedValue(client);
    query.mockResolvedValue({ rowCount: 1 });

    const res = await request(app)
      .delete('/api/patient-auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ confirm: true });  // никакого current_password

    expect(res.status).toBe(200);
    expect(res.body.data.scheduled_for).toBeDefined();
  });
});
