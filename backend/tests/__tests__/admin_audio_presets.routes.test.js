// =====================================================
// TEST: Custom Audio (AA2) — /api/admin/audio-presets + /audio-cue-defaults
// upload / list / replace / serve / delete (409-on-ref) + дом-карта UPSERT
//
// Hybrid: query() мокается (без БД), multer + filesystem реальные.
// Admin-роутер: authenticateToken делает is_active DB-чек ПЕРВЫМ query → authOk()
// ставит его в очередь перед route-моками. Токен через JWT_SECRET (admin role).
// query.mockReset() в beforeEach (clearAllMocks НЕ чистит Once-очередь —
// feedback_mock_queue_leftover). Test-файлы presets/ чистятся в afterEach.
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { query } = require('../../database/db');

const adminUser = { id: 1, email: 'admin@test.com', role: 'admin' };
const adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const instructorUser = { id: 2, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(instructorUser, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const PRESETS_DIR = path.join(__dirname, '../../uploads/sounds/presets');

// Валидные magic-bytes фикстуры (≥12 байт).
const MP3_BUF = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(60)]);
const WAV_BUF = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVE'), Buffer.alloc(60),
]);
const GARBAGE_BUF = Buffer.from('this is definitely not audio content, just plain text padding');

const admin = (req) => req.set('Authorization', `Bearer ${adminToken}`);
// authenticateToken проверяет is_active в БД ПЕРВЫМ запросом → ставим в очередь.
const authOk = () => query.mockResolvedValueOnce({ rows: [{ is_active: true }] });

beforeEach(() => {
  query.mockReset();
});

// Чистим ТОЛЬКО свои id (7/8/9) — общий реальный presets/ шарится с другими audio-
// тестами (patient_program_audio id=3, admin_audio_track_presets id 21-25). Широкий
// \d+ удалял их файлы при параллельных воркерах (флак handoff §5). Узкий паттерн
// разводит файлы по тест-файлам без гонки.
afterEach(() => {
  if (fs.existsSync(PRESETS_DIR)) {
    fs.readdirSync(PRESETS_DIR)
      .filter((f) => /^(7|8|9)\.(mp3|wav)$/.test(f))
      .forEach((f) => { try { fs.unlinkSync(path.join(PRESETS_DIR, f)); } catch (_) { /* ignore */ } });
  }
});

// =====================================================
// Auth guards
// =====================================================
describe('audio-presets auth', () => {
  it('без токена → 401', async () => {
    const res = await request(app).get('/api/admin/audio-presets');
    expect(res.status).toBe(401);
  });

  it('instructor роль → 403', async () => {
    authOk();
    const res = await request(app)
      .get('/api/admin/audio-presets')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(403);
  });
});

// =====================================================
// POST /audio-presets
// =====================================================
describe('POST /api/admin/audio-presets', () => {
  it('valid MP3 → 201, файл presets/{id}.mp3, file_path НЕ в ответе', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // nextval
      .mockResolvedValueOnce({ rows: [{
        id: 7, name: 'Гонг', mime_type: 'audio/mpeg', size_bytes: MP3_BUF.length,
        duration_ms: null, original_filename: 'gong.mp3', is_active: true,
        created_at: new Date(), updated_at: new Date(),
      }] }); // INSERT RETURNING

    const res = await admin(request(app).post('/api/admin/audio-presets'))
      .field('name', 'Гонг')
      .attach('file', MP3_BUF, { filename: 'gong.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(7);
    expect(res.body.data.name).toBe('Гонг');
    expect(res.body.data.file_path).toBeUndefined(); // allowlist
    expect(fs.existsSync(path.join(PRESETS_DIR, '7.mp3'))).toBe(true);
    // INSERT: канонический file_path + mime + created_by = admin id.
    const ins = query.mock.calls[2];
    expect(ins[0]).toMatch(/INSERT INTO audio_presets/);
    expect(ins[1][2]).toBe('/uploads/sounds/presets/7.mp3');
    expect(ins[1][3]).toBe('audio/mpeg');
    expect(ins[1][7]).toBe(1); // created_by
    // audit: CREATE audio_preset залогирован.
    const audit = query.mock.calls.find((c) => /INSERT INTO audit_logs/.test(c[0]));
    expect(audit[1][1]).toBe('CREATE');
    expect(audit[1][2]).toBe('audio_preset');
  });

  it('valid WAV → 201, файл presets/{id}.wav', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 8 }] })
      .mockResolvedValueOnce({ rows: [{ id: 8, name: 'Колокол', mime_type: 'audio/wav', size_bytes: WAV_BUF.length, duration_ms: null, original_filename: 'b.wav', is_active: true, created_at: new Date(), updated_at: new Date() }] });

    const res = await admin(request(app).post('/api/admin/audio-presets'))
      .field('name', 'Колокол')
      .attach('file', WAV_BUF, { filename: 'b.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(201);
    expect(fs.existsSync(path.join(PRESETS_DIR, '8.wav'))).toBe(true);
    expect(query.mock.calls[2][1][3]).toBe('audio/wav');
  });

  it('отсутствующее name → 400, INSERT не вызван', async () => {
    authOk();
    const res = await admin(request(app).post('/api/admin/audio-presets'))
      .attach('file', MP3_BUF, { filename: 'g.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    // только is_active auth-чек, без nextval/insert.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('не-аудио по magic-bytes → 400, INSERT не вызван', async () => {
    authOk();
    const res = await admin(request(app).post('/api/admin/audio-presets'))
      .field('name', 'Фейк')
      .attach('file', GARBAGE_BUF, { filename: 'fake.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/MP3 или WAV/);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('> 512 КБ → multer прерывает (400/413/ECONNRESET)', async () => {
    authOk();
    const big = Buffer.alloc(513 * 1024, 0xff);
    let res; let err;
    try {
      res = await admin(request(app).post('/api/admin/audio-presets'))
        .field('name', 'Большой')
        .attach('file', big, { filename: 'big.mp3', contentType: 'audio/mpeg' });
    } catch (e) { err = e; }
    if (res) {
      expect([400, 413]).toContain(res.status);
    } else {
      expect(err && (err.code === 'ECONNRESET' || /aborted|reset/i.test(err.message))).toBeTruthy();
    }
  });
});

// =====================================================
// GET /audio-presets (список)
// =====================================================
describe('GET /api/admin/audio-presets', () => {
  it('список → 200, usage_count есть, file_path нет', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [{
      id: 7, name: 'Гонг', mime_type: 'audio/mpeg', size_bytes: 8000, duration_ms: 1200,
      original_filename: 'gong.mp3', is_active: true, created_at: new Date(), updated_at: new Date(),
      usage_count: 2,
    }] });

    const res = await admin(request(app).get('/api/admin/audio-presets'));
    expect(res.status).toBe(200);
    expect(res.body.data[0].usage_count).toBe(2);
    expect(res.body.data[0].file_path).toBeUndefined();
    // SQL не тянет file_path.
    expect(query.mock.calls[1][0]).not.toMatch(/ap\.file_path/);
  });
});

// =====================================================
// PUT /audio-presets/:id
// =====================================================
describe('PUT /api/admin/audio-presets/:id', () => {
  it('переименование (JSON, без файла) → 200', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, file_path: '/uploads/sounds/presets/7.mp3' }] }) // SELECT existing
      .mockResolvedValueOnce({ rows: [{ id: 7, name: 'Новое имя', mime_type: 'audio/mpeg', size_bytes: 8000, duration_ms: null, original_filename: 'g.mp3', is_active: true, created_at: new Date(), updated_at: new Date() }] }); // UPDATE

    const res = await admin(request(app).put('/api/admin/audio-presets/7'))
      .send({ name: 'Новое имя' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Новое имя');
    expect(query.mock.calls[2][0]).toMatch(/UPDATE audio_presets SET name = \$1/);
    const audit = query.mock.calls.find((c) => /INSERT INTO audit_logs/.test(c[0]));
    expect(audit[1][1]).toBe('UPDATE');
    expect(audit[1][2]).toBe('audio_preset');
  });

  it('замена файла (multipart) → 200, новый файл на диске', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 9, file_path: '/uploads/sounds/presets/9.mp3' }] })
      .mockResolvedValueOnce({ rows: [{ id: 9, name: 'Гонг', mime_type: 'audio/wav', size_bytes: WAV_BUF.length, duration_ms: null, original_filename: 'b.wav', is_active: true, created_at: new Date(), updated_at: new Date() }] });

    const res = await admin(request(app).put('/api/admin/audio-presets/9'))
      .attach('file', WAV_BUF, { filename: 'b.wav', contentType: 'audio/wav' });
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(PRESETS_DIR, '9.wav'))).toBe(true);
    // UPDATE содержит file_path/mime/size.
    expect(query.mock.calls[2][0]).toMatch(/file_path =/);
  });

  it('несуществующий id → 404', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [] }); // SELECT existing none
    const res = await admin(request(app).put('/api/admin/audio-presets/999')).send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

// =====================================================
// GET /audio-presets/:id/file
// =====================================================
describe('GET /api/admin/audio-presets/:id/file', () => {
  it('preview → 200, Content-Type + Cache-Control private', async () => {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
    fs.writeFileSync(path.join(PRESETS_DIR, '7.mp3'), MP3_BUF);
    authOk();
    query.mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/presets/7.mp3', mime_type: 'audio/mpeg' }] });

    const res = await admin(request(app).get('/api/admin/audio-presets/7/file'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.body).toBeInstanceOf(Buffer);
  });

  it('нет строки → 404', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [] });
    const res = await admin(request(app).get('/api/admin/audio-presets/7/file'));
    expect(res.status).toBe(404);
  });
});

// =====================================================
// DELETE /audio-presets/:id
// =====================================================
describe('DELETE /api/admin/audio-presets/:id', () => {
  it('используется (cnt>0) → 409, не удаляет', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [{ cnt: 2 }] }); // usage
    const res = await admin(request(app).delete('/api/admin/audio-presets/7'));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/используется в 2/);
  });

  it('0 ссылок → 200, файл удалён + строка удалена', async () => {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
    const abs = path.join(PRESETS_DIR, '7.mp3');
    fs.writeFileSync(abs, MP3_BUF);
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // usage
      .mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/presets/7.mp3' }] }) // SELECT existing
      .mockResolvedValueOnce({ rows: [] }); // DELETE

    const res = await admin(request(app).delete('/api/admin/audio-presets/7'));
    expect(res.status).toBe(200);
    expect(fs.existsSync(abs)).toBe(false);
    expect(query.mock.calls[3][0]).toMatch(/DELETE FROM audio_presets/);
    const audit = query.mock.calls.find((c) => /INSERT INTO audit_logs/.test(c[0]));
    expect(audit[1][1]).toBe('DELETE');
    expect(audit[1][2]).toBe('audio_preset');
  });

  it('0 ссылок, нет строки → 404', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] })
      .mockResolvedValueOnce({ rows: [] }); // SELECT existing none
    const res = await admin(request(app).delete('/api/admin/audio-presets/7'));
    expect(res.status).toBe(404);
  });
});

// =====================================================
// GET / PUT /audio-cue-defaults
// =====================================================
describe('GET /api/admin/audio-cue-defaults', () => {
  it('→ 200, 4 UI-cue (заданные + дефолтные)', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [
      { cue_name: 'set_start', preset_id: 3, is_locked: true, preset_name: 'Гонг', preset_is_active: true },
    ] });
    const res = await admin(request(app).get('/api/admin/audio-cue-defaults'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);
    const byCue = Object.fromEntries(res.body.data.map((d) => [d.cue_name, d]));
    expect(byCue.set_start.preset_id).toBe(3);
    expect(byCue.set_start.is_locked).toBe(true);
    expect(byCue.rest_end.preset_id).toBeNull(); // дефолт
    expect(byCue.rest_end.is_locked).toBe(false);
  });
});

describe('PUT /api/admin/audio-cue-defaults/:cue', () => {
  it('назначить активный пресет + lock → 200 UPSERT', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 3 }] }) // preset exists+active
      .mockResolvedValueOnce({ rows: [{ cue_name: 'set_start', preset_id: 3, is_locked: true, updated_at: new Date() }] }); // UPSERT

    const res = await admin(request(app).put('/api/admin/audio-cue-defaults/set_start'))
      .send({ preset_id: 3, is_locked: true });
    expect(res.status).toBe(200);
    expect(res.body.data.preset_id).toBe(3);
    expect(query.mock.calls[2][0]).toMatch(/ON CONFLICT \(cue_name\) DO UPDATE/);
    const audit = query.mock.calls.find((c) => /INSERT INTO audit_logs/.test(c[0]));
    expect(audit[1][1]).toBe('UPSERT');
    expect(audit[1][2]).toBe('audio_cue_default');
  });

  it('preset_id=null (явный тон) → 200, без проверки существования', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [{ cue_name: 'rest_end', preset_id: null, is_locked: false, updated_at: new Date() }] }); // UPSERT (без SELECT preset)
    const res = await admin(request(app).put('/api/admin/audio-cue-defaults/rest_end'))
      .send({ preset_id: null, is_locked: false });
    expect(res.status).toBe(200);
    expect(res.body.data.preset_id).toBeNull();
    // preset_id=null пропускает SELECT-проверку существования пресета.
    const selectPresetCalled = query.mock.calls.some(
      (c) => /SELECT id FROM audio_presets WHERE id = \$1 AND is_active/.test(c[0]),
    );
    expect(selectPresetCalled).toBe(false);
  });

  it('несуществующий/неактивный пресет → 400', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [] }); // preset not found
    const res = await admin(request(app).put('/api/admin/audio-cue-defaults/set_start'))
      .send({ preset_id: 999 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/не найден или неактивен/);
  });

  it('невалидный cue → 400, без query кроме auth', async () => {
    authOk();
    const res = await admin(request(app).put('/api/admin/audio-cue-defaults/bad_cue'))
      .send({ preset_id: null });
    expect(res.status).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
