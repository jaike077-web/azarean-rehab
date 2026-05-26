// =====================================================
// TEST: PATCH /api/patients/:id/assign-instructor
// Wave 3 C1 — Step 3
//
// Admin-only endpoint для переназначения ответственного инструктора пациента.
// Audit через logAudit(req, 'PATIENT_REASSIGNED', 'patient', patientId,
//   { patientId, details: { from_user_id, to_user_id, reason } }).
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
const { query } = require('../../database/db');

const adminToken = jwt.sign(
  { id: 1, email: 'admin@test.com', role: 'admin' },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

const instructorToken = jwt.sign(
  { id: 2, email: 'inst@test.com', role: 'instructor' },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PATCH /api/patients/:id/assign-instructor', () => {
  it('admin: 200 + UPDATE + audit PATIENT_REASSIGNED с from/to/reason в details', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })  // auth middleware
      .mockResolvedValueOnce({ rows: [{ id: 14, assigned_instructor_id: 3 }] })  // SELECT patient
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })  // SELECT user (new instructor)
      .mockResolvedValueOnce({ rows: [{ id: 14, assigned_instructor_id: 5 }] })  // UPDATE patients
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // audit INSERT

    const res = await request(app)
      .patch('/api/patients/14/assign-instructor')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructor_id: 5, reason: 'инструктор уволен' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 14, assigned_instructor_id: 5 });
    expect(res.body.message).toBe('Инструктор назначен');

    // UPDATE patients SET assigned_instructor_id = $1, updated_at = NOW() WHERE id = $2
    const updateCall = query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /UPDATE patients[\s\S]*SET assigned_instructor_id/i.test(sql)
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall[1]).toEqual([5, 14]);

    // Audit INSERT — последний query call. Сигнатура INSERT INTO audit_logs
    // (user_id, action, entity_type, entity_id, patient_id, ip, ua, details::json).
    const auditCall = query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /INSERT INTO audit_logs/i.test(sql)
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[1][1]).toBe('PATIENT_REASSIGNED');
    expect(auditCall[1][2]).toBe('patient');
    expect(auditCall[1][3]).toBe(14);  // entity_id
    expect(auditCall[1][4]).toBe(14);  // patient_id
    // details JSON: { from_user_id, to_user_id, reason }
    const details = JSON.parse(auditCall[1][7]);
    expect(details.from_user_id).toBe(3);
    expect(details.to_user_id).toBe(5);
    expect(details.reason).toBe('инструктор уволен');
  });

  it('admin без reason → details.reason = null', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 14, assigned_instructor_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 14, assigned_instructor_id: 5 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .patch('/api/patients/14/assign-instructor')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructor_id: 5 });

    const auditCall = query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /INSERT INTO audit_logs/i.test(sql)
    );
    const details = JSON.parse(auditCall[1][7]);
    expect(details.from_user_id).toBeNull();
    expect(details.to_user_id).toBe(5);
    expect(details.reason).toBeNull();
  });

  it('instructor (non-admin) → 403', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });  // auth middleware

    const res = await request(app)
      .patch('/api/patients/14/assign-instructor')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ instructor_id: 5 });

    expect(res.status).toBe(403);
  });

  it('несуществующий пациент → 404', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [] });  // patient SELECT — пусто

    const res = await request(app)
      .patch('/api/patients/9999/assign-instructor')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructor_id: 5 });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Пациент не найден/i);
  });

  it('несуществующий instructor_id → 404', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 14, assigned_instructor_id: 3 }] })
      .mockResolvedValueOnce({ rows: [] });  // user SELECT — пусто

    const res = await request(app)
      .patch('/api/patients/14/assign-instructor')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructor_id: 9999 });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Инструктор не найден/i);
  });

  it('instructor_id не число → 400', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });

    const res = await request(app)
      .patch('/api/patients/14/assign-instructor')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructor_id: 'abc' });

    expect(res.status).toBe(400);
  });

  it('instructor_id отсутствует → 400', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });

    const res = await request(app)
      .patch('/api/patients/14/assign-instructor')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it(':id не число → 400', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });

    const res = await request(app)
      .patch('/api/patients/abc/assign-instructor')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ instructor_id: 5 });

    expect(res.status).toBe(400);
  });
});
