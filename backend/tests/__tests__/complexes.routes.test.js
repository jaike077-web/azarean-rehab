// =====================================================
// TEST: Complexes API — derived_title computed field (Wave 1 #1.08a)
// =====================================================
// Mock-based по правилу 2026-05-13 (нет integration с реальной БД).
// Тестируем что:
// - Все 4 endpoint'а (GET /, /:id, /patient/:patient_id, /trash/list)
//   возвращают derived_title в response
// - SQL содержит COALESCE(NULLIF(title, ''), subquery с string_agg)
//   pattern для fallback'а из первых 2 упражнений
// - Поле NULL не падает на фронте, корректно проходит через unwrap

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

const instructorUser = { id: 1, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(instructorUser, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

beforeEach(() => {
  jest.clearAllMocks();
  // auth middleware is_active check
  query.mockResolvedValueOnce({ rows: [{ is_active: true }] });
});

describe('GET /api/complexes — derived_title computed field', () => {
  it('возвращает derived_title = title если он непустой', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          title: 'Реабилитация колена базовая',
          patient_id: 14,
          patient_name: 'Вадим',
          derived_title: 'Реабилитация колена базовая',
          exercises_count: '5',
          completions_count: '3',
        },
      ],
    });

    const res = await request(app)
      .get('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].derived_title).toBe('Реабилитация колена базовая');
  });

  it('возвращает derived_title = first 2 exercises joined если title пустой', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          title: null,
          patient_id: 14,
          patient_name: 'Вадим',
          derived_title: 'Приседания у стены · Подъём прямой ноги',
          exercises_count: '4',
        },
      ],
    });

    const res = await request(app)
      .get('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    expect(res.body.data[0].derived_title).toBe('Приседания у стены · Подъём прямой ноги');
    expect(res.body.data[0].title).toBeNull();
  });

  it('возвращает derived_title = null если ни title ни exercises', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 3,
          title: null,
          patient_id: 14,
          derived_title: null,
          exercises_count: '0',
        },
      ],
    });

    const res = await request(app)
      .get('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    expect(res.body.data[0].derived_title).toBeNull();
  });

  it('SQL содержит COALESCE + NULLIF + string_agg pattern', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`);

    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/COALESCE/i);
    expect(sql).toMatch(/NULLIF\(c\.title, ''\)/);
    expect(sql).toMatch(/string_agg\(ex\.title, ' · '/);
    expect(sql).toMatch(/LIMIT 2/);
    expect(sql).toMatch(/AS derived_title/i);
  });
});

describe('GET /api/complexes/:id — derived_title', () => {
  it('возвращает derived_title в карточке комплекса', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          title: '',
          patient_id: 14,
          patient_name: 'Вадим',
          instructor_name: 'Vadim',
          derived_title: 'Упр1 · Упр2',
          exercises: [],
        },
      ],
    });

    const res = await request(app)
      .get('/api/complexes/5')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    expect(res.body.data.derived_title).toBe('Упр1 · Упр2');
  });

  it('404 + не возвращает derived_title если комплекс не найден', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/complexes/99999')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(404);

    expect(res.body).not.toHaveProperty('derived_title');
  });
});

describe('GET /api/complexes/patient/:patient_id — derived_title', () => {
  it('возвращает derived_title для каждого комплекса пациента', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 10, title: 'Колено фаза 1', derived_title: 'Колено фаза 1', patient_id: 14 },
        { id: 11, title: null, derived_title: 'Упр А · Упр Б', patient_id: 14 },
      ],
    });

    const res = await request(app)
      .get('/api/complexes/patient/14')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].derived_title).toBe('Колено фаза 1');
    expect(res.body.data[1].derived_title).toBe('Упр А · Упр Б');
  });
});

describe('GET /api/complexes/trash/list — derived_title', () => {
  it('возвращает derived_title и для удалённых комплексов (для UI восстановления)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 50, title: null, derived_title: 'Старый компл · Упр', is_active: false },
      ],
    });

    const res = await request(app)
      .get('/api/complexes/trash/list')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    expect(res.body.data[0].derived_title).toBe('Старый компл · Упр');
  });
});

// =====================================================
// Hot-fix #2 (2026-05-15) — POST/PUT принимают title (Bug #13 root cause)
// =====================================================
const { getClient } = require('../../database/db');

describe('POST /api/complexes — title в payload', () => {
  function makeMockClient() {
    return { query: jest.fn(), release: jest.fn() };
  }

  it('сохраняет title из body в INSERT', async () => {
    const client = makeMockClient();
    let insertedTitle = undefined;
    client.query.mockImplementation((sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/INSERT INTO complexes/i.test(sql)) {
        // params[2] = title после patient_id, instructor_id
        insertedTitle = params[2];
        return Promise.resolve({ rows: [{ id: 100, title: params[2] }] });
      }
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);
    // top-level `query` для fullComplexResult SELECT после INSERT
    query.mockResolvedValueOnce({ rows: [{ id: 100, title: 'Утренний комплекс плеча' }] });

    const res = await request(app)
      .post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: 14,
        title: 'Утренний комплекс плеча',
        exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
      });

    expect(res.status).toBe(201);
    expect(insertedTitle).toBe('Утренний комплекс плеча');
    // INSERT SQL включает title в список колонок
    const insertCall = client.query.mock.calls.find(([sql]) => /INSERT INTO complexes/i.test(sql));
    expect(insertCall[0]).toMatch(/\btitle\b/i);
  });

  it('пустая строка title → NULL в БД (derived_title fallback продолжает работать)', async () => {
    const client = makeMockClient();
    let insertedTitle;
    client.query.mockImplementation((sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/INSERT INTO complexes/i.test(sql)) {
        insertedTitle = params[2];
        return Promise.resolve({ rows: [{ id: 100 }] });
      }
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);
    query.mockResolvedValueOnce({ rows: [{ id: 100, title: null }] });

    await request(app)
      .post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: 14,
        title: '   ', // whitespace-only
        exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
      });

    expect(insertedTitle).toBeNull();
  });
});

describe('PUT /api/complexes/:id — title в payload', () => {
  function makeMockClient() {
    return { query: jest.fn(), release: jest.fn() };
  }

  it('обновляет title через UPDATE', async () => {
    const client = makeMockClient();
    let updatedTitle = undefined;
    client.query.mockImplementation((sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 50 }] });
      if (/UPDATE complexes/i.test(sql)) {
        // params[0] = title после `SET title = $1`
        updatedTitle = params[0];
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);

    const res = await request(app)
      .put('/api/complexes/50')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        title: 'Обновлённое название',
        diagnosis_id: 1,
        recommendations: 'rec',
        warnings: 'warn',
        exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
      });

    expect(res.status).toBe(200);
    expect(updatedTitle).toBe('Обновлённое название');
    const updateCall = client.query.mock.calls.find(([sql]) => /UPDATE complexes/i.test(sql));
    expect(updateCall[0]).toMatch(/\btitle\b/i);
  });

  it('пустой title → NULL в БД', async () => {
    const client = makeMockClient();
    let updatedTitle;
    client.query.mockImplementation((sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 50 }] });
      if (/UPDATE complexes/i.test(sql)) {
        updatedTitle = params[0];
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);

    await request(app)
      .put('/api/complexes/50')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        title: '',
        diagnosis_id: null,
        recommendations: null,
        warnings: null,
        exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
      });

    expect(updatedTitle).toBeNull();
  });
});
