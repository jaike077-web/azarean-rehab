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

describe('GET /api/complexes/patient/:patient_id — derived_title + ownership', () => {
  it('возвращает derived_title для каждого комплекса пациента', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] }) // access-guard: пациент доступен
      .mockResolvedValueOnce({
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

  it('ARC-fix: возвращает ВСЕ комплексы пациента (НЕ фильтрует по instructor_id)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] }) // access ok
      .mockResolvedValueOnce({ rows: [{ id: 59, patient_id: 14, instructor_id: 1 }] });

    await request(app)
      .get('/api/complexes/patient/14')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(200);

    // calls: [0]=auth is_active, [1]=access-guard, [2]=выборка комплексов.
    // Выборка: WHERE по patient_id, БЕЗ instructor_id-фильтра.
    const complexSql = query.mock.calls[2][0];
    expect(complexSql).toMatch(/WHERE c\.patient_id = \$1 AND c\.is_active = true/);
    expect(complexSql).not.toMatch(/c\.instructor_id = \$2/);
  });

  it('ARC-fix: 404 если пациент НЕ доступен инструктору (access-guard, IDOR)', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // access-guard пуст → нет доступа

    const res = await request(app)
      .get('/api/complexes/patient/999')
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(404);

    expect(res.body.error).toBe('Not Found');
    // выборка комплексов НЕ выполняется: только [0]=auth + [1]=access-guard.
    expect(query.mock.calls.length).toBe(2);
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

// =====================================================
// CP2a (TZ_TIMER_AUDIO_TIMESETS) — auto_complete + tempo_* в complex_exercises
// =====================================================
describe('CP2a — INSERT complex_exercises (write path)', () => {
  function makeMockClient() {
    return { query: jest.fn(), release: jest.fn() };
  }

  // Захват params последнего INSERT в complex_exercises (есть в POST и PUT).
  // Возвращает getter — вызвать после await request чтобы получить { sql, params }.
  function captureCEInsert(client) {
    let capturedSql = null;
    let capturedParams = null;
    client.query.mockImplementation((sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/SELECT id FROM complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 50 }] });
      if (/UPDATE patients/i.test(sql)) return Promise.resolve({ rows: [] });
      if (/INSERT INTO complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 100 }] });
      if (/DELETE FROM complex_exercises/i.test(sql)) return Promise.resolve({ rows: [] });
      if (/UPDATE complexes/i.test(sql)) return Promise.resolve({ rows: [] });
      if (/INSERT INTO complex_exercises/i.test(sql)) {
        capturedSql = sql;
        capturedParams = params;
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    return () => ({ sql: capturedSql, params: capturedParams });
  }

  describe('POST /api/complexes — INSERT включает новые колонки', () => {
    it('SQL содержит auto_complete + 3 темп-колонки + 12 параметров', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);
      query.mockResolvedValueOnce({ rows: [{ id: 100 }] }); // fullComplexResult

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
        });

      const { sql, params } = getCapture();
      expect(sql).toMatch(/auto_complete/);
      expect(sql).toMatch(/tempo_eccentric_s/);
      expect(sql).toMatch(/tempo_pause_s/);
      expect(sql).toMatch(/tempo_concentric_s/);
      expect(sql).toMatch(/\$12/);
      expect(params).toHaveLength(12);
    });

    it('по умолчанию auto_complete=true (CP2 решение арка)', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);
      query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
        });

      // params: [complex_id, exercise_id, order_number, sets, reps, duration, rest, notes, auto_complete, ecc, pause, con]
      const { params } = getCapture();
      expect(params[8]).toBe(true);
    });

    it('auto_complete=false из body → false в params', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);
      query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{
            exercise_id: 1, order_number: 1, sets: 3, duration_seconds: 30,
            auto_complete: false,
          }],
        });

      const { params } = getCapture();
      expect(params[8]).toBe(false);
    });

    it('темп 3-0-3 → params [3, 0, 3]', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);
      query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{
            exercise_id: 1, order_number: 1, sets: 3, reps: 10,
            tempo_eccentric_s: 3, tempo_pause_s: 0, tempo_concentric_s: 3,
          }],
        });

      const { params } = getCapture();
      expect(params[9]).toBe(3);
      expect(params[10]).toBe(0);
      expect(params[11]).toBe(3);
    });

    it('темп не задан → params [null, null, null]', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);
      query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
        });

      const { params } = getCapture();
      expect(params[9]).toBeNull();
      expect(params[10]).toBeNull();
      expect(params[11]).toBeNull();
    });

    it('reps + duration_seconds вместе (XOR снят) — оба попадают в INSERT', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);
      query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{
            exercise_id: 1, order_number: 1, sets: 3,
            reps: 10, duration_seconds: 30,
          }],
        });

      const { params } = getCapture();
      // params[4]=reps, params[5]=duration_seconds — оба сосуществуют (XOR снят CP2)
      expect(params[4]).toBe(10);
      expect(params[5]).toBe(30);
    });

    it('reps=0 + duration=30 (legacy time-only payload) → reps нормализован в NULL', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);
      query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{
            exercise_id: 1, order_number: 1, sets: 3,
            reps: 0, duration_seconds: 30,
          }],
        });

      const { params } = getCapture();
      // reps=0 → NULL (нормализация для существующего CreateComplex.js time-only)
      expect(params[4]).toBeNull();
      expect(params[5]).toBe(30);
    });
  });

  describe('PUT /api/complexes/:id — INSERT после DELETE packs', () => {
    it('INSERT SQL содержит auto_complete + tempo_*, params передаются', async () => {
      const client = makeMockClient();
      const getCapture = captureCEInsert(client);
      getClient.mockResolvedValueOnce(client);

      await request(app)
        .put('/api/complexes/50')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          title: 'обновлено',
          exercises: [{
            exercise_id: 1, order_number: 1, sets: 3, reps: 10,
            auto_complete: false,
            tempo_eccentric_s: 2, tempo_pause_s: 1, tempo_concentric_s: 2,
          }],
        });

      const { sql, params } = getCapture();
      expect(sql).toMatch(/auto_complete/);
      expect(sql).toMatch(/tempo_eccentric_s/);
      expect(params[8]).toBe(false);
      expect(params[9]).toBe(2);
      expect(params[10]).toBe(1);
      expect(params[11]).toBe(2);
    });
  });
});

// =====================================================
// CP2a — read path: pacient GET /my-complexes/:id отдаёт новые поля
// SQL-pattern проверка (mock-based supertest для patientAuth — overhead;
// pattern-test достаточен по образцу program_types.migration.test.js).
// =====================================================
describe('CP2a — read path: routes/patientAuth.js GET /my-complexes/:id', () => {
  const patientAuthSrc = require('fs').readFileSync(
    require('path').join(__dirname, '../../routes/patientAuth.js'),
    'utf8'
  );

  it('json_build_object содержит auto_complete', () => {
    expect(patientAuthSrc).toMatch(/'auto_complete',\s*ce\.auto_complete/);
  });

  it('json_build_object содержит 3 темп-колонки', () => {
    expect(patientAuthSrc).toMatch(/'tempo_eccentric_s',\s*ce\.tempo_eccentric_s/);
    expect(patientAuthSrc).toMatch(/'tempo_pause_s',\s*ce\.tempo_pause_s/);
    expect(patientAuthSrc).toMatch(/'tempo_concentric_s',\s*ce\.tempo_concentric_s/);
  });
});

// =====================================================
// CP2c — instructor edit round-trip (TZ_..._CP2c_INSTRUCTOR_READ)
//
// CP2b отчёт вскрыл тихую потерю данных: EditComplex.loadComplexData
// зовёт complexes.getOne → GET /api/complexes/:id, но CP2a расширил
// только пациентский /my-complexes/:id. Инструктор сохранял auto_complete=
// false / темп, перезагружал Edit → undefined → молча дефолты → save →
// затёрто.
//
// CP2c закрывает: 4 поля в обоих instructor read-paths (POST after-INSERT
// fullComplexResult + GET /:id) + round-trip тест.
// =====================================================
describe('CP2c — instructor edit round-trip (auto_complete + tempo)', () => {
  // Локальный mockReset — очищает накопленную mockResolvedValueOnce-очередь
  // из предыдущих тестов файла. clearAllMocks в глобальном beforeEach
  // НЕ трогает queue.
  beforeEach(() => {
    query.mockReset();
    // Re-setup auth (глобальный beforeEach уже добавлял, но он съеден reset'ом).
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });
  });

  describe('GET /api/complexes/:id (EditComplex.loadComplexData)', () => {
    it('SQL json_build_object содержит auto_complete + 3 темп-колонки', async () => {
      query.mockResolvedValueOnce({
        rows: [{
          id: 50, title: 'Тест', patient_id: 14, patient_name: 'Вадим',
          instructor_name: 'Vadim', derived_title: 'Тест',
          exercises: [],
        }],
      });

      await request(app)
        .get('/api/complexes/50')
        .set('Authorization', `Bearer ${instructorToken}`);

      // Mock вызывался дважды: [0]=auth middleware is_active, [1]=сам SELECT
      const sql = query.mock.calls[1][0];
      expect(sql).toMatch(/'auto_complete',\s*ce\.auto_complete/);
      expect(sql).toMatch(/'tempo_eccentric_s',\s*ce\.tempo_eccentric_s/);
      expect(sql).toMatch(/'tempo_pause_s',\s*ce\.tempo_pause_s/);
      expect(sql).toMatch(/'tempo_concentric_s',\s*ce\.tempo_concentric_s/);
    });

    it('round-trip: auto_complete=false + темп 3-0-3 в БД → возвращаются в response', async () => {
      // Симулируем БД-row которая ВЕРНУЛАСЬ из INSERT — те же значения которые
      // инструктор ставил в EditComplex.
      query.mockResolvedValueOnce({
        rows: [{
          id: 50,
          title: 'Time-based комплекс',
          patient_id: 14,
          patient_name: 'Вадим',
          instructor_name: 'Vadim',
          derived_title: 'Time-based комплекс',
          exercises: [
            {
              id: 100,
              order_number: 1,
              sets: 3,
              reps: null,
              duration_seconds: 30,
              rest_seconds: 30,
              notes: null,
              auto_complete: false,
              tempo_eccentric_s: 3,
              tempo_pause_s: 0,
              tempo_concentric_s: 3,
              exercise: { id: 1, title: 'Присед' },
            },
          ],
        }],
      });

      const res = await request(app)
        .get('/api/complexes/50')
        .set('Authorization', `Bearer ${instructorToken}`)
        .expect(200);

      const ex = res.body.data.exercises[0];
      // Это то что EditComplex.loadComplexData будет mapping'ить — должно
      // быть достаточно для item.auto_complete !== false → checkbox unchecked
      // и item.tempo_eccentric_s ?? '' → 3 (не пустая строка).
      expect(ex.auto_complete).toBe(false);
      expect(ex.tempo_eccentric_s).toBe(3);
      expect(ex.tempo_pause_s).toBe(0);
      expect(ex.tempo_concentric_s).toBe(3);
      expect(ex.reps).toBeNull();
      expect(ex.duration_seconds).toBe(30);
    });
  });

  describe('POST /api/complexes (after-INSERT fullComplexResult)', () => {
    it('SQL fullComplexResult json_build_object содержит auto_complete + темп', async () => {
      // Симулируем минимально-успешный POST flow
      const client = { query: jest.fn(), release: jest.fn() };
      client.query.mockImplementation((sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
        if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
        if (/INSERT INTO complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 100 }] });
        return Promise.resolve({ rows: [] });
      });
      getClient.mockResolvedValueOnce(client);
      // Запоминаем SQL который пошёл в top-level `query` для fullComplexResult.
      query.mockResolvedValueOnce({ rows: [{ id: 100, title: null }] });

      await request(app)
        .post('/api/complexes')
        .set('Authorization', `Bearer ${instructorToken}`)
        .send({
          patient_id: 14,
          exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
        });

      // query.mock.calls — [0]: auth, [1]: fullComplexResult SELECT
      const sql = query.mock.calls[1][0];
      expect(sql).toMatch(/'auto_complete',\s*ce\.auto_complete/);
      expect(sql).toMatch(/'tempo_eccentric_s',\s*ce\.tempo_eccentric_s/);
      expect(sql).toMatch(/'tempo_pause_s',\s*ce\.tempo_pause_s/);
      expect(sql).toMatch(/'tempo_concentric_s',\s*ce\.tempo_concentric_s/);
    });
  });
});
