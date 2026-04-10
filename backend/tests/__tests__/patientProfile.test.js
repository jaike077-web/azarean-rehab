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
    // success field removed — проверяем status
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
    // success field removed — проверяем status
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
    // success field removed — проверяем status
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
    // success field removed — проверяем status
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});

// =====================================================
// GET /api/patient-auth/my-complexes
// =====================================================
describe('GET /api/patient-auth/my-complexes', () => {

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/patient-auth/my-complexes');
    expect(res.status).toBe(401);
  });

  it('should return empty list when patient has no complexes', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/patient-auth/my-complexes')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    // success field removed — проверяем status
    expect(res.body.data).toEqual([]);
  });

  it('should return list of patient complexes', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          title: 'Комплекс 1',
          diagnosis_note: null,
          recommendations: null,
          warnings: null,
          created_at: '2026-04-01T00:00:00.000Z',
          diagnosis_name: 'ПКС',
          instructor_name: 'Вадим',
          exercises_count: '5',
        },
        {
          id: 2,
          title: 'Комплекс 2',
          diagnosis_note: null,
          recommendations: null,
          warnings: null,
          created_at: '2026-03-01T00:00:00.000Z',
          diagnosis_name: 'Плечо',
          instructor_name: 'Вадим',
          exercises_count: '3',
        },
      ],
    });

    const res = await request(app)
      .get('/api/patient-auth/my-complexes')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    // success field removed — проверяем status
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].exercises_count).toBe(5);
    expect(res.body.data[1].exercises_count).toBe(3);
  });

  it('should query with patient_id from JWT', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/patient-auth/my-complexes')
      .set('Authorization', `Bearer ${validToken}`);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE c.patient_id = $1'),
      [testPatient.id]
    );
  });

  it('should return 500 on DB error', async () => {
    query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .get('/api/patient-auth/my-complexes')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
  });
});

// =====================================================
// GET /api/patient-auth/my-complexes/:id
// =====================================================
describe('GET /api/patient-auth/my-complexes/:id', () => {

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/patient-auth/my-complexes/1');
    expect(res.status).toBe(401);
  });

  it('should return 400 for invalid ID', async () => {
    const res = await request(app)
      .get('/api/patient-auth/my-complexes/notanumber')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(400);
  });

  it('should return 404 when complex does not belong to patient', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/patient-auth/my-complexes/999')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(404);
  });

  it('should return complex with exercises', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          title: 'Утро',
          diagnosis_note: 'Аккуратно с коленом',
          recommendations: 'Разминка обязательна',
          warnings: null,
          created_at: '2026-04-01T00:00:00.000Z',
          diagnosis_name: 'ПКС',
          instructor_name: 'Вадим',
          exercises: [
            {
              id: 1,
              order_number: 1,
              sets: 3,
              reps: 10,
              duration_seconds: null,
              rest_seconds: 30,
              notes: null,
              exercise: {
                id: 100,
                title: 'Приседания',
                description: null,
                video_url: null,
                thumbnail_url: null,
                kinescope_id: null,
                exercise_type: 'strength',
                difficulty_level: 2,
                equipment: [],
                instructions: null,
                contraindications: null,
                tips: null,
              },
            },
          ],
        },
      ],
    });

    const res = await request(app)
      .get('/api/patient-auth/my-complexes/5')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    // success field removed — проверяем status
    expect(res.body.data.id).toBe(5);
    expect(res.body.data.exercises).toHaveLength(1);
    expect(res.body.data.exercises[0].exercise.title).toBe('Приседания');
    expect(res.body.data).not.toHaveProperty('access_token');
  });

  it('should filter by patient_id (ownership check)', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/patient-auth/my-complexes/42')
      .set('Authorization', `Bearer ${validToken}`);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE c.id = $1 AND c.patient_id = $2'),
      [42, testPatient.id]
    );
  });
});
