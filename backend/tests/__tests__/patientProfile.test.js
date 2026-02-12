// =====================================================
// TESTS: Patient Profile Endpoints
// Sprint 2 — Профиль пациента
// =====================================================

// CRITICAL: Mock db BEFORE any imports
jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

jest.mock('../../utils/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

// Mock fs for avatar file operations
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});

const request = require('supertest');
const app = require('../../server');
const { query } = require('../../database/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// =====================================================
// TEST DATA
// =====================================================

const testPatient = { id: 14, email: 'test@patient.com', full_name: 'Тест Пациент' };
const validToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// =====================================================
// SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// POST /api/patient-auth/change-password
// =====================================================
describe('POST /api/patient-auth/change-password', () => {

  it('should return 401 without token', async () => {
    const res = await request(app)
      .post('/api/patient-auth/change-password')
      .send({ old_password: 'test', new_password: 'testtest' });

    expect(res.status).toBe(401);
  });

  it('should return 400 when old_password is missing', async () => {
    const res = await request(app)
      .post('/api/patient-auth/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ new_password: 'newpass12345' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/обязательны/i);
  });

  it('should return 400 when new_password is missing', async () => {
    const res = await request(app)
      .post('/api/patient-auth/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ old_password: 'oldpass12345' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/обязательны/i);
  });

  it('should return 400 when new_password is too short', async () => {
    const res = await request(app)
      .post('/api/patient-auth/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ old_password: 'oldpass12345', new_password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/минимум 8/i);
  });

  it('should return 400 when old_password is incorrect', async () => {
    const hashedPassword = await bcrypt.hash('correctpassword', 10);
    query.mockResolvedValueOnce({ rows: [{ password_hash: hashedPassword }] });

    const res = await request(app)
      .post('/api/patient-auth/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ old_password: 'wrongpassword', new_password: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/неверный/i);
  });

  it('should return 404 when patient not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/patient-auth/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ old_password: 'oldpassword', new_password: 'newpassword123' });

    expect(res.status).toBe(404);
  });

  it('should return 200 on successful password change', async () => {
    const hashedPassword = await bcrypt.hash('oldpassword', 10);
    query
      .mockResolvedValueOnce({ rows: [{ password_hash: hashedPassword }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }) // UPDATE password
      .mockResolvedValueOnce({ rows: [] }); // DELETE refresh tokens

    const res = await request(app)
      .post('/api/patient-auth/change-password')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ old_password: 'oldpassword', new_password: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/изменён/i);
    // Should have called query 3 times: SELECT, UPDATE, DELETE
    expect(query).toHaveBeenCalledTimes(3);
  });
});

// =====================================================
// DELETE /api/patient-auth/avatar
// =====================================================
describe('DELETE /api/patient-auth/avatar', () => {

  it('should return 401 without token', async () => {
    const res = await request(app)
      .delete('/api/patient-auth/avatar');

    expect(res.status).toBe(401);
  });

  it('should return 200 on successful avatar deletion', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ avatar_url: '/uploads/avatars/test.jpg' }] })
      .mockResolvedValueOnce({ rows: [] });

    fs.existsSync.mockReturnValue(true);

    const res = await request(app)
      .delete('/api/patient-auth/avatar')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/удалён/i);
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('should return 200 even when no avatar exists (avatar_url is null)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ avatar_url: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/api/patient-auth/avatar')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should not try to delete a file
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should not throw if file does not exist on disk', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ avatar_url: '/uploads/avatars/missing.jpg' }] })
      .mockResolvedValueOnce({ rows: [] });

    fs.existsSync.mockReturnValue(false);

    const res = await request(app)
      .delete('/api/patient-auth/avatar')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});
