// =====================================================
// TEST: Custom Audio (AA3) — POST/PUT /api/complexes cue_sounds привязки
// Инструктор назначает звук на cue при сборке комплекса. Транзакция (getClient).
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

const instructorToken = jwt.sign(
  { id: 1, email: 'inst@test.com', role: 'instructor' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' },
);

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // auth is_active
});

function makeMockClient(extra = {}) {
  const client = { query: jest.fn(), release: jest.fn() };
  client.query.mockImplementation((sql) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
    if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
    if (/INSERT INTO complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 100 }] });
    if (/UPDATE patients/i.test(sql)) return Promise.resolve({ rows: [], rowCount: 1 });
    if (/SELECT id FROM complexes WHERE id = \$1 AND instructor_id/i.test(sql)) return Promise.resolve({ rows: [{ id: 5 }] });
    if (/UPDATE complexes SET/i.test(sql)) return Promise.resolve({ rows: [] });
    if (/DELETE FROM complex_exercises/i.test(sql)) return Promise.resolve({ rows: [] });
    if (/INSERT INTO complex_exercises/i.test(sql)) return Promise.resolve({ rows: [] });
    // preset-existence: по умолчанию пресет 3 активен; override в extra.
    if (/SELECT id FROM audio_presets WHERE id = ANY/i.test(sql)) {
      return Promise.resolve(extra.presetRows || { rows: [{ id: 3 }] });
    }
    if (/DELETE FROM complex_cue_sounds/i.test(sql)) return Promise.resolve({ rows: [] });
    if (/INSERT INTO complex_cue_sounds/i.test(sql)) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [] });
  });
  return client;
}

const EX = [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }];

// =====================================================
// POST /api/complexes (insert)
// =====================================================
describe('POST /api/complexes — cue_sounds', () => {
  it('валидные cue_sounds → 201 + INSERT complex_cue_sounds с верными параметрами', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    query.mockResolvedValueOnce({ rows: [{ id: 100 }] }); // fullComplex SELECT

    const res = await request(app).post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, exercises: EX, cue_sounds: [{ cue_name: 'set_start', preset_id: 3, is_locked: true }] });

    expect(res.status).toBe(201);
    const ins = client.query.mock.calls.find(([sql]) => /INSERT INTO complex_cue_sounds/i.test(sql));
    expect(ins).toBeTruthy();
    expect(ins[1]).toEqual([100, 'set_start', 3, true]);
  });

  it('preset_id=null (явный тон) → 201, без проверки существования пресета', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

    const res = await request(app).post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, exercises: EX, cue_sounds: [{ cue_name: 'rest_end', preset_id: null, is_locked: true }] });

    expect(res.status).toBe(201);
    const presetCheck = client.query.mock.calls.find(([sql]) => /SELECT id FROM audio_presets WHERE id = ANY/i.test(sql));
    expect(presetCheck).toBeFalsy();
    const ins = client.query.mock.calls.find(([sql]) => /INSERT INTO complex_cue_sounds/i.test(sql));
    expect(ins[1]).toEqual([100, 'rest_end', null, true]);
  });

  it('некорректный cue_name → 400, ROLLBACK до INSERT комплекса', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);

    const res = await request(app).post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, exercises: EX, cue_sounds: [{ cue_name: 'bad_cue', preset_id: 3 }] });

    expect(res.status).toBe(400);
    const complexInsert = client.query.mock.calls.find(([sql]) => /INSERT INTO complexes/i.test(sql));
    expect(complexInsert).toBeFalsy(); // отвалились на валидации до INSERT
  });

  it('дубль cue_name → 400', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    const res = await request(app).post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, exercises: EX, cue_sounds: [
        { cue_name: 'set_start', preset_id: 3 }, { cue_name: 'set_start', preset_id: null },
      ] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Дубль/);
  });

  it('несуществующий/неактивный preset_id → 400 + ROLLBACK', async () => {
    const client = makeMockClient({ presetRows: { rows: [] } }); // пресет не найден/неактивен
    getClient.mockResolvedValueOnce(client);

    const res = await request(app).post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, exercises: EX, cue_sounds: [{ cue_name: 'set_start', preset_id: 999 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/не найден или неактивен/);
    const rollback = client.query.mock.calls.find(([sql]) => sql === 'ROLLBACK');
    expect(rollback).toBeTruthy();
  });

  it('без cue_sounds → 201, complex_cue_sounds не трогается (backward-compat)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);
    query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

    const res = await request(app).post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, exercises: EX });

    expect(res.status).toBe(201);
    const touched = client.query.mock.calls.find(([sql]) => /complex_cue_sounds/i.test(sql));
    expect(touched).toBeFalsy();
  });
});

// =====================================================
// PUT /api/complexes/:id (replace)
// =====================================================
describe('PUT /api/complexes/:id — cue_sounds replace', () => {
  it('cue_sounds → 200, DELETE + INSERT (полная замена)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);

    const res = await request(app).put('/api/complexes/5')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ exercises: EX, cue_sounds: [{ cue_name: 'set_end', preset_id: 3, is_locked: false }] });

    expect(res.status).toBe(200);
    expect(client.query.mock.calls.find(([sql]) => /DELETE FROM complex_cue_sounds/i.test(sql))).toBeTruthy();
    const ins = client.query.mock.calls.find(([sql]) => /INSERT INTO complex_cue_sounds/i.test(sql));
    // complex_id из req.params.id — строка '5' (как во всех PUT-запросах; pg коэрсит в int).
    expect(ins[1]).toEqual(['5', 'set_end', 3, false]);
  });

  it('пустой массив cue_sounds:[] → 200, DELETE без INSERT (наследование дом-карты)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);

    const res = await request(app).put('/api/complexes/5')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ exercises: EX, cue_sounds: [] });

    expect(res.status).toBe(200);
    expect(client.query.mock.calls.find(([sql]) => /DELETE FROM complex_cue_sounds/i.test(sql))).toBeTruthy();
    expect(client.query.mock.calls.find(([sql]) => /INSERT INTO complex_cue_sounds/i.test(sql))).toBeFalsy();
  });

  it('без cue_sounds → 200, complex_cue_sounds не трогается (backward-compat)', async () => {
    const client = makeMockClient();
    getClient.mockResolvedValueOnce(client);

    const res = await request(app).put('/api/complexes/5')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ exercises: EX });

    expect(res.status).toBe(200);
    expect(client.query.mock.calls.find(([sql]) => /complex_cue_sounds/i.test(sql))).toBeFalsy();
  });
});
