// =====================================================
// TEST: Wave 3 C4 — dynamics (3-axis trends + конфликт перетрена)
//
// GET /api/admin/command-center/dynamics?period=&instructor_id=
//
// Mock-based: SQL отдаёт строки с уже посчитанными половинными агрегатами
// (pain_avg_first/second, pain_count_first/second, sessions_first/second,
// is_stuck), JS-логика классифицирует тренды и считает конфликт.
//
// Константы калибровки (admin.js):
//   PAIN_DELTA_THRESHOLD = 0.5
//   ADHERENCE_RATIO_HI   = 1.2
//   ADHERENCE_RATIO_LO   = 0.8
//   MIN_DIARY_POINTS     = 2
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

function makeRow(overrides = {}) {
  return {
    patient_id: 100,
    assigned_instructor_id: 3,
    pain_avg_first: null,  pain_count_first: 0,
    pain_avg_second: null, pain_count_second: 0,
    sessions_first: 0,     sessions_second: 0,
    is_stuck: false,
    ...overrides,
  };
}

// =====================================================
// Боль — тренд по половинам
// =====================================================
describe('Pain trend (halving + min-data guard)', () => {
  it('improving: delta = avg_second - avg_first <= -0.5 → improving', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({
        pain_avg_first: '7.0', pain_count_first: 5,
        pain_avg_second: '5.5', pain_count_second: 5, // delta=-1.5
      })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.pain).toEqual({ improving: 1, stable: 0, worsening: 0, insufficient_data: 0 });
  });

  it('worsening: delta >= +0.5 → worsening', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({
        pain_avg_first: '4.0', pain_count_first: 3,
        pain_avg_second: '6.0', pain_count_second: 3, // delta=+2.0
      })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.pain.worsening).toBe(1);
  });

  it('stable: |delta| < 0.5 → stable', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({
        pain_avg_first: '5.0', pain_count_first: 3,
        pain_avg_second: '5.3', pain_count_second: 3, // delta=+0.3
      })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.pain.stable).toBe(1);
  });

  it('граница порога: delta=0.5 (ровно) → worsening; delta=0.4 → stable', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1,
          pain_avg_first: '5.0', pain_count_first: 3,
          pain_avg_second: '5.5', pain_count_second: 3, // delta=+0.5
        }),
        makeRow({ patient_id: 2,
          pain_avg_first: '5.0', pain_count_first: 3,
          pain_avg_second: '5.4', pain_count_second: 3, // delta=+0.4
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.pain.worsening).toBe(1);
    expect(res.body.data.pain.stable).toBe(1);
  });

  it('insufficient_data: <2 записей в одной из половин → insufficient, НЕ stable', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, // 5 в первой, 1 во второй
          pain_avg_first: '6.0', pain_count_first: 5,
          pain_avg_second: '5.0', pain_count_second: 1,
        }),
        makeRow({ patient_id: 2, // 0 в первой, 5 во второй
          pain_avg_first: null, pain_count_first: 0,
          pain_avg_second: '5.0', pain_count_second: 5,
        }),
        makeRow({ patient_id: 3, // 2/2 — ровно граница, проходит
          pain_avg_first: '5.0', pain_count_first: 2,
          pain_avg_second: '5.0', pain_count_second: 2,
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.pain.insufficient_data).toBe(2);
    expect(res.body.data.pain.stable).toBe(1);
  });
});

// =====================================================
// Приверженность — тренд по rate (sessions/days)
// =====================================================
describe('Adherence trend (rate-based, anti-175% guard)', () => {
  it('improving: rate_second >= 1.2x rate_first', async () => {
    // window=30, daysFirst=15, daysSecond=15. rate_first=2/15, rate_second=4/15.
    // 4/15 >= (2/15)*1.2=0.16 ✓ → improving
    query.mockResolvedValueOnce({
      rows: [makeRow({ sessions_first: 2, sessions_second: 4 })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.improving).toBe(1);
  });

  it('worsening: rate_second <= 0.8x rate_first', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({ sessions_first: 5, sessions_second: 3 })],
      // 3/15 = 0.2; 5/15 * 0.8 = 0.267; 0.2 <= 0.267 → worsening
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.worsening).toBe(1);
  });

  it('stable: rate_second в диапазоне (0.8x, 1.2x)', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({ sessions_first: 4, sessions_second: 4 })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.stable).toBe(1);
  });

  it('insufficient_data: sessions_total=0 → insufficient', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({ sessions_first: 0, sessions_second: 0 })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.insufficient_data).toBe(1);
    expect(res.body.data.adherence.stable).toBe(0);
  });

  it('edge: 0 → N → improving (избегаем 0/0)', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({ sessions_first: 0, sessions_second: 3 })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.improving).toBe(1);
  });

  it('edge: N → 0 → worsening (rate_second=0 <= rate_first*0.8 при rate_first>0)', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({ sessions_first: 5, sessions_second: 0 })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.worsening).toBe(1);
  });

  it('размерность (anti-175%): 3 session_id → 3 сессии, НЕ 9 строк pl.id', async () => {
    // Mock возвращает sessions_first/second как DISTINCT counts. SQL гарантирует это
    // через COUNT(DISTINCT pl.session_id) FILTER (WHERE NOT NULL). Тест проверяет
    // SQL-форму ниже + классификация работает на сырых 3 сессиях, не на 9 строках.
    query.mockResolvedValueOnce({
      rows: [makeRow({ sessions_first: 1, sessions_second: 3 })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    // window=7 → daysFirst=3, daysSecond=4. rate=1/3=0.33, rate=3/4=0.75.
    // 0.75 >= 0.33*1.2 = 0.4 ✓ → improving
    expect(res.body.data.adherence.improving).toBe(1);
  });
});

// =====================================================
// Phase — current-state
// =====================================================
describe('Phase axis (current-state)', () => {
  it('is_stuck=true → stalled; false → on_track', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, is_stuck: true }),
        makeRow({ patient_id: 2, is_stuck: false }),
        makeRow({ patient_id: 3, is_stuck: false }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.phase).toEqual({ on_track: 2, stalled: 1 });
  });

  it('phase.on_track + phase.stalled == cohort', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, is_stuck: true }),
        makeRow({ patient_id: 2, is_stuck: true }),
        makeRow({ patient_id: 3, is_stuck: false }),
        makeRow({ patient_id: 4, is_stuck: false }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.cohort).toBe(4);
    expect(res.body.data.phase.on_track + res.body.data.phase.stalled).toBe(4);
  });
});

// =====================================================
// Конфликт overtraining_candidate
// =====================================================
describe('Conflict — overtraining_candidate (pain↑ + adherence↑)', () => {
  it('pain.worsening + adherence.improving → +1 candidate, НЕ вычитается из осей', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({
        // Pain worsening: delta = +1.0
        pain_avg_first: '4.0', pain_count_first: 3,
        pain_avg_second: '5.0', pain_count_second: 3,
        // Adherence improving: 0 → 4
        sessions_first: 0, sessions_second: 4,
      })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.pain.worsening).toBe(1);
    expect(res.body.data.adherence.improving).toBe(1);
    expect(res.body.data.conflicts.overtraining_candidates).toBe(1);
  });

  it('pain.worsening + adherence.stable → НЕ конфликт', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({
        pain_avg_first: '4.0', pain_count_first: 3,
        pain_avg_second: '5.0', pain_count_second: 3,
        sessions_first: 4, sessions_second: 4, // rate stable
      })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.conflicts.overtraining_candidates).toBe(0);
  });

  it('pain.improving + adherence.improving → НЕ конфликт (это просто прогресс)', async () => {
    query.mockResolvedValueOnce({
      rows: [makeRow({
        pain_avg_first: '6.0', pain_count_first: 3,
        pain_avg_second: '4.0', pain_count_second: 3,
        sessions_first: 1, sessions_second: 5,
      })],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.conflicts.overtraining_candidates).toBe(0);
  });
});

// =====================================================
// Структурные guards и суммы корзин
// =====================================================
describe('Sums and shape', () => {
  it('сумма корзин pain == cohort (insufficient_data входит)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, pain_avg_first: '6', pain_count_first: 3, pain_avg_second: '4', pain_count_second: 3 }), // improving
        makeRow({ patient_id: 2, pain_avg_first: '4', pain_count_first: 3, pain_avg_second: '6', pain_count_second: 3 }), // worsening
        makeRow({ patient_id: 3, pain_avg_first: '5', pain_count_first: 3, pain_avg_second: '5', pain_count_second: 3 }), // stable
        makeRow({ patient_id: 4, pain_count_first: 0, pain_count_second: 0 }),                                            // insufficient
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    const p = res.body.data.pain;
    expect(p.improving + p.stable + p.worsening + p.insufficient_data).toBe(res.body.data.cohort);
    expect(res.body.data.cohort).toBe(4);
  });

  it('сумма корзин adherence == cohort', async () => {
    query.mockResolvedValueOnce({
      rows: [
        makeRow({ patient_id: 1, sessions_first: 1, sessions_second: 5 }),
        makeRow({ patient_id: 2, sessions_first: 0, sessions_second: 0 }), // insufficient
        makeRow({ patient_id: 3, sessions_first: 3, sessions_second: 3 }), // stable
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=30d')
      .set('Authorization', `Bearer ${adminToken}`);
    const a = res.body.data.adherence;
    expect(a.improving + a.stable + a.worsening + a.insufficient_data).toBe(res.body.data.cohort);
  });

  it('cohort = только активные программы (active_program JOIN base)', async () => {
    // В моке количество строк = что вернул SQL. Реальная фильтрация
    // active_program AND base — в SQL. Тест проверяет shape.
    query.mockResolvedValueOnce({ rows: [makeRow({ patient_id: 1 }), makeRow({ patient_id: 2 })] });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.cohort).toBe(2);
  });

  it('пустая когорта → все нули', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.cohort).toBe(0);
    expect(res.body.data.pain).toEqual({ improving: 0, stable: 0, worsening: 0, insufficient_data: 0 });
    expect(res.body.data.adherence).toEqual({ improving: 0, stable: 0, worsening: 0, insufficient_data: 0 });
    expect(res.body.data.phase).toEqual({ on_track: 0, stalled: 0 });
    expect(res.body.data.conflicts.overtraining_candidates).toBe(0);
  });
});

// =====================================================
// SQL anti-regression guards
// =====================================================
describe('SQL anti-regression guards', () => {
  it('SQL содержит COUNT(DISTINCT pl.session_id) FILTER (anti-175%)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    // ОБЕ половины должны быть через DISTINCT session_id
    const matches = sql.match(/COUNT\(DISTINCT pl\.session_id\)\s*FILTER/gi);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(2); // sessions_first + sessions_second
    // НЕ COUNT(pl.id) для адхеренса
    expect(sql).not.toMatch(/COUNT\(pl\.id\)/i);
  });

  it('SQL берёт pain_level из diary_entries (НЕ pain_entries — это red flags)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/FROM diary_entries|LEFT JOIN diary_entries/i);
    expect(sql).toMatch(/de\.pain_level/);
    // pain_entries — не для тренда
    expect(sql).not.toMatch(/FROM pain_entries|JOIN pain_entries/i);
  });

  it('SQL: каноничная активная программа + EXISTS phase_stuck_alerts (is_stuck)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/rp\.is_active = true AND rp\.status = 'active'/i);
    expect(sql).toMatch(/FROM phase_stuck_alerts psa[\s\S]*resolved_at IS NULL/i);
  });

  it('SQL: половины через CURRENT_DATE - ($2::int - 1 - $3::int) midpoint', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    // first half < midpoint, second half >= midpoint
    expect(sql).toMatch(/<\s*CURRENT_DATE\s*-\s*\(\s*\$2::int\s*-\s*1\s*-\s*\$3::int\s*\)/);
    expect(sql).toMatch(/>=\s*CURRENT_DATE\s*-\s*\(\s*\$2::int\s*-\s*1\s*-\s*\$3::int\s*\)/);
  });
});

// =====================================================
// Параметры
// =====================================================
describe('Параметры', () => {
  it('default period → 30d, window_days=30, daysFirstHalf=15 в params[2]', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.period).toBe('30d');
    expect(res.body.data.window_days).toBe(30);
    const params = query.mock.calls[1][1];
    expect(params[1]).toBe(30);
    expect(params[2]).toBe(15);
  });

  it("period='7d' → window_days=7, daysFirstHalf=3", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/dynamics?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    const params = query.mock.calls[1][1];
    expect(params[1]).toBe(7);
    expect(params[2]).toBe(3);
  });

  it("period='all' → window_days=30 (sane default)", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/admin/command-center/dynamics?period=all')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.period).toBe('all');
    expect(res.body.data.window_days).toBe(30);
  });

  it('instructor_id → params[0]', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/dynamics?instructor_id=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(query.mock.calls[1][1][0]).toBe(5);
  });

  it('non-admin → 403', async () => {
    const res = await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(403);
  });
});
