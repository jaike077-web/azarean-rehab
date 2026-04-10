// =====================================================
// TESTS: Progress endpoints
// Покрывает новый composite middleware authenticatePatientOrInstructor
// (JWT инструктора + JWT пациента через Bearer или cookie)
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

const request = require('supertest');
const app = require('../../server');
const { query } = require('../../database/db');
const jwt = require('jsonwebtoken');

// Токены
const instructorPayload = { id: 1, email: 'inst@azarean.com', role: 'instructor' };
const instructorToken = jwt.sign(instructorPayload, process.env.JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

const patientPayload = { id: 14, email: 'avi707@mail.ru', full_name: 'Вадим' };
const patientToken = jwt.sign(patientPayload, process.env.PATIENT_JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/progress — auth', () => {

  it('should return 401 without any auth', async () => {
    const res = await request(app)
      .post('/api/progress')
      .send({ complex_id: 1, exercise_id: 100 });

    expect(res.status).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', 'Bearer totally.invalid.token')
      .send({ complex_id: 1, exercise_id: 100 });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/progress — patient JWT', () => {

  it('should return 403 when complex does not belong to patient', async () => {
    // Ownership check fails (нет комплекса с таким patient_id)
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ complex_id: 999, exercise_id: 100, completed: true });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/доступа/i);
  });

  it('should save progress when complex belongs to patient', async () => {
    // 1. Ownership check passes
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    // 2. complex_exercises check passes
    query.mockResolvedValueOnce({ rows: [{ id: 50 }] });
    // 3. INSERT returns row
    query.mockResolvedValueOnce({
      rows: [{
        id: 1, complex_id: 1, exercise_id: 100,
        completed: true, pain_level: 3, difficulty_rating: 5,
      }],
    });

    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        complex_id: 1,
        exercise_id: 100,
        completed: true,
        pain_level: 3,
        difficulty_rating: 5,
        session_id: 12345,
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('complex_id', 1);

    // Убедимся что первый запрос был ownership check через patient_id
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE id = $1 AND patient_id = $2'),
      [1, patientPayload.id]
    );
  });

  it('should return 400 when complex_id or exercise_id missing', async () => {
    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ complex_id: 1 });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/progress — instructor JWT', () => {

  it('should save progress with instructor JWT (ownership via instructor_id)', async () => {
    // Инструктор активен
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });
    // complex_exercises + ownership check (единый запрос с JOIN на instructor_id)
    query.mockResolvedValueOnce({ rows: [{ id: 50 }] });
    // INSERT
    query.mockResolvedValueOnce({
      rows: [{ id: 1, complex_id: 1, exercise_id: 100 }],
    });

    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        complex_id: 1,
        exercise_id: 100,
        completed: true,
      });

    expect(res.status).toBe(201);
  });
});

describe('GET /api/progress/complex/:complex_id — patient ownership', () => {

  it('should return 403 when complex does not belong to patient', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/progress/complex/999')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(403);
  });

  it('should return progress when complex belongs to patient', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // ownership
    query.mockResolvedValueOnce({ rows: [] }); // logs
    query.mockResolvedValueOnce({
      rows: [{
        total_logs: 0,
        completed_count: 0,
        avg_pain_level: null,
        avg_difficulty: null,
        total_sessions: 0,
        unique_days: 0,
      }],
    }); // stats

    const res = await request(app)
      .get('/api/progress/complex/1')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('logs');
    expect(res.body.data).toHaveProperty('statistics');
  });
});
