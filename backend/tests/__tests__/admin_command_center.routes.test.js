// =====================================================
// TEST: GET /api/admin/command-center (Wave 3 C2)
//
// Mock-based — SQL отдаёт уже посчитанные per-patient строки
// (has_active_program, days_since, expected_gap_days, sessions, …),
// JS-логика классифицирует сегменты и считает адхеренс.
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

beforeEach(() => {
  jest.clearAllMocks();
  // auth middleware is_active check
  query.mockResolvedValueOnce({ rows: [{ is_active: true }] });
});

// Row factory — какой видит endpoint после SELECT. Дефолт: онбордингованный
// пациент без активности и без cadence-цели.
function makeRow(overrides = {}) {
  return {
    patient_id: 100,
    is_registered: true,
    has_active_program: true,
    target_min: null,
    target_unit: null,
    last_activity_date: null,
    days_since: null,
    expected_gap_days: 7,
    sessions: 0,
    program_age_days: 30, // не grace
    ...overrides,
  };
}

describe('GET /api/admin/command-center — воронка', () => {
  it('базовая монотонность created >= registered >= active_program', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, is_registered: true, has_active_program: true }),
        makeRow({ patient_id: 2, is_registered: true, has_active_program: true }),
        makeRow({ patient_id: 3, is_registered: true, has_active_program: false }),
        makeRow({ patient_id: 4, is_registered: false, has_active_program: false }),
      ],
    });

    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.funnel.created).toBe(4);
    expect(res.body.data.funnel.registered).toBe(3);
    expect(res.body.data.funnel.active_program).toBe(2);
    // Монотонность
    const f = res.body.data.funnel;
    expect(f.created).toBeGreaterThanOrEqual(f.registered);
    expect(f.registered).toBeGreaterThanOrEqual(f.active_program);
    expect(f.active_program).toBeGreaterThanOrEqual(f.active);
    expect(f.active).toBeGreaterThanOrEqual(f.adhering);
  });

  it('registered без активной программы → funnel_gaps.registered_no_active_program', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, is_registered: true, has_active_program: false }),
        makeRow({ patient_id: 2, is_registered: true, has_active_program: false }),
        makeRow({ patient_id: 3, is_registered: false, has_active_program: false }),
      ],
    });

    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.funnel_gaps.registered_no_active_program).toBe(2);
    expect(res.body.data.funnel.active_program).toBe(0);
  });

  it('пациент без password_hash НЕ попадает в registered', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, is_registered: false, has_active_program: false }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.funnel.registered).toBe(0);
    expect(res.body.data.funnel.created).toBe(1);
  });
});

describe('GET /api/admin/command-center — сегменты (cadence-relative)', () => {
  it('week/1, days_since=10 → at_risk (gap=7, 10 ∈ (7, 14])', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 1, target_unit: 'week',
          expected_gap_days: 7, days_since: 10,
          last_activity_date: '2026-05-16',
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments).toEqual({ active: 0, at_risk: 1, dormant: 0, churned: 0 });
  });

  it('day/1, days_since=3 → at_risk (gap=1, ceiling=max(2, 4)=4, 1<3≤4)', async () => {
    // Пол потолка at_risk = gap+3 для дневных. Пропуск 3 дней при дневной
    // рутине = «under risk», а не «спит» (это калибровка из ТЗ C2-followup).
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 1, target_unit: 'day',
          expected_gap_days: 1, days_since: 3,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments).toEqual({ active: 0, at_risk: 1, dormant: 0, churned: 0 });
  });

  it('day/1, days_since=4 → at_risk; days_since=5 → dormant (граница пола at_risk)', async () => {
    // gap=1, ceiling=max(2, 4)=4. Точно проверяем верхнюю границу пола.
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, target_min: 1, target_unit: 'day', expected_gap_days: 1, days_since: 4 }),
        makeRow({ patient_id: 2, target_min: 1, target_unit: 'day', expected_gap_days: 1, days_since: 5 }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments).toEqual({ active: 0, at_risk: 1, dormant: 1, churned: 0 });
  });

  it('недельные режимы: gap+3 не работает (gap=7 → ceiling=14, не 10)', async () => {
    // gap=7, ceiling=max(14, 10)=14. Пол gap+3=10 не активен для недельных.
    // Проверяем что days_since=12 всё ещё at_risk (а не dormant с порогом 10).
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 1, target_unit: 'week',
          expected_gap_days: 7, days_since: 12,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments).toEqual({ active: 0, at_risk: 1, dormant: 0, churned: 0 });
  });

  it('days_since на границе active: days_since == expected_gap_days → active', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 1, target_unit: 'week',
          expected_gap_days: 7, days_since: 7,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments.active).toBe(1);
  });

  it('backstop: days_since=40 → churned независимо от cadence', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 5, target_unit: 'week', // gap=ceil(7/5)=2 — теоретически at_risk бы было
          expected_gap_days: 2, days_since: 40,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments).toEqual({ active: 0, at_risk: 0, dormant: 0, churned: 1 });
  });

  it('grace-эдж: days_since=NULL, program_age=3 → active (не churned/dormant)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          days_since: null, last_activity_date: null,
          program_age_days: 3,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments.active).toBe(1);
    expect(res.body.data.segments.churned).toBe(0);
    expect(res.body.data.segments.dormant).toBe(0);
  });

  it('новый без активности, программа старше 7 дней → dormant', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          days_since: null, last_activity_date: null,
          program_age_days: 20,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments.dormant).toBe(1);
    expect(res.body.data.segments.active).toBe(0);
  });

  it('сумма сегментов == active_program (все онбордингованные распределены)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, days_since: 2, target_min: 1, target_unit: 'week', expected_gap_days: 7 }),  // active
        makeRow({ patient_id: 2, days_since: 10, target_min: 1, target_unit: 'week', expected_gap_days: 7 }), // at_risk
        makeRow({ patient_id: 3, days_since: 20, target_min: 1, target_unit: 'week', expected_gap_days: 7 }), // dormant
        makeRow({ patient_id: 4, days_since: 50, target_min: 1, target_unit: 'week', expected_gap_days: 7 }), // churned
        makeRow({ patient_id: 5, has_active_program: false }), // не считается в сегментах
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const s = res.body.data.segments;
    expect(s.active + s.at_risk + s.dormant + s.churned).toBe(res.body.data.funnel.active_program);
    expect(s.active).toBe(1);
    expect(s.at_risk).toBe(1);
    expect(s.dormant).toBe(1);
    expect(s.churned).toBe(1);
  });
});

describe('GET /api/admin/command-center — адхеренс (session-grained, anti-175%)', () => {
  it('target=2/week, window=7, sessions=3 → adhering=true (считается 3 сессии, не строки)', async () => {
    // expected_min = 2 * (7/7) = 2; threshold = 0.6*2 = 1.2; 3 >= 1.2 → true.
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 2, target_unit: 'week',
          expected_gap_days: 4, // ceil(7/2)
          days_since: 1, last_activity_date: '2026-05-25',
          sessions: 3,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.funnel.adhering).toBe(1);
    expect(res.body.data.adherence_window_days).toBe(7);
  });

  it('target=3/week, window=7, sessions=1 → НЕ adhering (1 < 0.6*3=1.8)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 3, target_unit: 'week',
          expected_gap_days: 3, // ceil(7/3)
          days_since: 1, sessions: 1,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.funnel.adhering).toBe(0);
  });

  it('target=1/day, window=30, sessions=20 → adhering=true (20 >= 0.6*30=18)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: 1, target_unit: 'day',
          expected_gap_days: 1,
          days_since: 1, sessions: 20,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.funnel.adhering).toBe(1);
  });

  it('target_min=NULL → не adhering, попадает в no_target_set', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({
          target_min: null, target_unit: null,
          days_since: 1, sessions: 10,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.funnel.adhering).toBe(0);
    expect(res.body.data.segments_note.no_target_set).toBe(1);
  });

  it('пациент без активной программы НЕ считается в no_target_set', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({ has_active_program: false })],
    });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments_note.no_target_set).toBe(0);
  });
});

describe('GET /api/admin/command-center — параметры period и instructor_id', () => {
  it('default period (нет query) → 30d, adherence_window=30', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.period).toBe('30d');
    expect(res.body.data.adherence_window_days).toBe(30);
  });

  it("period='7d' → adherence_window=7, SQL params[1]=7", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    const mainCall = query.mock.calls[1]; // [0] = auth, [1] = aggregate
    expect(mainCall[1][1]).toBe(7);
  });

  it("period='all' → adherence_window=30 (sane default), period сохраняется 'all'", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center?period=all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.period).toBe('all');
    expect(res.body.data.adherence_window_days).toBe(30);
  });

  it('невалидный period → fallback 30d', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center?period=garbage')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.period).toBe('30d');
  });

  it('instructor_id передаётся в SQL params[0]', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center?instructor_id=5')
      .set('Authorization', `Bearer ${adminToken}`);
    const mainCall = query.mock.calls[1];
    expect(mainCall[1][0]).toBe(5);
  });

  it('без instructor_id → params[0] = null (admin-wide)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const mainCall = query.mock.calls[1];
    expect(mainCall[1][0]).toBeNull();
  });

  it('невалидный instructor_id (нечисло) → null (не падает)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center?instructor_id=abc')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.instructor_id).toBeNull();
  });
});

describe('GET /api/admin/command-center — SQL anti-regression guards', () => {
  it('SQL содержит COUNT(DISTINCT pl.session_id) FILTER (anti-175%)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    // session-grained сессии (не COUNT pl.id)
    expect(sql).toMatch(/COUNT\(DISTINCT pl\.session_id\)\s*FILTER\s*\(WHERE pl\.session_id IS NOT NULL\)/i);
    // НЕ COUNT(pl.id) для адхеренса
    expect(sql).not.toMatch(/COUNT\(pl\.id\)/i);
  });

  it('SQL использует канонический предикат активной программы', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/rp\.is_active\s*=\s*true\s+AND\s+rp\.status\s*=\s*'active'/i);
  });

  it('SQL берёт last_activity_date из streaks через streak_pick CTE', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/FROM streaks s/i);
    expect(sql).toMatch(/DISTINCT ON \(s\.patient_id\)/i);
    expect(sql).toMatch(/last_activity_date/);
  });

  it('окно адхеренса = CURRENT_DATE - (window_days - 1) — параметризовано $2', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/CURRENT_DATE\s*-\s*\(\s*\$2::int\s*-\s*1\s*\)/);
  });
});
