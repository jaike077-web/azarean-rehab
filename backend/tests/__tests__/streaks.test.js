// =====================================================
// TEST: utils/streaks.js + интеграция с /my/streak, /my/dashboard,
// POST /api/progress (триггер стрика после INSERT в progress_logs)
// Wave 0 commit 01 — закрытие регресса v12
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { query, getClient } = require('../../database/db');
const { updateStreak, getStreakSummary } = require('../../utils/streaks');

const patientPayload = { id: 14, email: 'avi707@mail.ru', full_name: 'Вадим' };
const patientToken = jwt.sign(patientPayload, process.env.PATIENT_JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

function makeMockClient() {
  return {
    query: jest.fn(),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// updateStreak — unit-тесты
// =====================================================

describe('updateStreak', () => {
  it('записывает день в streak_days и пересчитывает streaks', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                  // INSERT streak_days
      .mockResolvedValueOnce({ rows: [{ total_days: 1, last_activity_date: '2026-05-08' }] }) // aggregates
      .mockResolvedValueOnce({ rows: [{ longest_run: 1 }] })             // longest run
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                  // UPSERT streaks
      .mockResolvedValueOnce({ rows: [] });                              // COMMIT

    await updateStreak(14, 1, 'progress');

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO streak_days'),
      [14, 1, 'progress']
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO streaks[\s\S]+ON CONFLICT \(patient_id, program_id\)/),
      [14, 1, 1, 1, 1, '2026-05-08']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('идемпотентна: повторный вызов в тот же день не падает (ON CONFLICT DO NOTHING)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    // Симулируем что INSERT не создал новую строку (конфликт), aggregates остались как были
    client.query
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                  // INSERT (conflict)
      .mockResolvedValueOnce({ rows: [{ total_days: 5, last_activity_date: '2026-05-08' }] })
      .mockResolvedValueOnce({ rows: [{ longest_run: 3 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                  // UPSERT streaks
      .mockResolvedValueOnce({ rows: [] });                              // COMMIT

    await expect(updateStreak(14, 1, 'diary')).resolves.not.toThrow();
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('не падает на patientId=null и не дёргает БД', async () => {
    await expect(updateStreak(null, 1, 'progress')).resolves.toBeUndefined();
    expect(getClient).not.toHaveBeenCalled();
  });

  it('при programId=null не выполняет UPSERT в streaks (только запись в streak_days)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                  // INSERT streak_days
      .mockResolvedValueOnce({ rows: [{ total_days: 1, last_activity_date: '2026-05-08' }] })
      .mockResolvedValueOnce({ rows: [{ longest_run: 1 }] })
      .mockResolvedValueOnce({ rows: [] });                              // COMMIT

    await updateStreak(14, null, 'manual');

    const upsertCalls = client.query.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /INSERT INTO streaks/.test(sql)
    );
    expect(upsertCalls).toHaveLength(0);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('при ошибке делает ROLLBACK и не пробрасывает (стрик не критичен)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockRejectedValueOnce(new Error('FK violation'));                 // INSERT падает
    client.query.mockResolvedValueOnce({ rows: [] });                    // ROLLBACK ok

    // Подавляем шум в тесте
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(updateStreak(14, 1, 'progress')).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});

// =====================================================
// getStreakSummary — unit-тесты
// =====================================================

describe('getStreakSummary', () => {
  it('возвращает нули и missed_yesterday=false при отсутствии streak', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const summary = await getStreakSummary(14);

    expect(summary).toEqual({
      current_streak: 0,
      longest_streak: 0,
      total_days: 0,
      last_activity_date: null,
      days_since_last_activity: null,
      missed_yesterday: false,
    });
  });

  it('missed_yesterday=true когда days_since_last_activity=1', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        current_streak: 5,
        longest_streak: 7,
        total_days: 5,
        last_activity_date: '2026-05-07',
        days_since_last_activity: 1,
      }],
    });

    const summary = await getStreakSummary(14);

    expect(summary.missed_yesterday).toBe(true);
    expect(summary.days_since_last_activity).toBe(1);
    expect(summary.current_streak).toBe(5);
  });

  it('missed_yesterday=false когда активность сегодня (days_since_last_activity=0)', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        current_streak: 3,
        longest_streak: 3,
        total_days: 3,
        last_activity_date: '2026-05-08',
        days_since_last_activity: 0,
      }],
    });

    const summary = await getStreakSummary(14);

    expect(summary.missed_yesterday).toBe(false);
    expect(summary.days_since_last_activity).toBe(0);
  });

  it('missed_yesterday=false при больших разрывах (≥2 дней) — отдельная ветка для UI', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        current_streak: 8,
        longest_streak: 8,
        total_days: 8,
        last_activity_date: '2026-05-03',
        days_since_last_activity: 5,
      }],
    });

    const summary = await getStreakSummary(14);

    expect(summary.missed_yesterday).toBe(false);
    expect(summary.days_since_last_activity).toBe(5);
  });
});

// =====================================================
// Integration: GET /api/rehab/my/streak
// =====================================================

describe('GET /api/rehab/my/streak', () => {
  it('возвращает summary с missed_yesterday и programs[]', async () => {
    // 1. summary query (внутри getStreakSummary)
    query.mockResolvedValueOnce({
      rows: [{
        current_streak: 5,
        longest_streak: 7,
        total_days: 5,
        last_activity_date: '2026-05-07',
        days_since_last_activity: 1,
      }],
    });
    // 2. programs query
    query.mockResolvedValueOnce({
      rows: [{ id: 1, patient_id: 14, program_id: 1, program_title: 'ACL Rehab', current_streak: 5 }],
    });

    const res = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.current_streak).toBe(5);
    expect(res.body.data.missed_yesterday).toBe(true);
    expect(res.body.data.days_since_last_activity).toBe(1);
    expect(Array.isArray(res.body.data.programs)).toBe(true);
  });

  it('возвращает нули при отсутствии стрика', async () => {
    query.mockResolvedValueOnce({ rows: [] });           // summary empty
    query.mockResolvedValueOnce({ rows: [] });           // programs empty

    const res = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.current_streak).toBe(0);
    expect(res.body.data.missed_yesterday).toBe(false);
    expect(res.body.data.days_since_last_activity).toBeNull();
  });
});

// =====================================================
// Integration: POST /api/progress триггерит updateStreak
// =====================================================

describe('POST /api/progress → updateStreak', () => {
  it('после INSERT вызывает updateStreak с programId активной программы и source=progress', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                  // INSERT streak_days
      .mockResolvedValueOnce({ rows: [{ total_days: 1, last_activity_date: '2026-05-08' }] })
      .mockResolvedValueOnce({ rows: [{ longest_run: 1 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                  // UPSERT streaks
      .mockResolvedValueOnce({ rows: [] });                              // COMMIT

    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })              // ownership patient_id
      .mockResolvedValueOnce({ rows: [{ id: 50 }] })                     // complex_exercises check
      .mockResolvedValueOnce({                                           // INSERT progress_logs
        rows: [{ id: 99, complex_id: 1, exercise_id: 100, completed: true }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });                     // SELECT active program

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
    expect(getClient).toHaveBeenCalled();

    // Проверяем что INSERT в streak_days произошёл с programId=7
    const streakInsertCall = client.query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO streak_days')
    );
    expect(streakInsertCall).toBeDefined();
    expect(streakInsertCall[1]).toEqual([14, 7, 'progress']);
  });

  it('не вызывает updateStreak когда completed=false (упражнение не завершено)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })              // ownership
      .mockResolvedValueOnce({ rows: [{ id: 50 }] })                     // complex_exercises
      .mockResolvedValueOnce({                                           // INSERT progress_logs
        rows: [{ id: 99, complex_id: 1, exercise_id: 100, completed: false }],
      });

    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        complex_id: 1,
        exercise_id: 100,
        completed: false,
        pain_level: 5,
        session_id: 12345,
      });

    expect(res.status).toBe(201);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('не блокирует основной flow если updateStreak падает (ошибка проглочена)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockRejectedValueOnce(new Error('streak boom'));                  // INSERT streak падает
    client.query.mockResolvedValueOnce({ rows: [] });                    // ROLLBACK

    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })              // ownership
      .mockResolvedValueOnce({ rows: [{ id: 50 }] })                     // complex_exercises
      .mockResolvedValueOnce({                                           // INSERT progress_logs
        rows: [{ id: 99, complex_id: 1, exercise_id: 100, completed: true }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });                     // SELECT active program

    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        complex_id: 1,
        exercise_id: 100,
        completed: true,
        session_id: 12345,
      });

    // POST /api/progress по-прежнему 201 — стрик не блокирует ответ
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id', 99);

    errSpy.mockRestore();
  });
});
