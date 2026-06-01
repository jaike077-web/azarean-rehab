// =====================================================
// TEST: Exercise Audio (EA3) — привязка трека к упражнению (write) + патиент-резолв (read SQL).
// Write-path (exercises/complexes POST/PUT) — JS-логика, мокается query.
// Read-path резолв — в SQL (CASE-фрагмент); здесь проверяем что запрос ЕГО ВЫДАЁТ
// (fragment + JOIN'ы + scoped-serve EXISTS). Поведение CASE — отдельный throwaway-DB smoke.
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

const instructor = { id: 1, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(instructor, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const patientToken = jwt.sign({ id: 14, type: 'patient' }, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const authOk = () => query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // authenticateToken is_active
const inst = (req) => req.set('Authorization', `Bearer ${instructorToken}`);
const pat = (req) => req.set('Authorization', `Bearer ${patientToken}`).set('Origin', 'http://localhost:3000');

beforeEach(() => { query.mockReset(); getClient.mockReset(); });

const baseExercise = { title: 'Тест', video_url: 'https://example.com/v' };

// =====================================================
// exercises POST — audio_preset_id (track) валидация + INSERT
// =====================================================
describe('POST /api/exercises — audio_preset_id', () => {
  it('валидный track-пресет → 201, INSERT содержит audio_preset_id/audio_loop + params', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })                 // validateTrackPresetIds
      .mockResolvedValueOnce({ rows: [{ id: 100, audio_preset_id: 5, audio_loop: true }] }); // INSERT RETURNING

    const res = await inst(request(app).post('/api/exercises'))
      .send({ ...baseExercise, audio_preset_id: 5, audio_loop: true });

    expect(res.status).toBe(201);
    const ins = query.mock.calls.find((c) => /INSERT INTO exercises/.test(c[0]));
    expect(ins[0]).toMatch(/audio_preset_id/);
    expect(ins[0]).toMatch(/audio_loop/);
    expect(ins[0]).toMatch(/\$21/);          // 21 параметр
    expect(ins[1][19]).toBe(5);              // audio_preset_id ($20)
    expect(ins[1][20]).toBe(true);           // audio_loop ($21)
  });

  it('пресет не track/неактивен (validate вернул []) → 400, INSERT не вызван', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [] }); // validateTrackPresetIds → пусто
    const res = await inst(request(app).post('/api/exercises'))
      .send({ ...baseExercise, audio_preset_id: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/не найден|неактив|трек/i);
    expect(query.mock.calls.some((c) => /INSERT INTO exercises/.test(c[0]))).toBe(false);
  });

  it('без audio → INSERT с null/false (без лишнего validate-query)', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [{ id: 101 }] }); // INSERT RETURNING (validate пропущен)
    const res = await inst(request(app).post('/api/exercises')).send({ ...baseExercise });
    expect(res.status).toBe(201);
    const ins = query.mock.calls.find((c) => /INSERT INTO exercises/.test(c[0]));
    expect(ins[1][19]).toBeNull();   // audio_preset_id
    expect(ins[1][20]).toBe(false);  // audio_loop
    // validate-query (kind='track') НЕ вызван при отсутствии preset_id.
    expect(query.mock.calls.some((c) => /kind = 'track'/.test(c[0]))).toBe(false);
  });

  it('audio_preset_id=0 (некорректный) → 400', async () => {
    authOk();
    const res = await inst(request(app).post('/api/exercises'))
      .send({ ...baseExercise, audio_preset_id: 0 });
    // 0 != null → проходит в ветку валидации → Number 0 не > 0 → 400 некорректен.
    expect(res.status).toBe(400);
  });
});

// =====================================================
// exercises PUT — audio (UPDATE $19/$20, id $21)
// =====================================================
describe('PUT /api/exercises/:id — audio', () => {
  it('валидный track → 200, UPDATE содержит audio_preset_id=$19, audio_loop=$20, id=$21', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })  // validateTrackPresetIds
      .mockResolvedValueOnce({ rows: [{ id: 100, thumbnail_url: null, video_url: 'https://example.com/v' }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 100, audio_preset_id: 5 }] }); // UPDATE RETURNING

    const res = await inst(request(app).put('/api/exercises/100'))
      .send({ ...baseExercise, audio_preset_id: 5, audio_loop: false });
    expect(res.status).toBe(200);
    const upd = query.mock.calls.find((c) => /UPDATE exercises SET/.test(c[0]));
    expect(upd[0]).toMatch(/audio_preset_id = \$19/);
    expect(upd[0]).toMatch(/audio_loop = \$20/);
    expect(upd[0]).toMatch(/WHERE id = \$21/);
    expect(upd[1][18]).toBe(5);    // audio_preset_id
    expect(upd[1][20]).toBe('100'); // id (последний)
  });

  it('невалидный track → 400 до проверки существования', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [] }); // validateTrackPresetIds → пусто
    const res = await inst(request(app).put('/api/exercises/100'))
      .send({ ...baseExercise, audio_preset_id: 5 });
    expect(res.status).toBe(400);
    // SELECT existing НЕ должен вызываться (fail fast).
    expect(query.mock.calls.some((c) => /SELECT id, thumbnail_url/.test(c[0]))).toBe(false);
  });
});

// =====================================================
// complexes POST — per-exercise audio в транзакции
// =====================================================
describe('POST /api/complexes — per-exercise audio', () => {
  function mockClient(impl) {
    return { query: jest.fn(impl), release: jest.fn() };
  }

  it('упражнение с track-пресетом → INSERT complex_exercises с 15 параметрами (audio)', async () => {
    authOk();
    let ceInsert = null;
    const client = mockClient((sql, params) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return Promise.resolve();
      if (/SELECT id FROM patients/.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/kind = 'track'/.test(sql)) return Promise.resolve({ rows: [{ id: 5 }] }); // validateTrackPresetIds
      if (/UPDATE patients/.test(sql)) return Promise.resolve({ rows: [] });
      if (/INSERT INTO complexes/.test(sql)) return Promise.resolve({ rows: [{ id: 100 }] });
      if (/INSERT INTO complex_exercises/.test(sql)) { ceInsert = { sql, params }; return Promise.resolve({ rows: [] }); }
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);
    query.mockResolvedValueOnce({ rows: [{ id: 100 }] }); // fullComplexResult (через query, не client)

    const res = await inst(request(app).post('/api/complexes')).send({
      patient_id: 14,
      exercises: [{ exercise_id: 1, order_number: 1, audio_preset_id: 5, audio_loop: true }],
    });

    expect(res.status).toBe(201);
    expect(ceInsert.sql).toMatch(/audio_preset_id, audio_loop, audio_off/);
    expect(ceInsert.params).toHaveLength(15);
    expect(ceInsert.params[12]).toBe(5);    // audio_preset_id
    expect(ceInsert.params[13]).toBe(true); // audio_loop
    expect(ceInsert.params[14]).toBe(false); // audio_off
  });

  it('невалидный track-пресет упражнения → 400 + ROLLBACK, complex INSERT не вызван', async () => {
    authOk();
    let rolledBack = false; let complexInserted = false;
    const client = mockClient((sql) => {
      if (sql === 'ROLLBACK') { rolledBack = true; return Promise.resolve(); }
      if (['BEGIN', 'COMMIT'].includes(sql)) return Promise.resolve();
      if (/SELECT id FROM patients/.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/kind = 'track'/.test(sql)) return Promise.resolve({ rows: [] }); // пресет невалиден
      if (/INSERT INTO complexes/.test(sql)) { complexInserted = true; return Promise.resolve({ rows: [{ id: 100 }] }); }
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);

    const res = await inst(request(app).post('/api/complexes')).send({
      patient_id: 14,
      exercises: [{ exercise_id: 1, order_number: 1, audio_preset_id: 99 }],
    });

    expect(res.status).toBe(400);
    expect(rolledBack).toBe(true);
    expect(complexInserted).toBe(false); // валидация ДО создания комплекса
  });
});

// =====================================================
// READ SQL presence — резолв-фрагмент выдаётся в запросе
// =====================================================
describe('read-path SQL содержит резолв звука упражнения', () => {
  it('GET /my-complexes/:id — SQL c audio-фрагментом + ap_ce/ap_e JOIN', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 50, exercises: [] }] }); // main SELECT (нет audio_cues queries — exercises пуст)
    const res = await pat(request(app).get('/api/patient-auth/my-complexes/50'));
    // 404 (exercises пуст) или 200 — нам важен SQL первого запроса.
    const mainSql = query.mock.calls[0][0];
    expect(mainSql).toMatch(/'audio',/);
    expect(mainSql).toMatch(/ap_ce ON ap_ce\.id = ce\.audio_preset_id/);
    expect(mainSql).toMatch(/ap_e\s+ON ap_e\.id\s+= e\.audio_preset_id/);
    expect([200, 404]).toContain(res.status);
  });

  it('GET /audio-presets/:id/file — scoped serve включает exercise/complex_exercise EXISTS', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // вне scope → 404, но SQL проверяем
    await pat(request(app).get('/api/patient-auth/audio-presets/5/file'));
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/FROM complex_exercises ce[\s\S]*ce\.audio_preset_id = ap\.id/);
    expect(sql).toMatch(/JOIN exercises ex[\s\S]*ex\.audio_preset_id = ap\.id/);
    expect(query.mock.calls[0][1]).toEqual([5, 14]); // scoped by patient
  });
});
