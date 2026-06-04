// =====================================================
// TEST: Rehab API Routes (Sprint 1.2)
// Tests all rehab endpoints with mocked database
// =====================================================

// CRITICAL: Mock db BEFORE any imports
jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

// Mock multer + sharp цепочку. В unit-тестах у нас нет реальных файлов —
// проверяем только ownership / лимит / 404 в POST photos endpoint'е.
// Реальный sharp-процессинг покрыт в avatar-пути и протестирован вручную.
// avatarUpload/processAvatar оставляем нетронутыми (они не импортируются
// в rehab routes) — мокаем только diary branch.
jest.mock('../../middleware/upload', () => ({
  avatarUpload: { single: () => (req, res, next) => next() },
  processAvatar: (req, res, next) => next(),
  diaryPhotoUpload: {
    single: () => (req, _res, next) => {
      // Для тестов просто кладём fake file в req — processDiaryPhoto
      // заполнит остальные поля.
      if (req.headers['x-test-skip-file']) {
        req.file = null;
      } else {
        req.file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1000 };
      }
      next();
    },
  },
  processDiaryPhoto: (req, _res, next) => {
    if (req.file) {
      req.file.filename = 'test_diary_photo.jpg';
      req.file.path = '/tmp/test_diary_photo.jpg';
      req.file.size = 1000;
      req.file.relativePath = '/uploads/diary_photos/test_diary_photo.jpg';
    }
    next();
  },
  measurementPhotoUpload: { single: () => (_req, _res, next) => next() },
  processMeasurementPhoto: (_req, _res, next) => next(),
}));

const request = require('supertest');
const app = require('../../server');
const { query } = require('../../database/db');
const jwt = require('jsonwebtoken');
const fixtures = require('../fixtures');

// =====================================================
// TEST DATA
// =====================================================

const testPatient = { id: 1, email: 'test@patient.com', full_name: 'Test Patient' };
const validToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// =====================================================
// SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// PUBLIC ENDPOINTS - No Authentication
// =====================================================

describe('GET /api/rehab/phases', () => {
  it('should return phases with parsed JSON fields', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });

    const response = await request(app)
      .get('/api/rehab/phases')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);

    const phase = response.body.data[0];
    expect(phase.id).toBe(1);
    expect(phase.title).toBe('Защита и заживление');
    expect(Array.isArray(phase.goals)).toBe(true);
    expect(Array.isArray(phase.restrictions)).toBe(true);
    expect(Array.isArray(phase.criteria_next)).toBe(true);
    expect(phase.goals).toContain('Контроль отёка');
  });

  it('should return empty array when no phases', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/phases')
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app)
      .get('/api/rehab/phases')
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
    expect(response.body).toHaveProperty('message');
  });
});

describe('GET /api/rehab/phases/:id', () => {
  it('should return phase with videos', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });
    query.mockResolvedValueOnce({ rows: [fixtures.mockVideoRow] });

    const response = await request(app)
      .get('/api/rehab/phases/1')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data.id).toBe(1);
    expect(response.body.data.title).toBe('Защита и заживление');
    expect(Array.isArray(response.body.data.videos)).toBe(true);
    expect(response.body.data.videos).toHaveLength(1);
    expect(response.body.data.videos[0].title).toBe('Разминка');
  });

  it('should return 404 when phase not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/phases/999')
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Not Found');
    expect(response.body.message).toContain('не найдена');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/phases/1')
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

describe('GET /api/rehab/tips', () => {
  it('should return tips', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] });

    const response = await request(app)
      .get('/api/rehab/tips')
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe('Совет дня');
    expect(response.body.data[0].category).toBe('motivation');
  });

  it('should return empty array when no tips', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/tips')
      .expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/tips')
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Sprint 1.2 NEW
// =====================================================

describe('GET /api/rehab/my/exercises', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 403 with invalid token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', 'Bearer invalidtoken')
      .expect(403);

    expect(response.body).toHaveProperty('error');
  });

  it('should return exercise data with valid token', async () => {
    // AC4: /my/exercises сперва ищет активную программу + блоки. Нет блоков → legacy-путь.
    // Поля legacy дублируются на верхний уровень (обратная совместимость), + mode/gymnastics/training.
    query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'ACL Rehab' }] }); // активная программа
    query.mockResolvedValueOnce({ rows: [] });                              // блоки — нет → legacy
    query.mockResolvedValueOnce({ rows: [fixtures.mockExerciseRow] });      // legacy комплекс

    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('mode', 'legacy');
    expect(response.body.data).toHaveProperty('gymnastics', null);
    expect(response.body.data).toHaveProperty('training', null);
    expect(response.body.data).toHaveProperty('program_id', 1);
    expect(response.body.data).toHaveProperty('complex_id', 10);
    expect(response.body.data).not.toHaveProperty('access_token');
    expect(response.body.data).toHaveProperty('exercise_count', 1);
    expect(response.body.data).toHaveProperty('exercises');
    expect(Array.isArray(response.body.data.exercises)).toBe(true);
    expect(response.body.data.exercises).toHaveLength(1);
    expect(response.body.data.exercises[0].exercise).toHaveProperty('title', 'Разгибание колена');
  });

  it('should return 404 when no active program', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // активная программа — нет (блоки пропускаются)
    query.mockResolvedValueOnce({ rows: [] }); // legacy комплекс — нет → 404

    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Not Found');
    expect(response.body.message).toContain('не найдена');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/exercises')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Dashboard
// =====================================================

describe('GET /api/rehab/my/dashboard', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return dashboard data with program', async () => {
    // Mock 6 sequential queries for dashboard with program.
    // Wave 1 #1.02: SELECT теперь содержит JOIN с program_types —
    // программа приходит уже с program_type/program_label/joint/surgery_required.
    const programData = {
      id: 1,
      title: 'ACL Rehab',
      diagnosis: 'PKS',
      current_phase: 1,
      phase_started_at: '2026-01-15',
      surgery_date: '2026-01-01',
      status: 'active',
      program_type: 'acl',
      program_label: 'ПКС реабилитация',
      program_joint: 'knee',
      program_surgery_required: true,
    };
    const phaseData = {
      id: 1,
      phase_number: 1,
      title: 'Phase 1',
      subtitle: '0-2 weeks',
      duration_weeks: '6',
      description: 'Test phase description',
      icon: 'shield',
      color: '#1A8A6A',
      color_bg: '#EDFAF5'
    };

    query.mockResolvedValueOnce({ rows: [programData] }); // program
    query.mockResolvedValueOnce({ rows: [phaseData] }); // phase
    query.mockResolvedValueOnce({ rows: [{ current_streak: 5, longest_streak: 10, total_days: 20, last_activity_date: '2026-02-10' }] }); // streak
    query.mockResolvedValueOnce({ rows: [fixtures.mockDiaryEntryRow] }); // last diary
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] }); // tip
    query.mockResolvedValueOnce({ rows: [] }); // today diary check
    query.mockResolvedValueOnce({ rows: [] }); // today progress check (exercisesDoneToday)
    query.mockResolvedValueOnce({ rows: [{ has_blocks: false, gym_done: false, training_done: false }] }); // AC4 block-done

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('program');
    expect(response.body.data.program).not.toBeNull();
    expect(response.body.data.program.id).toBe(1);
    expect(response.body.data.program).toHaveProperty('patient_name', 'Test Patient');
    // Wave 1 #1.02: program_type + label/joint/surgery_required из JOIN с program_types
    expect(response.body.data.program.program_type).toBe('acl');
    expect(response.body.data.program.program_label).toBe('ПКС реабилитация');
    expect(response.body.data.program.program_joint).toBe('knee');
    expect(response.body.data.program.program_surgery_required).toBe(true);

    expect(response.body.data).toHaveProperty('phase');
    expect(response.body.data.phase).not.toBeNull();
    expect(response.body.data.phase.title).toBe('Phase 1');
    expect(response.body.data.phase).toHaveProperty('name', 'Phase 1');
    expect(response.body.data.phase).toHaveProperty('color2', '#EDFAF5');
    expect(response.body.data.phase).toHaveProperty('description', 'Test phase description');
    expect(response.body.data.phase.duration_weeks).toBe(6);
    expect(typeof response.body.data.phase.duration_weeks).toBe('number');

    expect(response.body.data).toHaveProperty('streak');
    expect(response.body.data.streak).toHaveProperty('current', 5);
    expect(response.body.data.streak).toHaveProperty('best', 10);
    expect(response.body.data.streak).toHaveProperty('atRisk');
    expect(typeof response.body.data.streak.atRisk).toBe('boolean');

    expect(response.body.data).toHaveProperty('lastDiary');
    expect(response.body.data).toHaveProperty('tip');
    expect(response.body.data).toHaveProperty('diaryFilledToday', false);
    expect(response.body.data).toHaveProperty('exercisesDoneToday', false);
  });

  it('Wave 1 #1.03: program_label остаётся NULL если JOIN вернул NULL (фронт сам fallback на «Фаза N»)', async () => {
    // После 1.03 backend больше НЕ ставит fallback через regex-маппинг —
    // HomeScreen.js самостоятельно показывает «Фаза N» без префикса label.
    const programData = {
      id: 2,
      title: 'Some Rehab',
      diagnosis: 'Разрыв ПКС левого колена',
      current_phase: 1,
      phase_started_at: '2026-01-15',
      surgery_date: '2026-01-01',
      status: 'active',
      program_type: 'acl',
      program_label: null,
      program_joint: null,
      program_surgery_required: null,
    };
    const phaseData = {
      id: 1, phase_number: 1, title: 'Phase 1', subtitle: '',
      duration_weeks: '6', description: '', icon: '', color: '', color_bg: '',
    };

    query.mockResolvedValueOnce({ rows: [programData] });
    query.mockResolvedValueOnce({ rows: [phaseData] });
    query.mockResolvedValueOnce({ rows: [{ current_streak: 0, longest_streak: 0, total_days: 0, last_activity_date: null }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ has_blocks: false, gym_done: false, training_done: false }] }); // AC4 block-done

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.program.program_label).toBeNull();
    expect(response.body.data.program.program_type).toBe('acl');
  });

  it('Wave 1 retrospective 2026-05-15: phase lookup для shoulder_general — главный HomeScreen для не-ACL', async () => {
    // Wave 1 #1.02 закрыл program_label через JOIN program_types, но
    // phase lookup в том же endpoint'е остался хардкодом 'acl'. Этот тест
    // защищает от регресса — phase для shoulder_general должен прилетать
    // с правильным program_type.
    const programData = {
      id: 1, title: 'Shoulder Rehab', diagnosis: 'Разрыв манжеты ротаторов',
      current_phase: 2, phase_started_at: '2026-01-15', surgery_date: null,
      status: 'active', program_type: 'shoulder_general',
      program_label: 'Реабилитация плеча', program_joint: 'shoulder',
      program_surgery_required: false,
    };
    const phaseData = {
      id: 12, phase_number: 2, title: 'Активные движения плеча',
      subtitle: '6-12 weeks', duration_weeks: '6', description: 'Active ROM',
      icon: 'move', color: '#3B82F6', color_bg: '#EFF6FF',
    };

    query.mockResolvedValueOnce({ rows: [programData] });        // program
    query.mockResolvedValueOnce({ rows: [phaseData] });          // phase
    query.mockResolvedValueOnce({ rows: [{ current_streak: 0, longest_streak: 0, total_days: 0, last_activity_date: null }] });
    query.mockResolvedValueOnce({ rows: [] });                   // diary
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] }); // tip
    query.mockResolvedValueOnce({ rows: [] });                   // today diary
    query.mockResolvedValueOnce({ rows: [] });                   // exercisesDoneToday
    query.mockResolvedValueOnce({ rows: [{ has_blocks: false, gym_done: false, training_done: false }] }); // AC4 block-done

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.program.program_type).toBe('shoulder_general');
    expect(response.body.data.phase).not.toBeNull();
    expect(response.body.data.phase.title).toBe('Активные движения плеча');
    expect(response.body.data.phase).toHaveProperty('color2', '#EFF6FF');
    // anti-regression: phase SQL параметризован, params [shoulder_general, 2]
    expect(query.mock.calls[1][0]).toMatch(/program_type = \$1/);
    expect(query.mock.calls[1][0]).not.toMatch(/program_type = 'acl'/);
    expect(query.mock.calls[1][1]).toEqual(['shoulder_general', 2]);
  });

  it('Wave 1 retrospective 2026-05-15: tips filter использует program.program_type + general sentinel', async () => {
    // Архитектор подтвердил pattern: tips с program_type='general' остаются
    // sentinel'ом для "общих" советов. В дев-БД 16 таких записей + 20 acl.
    // Фильтр в /my/dashboard должен быть `program.program_type OR 'general'`,
    // не хардкод `'acl' OR 'general'` (silent failure для shoulder/knee).
    const programData = {
      id: 1, title: 'Shoulder Rehab', diagnosis: 'Манжета',
      current_phase: 2, phase_started_at: '2026-01-15', surgery_date: null,
      status: 'active', program_type: 'shoulder_general',
      program_label: 'Реабилитация плеча', program_joint: 'shoulder',
      program_surgery_required: false,
    };
    const shoulderTip = {
      id: 99, program_type: 'shoulder_general', phase_number: 2,
      category: 'motivation', title: 'Совет для плеча', body: 'Body', icon: '🏋️',
    };

    query.mockResolvedValueOnce({ rows: [programData] });
    query.mockResolvedValueOnce({ rows: [{ id: 5, phase_number: 2, title: 'Ph2', subtitle: '', duration_weeks: '6', description: '', icon: '', color: '', color_bg: '' }] });
    query.mockResolvedValueOnce({ rows: [{ current_streak: 0, longest_streak: 0, total_days: 0, last_activity_date: null }] });
    query.mockResolvedValueOnce({ rows: [] });           // diary
    query.mockResolvedValueOnce({ rows: [shoulderTip] }); // tip
    query.mockResolvedValueOnce({ rows: [] });           // today diary
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ has_blocks: false, gym_done: false, training_done: false }] }); // AC4 block-done

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.tip).not.toBeNull();
    expect(response.body.data.tip.program_type).toBe('shoulder_general');

    // anti-regression: tipSql использует program_type параметром + general sentinel
    const tipCall = query.mock.calls[4]; // 0=program 1=phase 2=streak 3=diary 4=tip
    expect(tipCall[0]).toMatch(/program_type = \$\d+ OR program_type = 'general'/);
    expect(tipCall[0]).not.toMatch(/program_type = 'acl'/);
    // Параметры включают program_type из программы
    expect(tipCall[1]).toContain('shoulder_general');
  });

  it('should return null program when no program exists', async () => {
    // Mock queries when no program (phase query is skipped)
    query.mockResolvedValueOnce({ rows: [] }); // program - empty
    query.mockResolvedValueOnce({ rows: [] }); // streak
    query.mockResolvedValueOnce({ rows: [] }); // diary
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] }); // tip
    query.mockResolvedValueOnce({ rows: [] }); // today diary
    query.mockResolvedValueOnce({ rows: [] }); // today progress (exercisesDoneToday)

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.program).toBeNull();
    expect(response.body.data.phase).toBeNull();
    expect(response.body.data.streak).toHaveProperty('current', 0);
    expect(response.body.data.streak).toHaveProperty('best', 0);
    expect(response.body.data.streak).toHaveProperty('atRisk', false);
    expect(response.body.data.lastDiary).toBeNull();
    expect(response.body.data.tip).not.toBeNull();
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/dashboard')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Program
// =====================================================

describe('GET /api/rehab/my/program', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/program')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return program with phase data', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockProgramRow] });
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });

    const response = await request(app)
      .get('/api/rehab/my/program')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data.id).toBe(1);
    expect(response.body.data.title).toBe('ACL Rehab');
    expect(response.body.data).toHaveProperty('phase');
    expect(response.body.data.phase).not.toBeNull();
  });

  it('should return null when no program', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/my/program')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data).toBeNull();
    expect(response.body.message).toContain('Нет активной программы');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/program')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });

  it('Wave 1 retrospective 2026-05-15: phase lookup использует program.program_type для shoulder_general', async () => {
    query.mockResolvedValueOnce({
      rows: [{ ...fixtures.mockProgramRow, program_type: 'shoulder_general', current_phase: 2 }],
    });
    query.mockResolvedValueOnce({
      rows: [{ ...fixtures.mockPhaseRow, program_type: 'shoulder_general', phase_number: 2, title: 'Иммобилизация плеча' }],
    });

    const response = await request(app)
      .get('/api/rehab/my/program')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.phase).not.toBeNull();
    expect(response.body.data.phase.title).toBe('Иммобилизация плеча');
    // anti-regression: phase SQL — параметризован, не хардкод 'acl'
    expect(query.mock.calls[1][0]).toMatch(/program_type = \$1/);
    expect(query.mock.calls[1][0]).not.toMatch(/program_type = 'acl'/);
    expect(query.mock.calls[1][1]).toEqual(['shoulder_general', 2]);
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Diary
// =====================================================

describe('POST /api/rehab/my/diary', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .send({ pain_level: 3, mood: 4 })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should create diary entry with valid data', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // program check
    query.mockResolvedValueOnce({ rows: [fixtures.mockDiaryEntryRow] }); // insert

    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, mood: 4, exercises_done: '2' })
      .expect(201);

    expect(response.body).toHaveProperty('message', 'Запись сохранена');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data.pain_level).toBe(3);
  });

  it('should return 400 for invalid pain_level', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 15, mood: 4 })
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation Error');
    expect(response.body.message).toContain('боли должен быть от 0 до 10');
  });

  it('should return 400 for invalid mood', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 5, mood: 10 })
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation Error');
    expect(response.body.message).toContain('Настроение должно быть от 1 до 5');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, mood: 4 })
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });

  // ===== Checkpoint 6: новые структурные поля =====

  it('should accept pgic_feel, rom_degrees, better_list, pain_when', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // program
    query.mockResolvedValueOnce({
      rows: [{
        ...fixtures.mockDiaryEntryRow,
        pgic_feel: 'better', rom_degrees: 135, better_list: ['ext', 'walk'], pain_when: 'morning',
      }],
    });

    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        pain_level: 2,
        pgic_feel: 'better',
        rom_degrees: 135,
        better_list: ['ext', 'walk'],
        pain_when: 'morning',
      })
      .expect(201);

    expect(response.body.data).toHaveProperty('pgic_feel', 'better');
    expect(response.body.data).toHaveProperty('rom_degrees', 135);
  });

  it('should return 400 for invalid pgic_feel', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, pgic_feel: 'meh' })
      .expect(400);
    expect(response.body.error).toBe('Validation Error');
    expect(response.body.message).toMatch(/better\/same\/worse/);
  });

  it('should return 400 for out-of-range rom_degrees', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, rom_degrees: 250 })
      .expect(400);
    expect(response.body.message).toMatch(/ROM/);
  });

  it('should return 400 for invalid pain_when', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, pain_when: 'noon' })
      .expect(400);
    expect(response.body.message).toMatch(/pain_when/);
  });

  it('should return 400 for non-array better_list', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, better_list: 'ext' })
      .expect(400);
    expect(response.body.message).toMatch(/better_list must be array/);
  });

  it('should return 400 for better_list with disallowed value', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pain_level: 3, better_list: ['ext', 'random_junk'] })
      .expect(400);
    expect(response.body.message).toMatch(/ext, walk, sleep, mood/);
  });

  it('should accept PGIC-only auto-save (pgic_feel without pain_level)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // program
    query.mockResolvedValueOnce({
      rows: [{ ...fixtures.mockDiaryEntryRow, pgic_feel: 'same' }],
    });

    const response = await request(app)
      .post('/api/rehab/my/diary')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ pgic_feel: 'same' })
      .expect(201);

    expect(response.body.data.pgic_feel).toBe('same');
  });
});

// =====================================================
// Checkpoint 6: GET /api/rehab/my/diary/trend
// =====================================================

describe('GET /api/rehab/my/diary/trend', () => {
  it('should return 401 without token', async () => {
    await request(app).get('/api/rehab/my/diary/trend').expect(401);
  });

  it('should return 14 days by default', async () => {
    query.mockResolvedValueOnce({ rows: [
      { date: '2026-04-10', pain: 4 },
      { date: '2026-04-11', pain: 3 },
    ]});

    const response = await request(app)
      .get('/api/rehab/my/diary/trend')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0]).toHaveProperty('date');
    expect(response.body.data[0]).toHaveProperty('pain');
    // 14 дней передаются в запрос
    const sqlArgs = query.mock.calls[0][1];
    expect(sqlArgs[1]).toBe(14);
  });

  it('should clamp days to max 90', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/rehab/my/diary/trend?days=500')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
    expect(query.mock.calls[0][1][1]).toBe(90);
  });

  it('should accept custom days param', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/rehab/my/diary/trend?days=7')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
    expect(query.mock.calls[0][1][1]).toBe(7);
  });

  it('should fallback to 14 for invalid days', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/rehab/my/diary/trend?days=abc')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
    expect(query.mock.calls[0][1][1]).toBe(14);
  });
});

// =====================================================
// Checkpoint 6: Photo endpoints ownership + limit
// =====================================================

describe('Photo endpoints — ownership (DELETE branch)', () => {
  // Проверяем verifyDiaryOwnership через DELETE endpoint — он не требует
  // multer/sharp pipeline, так что не оставляет mock'ов «в очереди» при
  // падении middleware. POST endpoint использует ту же helper-функцию,
  // так что логика ownership покрыта общим helper'ом.

  it('POST — returns 401 without token', async () => {
    await request(app)
      .post('/api/rehab/my/diary/42/photos')
      .expect(401);
  });

  it('DELETE — returns 401 without token', async () => {
    await request(app)
      .delete('/api/rehab/my/diary/42/photos/7')
      .expect(401);
  });

  it('DELETE — returns 400 for non-numeric entry_id', async () => {
    const response = await request(app)
      .delete('/api/rehab/my/diary/abc/photos/7')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(400);
    expect(response.body).toHaveProperty('error');
  });

  it('DELETE — returns 404 when entry does not belong to patient', async () => {
    query.mockResolvedValueOnce({ rows: [{ patient_id: 999 }] }); // чужая запись

    const response = await request(app)
      .delete('/api/rehab/my/diary/42/photos/7')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(404);
    expect(response.body).toHaveProperty('error', 'Not Found');
  });

  it('DELETE — returns 400 for non-numeric photo_id', async () => {
    query.mockResolvedValueOnce({ rows: [{ patient_id: 1 }] }); // ownership OK

    const response = await request(app)
      .delete('/api/rehab/my/diary/42/photos/bad')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(400);
    expect(response.body).toHaveProperty('error');
  });

  it('DELETE — returns 404 when photo not found', async () => {
    query.mockResolvedValueOnce({ rows: [{ patient_id: 1 }] }); // ownership OK
    query.mockResolvedValueOnce({ rows: [] }); // photo query пустой

    const response = await request(app)
      .delete('/api/rehab/my/diary/42/photos/999')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(404);
    expect(response.body).toHaveProperty('error', 'Not Found');
  });

  // ===== POST photo — через замоканный multer/sharp =====
  // Upload endpoint покрывается отдельно: ownership + лимит 3 + happy path.
  // Middleware upload.js мокается в jest.mock сверху файла, так что sharp
  // не трогается и не ломает sibling-тесты.

  it('POST — returns 400 for non-numeric entry_id', async () => {
    const response = await request(app)
      .post('/api/rehab/my/diary/abc/photos')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(400);
    expect(response.body).toHaveProperty('error');
  });

  it('POST — returns 404 when entry does not belong to patient', async () => {
    query.mockResolvedValueOnce({ rows: [{ patient_id: 999 }] }); // чужая запись

    const response = await request(app)
      .post('/api/rehab/my/diary/42/photos')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(404);
    expect(response.body).toHaveProperty('error', 'Not Found');
  });

  it('POST — returns 400 when file not attached', async () => {
    query.mockResolvedValueOnce({ rows: [{ patient_id: 1 }] }); // ownership OK

    const response = await request(app)
      .post('/api/rehab/my/diary/42/photos')
      .set('Authorization', `Bearer ${validToken}`)
      .set('x-test-skip-file', '1') // см. mock выше — пропускает req.file
      .expect(400);
    expect(response.body).toHaveProperty('error');
  });

  it('POST — returns 400 when 3 photos already exist (limit enforcement)', async () => {
    query.mockResolvedValueOnce({ rows: [{ patient_id: 1 }] }); // ownership OK
    query.mockResolvedValueOnce({ rows: [{ n: 3 }] }); // count уже 3

    const response = await request(app)
      .post('/api/rehab/my/diary/42/photos')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(400);
    expect(response.body.message).toMatch(/Максимум 3 фото/);
  });

  it('POST — 201 happy path with row inserted', async () => {
    query.mockResolvedValueOnce({ rows: [{ patient_id: 1 }] }); // ownership OK
    query.mockResolvedValueOnce({ rows: [{ n: 1 }] }); // под лимитом
    query.mockResolvedValueOnce({
      rows: [{
        id: 77,
        file_path: '/uploads/diary_photos/test_diary_photo.jpg',
        file_size_bytes: 1000,
        created_at: new Date().toISOString(),
      }],
    });

    const response = await request(app)
      .post('/api/rehab/my/diary/42/photos')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(201);

    expect(response.body.data).toHaveProperty('id', 77);
    expect(response.body.data).toHaveProperty('file_size_bytes', 1000);
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Streak
// =====================================================

describe('GET /api/rehab/my/streak', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/streak')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return streak data', async () => {
    // 1. getStreakSummary query
    query.mockResolvedValueOnce({ rows: [fixtures.mockStreakRow] });
    // 2. programs query (для совместимости со старыми клиентами)
    query.mockResolvedValueOnce({ rows: [fixtures.mockStreakRow] });

    const response = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('current_streak', 5);
    expect(response.body.data).toHaveProperty('longest_streak', 10);
    expect(response.body.data).toHaveProperty('total_days', 20);
    expect(response.body.data).toHaveProperty('programs');
    expect(Array.isArray(response.body.data.programs)).toBe(true);
  });

  it('should return zero streak when no data', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // summary
    query.mockResolvedValueOnce({ rows: [] }); // programs

    const response = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.data.current_streak).toBe(0);
    expect(response.body.data.longest_streak).toBe(0);
    expect(response.body.data.total_days).toBe(0);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/streak')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Messages
// =====================================================

// =====================================================
// GET /my/messages — linked_diary_id + channel (Checkpoint 2)
// =====================================================
describe('GET /api/rehab/my/messages — linked_diary_id + channel', () => {
  it('возвращает linked_diary_id и channel в response (m.* SELECT)', async () => {
    const { query } = require('../../database/db');
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          patient_id: 14,
          program_id: 5,
          sender_type: 'instructor',
          sender_id: 7,
          content: 'Хорошо, продолжайте',
          is_read: false,
          created_at: '2026-04-21T08:00:00Z',
          linked_diary_id: 42,
          channel: 'in_app',
          sender_name: 'Татьяна',
        },
      ],
    });

    const res = await request(app)
      .get('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toHaveProperty('linked_diary_id', 42);
    expect(res.body.data[0]).toHaveProperty('channel', 'in_app');
  });

  it('linked_diary_id может быть null для сообщений без привязки', async () => {
    const { query } = require('../../database/db');
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          patient_id: 14,
          program_id: 5,
          sender_type: 'patient',
          sender_id: 14,
          content: 'Здравствуйте',
          is_read: true,
          created_at: '2026-04-21T08:00:00Z',
          linked_diary_id: null,
          channel: null,
          sender_name: 'Вадим',
        },
      ],
    });

    const res = await request(app)
      .get('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].linked_diary_id).toBeNull();
    expect(res.body.data[0].channel).toBeNull();
  });
});

describe('POST /api/rehab/my/messages', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .post('/api/rehab/my/messages')
      .send({ program_id: 1, body: 'Test message' })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return 400 without program_id or body', async () => {
    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation Error');
    expect(response.body.message).toContain('обязательны');
  });

  it('should return 403 when program not belonging to patient', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // check fails

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ program_id: 99, body: 'Test message' })
      .expect(403);

    expect(response.body).toHaveProperty('error', 'Forbidden');
    expect(response.body.message).toContain('Нет доступа');
  });

  it('should create message successfully', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // check passes
    query.mockResolvedValueOnce({ rows: [fixtures.mockMessageRow] }); // insert

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ program_id: 1, body: 'Test message' })
      .expect(201);

    expect(response.body).toHaveProperty('message', 'Сообщение отправлено');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data.body).toBe('Тестовое сообщение');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ program_id: 1, body: 'Test' })
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// Wave 0 commit 03 — message_kind + linked_diary_id (diary_report flow).
// Patient kicks off отчёт через POST /my/messages с message_kind='diary_report'
// и linked_diary_id, ownership check на diary_entries обязателен.
describe('POST /api/rehab/my/messages — diary_report flow', () => {
  it('создаёт diary_report при валидном linked_diary_id (ownership ok)', async () => {
    // 1. diary_entries ownership check → пациент владеет diary_id=42
    query.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    // 2. rehab_programs ownership check
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    // 3. INSERT возвращает row с новыми полями
    query.mockResolvedValueOnce({
      rows: [{
        id: 99,
        body: 'Дневник за 8 мая\nБоль: 3/10',
        message_kind: 'diary_report',
        linked_diary_id: 42,
        sender_type: 'patient',
        sender_id: 14,
        program_id: 1,
        created_at: '2026-05-08T10:30:00Z',
      }],
    });

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        program_id: 1,
        body: 'Дневник за 8 мая\nБоль: 3/10',
        message_kind: 'diary_report',
        linked_diary_id: 42,
      })
      .expect(201);

    expect(response.body.data.message_kind).toBe('diary_report');
    expect(response.body.data.linked_diary_id).toBe(42);
  });

  it('возвращает 400 если message_kind=diary_report но нет linked_diary_id', async () => {
    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        program_id: 1,
        body: 'отчёт',
        message_kind: 'diary_report',
      })
      .expect(400);

    expect(response.body.message).toContain('linked_diary_id');
  });

  it('возвращает 400 если linked_diary_id не целое число', async () => {
    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        program_id: 1,
        body: 'отчёт',
        message_kind: 'diary_report',
        linked_diary_id: 'not-a-number',
      })
      .expect(400);

    expect(response.body.message).toContain('linked_diary_id');
  });

  it('возвращает 404 если linked_diary принадлежит чужому пациенту', async () => {
    // diary_entries ownership check возвращает пустой результат
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        program_id: 1,
        body: 'отчёт',
        message_kind: 'diary_report',
        linked_diary_id: 999,
      })
      .expect(404);

    expect(response.body.error).toBe('Not Found');
    expect(response.body.message).toContain('запись дневника');
  });

  it('возвращает 400 для невалидного message_kind', async () => {
    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        program_id: 1,
        body: 'test',
        message_kind: 'session_report', // зарезервирован для Волны 3
      })
      .expect(400);

    expect(response.body.message).toContain('message_kind');
  });

  it('обычное text-сообщение по-прежнему создаётся без linked_diary_id', async () => {
    // Без message_kind = text default → diary_entries check пропускается
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // rehab_programs
    query.mockResolvedValueOnce({
      rows: [{
        id: 100,
        body: 'Привет',
        message_kind: 'text',
        linked_diary_id: null,
      }],
    });

    const response = await request(app)
      .post('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ program_id: 1, body: 'Привет' })
      .expect(201);

    expect(response.body.data.message_kind).toBe('text');
    expect(response.body.data.linked_diary_id).toBeNull();
  });
});

// Wave 0 commit 06 — статус застревания пациента на текущей фазе.
// is_stuck = NOW() > phase_started_at + duration_weeks × 1.5.
describe('GET /api/rehab/my/stuck-status', () => {
  it('возвращает 401 без токена', async () => {
    const res = await request(app).get('/api/rehab/my/stuck-status');
    expect(res.status).toBe(401);
  });

  it('возвращает is_stuck=false если активной программы нет', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // нет программы

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ is_stuck: false });
  });

  it('возвращает is_stuck=false если фазы нет в каталоге rehab_phases', async () => {
    // 1. программа есть
    query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        program_type: 'acl',
        current_phase: 99,
        phase_started_at: new Date('2026-01-01'),
        created_at: new Date('2026-01-01'),
      }],
    });
    // 2. но фазы 99 нет в каталоге
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ is_stuck: false });
  });

  it('возвращает is_stuck=true если пациент на фазе дольше 1.5×duration_weeks', async () => {
    // phase_started_at = 12 недель назад, duration_weeks = 4 → threshold = 6 недель
    const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        program_type: 'acl',
        current_phase: 2,
        phase_started_at: twelveWeeksAgo,
        created_at: twelveWeeksAgo,
      }],
    });
    query.mockResolvedValueOnce({
      rows: [{ title: 'Ранняя мобилизация', duration_weeks: 4 }],
    });

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_stuck).toBe(true);
    expect(res.body.data.current_phase).toBe(2);
    expect(res.body.data.phase_title).toBe('Ранняя мобилизация');
    expect(res.body.data.actual_weeks).toBeGreaterThanOrEqual(11);
    expect(res.body.data.expected_weeks).toBe(4);
    // anti-regression: SQL фазы использует $1 для program_type, не литерал 'acl'
    expect(query.mock.calls[1][0]).toMatch(/program_type = \$1/);
    expect(query.mock.calls[1][1]).toEqual(['acl', 2]);
  });

  it('возвращает is_stuck=false если пациент в пределах нормы', async () => {
    // 2 недели назад, duration_weeks = 4 → threshold = 6 недель → норм
    const twoWeeksAgo = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        program_type: 'acl',
        current_phase: 2,
        phase_started_at: twoWeeksAgo,
        created_at: twoWeeksAgo,
      }],
    });
    query.mockResolvedValueOnce({
      rows: [{ title: 'Ранняя мобилизация', duration_weeks: 4 }],
    });

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_stuck).toBe(false);
    expect(res.body.data.actual_weeks).toBeLessThan(4);
  });

  it('использует created_at как fallback если phase_started_at = NULL', async () => {
    const tenWeeksAgo = new Date(Date.now() - 10 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        program_type: 'acl',
        current_phase: 1,
        phase_started_at: null,
        created_at: tenWeeksAgo,
      }],
    });
    query.mockResolvedValueOnce({
      rows: [{ title: 'Защита', duration_weeks: 4 }],
    });

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_stuck).toBe(true);
    expect(res.body.data.actual_weeks).toBeGreaterThanOrEqual(9);
  });

  it('возвращает is_stuck=true для shoulder_general программы (не acl) — multi-protocol', async () => {
    // 8 недель назад, duration_weeks = "0-4" (upper=4) → threshold = 6 недель → застрял
    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{
        id: 1,
        program_type: 'shoulder_general',
        current_phase: 2,
        phase_started_at: eightWeeksAgo,
        created_at: eightWeeksAgo,
      }],
    });
    query.mockResolvedValueOnce({
      rows: [{ title: 'Иммобилизация', duration_weeks: '0-4' }],
    });

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_stuck).toBe(true);
    expect(res.body.data.phase_title).toBe('Иммобилизация');
    // anti-regression: phase lookup ушёл с правильным program_type, не 'acl'
    expect(query.mock.calls[1][1]).toEqual(['shoulder_general', 2]);
  });

  it('возвращает 500 при ошибке БД', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Server Error');
  });
});

describe('GET /api/rehab/my/messages — hydrated linked_diary', () => {
  it('возвращает linked_diary объект {id, entry_date, pain_level} для diary_report', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 99,
          program_id: 1,
          sender_type: 'patient',
          sender_id: 14,
          body: 'Дневник за 8 мая',
          is_read: false,
          message_kind: 'diary_report',
          linked_diary_id: 42,
          channel: null,
          created_at: '2026-05-08T10:30:00Z',
          sender_name: 'Вадим',
          linked_diary_date: '2026-05-08',
          linked_diary: { id: 42, entry_date: '2026-05-08', pain_level: 3 },
        },
      ],
    });

    const res = await request(app)
      .get('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('linked_diary');
    expect(res.body.data[0].linked_diary).toEqual({
      id: 42,
      entry_date: '2026-05-08',
      pain_level: 3,
    });
    expect(res.body.data[0].message_kind).toBe('diary_report');
  });

  it('linked_diary = null для обычных text-сообщений', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 100,
          program_id: 1,
          sender_type: 'instructor',
          sender_id: 7,
          body: 'Хорошо',
          message_kind: 'text',
          linked_diary_id: null,
          channel: null,
          created_at: '2026-05-08T11:00:00Z',
          sender_name: 'Татьяна',
          linked_diary_date: null,
          linked_diary: null,
        },
      ],
    });

    const res = await request(app)
      .get('/api/rehab/my/messages')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].linked_diary).toBeNull();
  });
});

// =====================================================
// AUTHENTICATED ENDPOINTS - Notifications
// =====================================================

describe('GET /api/rehab/my/notifications', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should return default settings when none saved', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('exercise_reminders', true);
    expect(response.body.data).toHaveProperty('diary_reminders', true);
    expect(response.body.data).toHaveProperty('message_notifications', true);
    expect(response.body.data).toHaveProperty('reminder_time', '09:00');
    expect(response.body.data).toHaveProperty('timezone', 'Europe/Moscow');
  });

  it('should return saved settings', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockNotificationSettingsRow] });

    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data.exercise_reminders).toBe(true);
    expect(response.body.data.reminder_time).toBe('09:00');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .get('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

describe('PUT /api/rehab/my/notifications', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .put('/api/rehab/my/notifications')
      .send({ exercise_reminders: false })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });

  it('should upsert notification settings', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockNotificationSettingsRow] });

    const response = await request(app)
      .put('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ exercise_reminders: false, reminder_time: '10:00' })
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Настройки сохранены');
    expect(response.body).toHaveProperty('data');
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .put('/api/rehab/my/notifications')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ exercise_reminders: false })
      .expect(500);

    expect(response.body).toHaveProperty('error', 'Server Error');
  });
});

// =====================================================
// Wave 1 #1.06: program_templates endpoints + POST /programs extension
// =====================================================

describe('GET /api/rehab/program-templates', () => {
  it('возвращает только активные шаблоны', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1, code: 'acl_bptb', program_type: 'acl', title: 'ПКС BPTB',
          description: null, surgery_required: true, default_phase_count: 6,
          variant_of: null, position: 1, is_active: true,
          program_type_label: 'ПКС реабилитация', program_joint: 'knee',
        },
      ],
    });

    const res = await request(app).get('/api/rehab/program-templates').expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].code).toBe('acl_bptb');
    expect(res.body.data[0].program_type_label).toBe('ПКС реабилитация');
  });

  it('фильтрует SQL по ?program_type=', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/rehab/program-templates?program_type=acl').expect(200);

    const sql = query.mock.calls[0][0];
    const params = query.mock.calls[0][1];
    expect(sql).toMatch(/AND pt\.program_type = \$1/);
    expect(params).toEqual(['acl']);
  });

  it('возвращает пустой массив если нет шаблонов', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/rehab/program-templates').expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('endpoint публичный (без auth)', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await request(app).get('/api/rehab/program-templates').expect(200);
  });
});

describe('GET /api/rehab/program-templates/:id/phases', () => {
  it('возвращает template + phases + recommended_complex', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 5, code: 'acl_bptb', program_type: 'acl', title: 'ПКС BPTB' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { phase_number: 1, title: 'Защита', subtitle: '0-2 нед', duration_weeks: '2', description: null, goals: null, restrictions: null },
          { phase_number: 2, title: 'Мобильность', subtitle: '2-6 нед', duration_weeks: '4', description: null, goals: null, restrictions: null },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            phase_number: 1, complex_template_id: 42, is_recommended: true, notes: null,
            template_id: 42, template_name: 'ПКС фаза 1 — базовый', template_description: 'Изометрика',
          },
        ],
      });

    const res = await request(app).get('/api/rehab/program-templates/5/phases').expect(200);

    expect(res.body.data.template.code).toBe('acl_bptb');
    expect(res.body.data.phases).toHaveLength(2);
    expect(res.body.data.phases[0].recommended_complex).toEqual({
      template_id: 42,
      name: 'ПКС фаза 1 — базовый',
      description: 'Изометрика',
      notes: null,
    });
    expect(res.body.data.phases[1].recommended_complex).toBeNull();
  });

  it('404 если шаблон не найден или деактивирован', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/rehab/program-templates/999/phases').expect(404);

    expect(res.body.message).toMatch(/не найден/i);
  });

  it('400 на невалидный id (не число)', async () => {
    const res = await request(app).get('/api/rehab/program-templates/abc/phases').expect(400);

    expect(res.body.message).toMatch(/невалидный/i);
  });

  it('возвращает phases с recommended_complex=null если junction пустой', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 5, code: 'knee_general_v1', program_type: 'knee_general' }] })
      .mockResolvedValueOnce({ rows: [{ phase_number: 1, title: 'Phase 1' }] })
      .mockResolvedValueOnce({ rows: [] }); // junction empty

    const res = await request(app).get('/api/rehab/program-templates/5/phases').expect(200);

    expect(res.body.data.phases[0].recommended_complex).toBeNull();
  });
});

describe('POST /api/rehab/programs — program_template_id support', () => {
  let instructorToken;

  beforeEach(() => {
    instructorToken = jwt.sign(
      { id: 1, email: 'instructor@test.com', role: 'instructor' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
  });

  it('сохраняет program_template_id и резолвит program_type из шаблона', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth middleware is_active check
      .mockResolvedValueOnce({ rows: [{ id: 14 }] })          // patientCheck
      .mockResolvedValueOnce({ rows: [{ id: 7, program_type: 'shoulder_general' }] }) // tplCheck
      .mockResolvedValueOnce({                                   // INSERT
        rows: [{
          id: 100, patient_id: 14, title: 'Реаб плеча', program_type: 'shoulder_general',
          program_template_id: 7, current_phase: 1, status: 'active',
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // streak insert

    const res = await request(app)
      .post('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: 14,
        title: 'Реаб плеча',
        program_template_id: 7,
        current_phase: 1,
      })
      .expect(201);

    expect(res.body.data.program_template_id).toBe(7);
    expect(res.body.data.program_type).toBe('shoulder_general');
  });

  it('400 если program_template_id ссылается на несуществующий шаблон', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: 14 }] })          // patientCheck
      .mockResolvedValueOnce({ rows: [] });                   // tplCheck — empty

    const res = await request(app)
      .post('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: 14,
        title: 'Реаб',
        program_template_id: 99999,
      })
      .expect(400);

    expect(res.body.message).toMatch(/шаблон.*не найден/i);
  });

  it('явный program_type перекрывает program_type шаблона', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 14 }] })
      .mockResolvedValueOnce({ rows: [{ id: 7, program_type: 'shoulder_general' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 100, program_type: 'knee_general', program_template_id: 7 }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        patient_id: 14,
        title: 'Mixed',
        program_template_id: 7,
        program_type: 'knee_general', // явно
      })
      .expect(201);

    // Проверяем что в INSERT попал именно явный program_type
    const insertCall = query.mock.calls[3]; // 4-й call — INSERT
    expect(insertCall[1]).toContain('knee_general');
  });

  it('работает без program_template_id (backwards compat)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 14 }] })
      .mockResolvedValueOnce({
        rows: [{ id: 100, program_type: 'acl', program_template_id: null }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, title: 'Без шаблона' })
      .expect(201);

    expect(res.body.data.program_template_id).toBeNull();
  });
});

// D3 — prehab phase 0 как стартовая фаза: current_phase=0 не должен коэрситься в 1.
// POST INSERT params: [...,current_phase=idx5,...]; PUT UPDATE params: [...,current_phase=idx3,...].
describe('current_phase coercion — prehab phase 0 (D3)', () => {
  let instructorToken;

  beforeEach(() => {
    instructorToken = jwt.sign(
      { id: 1, email: 'instructor@test.com', role: 'instructor' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
  });

  it('POST: current_phase=0 (prehab) сохраняется как 0, не коэрсится в 1', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })  // auth
      .mockResolvedValueOnce({ rows: [{ id: 14 }] })            // patientCheck
      .mockResolvedValueOnce({ rows: [{ id: 100, current_phase: 0, program_type: 'acl' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });        // streak

    await request(app)
      .post('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, title: 'Prehab', program_type: 'acl', current_phase: 0 })
      .expect(201);

    const insertParams = query.mock.calls[2][1];
    expect(insertParams[5]).toBe(0); // current_phase в INSERT = 0
  });

  it('POST: без current_phase → дефолт 1', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 14 }] })
      .mockResolvedValueOnce({ rows: [{ id: 100, program_type: 'acl' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .post('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ patient_id: 14, title: 'Без фазы' })
      .expect(201);

    expect(query.mock.calls[2][1][5]).toBe(1);
  });

  it('PUT: current_phase=0 (prehab) обновляется как 0, не коэрсится', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })          // auth
      .mockResolvedValueOnce({ rows: [{ id: 5, current_phase: 1 }] })  // checkResult
      .mockResolvedValueOnce({ rows: [{ id: 5, current_phase: 0 }] }); // UPDATE

    await request(app)
      .put('/api/rehab/programs/5')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ current_phase: 0 })
      .expect(200);

    expect(query.mock.calls[2][1][3]).toBe(0); // current_phase в UPDATE = 0
  });

  it('PUT: без current_phase → null (COALESCE сохраняет старую фазу)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, current_phase: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, current_phase: 2 }] });

    await request(app)
      .put('/api/rehab/programs/5')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ notes: 'только заметки' })
      .expect(200);

    expect(query.mock.calls[2][1][3]).toBeNull();
  });
});

// Sanity-тесты структуры миграции 20260513_program_templates.sql
// (паттерн как в program_types.migration.test.js — без реальной БД)
describe('20260513_program_templates migration — структура SQL', () => {
  const fs = require('fs');
  const path = require('path');
  const MIGRATION = fs.readFileSync(
    path.join(__dirname, '../../database/migrations/20260513_program_templates.sql'),
    'utf8'
  );

  it('создаёт program_templates через IF NOT EXISTS', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS program_templates/i);
  });

  it('создаёт program_template_phase_complexes через IF NOT EXISTS', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS program_template_phase_complexes/i);
  });

  it('program_templates.program_type FK на program_types(code) ON UPDATE CASCADE', () => {
    expect(MIGRATION).toMatch(/program_type VARCHAR\(50\) NOT NULL REFERENCES program_types\(code\)/i);
    expect(MIGRATION).toMatch(/ON UPDATE CASCADE/);
  });

  it('junction UNIQUE (program_template_id, phase_number)', () => {
    expect(MIGRATION).toMatch(/UNIQUE \(program_template_id, phase_number\)/);
  });

  it('rehab_programs.program_template_id добавляется через DO-блок с column_exists', () => {
    expect(MIGRATION).toMatch(/information_schema\.columns[\s\S]*column_name = 'program_template_id'/);
    expect(MIGRATION).toMatch(/ADD COLUMN program_template_id INTEGER REFERENCES program_templates\(id\) ON DELETE SET NULL/);
  });

  it('templates.program_type добавляется через DO-блок (FK на program_types)', () => {
    expect(MIGRATION).toMatch(/information_schema\.columns[\s\S]*column_name = 'program_type'/);
    expect(MIGRATION).toMatch(/ALTER TABLE templates[\s\S]*ADD COLUMN program_type VARCHAR\(50\) REFERENCES program_types\(code\)/i);
  });

  it('обёрнута в транзакцию BEGIN/COMMIT', () => {
    expect(MIGRATION).toMatch(/^BEGIN;/m);
    expect(MIGRATION).toMatch(/^COMMIT;/m);
  });

  it('создаёт 4+ индекса для нового справочника и поля', () => {
    const indexCount = (MIGRATION.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
    expect(indexCount).toBeGreaterThanOrEqual(4);
  });
});

// Wave 1 retrospective 2026-05-15 — instructor /programs list JOIN.
// Раньше JOIN с rehab_phases был хардкодом `ph.program_type = 'acl'` →
// инструктор не видел phase_title/phase_color для shoulder программ.
// Теперь JOIN использует `ph.program_type = rp.program_type`.
describe('GET /api/rehab/programs (instructor list)', () => {
  let instructorToken;

  beforeEach(() => {
    instructorToken = jwt.sign(
      { id: 5, email: 'instructor@test.com', role: 'instructor' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
  });

  it('возвращает 401 без токена', async () => {
    const res = await request(app).get('/api/rehab/programs');
    expect(res.status).toBe(401);
  });

  it('JOIN с rehab_phases использует rp.program_type (не хардкод acl) для shoulder программ', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // auth is_active check
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 11, patient_id: 1, program_type: 'shoulder_general',
          current_phase: 2, status: 'active', is_active: true,
          patient_name: 'Иван', patient_email: 'ivan@example.com',
          phase_title: 'Активные движения плеча',
          phase_subtitle: '6-12 нед.',
          phase_color: '#3B82F6',
        },
      ],
    });

    const res = await request(app)
      .get('/api/rehab/programs')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].program_type).toBe('shoulder_general');
    expect(res.body.data[0].phase_title).toBe('Активные движения плеча');
    expect(res.body.data[0].phase_color).toBe('#3B82F6');

    // anti-regression: SQL JOIN использует rp.program_type, не литерал
    const programsSql = query.mock.calls[1][0];
    expect(programsSql).toMatch(/ph\.program_type\s*=\s*rp\.program_type/);
    expect(programsSql).not.toMatch(/ph\.program_type\s*=\s*'acl'/);
  });
});

// Wave 1 #1.09 — instructor stuck-status endpoint.
// computeStuckStatus уже покрыт в stuckDetection.test.js — здесь проверяем
// только HTTP-обёртку: auth, ownership, валидация id.
describe('GET /api/rehab/programs/:id/stuck-status (instructor)', () => {
  let instructorToken;

  beforeEach(() => {
    instructorToken = jwt.sign(
      { id: 1, email: 'instructor@test.com', role: 'instructor' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
  });

  it('возвращает 401 без токена', async () => {
    const res = await request(app).get('/api/rehab/programs/1/stuck-status');
    expect(res.status).toBe(401);
  });

  it('возвращает 400 если id не число', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // auth is_active check
    const res = await request(app)
      .get('/api/rehab/programs/abc/stuck-status')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(400);
  });

  it('возвращает 404 если программы нет / не принадлежит инструктору', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth
      .mockResolvedValueOnce({ rows: [] });                    // program ownership

    const res = await request(app)
      .get('/api/rehab/programs/99/stuck-status')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(404);
  });

  it('возвращает yellow/red status для активной программы', async () => {
    const fiveWeeksAgo = new Date(Date.now() - 5 * 7 * 24 * 60 * 60 * 1000);
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })   // auth
      .mockResolvedValueOnce({                                   // program
        rows: [{
          id: 1, program_type: 'acl', current_phase: 1,
          phase_started_at: fiveWeeksAgo, created_at: fiveWeeksAgo,
        }],
      })
      .mockResolvedValueOnce({                                   // phase lookup (computeStuckStatus)
        rows: [{ title: 'Защита', duration_weeks: '0-2' }],
      });

    const res = await request(app)
      .get('/api/rehab/programs/1/stuck-status')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);
    // 5 нед при duration "0-2" (upper=2): 5 > 2.6 (yellow) и > 3.4 (red)
    expect(res.body.data.yellow).toBe(true);
    expect(res.body.data.red).toBe(true);
    expect(res.body.data.current_phase).toBe(1);
    expect(res.body.data.phase_title).toBe('Защита');
  });
});
