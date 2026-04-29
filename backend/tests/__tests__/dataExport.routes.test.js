// =====================================================
// Тесты на GET /api/patient-auth/me/data-export
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

jest.mock('../../utils/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

const request = require('supertest');
const app = require('../../server');
const { query } = require('../../database/db');
const jwt = require('jsonwebtoken');

const testPatient = { id: 14, email: 'test@patient.com', full_name: 'Тест Пациент' };
const validToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Helper — настраивает 11 параллельных запросов в порядке Promise.all
function setupQueriesForExport(opts = {}) {
  const profile = opts.profile || {
    id: 14,
    email: 'vadim@example.com',
    full_name: 'Вадим Тест',
    phone: '+79001234567',
    birth_date: '1990-01-01',
    diagnosis: null,
    notes: null,
    avatar_url: null,
    telegram_chat_id: null,
    preferred_messenger: 'telegram',
    email_verified: true,
    auth_provider: 'local',
    last_login_at: '2026-04-29T10:00:00Z',
    is_active: true,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-29T10:00:00Z',
    // Важно — в этом mock нет password_hash, чтобы видно что allowlist работает
    // (но даже если бы был — наш SELECT его не выбирает)
  };

  // Имитируем 11 query'ев в правильном порядке Promise.all'а
  query
    .mockResolvedValueOnce({ rows: [profile] })  // 1. profile
    .mockResolvedValueOnce({ rows: opts.programs || [] })  // 2. rehab_programs
    .mockResolvedValueOnce({ rows: opts.complexes || [] })  // 3. complexes
    .mockResolvedValueOnce({ rows: opts.complexExercises || [] })  // 4. complex_exercises
    .mockResolvedValueOnce({ rows: opts.progress || [] })  // 5. progress_logs
    .mockResolvedValueOnce({ rows: opts.diary || [] })  // 6. diary_entries
    .mockResolvedValueOnce({ rows: opts.diaryPhotos || [] })  // 7. diary_photos
    .mockResolvedValueOnce({ rows: opts.streaks || [] })  // 8. streaks
    .mockResolvedValueOnce({ rows: opts.messages || [] })  // 9. messages
    .mockResolvedValueOnce({ rows: opts.notifications ? [opts.notifications] : [] })  // 10. notification_settings
    .mockResolvedValueOnce({ rows: opts.auditLogs || [] })  // 11. audit_logs
    // 12. INSERT audit_logs (DATA_EXPORT) — fire-and-forget
    .mockResolvedValueOnce({ rowCount: 1 });
}

describe('GET /api/patient-auth/me/data-export', () => {
  it('returns 401 без токена', async () => {
    const res = await request(app).get('/api/patient-auth/me/data-export');
    expect(res.status).toBe(401);
  });

  it('returns 404 если patient не найден', async () => {
    // 1-й query (profile) возвращает пустой результат
    query.mockResolvedValueOnce({ rows: [] });
    // Остальные 10 параллельных тоже отрабатывают (Promise.all не короткозамыкается)
    for (let i = 0; i < 10; i++) {
      query.mockResolvedValueOnce({ rows: [] });
    }
    const res = await request(app)
      .get('/api/patient-auth/me/data-export')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 + полную структуру с auth', async () => {
    setupQueriesForExport({
      programs: [{ id: 1, title: 'ACL Phase 1', current_phase: 1, status: 'active' }],
      complexes: [{ id: 10, title: 'Утренний', is_active: true }],
      complexExercises: [
        { complex_id: 10, exercise_id: 100, order_number: 1, sets: 3, reps: 10, exercise_title: 'Разгибание' },
      ],
      progress: [{ id: 5, complex_id: 10, exercise_id: 100, completed: true, pain_level: 3 }],
      diary: [{ id: 50, entry_date: '2026-04-29', pain_level: 3, mood: 4 }],
      diaryPhotos: [{ id: 1, diary_entry_id: 50, file_size_bytes: 12345, created_at: '2026-04-29T10:00:00Z' }],
      streaks: [{ current_streak: 5, longest_streak: 10 }],
      messages: [{ id: 1, sender_type: 'patient', sender_id: 14, body: 'привет' }],
      notifications: { exercise_reminders: true, reminder_time: '09:00', timezone: 'Asia/Yekaterinburg' },
      auditLogs: [{ id: 1, action: 'OAUTH_LOGIN', entity_type: 'patient', created_at: '2026-04-29T08:00:00Z' }],
    });

    const res = await request(app)
      .get('/api/patient-auth/me/data-export')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    // Body parsed как JSON (supertest auto-parses application/json)
    expect(res.body._meta).toBeDefined();
    expect(res.body._meta.exported_by).toBe('patient_self');
    expect(res.body._meta.patient_id).toBe(14);

    expect(res.body.profile.id).toBe(14);
    expect(res.body.profile.email).toBe('vadim@example.com');
    // Allowlist: password_hash, failed_login_attempts, locked_until не возвращаются
    expect(res.body.profile.password_hash).toBeUndefined();
    expect(res.body.profile.failed_login_attempts).toBeUndefined();
    expect(res.body.profile.locked_until).toBeUndefined();

    expect(res.body.rehab_programs).toHaveLength(1);
    expect(res.body.complexes).toHaveLength(1);
    expect(res.body.complexes[0].exercises).toHaveLength(1); // exercises вложены в complex
    expect(res.body.progress_logs).toHaveLength(1);
    expect(res.body.diary_entries).toHaveLength(1);
    expect(res.body.diary_entries[0].photos).toHaveLength(1); // photos вложены в diary
    expect(res.body.diary_entries[0].photos[0].download_url).toContain('/api/rehab/my/diary/50/photos/1');
    expect(res.body.streaks).toHaveLength(1);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.notification_settings).toBeDefined();
    expect(res.body.audit_logs).toHaveLength(1);
  });

  it('content-type + content-disposition выставляет файл-скачивание', async () => {
    setupQueriesForExport();
    const res = await request(app)
      .get('/api/patient-auth/me/data-export')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toMatch(/azarean-data-export-\d{4}-\d{2}-\d{2}\.json/);
  });

  it('photo file_path НЕ возвращается (даём только download_url)', async () => {
    setupQueriesForExport({
      diary: [{ id: 50, entry_date: '2026-04-29' }],
      diaryPhotos: [{
        id: 1,
        diary_entry_id: 50,
        file_path: '/uploads/diary_photos/secret-internal-path.jpg',
        file_size_bytes: 5000,
        created_at: '2026-04-29T10:00:00Z',
      }],
    });

    const res = await request(app)
      .get('/api/patient-auth/me/data-export')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    const photo = res.body.diary_entries[0].photos[0];
    expect(photo.file_path).toBeUndefined();  // не утекает внутренний путь
    expect(photo.download_url).toBe('/api/rehab/my/diary/50/photos/1');
    expect(photo.file_size_bytes).toBe(5000);
  });

  it('audit log записан с action=DATA_EXPORT', async () => {
    setupQueriesForExport({
      diary: [{ id: 1 }, { id: 2 }],
      messages: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    await request(app)
      .get('/api/patient-auth/me/data-export')
      .set('Authorization', `Bearer ${validToken}`);

    // 12-й query (после 11 SELECT'ов) — наш INSERT в audit_logs
    const auditCall = query.mock.calls[11];
    expect(auditCall).toBeDefined();
    expect(auditCall[0]).toContain('INSERT INTO audit_logs');
    const params = auditCall[1];
    expect(params[0]).toBe('DATA_EXPORT');
    expect(params[1]).toBe(14); // entity_id
    expect(params[2]).toBe(14); // patient_id
    // details содержит rows_total
    const details = JSON.parse(params[5]);
    expect(details.rows_total).toBeGreaterThan(0);
  });
});
