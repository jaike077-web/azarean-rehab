// =====================================================
// TEST: ARC-CYCLE AC4 — пациентский резолв блоков (D2) + advance тренировочного дня
// GET /my/exercises (legacy / blocks / gym-only / 404 + lazy advance)
// POST /my/training/advance (explicit advance / idempotency / wrap / валидация)
//
// Каркас 1:1 с rehab.pain.test.js: мок db ДО импортов, пациентский JWT
// (PATIENT_JWT_SECRET). authenticatePatient не дёргает query → первый mock = первый
// запрос роута. requireSameOrigin пропускает в test-режиме (NODE_ENV='test').
// Локальный query.mockReset() + safety-default против Once-queue leak
// (feedback_mock_queue_leftover).
//
// ⚠️ Mock-тесты НЕ проверяют SQL против схемы — корректность json_agg / advance-формулы /
// freshness-гейта / 42P08 покрыта живым SQL-smoke на изолир. dev-БД (см. отчёт AC4).
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

const testPatient = { id: 14, email: 'avi707@mail.ru', full_name: 'Тест Пациент' };
const patientToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const auth = (req) => req.set('Authorization', `Bearer ${patientToken}`);
const findUpdate = () =>
  query.mock.calls.find(([sql]) => /UPDATE program_blocks[\s\S]*last_advanced_session_id/.test(sql));

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] }); // safety default
});

// =====================================================
// GET /api/rehab/my/exercises — D2 резолв
// =====================================================
describe('GET /api/rehab/my/exercises — D2 резолв (AC4)', () => {
  it('legacy: нет блоков → mode=legacy, плоские поля + D2-ключи null', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, title: 'Прог', complex_id: 9, program_type: 'acl', priority: 1 }] }) // активная программа (M1: + complex_id)
      .mockResolvedValueOnce({ rows: [] })                         // блоки — нет
      .mockResolvedValueOnce({                                     // legacy комплекс
        rows: [{
          program_id: 7, complex_id: 9, program_title: 'Прог', complex_title: 'Компл',
          diagnosis_name: 'ПКС', diagnosis_note: null, recommendations: null, warnings: null,
          instructor_name: 'Доктор', exercises: [{ id: 1, exercise: { id: 2, title: 'Упр' } }],
        }],
      });

    const res = await auth(request(app).get('/api/rehab/my/exercises')).expect(200);
    expect(res.body.data.mode).toBe('legacy');
    expect(res.body.data.gymnastics).toBeNull();
    expect(res.body.data.training).toBeNull();
    // плоские поля на верхнем уровне — обратная совместимость со старым ExercisesScreen
    expect(res.body.data.complex_id).toBe(9);
    expect(res.body.data.exercise_count).toBe(1);
    // и вложенный legacy-объект
    expect(res.body.data.legacy.complex_id).toBe(9);
  });

  it('blocks: gymnastics + training → две секции D2', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, title: 'Прог' }] }) // программа
      .mockResolvedValueOnce({
        rows: [
          { id: 10, block_type: 'gymnastics', title: 'Гимн', target_min: 1, target_max: 2, target_unit: 'day',
            current_day_index: null, current_day_started_at: null, last_advanced_session_id: null, num_days: 0 },
          { id: 11, block_type: 'training', title: 'Трен', target_min: 2, target_max: 3, target_unit: 'week',
            current_day_index: 1, current_day_started_at: '2026-05-30T00:00:00Z', last_advanced_session_id: null, num_days: 2 },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // lazy SELECT — нет свежей сессии
      .mockResolvedValueOnce({ rows: [{ complex_id: 63, day_index: null, day_label: null, position: 0, complex_title: 'Г', exercises: [{ id: 1, exercise: { id: 2 } }] }] }) // gym resolve
      .mockResolvedValueOnce({ rows: [{ complex_id: 64, day_index: 1, day_label: 'День А', position: 0, complex_title: 'Т', exercises: [{ id: 3, exercise: { id: 4 } }] }] }); // training resolve

    const res = await auth(request(app).get('/api/rehab/my/exercises')).expect(200);
    expect(res.body.data.mode).toBe('blocks');
    expect(res.body.data.legacy).toBeNull();
    expect(res.body.data.gymnastics.block_id).toBe(10);
    expect(res.body.data.gymnastics.target).toEqual({ min: 1, max: 2, unit: 'day' });
    expect(res.body.data.gymnastics.complexes).toHaveLength(1);
    expect(res.body.data.training.block_id).toBe(11);
    expect(res.body.data.training.current_day_index).toBe(1);
    expect(res.body.data.training.num_days).toBe(2);
    expect(res.body.data.training.day_label).toBe('День А');
    expect(res.body.data.training.complexes[0].complex_id).toBe(64);
  });

  it('blocks: только gymnastics → training=null', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, title: 'Прог' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 10, block_type: 'gymnastics', title: null, target_min: null, target_max: null, target_unit: null,
            current_day_index: null, current_day_started_at: null, last_advanced_session_id: null, num_days: 0 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ complex_id: 63, day_index: null, exercises: [] }] }); // gym resolve (нет lazy — нет trainBlock)

    const res = await auth(request(app).get('/api/rehab/my/exercises')).expect(200);
    expect(res.body.data.gymnastics).not.toBeNull();
    expect(res.body.data.training).toBeNull();
    expect(res.body.data.gymnastics.target).toEqual({ min: null, max: null, unit: null });
  });

  it('lazy advance срабатывает на GET при свежей завершённой сессии текущего дня', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, title: 'Прог' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 11, block_type: 'training', title: null, target_min: null, target_max: null, target_unit: null,
            current_day_index: 1, current_day_started_at: '2026-05-30T00:00:00Z', last_advanced_session_id: null, num_days: 2 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ session_id: 1700000000005 }] }) // lazy — свежая сессия
      .mockResolvedValueOnce({ rows: [{ current_day_index: 2 }] })      // advance UPDATE
      .mockResolvedValueOnce({ rows: [{ complex_id: 64, day_index: 2, day_label: 'День Б', exercises: [] }] }); // resolve день 2

    const res = await auth(request(app).get('/api/rehab/my/exercises')).expect(200);
    expect(res.body.data.training.current_day_index).toBe(2);
    const upd = findUpdate();
    expect(upd).toBeDefined();
    expect(upd[1]).toEqual([11, 2, 1700000000005]); // [block.id, next=(1%2)+1, sessionId]
  });

  it('lazy НЕ срабатывает без свежей сессии (старая/уже продвинутая отфильтрованы)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, title: 'Прог' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 11, block_type: 'training', title: null, target_min: null, target_max: null, target_unit: null,
            current_day_index: 1, current_day_started_at: '2026-05-30T00:00:00Z', last_advanced_session_id: 1700000000001, num_days: 2 },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // lazy — пусто
      .mockResolvedValueOnce({ rows: [{ complex_id: 64, day_index: 1, exercises: [] }] }); // resolve день 1 (без продвижения)

    const res = await auth(request(app).get('/api/rehab/my/exercises')).expect(200);
    expect(res.body.data.training.current_day_index).toBe(1);
    expect(findUpdate()).toBeUndefined();
  });

  it('404 когда нет активной программы и нет блоков (anti-regression legacy)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // программа — нет (блоки пропускаются)
      .mockResolvedValueOnce({ rows: [] }); // legacy комплекс — нет
    await auth(request(app).get('/api/rehab/my/exercises')).expect(404);
  });
});

// =====================================================
// POST /api/rehab/my/training/advance
// =====================================================
describe('POST /api/rehab/my/training/advance (AC4)', () => {
  const advance = (body) => auth(request(app).post('/api/rehab/my/training/advance')).send(body);

  it('400 при отсутствии block_id / session_id', async () => {
    const res = await advance({}).expect(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('404 если тренировочный блок не найден / не принадлежит пациенту', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // block lookup empty
    await advance({ block_id: 11, session_id: 1700000000005 }).expect(404);
  });

  it('advanced: день 1 → 2 при валидной завершённой сессии', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 11, current_day_index: 1, current_day_started_at: '2026-05-30T00:00:00Z', last_advanced_session_id: null, num_days: 3 }] }) // block
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })       // session validation OK
      .mockResolvedValueOnce({ rows: [{ current_day_index: 2 }] }) // advance UPDATE
      .mockResolvedValueOnce({ rows: [{ complex_id: 64, day_index: 2, exercises: [] }] }); // resolve

    const res = await advance({ block_id: 11, session_id: 1700000000005 }).expect(200);
    expect(res.body.data.advanced).toBe(true);
    expect(res.body.data.current_day_index).toBe(2);
    expect(res.body.data.num_days).toBe(3);
    expect(findUpdate()[1]).toEqual([11, 2, 1700000000005]);
  });

  it('идемпотентно: повтор с тем же session_id → advanced=false (no-op, без UPDATE)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 11, current_day_index: 2, current_day_started_at: '2026-05-30T00:00:00Z', last_advanced_session_id: 1700000000005, num_days: 3 }] }) // block (уже продвигал этой сессией)
      .mockResolvedValueOnce({ rows: [{ complex_id: 64, day_index: 2, exercises: [] }] }); // resolve

    const res = await advance({ block_id: 11, session_id: 1700000000005 }).expect(200);
    expect(res.body.data.advanced).toBe(false);
    expect(res.body.data.current_day_index).toBe(2);
    expect(findUpdate()).toBeUndefined();
  });

  it('wrap: день 3 → 1 (next = (3 % 3) + 1)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 11, current_day_index: 3, current_day_started_at: '2026-05-30T00:00:00Z', last_advanced_session_id: null, num_days: 3 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ current_day_index: 1 }] })
      .mockResolvedValueOnce({ rows: [{ complex_id: 62, day_index: 1, exercises: [] }] });

    const res = await advance({ block_id: 11, session_id: 1700000000009 }).expect(200);
    expect(res.body.data.current_day_index).toBe(1);
    expect(findUpdate()[1]).toEqual([11, 1, 1700000000009]);
  });

  it('400 если session_id не относится к завершённой сессии текущего дня', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 11, current_day_index: 1, current_day_started_at: '2026-05-30T00:00:00Z', last_advanced_session_id: null, num_days: 2 }] })
      .mockResolvedValueOnce({ rows: [] }); // session validation — пусто
    const res = await advance({ block_id: 11, session_id: 1700000000099 }).expect(400);
    expect(res.body.message).toMatch(/session_id/);
    expect(findUpdate()).toBeUndefined();
  });
});
