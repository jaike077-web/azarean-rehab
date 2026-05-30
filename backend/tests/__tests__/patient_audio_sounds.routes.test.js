// =====================================================
// TEST: Custom Audio (CA2) — /api/patient-auth/audio-sounds
// upload / list / serve / delete (зеркало avatar-аплоада)
//
// Hybrid integration: query() мокается (без БД), multer + filesystem реальные.
// Загруженные test-файлы (uploads/sounds/) чистятся в afterEach.
// query.mockReset() в beforeEach — clearAllMocks НЕ чистит mockResolvedValueOnce
// очередь (feedback_mock_queue_leftover).
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

const PATIENT = { id: 14, email: 'avi707@mail.ru', full_name: 'Тест Пациент' };
const patientToken = jwt.sign(PATIENT, process.env.PATIENT_JWT_SECRET, {
  algorithm: 'HS256', expiresIn: '1h',
});
const OTHER = { id: 99, email: 'other@test.com', full_name: 'Другой' };
const otherToken = jwt.sign(OTHER, process.env.PATIENT_JWT_SECRET, {
  algorithm: 'HS256', expiresIn: '1h',
});

const SOUNDS_DIR = path.join(__dirname, '../../uploads/sounds');

// Валидные magic-bytes фикстуры (≥12 байт).
const MP3_BUF = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(60)]);
const WAV_BUF = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVE'), Buffer.alloc(60),
]);
const GARBAGE_BUF = Buffer.from('this is definitely not audio content, just plain text padding');

const auth = (req, token = patientToken) => req.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  query.mockReset();
});

afterEach(() => {
  // Чистим test-файлы пациентов 14/99.
  if (fs.existsSync(SOUNDS_DIR)) {
    fs.readdirSync(SOUNDS_DIR)
      .filter((f) => /^(14|99)_/.test(f))
      .forEach((f) => { try { fs.unlinkSync(path.join(SOUNDS_DIR, f)); } catch (_) { /* ignore */ } });
  }
});

// =====================================================
// POST /audio-sounds
// =====================================================
describe('POST /api/patient-auth/audio-sounds', () => {
  it('valid MP3 → 200, файл на диске, строка upserted, file_path НЕ в ответе', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // SELECT existing → нет
      .mockResolvedValueOnce({ rows: [{
        cue_name: 'set_end', mime_type: 'audio/mpeg', size_bytes: MP3_BUF.length,
        original_filename: 'beep.mp3', uploaded_at: new Date('2026-05-30T10:00:00Z'),
      }] }); // upsert RETURNING

    const res = await auth(request(app).post('/api/patient-auth/audio-sounds'))
      .field('cue_name', 'set_end')
      .attach('file', MP3_BUF, { filename: 'beep.mp3', contentType: 'audio/mpeg' });

    expect(res.status).toBe(200);
    expect(res.body.data.cue_name).toBe('set_end');
    expect(res.body.data.mime_type).toBe('audio/mpeg');
    expect(res.body.data.file_path).toBeUndefined(); // allowlist

    // Файл записан под детерминированным именем.
    expect(fs.existsSync(path.join(SOUNDS_DIR, '14_set_end.mp3'))).toBe(true);

    // INSERT-параметры: канонический file_path + mime (не client-mime).
    const insertCall = query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO patient_audio_overrides/);
    expect(insertCall[0]).toMatch(/ON CONFLICT \(patient_id, cue_name\) DO UPDATE/);
    expect(insertCall[1][2]).toBe('/uploads/sounds/14_set_end.mp3');
    expect(insertCall[1][3]).toBe('audio/mpeg');
    expect(insertCall[1][4]).toBe(MP3_BUF.length);
  });

  it('valid WAV → 200, файл 14_rest_end.wav, mime audio/wav', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        cue_name: 'rest_end', mime_type: 'audio/wav', size_bytes: WAV_BUF.length,
        original_filename: 'r.wav', uploaded_at: new Date(),
      }] });

    const res = await auth(request(app).post('/api/patient-auth/audio-sounds'))
      .field('cue_name', 'rest_end')
      .attach('file', WAV_BUF, { filename: 'r.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(SOUNDS_DIR, '14_rest_end.wav'))).toBe(true);
    expect(query.mock.calls[1][1][3]).toBe('audio/wav');
  });

  it('отсутствующий cue_name → 400, query не вызван', async () => {
    const res = await auth(request(app).post('/api/patient-auth/audio-sounds'))
      .attach('file', MP3_BUF, { filename: 'beep.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('cue вне каталога → 400, query не вызван', async () => {
    const res = await auth(request(app).post('/api/patient-auth/audio-sounds'))
      .field('cue_name', 'bad_cue')
      .attach('file', MP3_BUF, { filename: 'beep.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('не-аудио по magic-bytes (mime audio/mpeg, контент мусор) → 400, query не вызван', async () => {
    const res = await auth(request(app).post('/api/patient-auth/audio-sounds'))
      .field('cue_name', 'set_end')
      .attach('file', GARBAGE_BUF, { filename: 'fake.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/MP3 или WAV/);
    expect(query).not.toHaveBeenCalled();
  });

  it('> 512 КБ → multer прерывает (400/413/ECONNRESET), query не вызван', async () => {
    const big = Buffer.alloc(513 * 1024, 0xff);
    let res; let err;
    try {
      res = await auth(request(app).post('/api/patient-auth/audio-sounds'))
        .field('cue_name', 'set_end')
        .attach('file', big, { filename: 'big.mp3', contentType: 'audio/mpeg' });
    } catch (e) { err = e; }
    if (res) {
      expect([400, 413]).toContain(res.status);
    } else {
      expect(err && (err.code === 'ECONNRESET' || /aborted|reset/i.test(err.message))).toBeTruthy();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('без JWT → 401', async () => {
    const res = await request(app)
      .post('/api/patient-auth/audio-sounds')
      .field('cue_name', 'set_end');
    expect(res.status).toBe(401);
  });

  it('re-upload mp3→wav: старый файл удалён, новый создан', async () => {
    // Старый .mp3 на диске + в БД.
    const oldAbs = path.join(SOUNDS_DIR, '14_set_end.mp3');
    fs.writeFileSync(oldAbs, 'old dummy mp3');
    query
      .mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/14_set_end.mp3' }] }) // SELECT existing
      .mockResolvedValueOnce({ rows: [{
        cue_name: 'set_end', mime_type: 'audio/wav', size_bytes: WAV_BUF.length,
        original_filename: 'r.wav', uploaded_at: new Date(),
      }] });

    const res = await auth(request(app).post('/api/patient-auth/audio-sounds'))
      .field('cue_name', 'set_end')
      .attach('file', WAV_BUF, { filename: 'r.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(fs.existsSync(oldAbs)).toBe(false); // старый .mp3 не висит
    expect(fs.existsSync(path.join(SOUNDS_DIR, '14_set_end.wav'))).toBe(true);
  });
});

// =====================================================
// GET /audio-sounds (список)
// =====================================================
describe('GET /api/patient-auth/audio-sounds', () => {
  it('список → 200, allowlist-поля, без file_path', async () => {
    query.mockResolvedValueOnce({ rows: [{
      cue_name: 'set_end', mime_type: 'audio/mpeg', size_bytes: 8000,
      original_filename: 'beep.mp3', uploaded_at: new Date('2026-05-30T10:00:00Z'),
    }] });

    const res = await auth(request(app).get('/api/patient-auth/audio-sounds'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].cue_name).toBe('set_end');
    expect(res.body.data[0].file_path).toBeUndefined();
    // SQL не тянет file_path.
    expect(query.mock.calls[0][0]).toMatch(/SELECT cue_name, mime_type, size_bytes/);
    expect(query.mock.calls[0][0]).not.toMatch(/file_path/);
  });

  it('без JWT → 401', async () => {
    const res = await request(app).get('/api/patient-auth/audio-sounds');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});

// =====================================================
// GET /audio-sounds/:cue/file (стрим)
// =====================================================
describe('GET /api/patient-auth/audio-sounds/:cue/file', () => {
  it('свой звук → 200, Content-Type из БД, Cache-Control private, тело Buffer', async () => {
    fs.writeFileSync(path.join(SOUNDS_DIR, '14_set_end.mp3'), MP3_BUF);
    query.mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/14_set_end.mp3', mime_type: 'audio/mpeg' }] });

    const res = await auth(request(app).get('/api/patient-auth/audio-sounds/set_end/file'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('нет override (0 строк) → 404', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await auth(request(app).get('/api/patient-auth/audio-sounds/set_end/file'));
    expect(res.status).toBe(404);
  });

  it('ownership: другой пациент GET → 404 (SQL фильтрует по своему patient_id)', async () => {
    // У пациента 99 нет такой строки → query вернёт [].
    query.mockResolvedValueOnce({ rows: [] });
    const res = await auth(request(app).get('/api/patient-auth/audio-sounds/set_end/file'), otherToken);
    expect(res.status).toBe(404);
    // SQL действительно фильтрует по patient_id из токена (99).
    expect(query.mock.calls[0][1][0]).toBe(99);
  });

  it('файл в БД есть, на диске нет → 404', async () => {
    query.mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/14_ghost.mp3', mime_type: 'audio/mpeg' }] });
    const res = await auth(request(app).get('/api/patient-auth/audio-sounds/set_end/file'));
    expect(res.status).toBe(404);
  });

  it('невалидный cue → 400, query не вызван', async () => {
    const res = await auth(request(app).get('/api/patient-auth/audio-sounds/bad_cue/file'));
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('без JWT → 401', async () => {
    const res = await request(app).get('/api/patient-auth/audio-sounds/set_end/file');
    expect(res.status).toBe(401);
  });
});

// =====================================================
// DELETE /audio-sounds/:cue
// =====================================================
describe('DELETE /api/patient-auth/audio-sounds/:cue', () => {
  it('удаление → 200, файл удалён с диска + строка удалена', async () => {
    const abs = path.join(SOUNDS_DIR, '14_set_end.mp3');
    fs.writeFileSync(abs, MP3_BUF);
    query
      .mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/14_set_end.mp3' }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // DELETE

    const res = await auth(request(app).delete('/api/patient-auth/audio-sounds/set_end'));
    expect(res.status).toBe(200);
    expect(fs.existsSync(abs)).toBe(false);
    expect(query.mock.calls[1][0]).toMatch(/DELETE FROM patient_audio_overrides/);
    expect(query.mock.calls[1][1]).toEqual([14, 'set_end']);
  });

  it('нет override → 200 идемпотентно (DELETE всё равно выполнен)', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // SELECT none
      .mockResolvedValueOnce({ rows: [] }); // DELETE
    const res = await auth(request(app).delete('/api/patient-auth/audio-sounds/set_end'));
    expect(res.status).toBe(200);
  });

  it('невалидный cue → 400, query не вызван', async () => {
    const res = await auth(request(app).delete('/api/patient-auth/audio-sounds/bad_cue'));
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('без JWT → 401', async () => {
    const res = await request(app).delete('/api/patient-auth/audio-sounds/set_end');
    expect(res.status).toBe(401);
  });
});
