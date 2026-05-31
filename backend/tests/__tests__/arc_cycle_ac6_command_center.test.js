// =====================================================
// TEST: ARC-CYCLE AC6 — командный центр, ДВА показателя адхеренса
// (gymnastics / training) РАЗДЕЛЬНО (Rule #34, НЕ пулим).
//
// Mock-based: PER_PATIENT_STATE_SQL отдаёт per-patient строки с блок-осями
// (has_gym_block, gym_target_min/unit/sessions, has_train_block, …). JS-логика
// (isAdheringGymnastics / isAdheringTraining) классифицирует каждую ось.
// SQL-агрегацию (anti-175%: 3 строки/1 день → 1) проверяет живой SQL-smoke,
// здесь — JS-пороги + sanity-grep, что SQL содержит правильные COUNT(DISTINCT …).
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
  query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // auth is_active
});

// Per-patient row factory — онбордингованный пациент без активности.
// Дефолт: блоков НЕТ (legacy). Оверрайды добавляют блок-оси.
function makeRow(overrides = {}) {
  return {
    patient_id: 100,
    assigned_instructor_id: 7,
    is_registered: true,
    has_active_program: true,
    target_min: null,
    target_unit: null,
    has_blocks: false,
    has_gym_block: false,
    gym_target_min: null,
    gym_target_unit: null,
    gym_sessions: 0,
    has_train_block: false,
    train_target_min: null,
    train_target_unit: null,
    train_sessions: 0,
    last_activity_date: '2026-05-30',
    days_since: 1,
    expected_gap_days: 1,
    sessions: 0,
    program_age_days: 30,
    is_unanswered: false,
    last_patient_msg_at: null,
    has_red_flag: false,
    is_stuck: false,
    ...overrides,
  };
}

// Блок-пациент: есть gymnastics-блок (day-цель) и/или training-блок (week-цель).
function gymBlockRow(over = {}) {
  return makeRow({
    has_blocks: true,
    has_gym_block: true,
    gym_target_min: 1,
    gym_target_unit: 'day',
    ...over,
  });
}
function trainBlockRow(over = {}) {
  return makeRow({
    has_blocks: true,
    has_train_block: true,
    train_target_min: 3,
    train_target_unit: 'week',
    ...over,
  });
}

describe('AC6 C2 — gymnastics-ось (day-grained, anti-175% дни не строки)', () => {
  it('gym target 1/day, window 7, gym_sessions=5 → gymnastics.adhering=1 (5 ≥ 0.6·7=4.2)', async () => {
    query.mockResolvedValueOnce({ rows: [gymBlockRow({ gym_sessions: 5 })] });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.adherence.gymnastics.adhering).toBe(1);
    expect(res.body.data.adherence.gymnastics.no_target).toBe(0);
    // training-ось пуста → no_target (раздельность)
    expect(res.body.data.adherence.training.adhering).toBe(0);
    expect(res.body.data.adherence.training.no_target).toBe(1);
  });

  it('gym target 1/day, window 7, gym_sessions=3 → НЕ adhering (3 < 4.2)', async () => {
    query.mockResolvedValueOnce({ rows: [gymBlockRow({ gym_sessions: 3 })] });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.gymnastics.adhering).toBe(0);
    expect(res.body.data.adherence.gymnastics.no_target).toBe(0); // цель есть
  });
});

describe('AC6 C2 — training-ось (session-grained, anti-175% сессии не строки)', () => {
  it('train target 3/week, window 7, train_sessions=3 → training.adhering=1 (3 ≥ 0.6·3=1.8)', async () => {
    query.mockResolvedValueOnce({ rows: [trainBlockRow({ train_sessions: 3 })] });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.training.adhering).toBe(1);
    // gymnastics-ось пуста → no_target
    expect(res.body.data.adherence.gymnastics.no_target).toBe(1);
    expect(res.body.data.adherence.gymnastics.adhering).toBe(0);
  });

  it('train target 3/week, window 7, train_sessions=1 → НЕ adhering (1 < 1.8)', async () => {
    query.mockResolvedValueOnce({ rows: [trainBlockRow({ train_sessions: 1 })] });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.training.adhering).toBe(0);
    expect(res.body.data.adherence.training.no_target).toBe(0);
  });
});

describe('AC6 C2 — раздельность осей + no_target_set', () => {
  it('пациент с обоими блоками → обе оси считаются независимо', async () => {
    query.mockResolvedValueOnce({
      rows: [
        gymBlockRow({
          has_train_block: true, train_target_min: 3, train_target_unit: 'week',
          gym_sessions: 5, train_sessions: 1, // gym adhering, train НЕ
        }),
      ],
    });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.gymnastics.adhering).toBe(1);
    expect(res.body.data.adherence.training.adhering).toBe(0);
    expect(res.body.data.adherence.gymnastics.no_target).toBe(0);
    expect(res.body.data.adherence.training.no_target).toBe(0);
    // обе оси имеют цель → пациент НЕ в no_target_set
    expect(res.body.data.segments_note.no_target_set).toBe(0);
  });

  it('блок-пациент ИГНОРИРУЕТ legacy c.target_* (has_blocks=true)', async () => {
    // gym-блок есть; legacy target_unit='week' присутствует, но has_blocks=true →
    // training-ось НЕ подхватывает legacy (no_target), gym-ось из блока.
    query.mockResolvedValueOnce({
      rows: [gymBlockRow({ gym_sessions: 5, target_min: 9, target_unit: 'week', sessions: 9 })],
    });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.adherence.gymnastics.adhering).toBe(1);
    expect(res.body.data.adherence.training.adhering).toBe(0);
    expect(res.body.data.adherence.training.no_target).toBe(1);
  });

  it('только gymnastics-блок → gym считается, train скрыт (no_target)', async () => {
    query.mockResolvedValueOnce({ rows: [gymBlockRow({ gym_sessions: 5 })] });
    const res = await request(app)
      .get('/api/admin/command-center?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.segments_note.no_target_set).toBe(0); // gym-цель есть
    expect(res.body.data.adherence.training.no_target).toBe(1);
  });
});

describe('AC6 C3 — две оси адхеренса per-instructor', () => {
  it('инструктор получает adherence.{gymnastics,training} раздельно', async () => {
    query.mockResolvedValueOnce({
      rows: [
        gymBlockRow({ patient_id: 1, assigned_instructor_id: 7, gym_sessions: 5 }),       // gym adhering
        trainBlockRow({ patient_id: 2, assigned_instructor_id: 7, train_sessions: 3 }),    // train adhering
        makeRow({ patient_id: 3, assigned_instructor_id: 7 }),                             // legacy no_target обе
      ],
    });
    // names query (instructorIds.length > 0)
    query.mockResolvedValueOnce({ rows: [{ id: 7, full_name: 'Тест Куратор', role: 'instructor' }] });

    const res = await request(app)
      .get('/api/admin/command-center/instructors?period=7d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const inst = res.body.data.instructors.find((i) => i.instructor_id === 7);
    expect(inst.caseload).toBe(3);
    expect(inst.adherence.gymnastics.adhering).toBe(1);
    expect(inst.adherence.training.adhering).toBe(1);
    // gym-ось: пациент1 adhering, пациент2 (train-блок) no_target, пациент3 (legacy) no_target
    expect(inst.adherence.gymnastics.no_target).toBe(2);
    expect(inst.adherence.training.no_target).toBe(2);
  });
});

describe('AC6 — SQL anti-regression guards (sanity-grep)', () => {
  it('PER_PATIENT_STATE_SQL: gymnastics = COUNT(DISTINCT completed_at::date), training = COUNT(DISTINCT session_id)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    // gymnastics дневная дисциплина
    expect(sql).toMatch(/COUNT\(DISTINCT pl\.completed_at::date\)/i);
    // training session-grained (anti-175%)
    expect(sql).toMatch(/COUNT\(DISTINCT pl\.session_id\)\s*FILTER\s*\(WHERE pl\.session_id IS NOT NULL\)/i);
    // блок-CTE присутствуют
    expect(sql).toMatch(/gym_block AS/i);
    expect(sql).toMatch(/train_block AS/i);
    expect(sql).toMatch(/program_block_complexes/i);
    // EXISTS-гейт: пустой блок (без комплексов) НЕ создаёт ось (→ no_target, не false).
    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM program_block_complexes pbc WHERE pbc\.block_id = b\.id\)/i);
    // НЕ COUNT(pl.id)
    expect(sql).not.toMatch(/COUNT\(pl\.id\)/i);
  });

  it('PER_PATIENT_STATE_SQL: expected_gap_days — gymnastics→1, иначе training→ceil(7/min)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/WHEN gb\.program_id IS NOT NULL THEN 1/i);
    expect(sql).toMatch(/CEIL\(7\.0 \/ tb\.train_target_min\)::int/i);
  });

  it('C4 dynamics SQL: re-scope сессий через program_complex_ids (блоки) + DISTINCT session_id', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/command-center/dynamics')
      .set('Authorization', `Bearer ${adminToken}`);
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/program_complex_ids AS/i);
    expect(sql).toMatch(/program_block_complexes/i);
    expect(sql).toMatch(/COUNT\(DISTINCT pl\.session_id\)/i);
    // больше НЕ скоупит сессии на одиночный ap.complex_id
    expect(sql).not.toMatch(/pl\.complex_id = ap\.complex_id/i);
  });
});
