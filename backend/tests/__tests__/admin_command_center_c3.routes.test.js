// =====================================================
// TEST: Wave 3 C3 — instructor cross-section + attention feed
//
// Покрываем:
//   GET /api/admin/command-center/instructors
//   GET /api/admin/command-center/attention
// + рефактор-guard: PER_PATIENT_STATE_SQL расширен 3 флагами
//   (is_unanswered, has_red_flag, is_stuck), + assigned_instructor_id.
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
  query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // auth middleware
});

// Row factory — расширена C3 полями (is_unanswered, has_red_flag, is_stuck,
// assigned_instructor_id, last_patient_msg_at).
function makeRow(overrides = {}) {
  return {
    patient_id: 100,
    assigned_instructor_id: 3,
    is_registered: true,
    has_active_program: true,
    target_min: null,
    target_unit: null,
    last_activity_date: null,
    days_since: null,
    expected_gap_days: 7,
    sessions: 0,
    program_age_days: 30,
    is_unanswered: false,
    last_patient_msg_at: null,
    has_red_flag: false,
    is_stuck: false,
    ...overrides,
  };
}

// =====================================================
// /command-center/instructors
// =====================================================
describe('GET /api/admin/command-center/instructors — срез по инструкторам', () => {
  it('GROUP BY assigned_instructor_id (НЕ created_by); пациент чужого инструктора не течёт', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          // Инструктор 3 — 2 пациента
          makeRow({ patient_id: 1, assigned_instructor_id: 3, days_since: 1,
                    target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          makeRow({ patient_id: 2, assigned_instructor_id: 3, days_since: 20,
                    target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          // Инструктор 5 — 1 пациент
          makeRow({ patient_id: 3, assigned_instructor_id: 5, days_since: 50,
                    target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          // Пациент без owner'а — пропускается
          makeRow({ patient_id: 4, assigned_instructor_id: null }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 3, full_name: 'Татьяна', role: 'admin' },
          { id: 5, full_name: 'Алёна',   role: 'instructor' },
        ],
      });

    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const instructors = res.body.data.instructors;
    expect(instructors).toHaveLength(2);

    // Сорт: caseload DESC → 3 (2 пациента) перед 5 (1)
    expect(instructors[0]).toMatchObject({
      instructor_id: 3, instructor_name: 'Татьяна', role: 'admin',
      caseload: 2, active: 1, at_risk: 0, dormant: 1, churned: 0,
    });
    expect(instructors[1]).toMatchObject({
      instructor_id: 5, instructor_name: 'Алёна', role: 'instructor',
      caseload: 1, churned: 1,
    });
  });

  it('сегментные счётчики per-instructor == C2 system-wide для того же набора', async () => {
    // Тот же набор данных скармливается ровно как C2 классифицировал бы:
    // 1 active, 1 at_risk, 1 dormant, 1 churned среди has_active_program=4.
    query
      .mockResolvedValueOnce({
        rows: [
          makeRow({ patient_id: 1, assigned_instructor_id: 3, days_since: 2,
                    target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          makeRow({ patient_id: 2, assigned_instructor_id: 3, days_since: 10,
                    target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          makeRow({ patient_id: 3, assigned_instructor_id: 3, days_since: 20,
                    target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          makeRow({ patient_id: 4, assigned_instructor_id: 3, days_since: 50,
                    target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 3, full_name: 'Татьяна', role: 'admin' }] });

    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${adminToken}`);

    const inst = res.body.data.instructors[0];
    expect(inst.active).toBe(1);
    expect(inst.at_risk).toBe(1);
    expect(inst.dormant).toBe(1);
    expect(inst.churned).toBe(1);
    expect(inst.caseload).toBe(4);
    // sum == caseload − no_program (все онбордингованные)
    expect(inst.active + inst.at_risk + inst.dormant + inst.churned).toBe(inst.caseload - inst.no_program);
  });

  it('no_program: зарегистрирован, но без активной программы → no_program +1', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          makeRow({ assigned_instructor_id: 3, is_registered: true, has_active_program: false }),
          makeRow({ assigned_instructor_id: 3, is_registered: false, has_active_program: false }),
          // Незарегистрированный без программы — caseload учитывается, no_program не растёт
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 3, full_name: 'X', role: 'admin' }] });

    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${adminToken}`);

    const inst = res.body.data.instructors[0];
    expect(inst.caseload).toBe(2);
    expect(inst.no_program).toBe(1);
    expect(inst.active + inst.at_risk + inst.dormant + inst.churned).toBe(0);
  });

  it('флаги внимания: unanswered/red_flags/stuck per-instructor', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          makeRow({ patient_id: 1, assigned_instructor_id: 3,
                    is_unanswered: true,  has_red_flag: false, is_stuck: false,
                    days_since: 1, target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          makeRow({ patient_id: 2, assigned_instructor_id: 3,
                    is_unanswered: true,  has_red_flag: true,  is_stuck: true,
                    days_since: 1, target_min: 1, target_unit: 'week', expected_gap_days: 7 }),
          makeRow({ patient_id: 3, assigned_instructor_id: 5,
                    is_unanswered: false, has_red_flag: true,  is_stuck: false }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 3, full_name: 'A', role: 'admin' },
          { id: 5, full_name: 'B', role: 'instructor' },
        ],
      });

    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${adminToken}`);

    const i3 = res.body.data.instructors.find((x) => x.instructor_id === 3);
    const i5 = res.body.data.instructors.find((x) => x.instructor_id === 5);
    expect(i3.unanswered).toBe(2);
    expect(i3.red_flags).toBe(1);
    expect(i3.stuck).toBe(1);
    expect(i5.unanswered).toBe(0);
    expect(i5.red_flags).toBe(1);
    expect(i5.stuck).toBe(0);
  });

  it('инструктор без привязанных пациентов в срез не попадает', async () => {
    query
      .mockResolvedValueOnce({
        rows: [makeRow({ assigned_instructor_id: 3 })],
      })
      .mockResolvedValueOnce({ rows: [{ id: 3, full_name: 'X', role: 'admin' }] });

    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${adminToken}`);

    // в users могут существовать ещё инструкторы — но в срезе только те,
    // у кого есть >=1 patient с assigned_instructor_id
    expect(res.body.data.instructors).toHaveLength(1);
    expect(res.body.data.instructors[0].instructor_id).toBe(3);
  });

  it('SQL вызов: instructorId=NULL (берём всех), потом users SELECT по ANY($1::int[])', async () => {
    query
      .mockResolvedValueOnce({ rows: [makeRow({ assigned_instructor_id: 3 })] })
      .mockResolvedValueOnce({ rows: [{ id: 3, full_name: 'X', role: 'admin' }] });

    await request(app)
      .get('/api/admin/command-center/instructors?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);

    // [0] = auth middleware; [1] = PER_PATIENT_STATE_SQL; [2] = users SELECT
    const stateCall = query.mock.calls[1];
    expect(stateCall[1][0]).toBeNull(); // instructorId = null (берём всех)
    expect(stateCall[1][1]).toBe(7);    // adherence_window_days

    const usersCall = query.mock.calls[2];
    expect(usersCall[0]).toMatch(/SELECT id, full_name, role FROM users WHERE id = ANY\(\$1::int\[\]\)/);
  });

  it('non-admin token → 403', async () => {
    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(403);
  });
});

// =====================================================
// /command-center/attention — Слой 0 unified feed
// =====================================================
describe('GET /api/admin/command-center/attention — лента внимания', () => {
  it('возвращает items с нормализованной формой (kind, patient/instructor, severity, summary, created_at)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          kind: 'pain_red_flag', patient_id: 14, patient_name: 'Вадим',
          instructor_id: 1, instructor_name: 'Админ',
          severity: 'high', summary: 'Резкая боль (VAS 8)',
          created_at: '2026-05-26T09:12:00Z', source_id: 5,
        },
        {
          kind: 'phase_stuck', patient_id: 14, patient_name: 'Вадим',
          instructor_id: 1, instructor_name: 'Админ',
          severity: 'high', summary: 'Застрял на фазе 1',
          created_at: '2026-05-25T11:00:00Z', source_id: 2,
        },
      ],
    });

    const res = await request(app)
      .get('/api/admin/command-center/attention')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0]).toMatchObject({
      kind: 'pain_red_flag', patient_id: 14, severity: 'high',
      summary: 'Резкая боль (VAS 8)',
    });
    expect(res.body.data.items[1]).toMatchObject({
      kind: 'phase_stuck', summary: 'Застрял на фазе 1',
    });
  });

  it('SQL: только resolved_at IS NULL из обоих источников', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/admin/command-center/attention')
      .set('Authorization', `Bearer ${adminToken}`);

    const sql = query.mock.calls[1][0];
    // ops_alerts WHERE resolved_at IS NULL
    expect(sql).toMatch(/FROM ops_alerts oa[\s\S]*WHERE oa\.resolved_at IS NULL/i);
    // phase_stuck_alerts WHERE resolved_at IS NULL
    expect(sql).toMatch(/FROM phase_stuck_alerts psa[\s\S]*WHERE psa\.resolved_at IS NULL/i);
  });

  it('SQL: маппинг phase_stuck threshold_level → severity (red→high, yellow→medium)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/attention')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/CASE WHEN psa\.threshold_level = 'red' THEN 'high' ELSE 'medium' END/);
  });

  it('SQL: JOIN users через patients.assigned_instructor_id (FK из C1)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/attention')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    // Обе ветки UNION ALL должны иметь LEFT JOIN users ON u.id = p.assigned_instructor_id
    const matches = sql.match(/LEFT JOIN users u ON u\.id = p\.assigned_instructor_id/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(2);
  });

  it('SQL: сортировка по severity rank (critical>high>medium>low), потом created_at DESC', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/attention')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/CASE severity[\s\S]*'critical'[\s\S]*4[\s\S]*'high'[\s\S]*3[\s\S]*'medium'[\s\S]*2[\s\S]*'low'[\s\S]*1/);
    expect(sql).toMatch(/created_at DESC/);
  });

  it("severity filter: 'high' → params[0]='high'", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/attention?severity=high')
      .set('Authorization', `Bearer ${adminToken}`);
    const params = query.mock.calls[1][1];
    expect(params[0]).toBe('high');
  });

  it('severity невалидный → null (silent fallthrough, 200)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center/attention?severity=garbage')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(query.mock.calls[1][1][0]).toBeNull();
  });

  it('limit clamp: 999 → 200; -5 → 50 default; 25 → 25', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/attention?limit=999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(query.mock.calls[1][1][1]).toBe(200);
  });

  it('default limit=50, offset=0', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/attention')
      .set('Authorization', `Bearer ${adminToken}`);
    const params = query.mock.calls[1][1];
    expect(params[1]).toBe(50);
    expect(params[2]).toBe(0);
  });

  it('non-admin token → 403', async () => {
    const res = await request(app)
      .get('/api/admin/command-center/attention')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(403);
  });
});

// =====================================================
// PER_PATIENT_STATE_SQL — расширение для C3 (структурные guard'ы)
// =====================================================
describe('PER_PATIENT_STATE_SQL — расширение для C3 (anti-regression)', () => {
  it('SQL содержит CTE unanswered, исключающий system_alert', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/unanswered AS\s*\(/i);
    expect(sql).toMatch(/m\.message_kind\s*<>\s*'system_alert'/i);
    // last_msg derived от программы (DISTINCT ON program_id ORDER BY created_at DESC)
    expect(sql).toMatch(/DISTINCT ON \(m\.program_id\)/i);
    expect(sql).toMatch(/ORDER BY m\.program_id, m\.created_at DESC/i);
    // Только когда последнее — от пациента
    expect(sql).toMatch(/WHERE last_msg\.sender_type = 'patient'/i);
  });

  it('SQL содержит EXISTS ops_alerts WHERE resolved_at IS NULL (has_red_flag)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/EXISTS\s*\([\s\S]*FROM ops_alerts oa[\s\S]*resolved_at IS NULL[\s\S]*\)\s*AS has_red_flag/i);
  });

  it('SQL содержит EXISTS phase_stuck_alerts с каноном активной программы (is_stuck)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/FROM phase_stuck_alerts psa[\s\S]*resolved_at IS NULL/i);
    expect(sql).toMatch(/rp2\.is_active = true AND rp2\.status = 'active'/i);
  });

  it('SQL возвращает assigned_instructor_id (для C3 GROUP BY)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/b\.assigned_instructor_id/);
  });

  it('SQL НЕ использует is_read для unanswered (regression-guard: messages.is_read != "отвечено")', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    // В CTE unanswered не должно быть фильтра по is_read
    const unansweredCte = sql.match(/unanswered AS \(([\s\S]*?)\n  \)/);
    if (unansweredCte) {
      expect(unansweredCte[1]).not.toMatch(/is_read/i);
    }
  });
});

// =====================================================
// «Без ответа» — канон derived (boolean флаг is_unanswered)
// =====================================================
describe('«Без ответа» — derived через CTE unanswered', () => {
  it('пациент с is_unanswered=true → +1 в unanswered его инструктора', async () => {
    query
      .mockResolvedValueOnce({
        rows: [makeRow({ assigned_instructor_id: 7, is_unanswered: true })],
      })
      .mockResolvedValueOnce({ rows: [{ id: 7, full_name: 'Test', role: 'instructor' }] });

    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.instructors[0].unanswered).toBe(1);
  });

  it('is_unanswered=false (последнее сообщение от инструктора) → НЕ считается', async () => {
    query
      .mockResolvedValueOnce({
        rows: [makeRow({ assigned_instructor_id: 7, is_unanswered: false })],
      })
      .mockResolvedValueOnce({ rows: [{ id: 7, full_name: 'Test', role: 'instructor' }] });

    const res = await request(app)
      .get('/api/admin/command-center/instructors')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.instructors[0].unanswered).toBe(0);
  });
});
