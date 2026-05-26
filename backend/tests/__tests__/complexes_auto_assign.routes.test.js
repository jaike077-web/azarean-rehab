// =====================================================
// TEST: POST /api/complexes — auto-assign инструктора пациенту
// Wave 3 C1 — Step 2
//
// После INSERT INTO complexes route делает UPDATE patients SET assigned_instructor_id
// WHERE id=$2 AND assigned_instructor_id IS NULL — те. проставляет только если
// у пациента ещё нет ответственного. Второй комплекс другим инструктором —
// no-op для assigned_instructor_id.
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
  { id: 1, email: 'inst1@test.com', role: 'instructor' },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

const otherInstructorToken = jwt.sign(
  { id: 2, email: 'inst2@test.com', role: 'instructor' },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

beforeEach(() => {
  jest.clearAllMocks();
  // auth middleware is_active check
  query.mockResolvedValueOnce({ rows: [{ is_active: true }] });
});

function makeMockClient() {
  return { query: jest.fn(), release: jest.fn() };
}

describe('POST /api/complexes — auto-assign instructor (Wave 3 C1)', () => {
  it('после INSERT комплекса проставляет assigned_instructor_id если пациент без ответственного', async () => {
    const client = makeMockClient();
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/INSERT INTO complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 100 }] });
      if (/UPDATE patients/i.test(sql)) return Promise.resolve({ rows: [], rowCount: 1 });
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);
    // fullComplexResult SELECT (вне транзакции, через top-level `query`)
    query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

    const res = await request(app)
      .post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: 14,
        title: 'Тест',
        exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
      });

    expect(res.status).toBe(201);

    // UPDATE patients SET assigned_instructor_id = $1 WHERE id = $2 AND assigned_instructor_id IS NULL
    const updateCall = client.query.mock.calls.find(([sql]) =>
      /UPDATE patients[\s\S]*SET assigned_instructor_id/i.test(sql)
    );
    expect(updateCall).toBeTruthy();
    // SQL содержит guard
    expect(updateCall[0]).toMatch(/assigned_instructor_id IS NULL/i);
    // params: [instructor_id из req.user.id, patient_id]
    expect(updateCall[1]).toEqual([1, 14]);
  });

  it('UPDATE patients идёт ВНУТРИ транзакции (через client.query), не через top-level query', async () => {
    const client = makeMockClient();
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/INSERT INTO complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 100 }] });
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);
    query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

    await request(app)
      .post('/api/complexes')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: 14,
        title: 'Тест',
        exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
      });

    // top-level query вызывается только дважды (auth + fullComplex SELECT) —
    // UPDATE patients НЕ через query(), а через client.query()
    const topLevelUpdates = query.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /UPDATE patients[\s\S]*assigned_instructor_id/i.test(sql)
    );
    expect(topLevelUpdates).toHaveLength(0);

    const clientUpdates = client.query.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /UPDATE patients[\s\S]*assigned_instructor_id/i.test(sql)
    );
    expect(clientUpdates).toHaveLength(1);
  });

  it('второй комплекс другим инструктором НЕ перезаписывает (rowCount=0, но SQL вызывается с IS NULL guard)', async () => {
    // У этого пациента уже есть assigned_instructor_id=1, второй инструктор (id=2)
    // создаёт комплекс — UPDATE с IS NULL guard просто ничего не обновит на БД-уровне.
    // Тест проверяет что SQL ВСЁ ЕЩЁ вызывается с правильным guard'ом (защита
    // от того что guard убрали и стали перезаписывать).
    const client = makeMockClient();
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve();
      if (/SELECT id FROM patients/i.test(sql)) return Promise.resolve({ rows: [{ id: 14 }] });
      if (/INSERT INTO complexes/i.test(sql)) return Promise.resolve({ rows: [{ id: 101 }] });
      // Реальная БД с IS NULL guard вернула бы rowCount=0 — назначение не перезаписалось
      if (/UPDATE patients/i.test(sql)) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve({ rows: [] });
    });
    getClient.mockResolvedValueOnce(client);
    query.mockResolvedValueOnce({ rows: [{ id: 101 }] });

    const res = await request(app)
      .post('/api/complexes')
      .set('Authorization', `Bearer ${otherInstructorToken}`)
      .send({
        patient_id: 14,
        title: 'Второй',
        exercises: [{ exercise_id: 1, order_number: 1, sets: 3, reps: 10 }],
      });

    expect(res.status).toBe(201);

    const updateCall = client.query.mock.calls.find(([sql]) =>
      /UPDATE patients[\s\S]*assigned_instructor_id/i.test(sql)
    );
    expect(updateCall).toBeTruthy();
    // Guard на месте — это единственная гарантия что мы не перезатрём
    expect(updateCall[0]).toMatch(/assigned_instructor_id IS NULL/i);
    // instructor_id = 2 (otherInstructor) — корректно передан в params
    expect(updateCall[1][0]).toBe(2);
  });
});
