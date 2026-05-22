// =====================================================
// TEST: Measurements endpoints (Wave 2 коммит 2.06)
// =====================================================
// Покрывает: POST /my/measurements/rom (8 types × validation paths),
// POST /my/measurements/girth (7 types, value_cm range), GET /my/measurements
// (type/program_id/since/limit фильтры + timezone rule #27 verify).
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
const patientToken = jwt.sign(
  testPatient,
  process.env.PATIENT_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// POST /api/rehab/my/measurements/rom
// =====================================================

describe('POST /api/rehab/my/measurements/rom', () => {
  it('valid degrees → 201 + value_degrees + measured_by=patient_self + measured_at как string', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 1, patient_id: 14, program_id: null,
        measurement_type: 'knee_flexion_degrees', side: 'L',
        value_degrees: '120.0', value_cm: null, value_categorical: null,
        measured_by: 'patient_self', measurement_session_id: null, notes: null,
        measured_at: '2026-05-19', // ::text вернул YYYY-MM-DD string
        created_at: new Date('2026-05-19T13:00:00Z'),
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_flexion_degrees', side: 'L', value: 120 });

    expect(res.status).toBe(201);
    expect(res.body.data.value_degrees).toBe('120.0');
    expect(res.body.data.measured_by).toBe('patient_self');
    expect(res.body.data.measured_at).toBe('2026-05-19');
    // Не ISO timestamp — timezone rule #27 verify
    expect(res.body.data.measured_at).not.toMatch(/T\d{2}:\d{2}/);
  });

  it('valid cm (knee_flexion_hbd_cm) → 201, value_cm заполнено, остальные null', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 2, measurement_type: 'knee_flexion_hbd_cm', side: 'R',
        value_degrees: null, value_cm: '12.50', value_categorical: null,
        measured_by: 'patient_self', measured_at: '2026-05-19',
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_flexion_hbd_cm', side: 'R', value: 12.5 });

    expect(res.status).toBe(201);
    expect(res.body.data.value_cm).toBe('12.50');
    expect(res.body.data.value_degrees).toBeNull();
    expect(res.body.data.value_categorical).toBeNull();
  });

  it('valid categorical HBB (shoulder_hbb_categorical + L3) → 201, value_categorical=L3', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 3, measurement_type: 'shoulder_hbb_categorical', side: 'R',
        value_degrees: null, value_cm: null, value_categorical: 'L3',
        measured_by: 'patient_self', measured_at: '2026-05-19',
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'shoulder_hbb_categorical', side: 'R', value: 'L3' });

    expect(res.status).toBe(201);
    expect(res.body.data.value_categorical).toBe('L3');
  });

  it('invalid measurement_type → 400 VALIDATION_ERROR со списком', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'foo_bar_degrees', side: 'L', value: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/knee_flexion_degrees/);
    expect(query).not.toHaveBeenCalled();
  });

  it('invalid side → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_flexion_degrees', side: 'X', value: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/L.*R/);
    expect(query).not.toHaveBeenCalled();
  });

  it('degrees out of range (500) → 400', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_flexion_degrees', side: 'L', value: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  it('categorical invalid vertebra (Z99) → 400', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'shoulder_hbb_categorical', side: 'L', value: 'Z99' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  it('non-numeric value для degrees → 400', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_flexion_degrees', side: 'L', value: 'abc' });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('measurement_session_id передан → сохраняется в INSERT', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 4, measurement_type: 'knee_flexion_degrees', side: 'L',
        value_degrees: '100.0', measured_by: 'patient_self',
        measurement_session_id: 1716100000000, measured_at: '2026-05-19',
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        measurement_type: 'knee_flexion_degrees', side: 'L', value: 100,
        measurement_session_id: 1716100000000,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.measurement_session_id).toBe(1716100000000);
    // Проверяем что session_id попал в params SQL
    const params = query.mock.calls[0][1];
    expect(params).toContain(1716100000000);
  });

  it('program_id FK violation (23503) → 400 FK_VIOLATION', async () => {
    const fkErr = new Error('fk violation');
    fkErr.code = '23503';
    query.mockRejectedValueOnce(fkErr);

    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        measurement_type: 'knee_flexion_degrees', side: 'L', value: 100,
        program_id: 99999,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('FK_VIOLATION');
  });

  it('program_id <= 0 → 400 VALIDATION_ERROR (без SQL hit)', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        measurement_type: 'knee_flexion_degrees', side: 'L', value: 100,
        program_id: -5,
      });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

// =====================================================
// POST /api/rehab/my/measurements/girth
// =====================================================

describe('POST /api/rehab/my/measurements/girth', () => {
  it('valid → 201 + NUMERIC(5,2) сохранён', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 10, measurement_type: 'knee_joint_line_cm', side: 'L',
        value_cm: '42.50', measured_by: 'patient_self',
        measured_at: '2026-05-19',
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_joint_line_cm', side: 'L', value_cm: 42.5 });

    expect(res.status).toBe(201);
    expect(res.body.data.value_cm).toBe('42.50');
    expect(res.body.data.measured_at).toBe('2026-05-19');
  });

  it('ROM type попал в girth (knee_flexion_degrees) → 400 (НЕ shared whitelist)', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_flexion_degrees', side: 'L', value_cm: 42.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  it('value_cm <= 0 → 400 (CHECK strict exclusive)', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_joint_line_cm', side: 'L', value_cm: 0 });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('value_cm >= 200 → 400', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_joint_line_cm', side: 'R', value_cm: 200 });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('invalid side → 400', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'knee_joint_line_cm', side: 'BOTH', value_cm: 42.5 });

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('measured_by в response = patient_self', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 11, measurement_type: 'shoulder_mid_deltoid_cm', side: 'R',
        value_cm: '35.20', measured_by: 'patient_self',
        measured_at: '2026-05-19',
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ measurement_type: 'shoulder_mid_deltoid_cm', side: 'R', value_cm: 35.2 });

    expect(res.status).toBe(201);
    expect(res.body.data.measured_by).toBe('patient_self');
    // Sanity — INSERT SQL включает 'patient_self' literal (girth CHECK enum допускает только 2)
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/'patient_self'/);
  });
});

// =====================================================
// GET /api/rehab/my/measurements
// =====================================================

describe('GET /api/rehab/my/measurements', () => {
  it('default (type=all) → data.rom + data.girth + total', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, measurement_type: 'knee_flexion_degrees', measured_at: '2026-05-19' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, measurement_type: 'knee_joint_line_cm', measured_at: '2026-05-19' }] });

    const res = await request(app)
      .get('/api/rehab/my/measurements')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rom).toHaveLength(1);
    expect(res.body.data.girth).toHaveLength(1);
    expect(res.body.total).toBe(2);
  });

  it('type=rom → только rom, girth НЕ query\'ится', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app)
      .get('/api/rehab/my/measurements?type=rom')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rom).toHaveLength(1);
    expect(res.body.data.girth).toHaveLength(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/rom_measurements/);
  });

  it('type=girth → только girth', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const res = await request(app)
      .get('/api/rehab/my/measurements?type=girth')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.girth).toHaveLength(1);
    expect(res.body.data.rom).toHaveLength(0);
    expect(query.mock.calls[0][0]).toMatch(/girth_measurements/);
  });

  it('invalid type → 400', async () => {
    const res = await request(app)
      .get('/api/rehab/my/measurements?type=wrong')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('program_id filter → попадает в SQL params', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/rehab/my/measurements?program_id=42')
      .set('Authorization', `Bearer ${patientToken}`);

    const romParams = query.mock.calls[0][1];
    expect(romParams).toContain(42);
    expect(query.mock.calls[0][0]).toMatch(/program_id = \$\d/);
  });

  it('since filter валидный → попадает в SQL', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/rehab/my/measurements?since=2026-05-01')
      .set('Authorization', `Bearer ${patientToken}`);

    const params = query.mock.calls[0][1];
    expect(params).toContain('2026-05-01');
    expect(query.mock.calls[0][0]).toMatch(/measured_at >= \$\d::date/);
  });

  it('since невалидный формат → 400', async () => {
    const res = await request(app)
      .get('/api/rehab/my/measurements?since=05/19/2026')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('limit передаётся как последний param + clamp 500', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/rehab/my/measurements?limit=9999')
      .set('Authorization', `Bearer ${patientToken}`);

    const params = query.mock.calls[0][1];
    expect(params[params.length - 1]).toBe(500); // clamp max
  });

  it('SELECT содержит measured_at::text (timezone rule #27)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/rehab/my/measurements')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(query.mock.calls[0][0]).toMatch(/measured_at::text\s+AS\s+measured_at/);
    expect(query.mock.calls[1][0]).toMatch(/measured_at::text\s+AS\s+measured_at/);
  });
});

// =====================================================
// Cross-cutting — auth + cross-patient isolation
// =====================================================

describe('Measurements auth + isolation', () => {
  it('POST rom без JWT → 401', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .send({ measurement_type: 'knee_flexion_degrees', side: 'L', value: 100 });

    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('GET без JWT → 401', async () => {
    const res = await request(app).get('/api/rehab/my/measurements');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('patient_id в body НЕ переопределяет req.patient.id из middleware', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 99, patient_id: 14, // backend всегда пишет req.patient.id=14
        measurement_type: 'knee_flexion_degrees', side: 'L',
        value_degrees: '100.0', measured_by: 'patient_self',
        measured_at: '2026-05-19',
      }],
    });

    await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        patient_id: 9999, // попытка inject — должна игнорироваться
        measurement_type: 'knee_flexion_degrees', side: 'L', value: 100,
      });

    // Первый param — patient_id из middleware (14), НЕ 9999
    const params = query.mock.calls[0][1];
    expect(params[0]).toBe(14);
    expect(params).not.toContain(9999);
  });
});

// =====================================================
// HF#11 — measurement_session_id BIGINT range (Date.now() millis)
// =====================================================

describe('measurement_session_id BIGINT range (HF#11)', () => {
  const UNIX_MILLIS = 1716100000000; // 13 digits, был overflow int4 в 2.06

  it('POST rom принимает Date.now() millis как session_id', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 100, patient_id: 14,
        measurement_type: 'knee_flexion_degrees', side: 'L',
        value_degrees: '120.0', value_cm: null, value_categorical: null,
        measured_by: 'patient_self',
        measurement_session_id: UNIX_MILLIS,
        measured_at: '2026-05-19',
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        measurement_type: 'knee_flexion_degrees',
        side: 'L',
        value: 120,
        measurement_session_id: UNIX_MILLIS,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.measurement_session_id).toBe(UNIX_MILLIS);
    // Подтверждение что в INSERT params попал именно millis (а не truncated int4)
    const params = query.mock.calls[0][1];
    expect(params).toContain(UNIX_MILLIS);
  });

  it('POST girth принимает Date.now() millis как session_id', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 101, measurement_type: 'knee_joint_line_cm', side: 'R',
        value_cm: '42.50', measured_by: 'patient_self',
        measurement_session_id: UNIX_MILLIS,
        measured_at: '2026-05-19',
      }],
    });

    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        measurement_type: 'knee_joint_line_cm',
        side: 'R',
        value_cm: 42.5,
        measurement_session_id: UNIX_MILLIS,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.measurement_session_id).toBe(UNIX_MILLIS);
  });

  it('GET возвращает measurement_session_id как Number (setTypeParser активен)', async () => {
    // Mock симулирует pg-node после setTypeParser (BIGINT → Number)
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 100, measurement_type: 'knee_flexion_degrees', side: 'L',
          value_degrees: '120.0',
          measurement_session_id: UNIX_MILLIS, // Number, не string
          measured_at: '2026-05-19',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/rehab/my/measurements?type=rom')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    const entry = res.body.data.rom[0];
    expect(typeof entry.measurement_session_id).toBe('number');
    expect(entry.measurement_session_id).toBe(UNIX_MILLIS);
  });
});
