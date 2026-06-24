// TEST: POST /api/exercises/transcribe — аудио надиктовки → текст (SpeechKit замокан).
// Сеть не трогаем; проверяем контракт: auth-гейт, 503-noop, нет файла → 400,
// проброс text, передача format/sampleRateHertz в сервис, маппинг ошибок.

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

jest.mock('../../services/yandexSpeechKit', () => ({
  isConfigured: jest.fn(() => true),
  transcribe: jest.fn(),
  ALLOWED_FORMATS: ['oggopus', 'lpcm', 'mp3'],
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { query } = require('../../database/db');
const speechkit = require('../../services/yandexSpeechKit');

const instructor = { id: 1, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(instructor, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const authOk = () => query.mockResolvedValueOnce({ rows: [{ is_active: true }] });
const inst = (req) => req.set('Authorization', `Bearer ${instructorToken}`);
const fakeAudio = Buffer.from([0x4f, 0x67, 0x67, 0x53, 1, 2, 3, 4]); // «OggS» + мусор

beforeEach(() => {
  query.mockReset();
  speechkit.isConfigured.mockReset();
  speechkit.transcribe.mockReset();
  speechkit.isConfigured.mockReturnValue(true);
});

describe('POST /api/exercises/transcribe', () => {
  it('401 без токена', async () => {
    const res = await request(app)
      .post('/api/exercises/transcribe')
      .attach('audio', fakeAudio, 'a.ogg');
    expect(res.status).toBe(401);
    expect(speechkit.transcribe).not.toHaveBeenCalled();
  });

  it('400 без файла', async () => {
    authOk();
    const res = await inst(request(app).post('/api/exercises/transcribe'));
    expect(res.status).toBe(400);
    expect(speechkit.transcribe).not.toHaveBeenCalled();
  });

  it('400 на не-аудио файл (fileFilter отсекает)', async () => {
    authOk();
    const res = await inst(request(app).post('/api/exercises/transcribe'))
      .attach('audio', Buffer.from('hello world'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(speechkit.transcribe).not.toHaveBeenCalled();
  });

  it('503 когда SpeechKit не настроен', async () => {
    authOk();
    speechkit.isConfigured.mockReturnValue(false);
    const res = await inst(request(app).post('/api/exercises/transcribe'))
      .attach('audio', fakeAudio, 'a.ogg');
    expect(res.status).toBe(503);
    expect(speechkit.transcribe).not.toHaveBeenCalled();
  });

  it('200 → { text } + format/sampleRateHertz прокинуты в сервис', async () => {
    authOk();
    speechkit.transcribe.mockResolvedValueOnce('маятник кодмана плечо');
    const res = await inst(request(app).post('/api/exercises/transcribe'))
      .field('format', 'lpcm')
      .field('sampleRateHertz', '16000')
      .attach('audio', fakeAudio, { filename: 'speech.pcm', contentType: 'audio/l16' });
    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe('маятник кодмана плечо');
    const [buf, opts] = speechkit.transcribe.mock.calls[0];
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(opts).toMatchObject({ format: 'lpcm', sampleRateHertz: 16000 });
  });

  it('дефолтный формат oggopus, если не указан', async () => {
    authOk();
    speechkit.transcribe.mockResolvedValueOnce('текст');
    const res = await inst(request(app).post('/api/exercises/transcribe'))
      .attach('audio', fakeAudio, 'a.ogg');
    expect(res.status).toBe(200);
    expect(speechkit.transcribe.mock.calls[0][1]).toMatchObject({ format: 'oggopus' });
  });

  it('504 на таймаут SpeechKit', async () => {
    authOk();
    const e = new Error('t'); e.code = 'STT_TIMEOUT';
    speechkit.transcribe.mockRejectedValueOnce(e);
    const res = await inst(request(app).post('/api/exercises/transcribe'))
      .attach('audio', fakeAudio, 'a.ogg');
    expect(res.status).toBe(504);
  });

  it('502 на HTTP-ошибку SpeechKit', async () => {
    authOk();
    const e = new Error('h'); e.code = 'STT_HTTP'; e.status = 400;
    speechkit.transcribe.mockRejectedValueOnce(e);
    const res = await inst(request(app).post('/api/exercises/transcribe'))
      .attach('audio', fakeAudio, 'a.ogg');
    expect(res.status).toBe(502);
  });
});
