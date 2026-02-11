// =====================================================
// TEST: Rehab API Routes (Sprint 1.2)
// Tests all rehab endpoints with mocked database
// =====================================================

// CRITICAL: Mock db BEFORE any imports
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
const fixtures = require('../fixtures');

// =====================================================
// TEST DATA
// =====================================================

const testPatient = { id: 1, email: 'test@patient.com', full_name: 'Test Patient' };
const validToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// =====================================================
// SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// PUBLIC ENDPOINTS - No Authentication
// =====================================================

describe('GET /api/rehab/phases', () => {
  it('should return phases with parsed JSON fields', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });

    const response = await request(app)
      .get('/api/rehab/phases')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);

    const phase = response.body.data[0];
    expect(phase.id).toBe(1);
    expect(phase.title).toBe('Защита и заживление');
    expect(Array.isArray(phase.goals)).toBe(true);
    expect(Array.isArray(phase.restrictions)).toBe(true);
    expect(Array.isArray(phase.criteria_next)).toBe(true);
    expect(phase.goals).toContain('Контроль отёка');
  });

  it('should return empty array when no phases', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/phases')
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app)
      .get('/api/rehab/phases')
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
    expect(response.body).toHaveProperty('message');
  });
});

describe('GET /api/rehab/phases/:id', () => {
  it('should return phase with videos', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });
    query.mockResolvedValueOnce({ rows: [fixtures.mockVideoRow] });

    const response = await request(app)
      .get('/api/rehab/phases/1')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data.id).toBe(1);
    expect(response.body.data.title).toBe('Защита и заживление');
    expect(Array.isArray(response.body.data.videos)).toBe(true);
    expect(response.body.data.videos).toHaveLength(1);
    expect(response.body.data.videos[0].title).toBe('Разминка');
  });

  it('should return 404 when phase not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/phases/999')
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Not Found');
    expect(response.body.message).toContain('не найдена');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/phases/1')
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

describe('GET /api/rehab/tips', () => {
  it('should return tips', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] });

    const response = await request(app)
      .get('/api/rehab/tips')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe('Совет дня');
    expect(response.body.data[0].category).toBe('motivation');
  });

  it('should return empty array when no tips', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/tips')
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/tips')
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Sprint 1.2 NEW
// =====================================================

describe('GET /api/rehab/my/exercises', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 403 with invalid token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', 'Bearer invalidtoken')
      .expect(403);

    expect(response.body).toHaveProperty('error');
  });

  it('should return exercise data with valid token', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockExerciseRow] });

    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('program_id', 1);
    expect(response.body.data).toHaveProperty('complex_id', 10);
    expect(response.body.data).toHaveProperty('access_token', 'abc-123-test-token');
    expect(response.body.data).toHaveProperty('exercise_count', 8);
    expect(response.body.data).toHaveProperty('program_title');
    expect(response.body.data).toHaveProperty('complex_title');
  });

  it('should return 404 when no active program', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Not Found');
    expect(response.body.message).toContain('не найдена');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Dashboard
// =====================================================

describe('GET /api/rehab/my/dashboard', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return dashboard data with program', async () => {
    // Mock 6 sequential queries for dashboard with program
    const programData = {
      id: 1,
      title: 'ACL Rehab',
      diagnosis: 'PKS',
      current_phase: 1,
      phase_started_at: '2026-01-15',
      surgery_date: '2026-01-01',
      status: 'active'
    };
    const phaseData = {
      id: 1,
      phase_number: 1,
      title: 'Phase 1',
      subtitle: '0-2 weeks',
      duration_weeks: '6',
      description: 'Test phase description',
      icon: 'shield',
      color: '#1A8A6A',
      color_bg: '#EDFAF5'
    };

    query.mockResolvedValueOnce({ rows: [programData] }); // program
    query.mockResolvedValueOnce({ rows: [phaseData] }); // phase
    query.mockResolvedValueOnce({ rows: [{ current_streak: 5, longest_streak: 10, total_days: 20, last_activity_date: '2026-02-10' }] }); // streak
    query.mockResolvedValueOnce({ rows: [fixtures.mockDiaryEntryRow] }); // last diary
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] }); // tip
    query.mockResolvedValueOnce({ rows: [] }); // today diary check

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('program');
    expect(response.body.data.program).not.toBeNull();
    expect(response.body.data.program.id).toBe(1);
    expect(response.body.data.program).toHaveProperty('patient_name', 'Test Patient');

    expect(response.body.data).toHaveProperty('phase');
    expect(response.body.data.phase).not.toBeNull();
    expect(response.body.data.phase.title).toBe('Phase 1');
    expect(response.body.data.phase).toHaveProperty('name', 'Phase 1');
    expect(response.body.data.phase).toHaveProperty('color2', '#EDFAF5');
    expect(response.body.data.phase).toHaveProperty('description', 'Test phase description');
    expect(response.body.data.phase.duration_weeks).toBe(6);
    expect(typeof response.body.data.phase.duration_weeks).toBe('number');

    expect(response.body.data).toHaveProperty('streak');
    expect(response.body.data.streak).toHaveProperty('current', 5);
    expect(response.body.data.streak).toHaveProperty('best', 10);
    expect(response.body.data.streak).toHaveProperty('atRisk');
    expect(typeof response.body.data.streak.atRisk).toBe('boolean');

    expect(response.body.data).toHaveProperty('lastDiary');
    expect(response.body.data).toHaveProperty('tip');
    expect(response.body.data).toHaveProperty('diaryFilledToday', false);
  });

  it('should return null program when no program exists', async () => {
    // Mock 5 queries when no program (phase query is skipped)
    query.mockResolvedValueOnce({ rows: [] }); // program - empty
    query.mockResolvedValueOnce({ rows: [] }); // streak
    query.mockResolvedValueOnce({ rows: [] }); // diary
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] }); // tip
    query.mockResolvedValueOnce({ rows: [] }); // today diary

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.program).toBeNull();
    expect(response.body.data.phase).toBeNull();
    expect(response.body.data.streak).toHaveProperty('current', 0);
    expect(response.body.data.streak).toHaveProperty('best', 0);
    expect(response.body.data.streak).toHaveProperty('atRisk', false);
    expect(response.body.data.lastDiary).toBeNull();
    expect(response.body.data.tip).not.toBeNull();
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Program
// =====================================================

describe('GET /api/rehab/my/program', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/program')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return program with phase data', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockProgramRow] });
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });

    const response = await request(app)
      .get('/api/rehab/my/program')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data.id).toBe(1);
    expect(response.body.data.title).toBe('ACL Rehab');
    expect(response.body.data).toHaveProperty('phase');
    expect(response.body.data.phase).not.toBeNull();
  });

  it('should return null when no program', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/my/program')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data).toBeNull();
    expect(response.body.message).toContain('Нет активной программы');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/program')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Diary
// =====================================================

describe('POST /api/rehab/my/diary', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .send({ pain_level: 3, mood: 4 })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should create diary entry with valid data', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // program check
    query.mockResolvedValueOnce({ rows: [fixtures.mockDiaryEntryRow] }); // insert

    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, mood: 4, exercises_done: '2' })
      .expect(201);

    expect(response.body).toHaveProperty('message', 'Запись сохранена');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data.pain_level).toBe(3);
  });

  it('should return 400 for invalid pain_level', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 15, mood: 4 })
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation Error');
    expect(response.body.message).toContain('боли должен быть от 0 до 10');
  });

  it('should return 400 for invalid mood', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 5, mood: 10 })
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation Error');
    expect(response.body.message).toContain('Настроение должно быть от 1 до 5');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, mood: 4 })
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Streak
// =====================================================

describe('GET /api/rehab/my/streak', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/streak')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return streak data', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockStreakRow] });

    const response = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('current_streak', 5);
    expect(response.body.data).toHaveProperty('longest_streak', 10);
    expect(response.body.data).toHaveProperty('total_days', 20);
    expect(response.body.data).toHaveProperty('programs');
    expect(Array.isArray(response.body.data.programs)).toBe(true);
  });

  it('should return zero streak when no data', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.current_streak).toBe(0);
    expect(response.body.data.longest_streak).toBe(0);
    expect(response.body.data.total_days).toBe(0);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Messages
// =====================================================

describe('POST /api/rehab/my/messages', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .post('/api/rehab/my/messages')
      .send({ program_id: 1, body: 'Test message' })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 400 without program_id or body', async () => {
    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation Error');
    expect(response.body.message).toContain('обязательны');
  });

  it('should return 403 when program not belonging to patient', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // check fails

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ program_id: 99, body: 'Test message' })
      .expect(403);

    expect(response.body).toHaveProperty('error', 'Forbidden');
    expect(response.body.message).toContain('Нет доступа');
  });

  it('should create message successfully', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // check passes
    query.mockResolvedValueOnce({ rows: [fixtures.mockMessageRow] }); // insert

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ program_id: 1, body: 'Test message' })
      .expect(201);

    expect(response.body).toHaveProperty('message', 'Сообщение отправлено');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data.body).toBe('Тестовое сообщение');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ program_id: 1, body: 'Test' })
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Notifications
// =====================================================

describe('GET /api/rehab/my/notifications', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return default settings when none saved', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('exercise_reminders', true);
    expect(response.body.data).toHaveProperty('diary_reminders', true);
    expect(response.body.data).toHaveProperty('message_notifications', true);
    expect(response.body.data).toHaveProperty('reminder_time', '09:00');
    expect(response.body.data).toHaveProperty('timezone', 'Europe/Moscow');
  });

  it('should return saved settings', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockNotificationSettingsRow] });

    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data.exercise_reminders).toBe(true);
    expect(response.body.data.reminder_time).toBe('09:00');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

describe('PUT /api/rehab/my/notifications', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .put('/api/rehab/my/notifications')
      .send({ exercise_reminders: false })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should upsert notification settings', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockNotificationSettingsRow] });

    const response = await request(app)
      .put('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ exercise_reminders: false, reminder_time: '10:00' })
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Настройки сохранены');
    expect(response.body).toHaveProperty('data');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .put('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ exercise_reminders: false })
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});
