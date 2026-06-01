// =====================================================
// TEST: Custom Audio (AA3) — пациентская сторона
//  - GET /my-complexes/:id → resolved audio_cues (binding ?? дом-карта ?? тон)
//  - GET /audio-presets/:id/file → scoped стрим пресета программы
// query() мокается; для serve — реальный fs (файл presets/ чистится в afterEach).
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

const PATIENT = { id: 14, email: 'avi707@mail.ru', full_name: 'Тест' };
const patientToken = jwt.sign(PATIENT, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const auth = (req) => req.set('Authorization', `Bearer ${patientToken}`);

const PRESETS_DIR = path.join(__dirname, '../../uploads/sounds/presets');
const MP3_BUF = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(60)]);

beforeEach(() => { query.mockReset(); });
afterEach(() => {
  if (fs.existsSync(PRESETS_DIR)) {
    fs.readdirSync(PRESETS_DIR).filter((f) => /^\d+\.(mp3|wav)$/.test(f))
      .forEach((f) => { try { fs.unlinkSync(path.join(PRESETS_DIR, f)); } catch (_) { /* ignore */ } });
  }
});

// =====================================================
// GET /my-complexes/:id → audio_cues
// =====================================================
describe('GET /my-complexes/:id — resolved audio_cues', () => {
  it('binding перебивает дом-карту; preset_id=null=тон; неактивный пресет→тон; нет источника→тон', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 5, title: 'X', diagnosis_name: null, diagnosis_note: null,
        recommendations: null, warnings: null, instructor_name: null,
        created_at: new Date(), exercises: [{ exercise: { id: 1 } }],
      }] }) // main SELECT
      .mockResolvedValueOnce({ rows: [
        { cue_name: 'set_start', preset_id: 3, is_locked: true },   // binding с активным пресетом
        { cue_name: 'set_end', preset_id: null, is_locked: true },  // binding «явный тон» (перебивает default)
      ] }) // complex_cue_sounds
      .mockResolvedValueOnce({ rows: [
        { cue_name: 'set_start', preset_id: 9, is_locked: false },  // дом-карта (перебита binding'ом)
        { cue_name: 'set_end', preset_id: 7, is_locked: false },    // дом-карта (перебита явным тоном)
        { cue_name: 'rest_end', preset_id: 5, is_locked: false },   // дом-карта с НЕАКТИВНЫМ пресетом
      ] }) // audio_cue_defaults
      .mockResolvedValueOnce({ rows: [
        { id: 3, is_active: true, updated_at: 't3' },
        { id: 9, is_active: true, updated_at: 't9' },
        { id: 7, is_active: true, updated_at: 't7' },
        { id: 5, is_active: false, updated_at: 't5' },
      ] }); // audio_presets

    const res = await auth(request(app).get('/api/patient-auth/my-complexes/5'));
    expect(res.status).toBe(200);
    const cues = Object.fromEntries(res.body.data.audio_cues.map((c) => [c.cue_name, c]));
    expect(res.body.data.audio_cues).toHaveLength(4);
    // set_start: binding(3, active) перебивает default(9)
    expect(cues.set_start).toMatchObject({ preset_id: 3, is_locked: true, sig: 't3' });
    // set_end: binding явный тон (null) + lock перебивает default(7)
    expect(cues.set_end).toMatchObject({ preset_id: null, is_locked: true, sig: null });
    // rest_end: default с неактивным пресетом → тон
    expect(cues.rest_end).toMatchObject({ preset_id: null, is_locked: false, sig: null });
    // count_tick: нет ни binding, ни default → тон
    expect(cues.count_tick).toMatchObject({ preset_id: null, is_locked: false, sig: null });
  });

  it('аудио-инфра падает (нет таблиц) → 200, тон-cue (graceful degrade)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 5, title: 'X', diagnosis_name: null, diagnosis_note: null,
        recommendations: null, warnings: null, instructor_name: null,
        created_at: new Date(), exercises: [{ exercise: { id: 1 } }],
      }] }) // main SELECT
      .mockRejectedValueOnce(new Error('relation "complex_cue_sounds" does not exist')); // resolution падает

    const res = await auth(request(app).get('/api/patient-auth/my-complexes/5'));
    expect(res.status).toBe(200);
    expect(res.body.data.audio_cues).toHaveLength(4);
    res.body.data.audio_cues.forEach((c) => expect(c.preset_id).toBeNull());
  });

  it('комплекс чужой → 404', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // main SELECT none
    const res = await auth(request(app).get('/api/patient-auth/my-complexes/5'));
    expect(res.status).toBe(404);
  });
});

// =====================================================
// GET /audio-presets/:id/file (scoped serve)
// =====================================================
describe('GET /my (patient) /audio-presets/:id/file', () => {
  it('пресет в scope (дом-карта/свой комплекс) + файл на диске → 200', async () => {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
    fs.writeFileSync(path.join(PRESETS_DIR, '3.mp3'), MP3_BUF);
    query.mockResolvedValueOnce({ rows: [{ file_path: '/uploads/sounds/presets/3.mp3', mime_type: 'audio/mpeg' }] });

    const res = await auth(request(app).get('/api/patient-auth/audio-presets/3/file'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.body).toBeInstanceOf(Buffer);
  });

  it('пресет вне scope (SQL вернул []) → 404', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await auth(request(app).get('/api/patient-auth/audio-presets/999/file'));
    expect(res.status).toBe(404);
    // SQL скоупит по patient_id из токена.
    expect(query.mock.calls[0][1]).toEqual([999, 14]);
  });

  it('некорректный id → 400, query не вызван', async () => {
    const res = await auth(request(app).get('/api/patient-auth/audio-presets/abc/file'));
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('без JWT → 401', async () => {
    const res = await request(app).get('/api/patient-auth/audio-presets/3/file');
    expect(res.status).toBe(401);
  });
});
