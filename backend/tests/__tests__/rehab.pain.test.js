// =====================================================
// TEST: Pain endpoints (Wave 2 коммит 2.04)
// =====================================================
// Покрывает: GET /my/pain-locations, POST /my/pain/daily (UPSERT),
// POST /my/pain/event (INSERT), GET /my/pain (filter type),
// red-flag automation через триггер sendOpsAlert + ops_alerts INSERT
// + UPDATE pain_entries.ops_alert_sent_at.
// =====================================================

// CRITICAL: Mock db BEFORE any imports
jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

// Мокаем utils/opsAlert чтобы не дёргать реальный Telegram в тестах
jest.mock('../../utils/opsAlert', () => ({
  sendOpsAlert: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../server');
const { query, getClient } = require('../../database/db');
const { sendOpsAlert } = require('../../utils/opsAlert');
const jwt = require('jsonwebtoken');

const testPatient = { id: 14, email: 'avi707@mail.ru', full_name: 'Тест Пациент' };
const patientToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const instructorUser = { id: 1, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(instructorUser, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Удобная фабрика mock-клиента для getClient()
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
// GET /api/rehab/my/pain-locations
// =====================================================

describe('GET /api/rehab/my/pain-locations', () => {
  it('возвращает локации program_type активной программы пациента', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ program_type: 'acl' }] }) // rehab_programs lookup
      .mockResolvedValueOnce({
        rows: [
          { code: 'knee_anterior', program_type: 'acl', label: 'Передняя', position: 10, is_red_flag: false },
          { code: 'calf_posterior', program_type: 'acl', label: 'Икроножная', position: 80, is_red_flag: true },
        ],
      });

    const res = await request(app)
      .get('/api/rehab/my/pain-locations')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('возвращает пустой массив если у пациента нет активной программы', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/rehab/my/pain-locations')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('требует auth (401 без токена)', async () => {
    const res = await request(app).get('/api/rehab/my/pain-locations');
    expect(res.status).toBe(401);
  });
});

// =====================================================
// POST /api/rehab/my/pain/daily — UPSERT
// =====================================================

describe('POST /api/rehab/my/pain/daily', () => {
  it('400 — vas_score обязателен', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ notes: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/vas_score/);
  });

  it('400 — vas_score вне диапазона 0..10', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 15 });
    expect(res.status).toBe(400);
  });

  it('400 — notes слишком длинный', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, notes: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
  });

  it('400 — pain_character не массив (HF#9 v2)', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, pain_character: 'sharp' }); // string, не array
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/должен быть массивом/);
  });

  it('400 — pain_character пустой массив', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, pain_character: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/пустой массив/);
  });

  it('400 — pain_character содержит невалидный элемент', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, pain_character: ['sharp', 'totally_invalid'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/totally_invalid/);
  });

  it('INSERT новой daily с pain_character массивом нескольких значений', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // FOR UPDATE
      .mockResolvedValueOnce({
        rows: [
          {
            id: 110, patient_id: 14, vas_score: 5, is_event: false,
            entry_date: '2026-05-18', created_at: new Date(),
            pain_character: ['sharp', 'burning'], red_flag_triggered: false,
          },
        ],
      }) // INSERT
      .mockResolvedValueOnce(undefined) // DELETE pain_entry_locations
      .mockResolvedValueOnce(undefined); // COMMIT

    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, pain_character: ['sharp', 'burning'] });

    expect(res.status).toBe(201);
    // Подтверждаем что INSERT получил массив (не строку)
    const insertCall = mc.query.mock.calls.find((c) => /^\s*INSERT INTO pain_entries/.test(c[0]));
    expect(insertCall[1]).toEqual(expect.arrayContaining([['sharp', 'burning']]));
  });

  it('INSERT новой daily (нет существующей) — без red-flag', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // FOR UPDATE — нет existing
      .mockResolvedValueOnce({
        rows: [
          {
            id: 100, patient_id: 14, vas_score: 5, is_event: false,
            entry_date: '2026-05-18', created_at: new Date(), notes: 'OK',
            red_flag_triggered: false,
          },
        ],
      }) // INSERT pain_entries
      .mockResolvedValueOnce(undefined) // DELETE pain_entry_locations
      .mockResolvedValueOnce(undefined); // COMMIT

    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, notes: 'OK' });

    expect(res.status).toBe(201);
    expect(res.body.data.is_event).toBe(false);
    expect(res.body.data.ops_alert_id).toBeNull();
    expect(sendOpsAlert).not.toHaveBeenCalled();
  });

  it('UPDATE существующей daily (UPSERT повторный submit)', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 100, created_at: new Date(), red_flag_triggered: false }],
      }) // FOR UPDATE — found
      .mockResolvedValueOnce({
        rows: [{ id: 100, patient_id: 14, vas_score: 7, is_event: false, red_flag_triggered: false }],
      }) // UPDATE
      .mockResolvedValueOnce(undefined) // DELETE pain_entry_locations
      .mockResolvedValueOnce(undefined); // COMMIT

    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 7 });

    expect(res.status).toBe(201);
    const updateCall = mc.query.mock.calls.find(c => /UPDATE pain_entries[\s\S]*?SET vas_score/.test(c[0]));
    expect(updateCall).toBeDefined();
    // id того же
    expect(res.body.data.id).toBe(100);
  });

  it('red-flag в daily — sendOpsAlert вызван + INSERT ops_alerts + UPDATE ops_alert_sent_at', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ code: 'calf_posterior', label: 'Икроножная', position: 80, is_red_flag: true, red_flag_reason: 'ТГВ' }],
      }) // locations check
      .mockResolvedValueOnce({ rows: [] }) // FOR UPDATE — нет existing
      .mockResolvedValueOnce({
        rows: [
          {
            id: 101, patient_id: 14, vas_score: 8, is_event: false,
            entry_date: '2026-05-18', created_at: new Date(),
            red_flag_triggered: true, notes: 'икра болит',
          },
        ],
      }) // INSERT pain_entries
      .mockResolvedValueOnce(undefined) // DELETE locations
      .mockResolvedValueOnce(undefined) // INSERT pain_entry_locations
      .mockResolvedValueOnce(undefined); // COMMIT

    query
      .mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'Тест', phone: '+7900' }] }) // patient lookup
      .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // ops_alerts INSERT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE pain_entries.ops_alert_sent_at

    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 8, location_codes: ['calf_posterior'], notes: 'икра болит' });

    expect(res.status).toBe(201);
    expect(sendOpsAlert).toHaveBeenCalledTimes(1);
    const [title, body] = sendOpsAlert.mock.calls[0];
    expect(title).toMatch(/RED FLAG/);
    expect(body).toMatch(/ТГВ/);
    expect(body).toMatch(/Daily diary/);
    expect(body).toMatch(/8\/10/);
    expect(res.body.data.ops_alert_id).toBe(200);
    expect(res.body.message).toMatch(/уведомление о красном флаге/);

    const setSentAt = query.mock.calls.find(c => /ops_alert_sent_at\s*=\s*NOW/.test(c[0]));
    expect(setSentAt).toBeDefined();
  });

  it('sticky red_flag — UPDATE сохраняет prev=true даже если новый submit без red-flag', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ code: 'knee_anterior', label: 'Передняя', position: 10, is_red_flag: false, red_flag_reason: null }],
      }) // locations
      .mockResolvedValueOnce({
        rows: [{ id: 100, created_at: new Date(), red_flag_triggered: true }], // prev red flag
      }) // FOR UPDATE
      .mockResolvedValueOnce({
        rows: [{ id: 100, vas_score: 3, is_event: false, red_flag_triggered: true }],
      }) // UPDATE
      .mockResolvedValueOnce(undefined) // DELETE locations
      .mockResolvedValueOnce(undefined) // INSERT location
      .mockResolvedValueOnce(undefined); // COMMIT

    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 3, location_codes: ['knee_anterior'] });

    expect(res.status).toBe(201);
    const updateCall = mc.query.mock.calls.find(c => /UPDATE pain_entries[\s\S]*?SET vas_score/.test(c[0]));
    // 5-й параметр UPDATE (индекс 4) — red_flag_triggered — должен быть true (sticky)
    expect(updateCall[1][4]).toBe(true);
    // sendOpsAlert не вызван — newRedFlag=false, sticky только сохраняет старый флаг
    expect(sendOpsAlert).not.toHaveBeenCalled();
  });

  it('400 — неизвестная локация в location_codes', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ code: 'knee_anterior', label: 'X', is_red_flag: false }],
      }); // только 1 из 2 найден

    const res = await request(app)
      .post('/api/rehab/my/pain/daily')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, location_codes: ['knee_anterior', 'fake_loc'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fake_loc/);
  });
});

// =====================================================
// POST /api/rehab/my/pain/event — INSERT (multiple per day)
// =====================================================

describe('POST /api/rehab/my/pain/event', () => {
  it('400 — location_codes обязательны для event', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/location_codes/);
  });

  it('400 — пустой location_codes', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, location_codes: [] });
    expect(res.status).toBe(400);
  });

  it('400 — больше 16 локаций', async () => {
    const codes = Array.from({ length: 17 }, (_, i) => `loc_${i}`);
    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, location_codes: codes });
    expect(res.status).toBe(400);
  });

  it('event без red-flag — INSERT с is_event=true, без sendOpsAlert', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ code: 'knee_anterior', label: 'Передняя', position: 10, is_red_flag: false }],
      }) // locations
      .mockResolvedValueOnce({
        rows: [
          {
            id: 200, patient_id: 14, vas_score: 6, is_event: true,
            red_flag_triggered: false, created_at: new Date(),
            trigger_type: 'after_exercise',
          },
        ],
      }) // INSERT
      .mockResolvedValueOnce(undefined) // INSERT location junction
      .mockResolvedValueOnce(undefined); // COMMIT

    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 6, location_codes: ['knee_anterior'], trigger_type: 'after_exercise' });

    expect(res.status).toBe(201);
    expect(res.body.data.is_event).toBe(true);
    expect(sendOpsAlert).not.toHaveBeenCalled();
    expect(res.body.data.ops_alert_id).toBeNull();
  });

  it('event с red-flag → Telegram body содержит "Pain Event" mode + reason', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            code: 'neck_lateral', label: 'Шея боковая', position: 20,
            is_red_flag: true, red_flag_reason: 'цервикальная радикулопатия',
          },
        ],
      }) // locations
      .mockResolvedValueOnce({
        rows: [
          {
            id: 201, patient_id: 14, vas_score: 9, is_event: true,
            created_at: new Date(), trigger_type: 'at_night',
            notes: 'острая боль', red_flag_triggered: true,
          },
        ],
      }) // INSERT
      .mockResolvedValueOnce(undefined) // INSERT location junction
      .mockResolvedValueOnce(undefined); // COMMIT

    query
      .mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'X', phone: '+7900' }] }) // patient lookup
      .mockResolvedValueOnce({ rows: [{ id: 300 }] }) // ops_alerts INSERT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE ops_alert_sent_at

    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        vas_score: 9,
        location_codes: ['neck_lateral'],
        trigger_type: 'at_night',
        notes: 'острая боль',
      });

    expect(res.status).toBe(201);
    expect(sendOpsAlert).toHaveBeenCalled();
    const [, body] = sendOpsAlert.mock.calls[0];
    expect(body).toMatch(/Pain Event/);
    expect(body).toMatch(/цервикальная радикулопатия/);
    // trigger_type → русский лейбл (at_night → 'ночью'), не enum code
    expect(body).toMatch(/Триггер: ночью/);
    expect(body).not.toMatch(/at_night/);
    expect(res.body.data.ops_alert_id).toBe(300);
  });

  it('Telegram alert содержит русский лейбл pain_character (не enum code)', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          { code: 'calf_posterior', label: 'Икроножная', position: 80, is_red_flag: true, red_flag_reason: 'ТГВ' },
        ],
      }) // locations
      .mockResolvedValueOnce({
        rows: [
          {
            id: 202, patient_id: 14, vas_score: 7, is_event: true,
            created_at: new Date(),
            // HF#9 v2 — pain_character теперь массив
            pain_character: ['burning', 'throbbing'], red_flag_triggered: true,
          },
        ],
      }) // INSERT
      .mockResolvedValueOnce(undefined) // INSERT location junction
      .mockResolvedValueOnce(undefined); // COMMIT

    query
      .mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'X', phone: '+7900' }] })
      .mockResolvedValueOnce({ rows: [{ id: 301 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        vas_score: 7,
        location_codes: ['calf_posterior'],
        pain_character: ['burning', 'throbbing'],
      });

    expect(res.status).toBe(201);
    const [, body] = sendOpsAlert.mock.calls[0];
    // Multi-character → русские labels join'ом ", ": burning='жгучая', throbbing='пульсирующая'
    expect(body).toMatch(/Характер: жгучая, пульсирующая/);
    expect(body).not.toMatch(/Характер: burning/);
  });

  it('event с photo_url сохраняется в INSERT', async () => {
    const mc = makeMockClient();
    getClient.mockResolvedValueOnce(mc);
    mc.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ code: 'knee_anterior', label: 'X', position: 10, is_red_flag: false }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 202, vas_score: 5, is_event: true, photo_url: '/uploads/pain_202.jpg', red_flag_triggered: false, created_at: new Date() },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        vas_score: 5,
        location_codes: ['knee_anterior'],
        photo_url: '/uploads/pain_202.jpg',
      });

    expect(res.status).toBe(201);
    const insertCall = mc.query.mock.calls.find(c => /^\s*INSERT INTO pain_entries/.test(c[0]));
    expect(insertCall[1]).toContain('/uploads/pain_202.jpg');
  });

  it('400 — pain_character в event не массив', async () => {
    const res = await request(app)
      .post('/api/rehab/my/pain/event')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ vas_score: 5, location_codes: ['knee_anterior'], pain_character: 'sharp' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/должен быть массивом/);
  });
});

// =====================================================
// GET /api/rehab/my/pain — history with type filter
// =====================================================

describe('GET /api/rehab/my/pain', () => {
  it('пациент получает свою историю — type=all default', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          { id: 1, vas_score: 5, is_event: false, locations: [] },
          { id: 2, vas_score: 8, is_event: true, locations: [] },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ cnt: 2 }] });

    const res = await request(app)
      .get('/api/rehab/my/pain')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('type=daily — фильтрует is_event=FALSE', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, is_event: false }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });

    const res = await request(app)
      .get('/api/rehab/my/pain?type=daily')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(/is_event\s*=\s*FALSE/);
    expect(query.mock.calls[1][0]).toMatch(/is_event\s*=\s*FALSE/);
  });

  it('type=event — фильтрует is_event=TRUE', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 2, is_event: true }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });

    const res = await request(app)
      .get('/api/rehab/my/pain?type=event')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(/is_event\s*=\s*TRUE/);
  });

  it('type невалидный — 400', async () => {
    const res = await request(app)
      .get('/api/rehab/my/pain?type=wrong')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(400);
  });

  it('инструктор без patient_id — 400', async () => {
    // Mock auth middleware DB-проверки is_active для инструктора
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });

    const res = await request(app)
      .get('/api/rehab/my/pain')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/patient_id обязателен/);
  });

  it('limit/offset передаются в SQL', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    await request(app)
      .get('/api/rehab/my/pain?limit=10&offset=20')
      .set('Authorization', `Bearer ${patientToken}`);

    const [, params] = query.mock.calls[0];
    expect(params[1]).toBe(10);
    expect(params[2]).toBe(20);
  });

  // HF#10 Fix A — entry_date::text без timezone shift
  it('entry_date возвращается как text (без timezone shift)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    await request(app)
      .get('/api/rehab/my/pain?type=daily')
      .set('Authorization', `Bearer ${patientToken}`);

    const [sql] = query.mock.calls[0];
    // PG DATE → pg-node JS Date → JSON UTC ISO сдвигает дату на -1 в RU (+05).
    // ::text возвращает 'YYYY-MM-DD' буквально, без timezone роли.
    expect(sql).toMatch(/pe\.entry_date::text\s+AS\s+entry_date/);
  });
});

// =====================================================
// GET /rehab/my/ops-alerts/recent — Wave 2 #2.05 для dedup UX
// =====================================================

describe('GET /api/rehab/my/ops-alerts/recent', () => {
  it('возвращает recent red-flag alerts за час по умолчанию', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, alert_type: 'red_flag_pain', severity: 'high', source_entity_id: 50, created_at: new Date() },
      ],
    });

    const res = await request(app)
      .get('/api/rehab/my/ops-alerts/recent')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    // default 1 hour должно быть в params
    expect(query.mock.calls[0][1]).toEqual([14, 1]);
  });

  it('hours param custom (3 часа)', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/rehab/my/ops-alerts/recent?hours=3')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(query.mock.calls[0][1]).toEqual([14, 3]);
  });

  it('hours param clamp (0 → 1, 99 → 24)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/rehab/my/ops-alerts/recent?hours=0')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(query.mock.calls[0][1]).toEqual([14, 1]);

    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/rehab/my/ops-alerts/recent?hours=99')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(query.mock.calls[1][1]).toEqual([14, 24]);
  });
});
