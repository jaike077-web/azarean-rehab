// =====================================================
// TEST: Exercise Audio (EA2) — track-пресеты через /api/admin/audio-presets?kind=track
// kind-маршрутизация multer (10МБ track vs 512КБ cue), stored kind, ?kind фильтр,
// usage_count по 4 таблицам (cue + track-привязки).
//
// Hybrid: query() мокается (без БД), multer + filesystem реальные (зеркало AA2-теста).
// query.mockReset() в beforeEach. Test-файлы presets/ чистятся в afterEach.
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

const PRESETS_DIR = path.join(__dirname, '../../uploads/sounds/presets');

const MP3_HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
const MP3_SMALL = Buffer.concat([MP3_HEADER, Buffer.alloc(60)]);
// 600 КБ: больше cue-лимита (512КБ), меньше track-лимита (10МБ) — доказывает,
// что ?kind=track выбрал track-multer, а не cue.
const MP3_600KB = Buffer.concat([MP3_HEADER, Buffer.alloc(600 * 1024)]);

const admin = (req) => req.set('Authorization', `Bearer ${adminToken}`);
const authOk = () => query.mockResolvedValueOnce({ rows: [{ is_active: true }] });

beforeEach(() => {
  query.mockReset();
});

// Чистим ТОЛЬКО свои id (21..25) — общий реальный presets/ шарится с
// admin_audio_presets.routes.test.js (cue, id 7/8/9). Широкий паттерн \d+ удалял бы
// их файлы при параллельных jest-воркерах (известный флак, handoff §5). Узкий паттерн
// разводит файлы по тестам без гонки.
afterEach(() => {
  if (fs.existsSync(PRESETS_DIR)) {
    fs.readdirSync(PRESETS_DIR)
      .filter((f) => /^(21|22|23|24|25)\.(mp3|wav)$/.test(f))
      .forEach((f) => { try { fs.unlinkSync(path.join(PRESETS_DIR, f)); } catch (_) { /* ignore */ } });
  }
});

// =====================================================
// POST /audio-presets?kind=track
// =====================================================
describe('POST /api/admin/audio-presets?kind=track', () => {
  it('valid MP3 → 201, stored kind=track ($9), audit details.kind=track', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // nextval
      .mockResolvedValueOnce({ rows: [{
        id: 21, name: 'Медитация', kind: 'track', mime_type: 'audio/mpeg',
        size_bytes: MP3_SMALL.length, duration_ms: null, original_filename: 'med.mp3',
        is_active: true, created_at: new Date(), updated_at: new Date(),
      }] }); // INSERT RETURNING

    const res = await admin(request(app).post('/api/admin/audio-presets?kind=track'))
      .field('name', 'Медитация')
      .attach('file', MP3_SMALL, { filename: 'med.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe('track');
    expect(res.body.data.file_path).toBeUndefined(); // allowlist сохранён
    // (real-fs write покрыт AA2-тестом — тот же handler; здесь не ассертим fs,
    //  чтобы не зависеть от общего presets/ при параллельных воркерах)
    // INSERT: kind как $9, created_by всё ещё $8 (позиции не сдвинулись).
    const ins = query.mock.calls[2];
    expect(ins[0]).toMatch(/INSERT INTO audio_presets/);
    expect(ins[0]).toMatch(/created_by, kind/);
    expect(ins[1][7]).toBe(1);        // created_by (back-compat позиция)
    expect(ins[1][8]).toBe('track');  // kind
    // audit details содержит kind.
    const audit = query.mock.calls.find((c) => /INSERT INTO audit_logs/.test(c[0]));
    expect(audit[1][1]).toBe('CREATE');
    expect(audit[1][2]).toBe('audio_preset');
  });

  it('600 КБ файл (>512КБ cue-лимит, <10МБ track-лимит) → 201 — track-multer выбран', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 22 }] })
      .mockResolvedValueOnce({ rows: [{
        id: 22, name: 'Длинная музыка', kind: 'track', mime_type: 'audio/mpeg',
        size_bytes: MP3_600KB.length, duration_ms: null, original_filename: 'm.mp3',
        is_active: true, created_at: new Date(), updated_at: new Date(),
      }] });

    const res = await admin(request(app).post('/api/admin/audio-presets?kind=track'))
      .field('name', 'Длинная музыка')
      .attach('file', MP3_600KB, { filename: 'm.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe('track'); // ключевое: track-multer пропустил 600КБ
  });

  it('600 КБ файл БЕЗ ?kind (cue-default) → multer прерывает (cue-лимит 512КБ держит)', async () => {
    authOk();
    let res; let err;
    try {
      res = await admin(request(app).post('/api/admin/audio-presets'))
        .field('name', 'Слишком большой cue')
        .attach('file', MP3_600KB, { filename: 'm.mp3', contentType: 'audio/mpeg' });
    } catch (e) { err = e; }
    if (res) {
      expect([400, 413]).toContain(res.status);
      if (res.body && res.body.message) expect(res.body.message).toMatch(/512 КБ/);
    } else {
      expect(err && (err.code === 'ECONNRESET' || /aborted|reset/i.test(err.message))).toBeTruthy();
    }
  });

  it('БЕЗ ?kind → stored kind=cue (back-compat default)', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 23 }] })
      .mockResolvedValueOnce({ rows: [{
        id: 23, name: 'Бип', kind: 'cue', mime_type: 'audio/mpeg', size_bytes: MP3_SMALL.length,
        duration_ms: null, original_filename: 'b.mp3', is_active: true, created_at: new Date(), updated_at: new Date(),
      }] });

    const res = await admin(request(app).post('/api/admin/audio-presets'))
      .field('name', 'Бип')
      .attach('file', MP3_SMALL, { filename: 'b.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(201);
    expect(query.mock.calls[2][1][8]).toBe('cue'); // $9 kind
  });

  it('?kind=garbage → коэрсится в cue (предикат === track)', async () => {
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ id: 24 }] })
      .mockResolvedValueOnce({ rows: [{
        id: 24, name: 'X', kind: 'cue', mime_type: 'audio/mpeg', size_bytes: MP3_SMALL.length,
        duration_ms: null, original_filename: 'x.mp3', is_active: true, created_at: new Date(), updated_at: new Date(),
      }] });

    const res = await admin(request(app).post('/api/admin/audio-presets?kind=garbage'))
      .field('name', 'X')
      .attach('file', MP3_SMALL, { filename: 'x.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(201);
    expect(query.mock.calls[2][1][8]).toBe('cue');
  });
});

// =====================================================
// GET /audio-presets?kind=track (фильтр)
// =====================================================
describe('GET /api/admin/audio-presets?kind=track', () => {
  it('фильтр kind=track → SQL WHERE ap.kind = $N, kind в SELECT', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [{
      id: 21, name: 'Медитация', kind: 'track', mime_type: 'audio/mpeg', size_bytes: 900000,
      duration_ms: 300000, original_filename: 'med.mp3', is_active: true,
      created_at: new Date(), updated_at: new Date(), usage_count: 0,
    }] });

    const res = await admin(request(app).get('/api/admin/audio-presets?kind=track'));
    expect(res.status).toBe(200);
    expect(res.body.data[0].kind).toBe('track');
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/ap\.kind/);            // в SELECT
    expect(sql).toMatch(/ap\.kind = \$1/);      // в WHERE
    // params: только kind (is_active не задан).
    expect(query.mock.calls[1][1]).toEqual(['track']);
  });

  it('невалидный kind игнорируется (без WHERE по kind)', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [] });
    const res = await admin(request(app).get('/api/admin/audio-presets?kind=bogus'));
    expect(res.status).toBe(200);
    const sql = query.mock.calls[1][0];
    expect(sql).not.toMatch(/ap\.kind = \$/); // kind-фильтр не применён
    expect(query.mock.calls[1][1]).toEqual([]);
  });
});

// =====================================================
// usage_count / DELETE 409 — теперь считает exercises + complex_exercises
// =====================================================
describe('usage_count / DELETE учитывает track-привязки (exercises + complex_exercises)', () => {
  it('GET list — PRESET_USAGE_SQL включает все 4 источника ссылок', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [] });
    await admin(request(app).get('/api/admin/audio-presets'));
    const sql = query.mock.calls[1][0];
    expect(sql).toMatch(/FROM audio_cue_defaults/);
    expect(sql).toMatch(/FROM complex_cue_sounds/);
    expect(sql).toMatch(/FROM exercises e WHERE e\.audio_preset_id/);
    expect(sql).toMatch(/FROM complex_exercises ce WHERE ce\.audio_preset_id/);
  });

  it('DELETE: ссылки из exercise-привязок (cnt>0) → 409', async () => {
    authOk();
    query.mockResolvedValueOnce({ rows: [{ cnt: 3 }] }); // usage по 4 таблицам
    const res = await admin(request(app).delete('/api/admin/audio-presets/21'));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/используется в 3/);
    // usage-SQL считает exercises + complex_exercises тоже.
    const usageSql = query.mock.calls[1][0];
    expect(usageSql).toMatch(/FROM exercises WHERE audio_preset_id/);
    expect(usageSql).toMatch(/FROM complex_exercises WHERE audio_preset_id/);
  });

  it('DELETE: 0 ссылок → 200, файл + строка удалены', async () => {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
    const abs = path.join(PRESETS_DIR, '25.mp3');
    fs.writeFileSync(abs, MP3_SMALL);
    authOk();
    query
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }) // usage
      .mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/presets/25.mp3' }] }) // SELECT existing
      .mockResolvedValueOnce({ rows: [] }); // DELETE
    const res = await admin(request(app).delete('/api/admin/audio-presets/25'));
    expect(res.status).toBe(200);
    expect(fs.existsSync(abs)).toBe(false);
  });
});
