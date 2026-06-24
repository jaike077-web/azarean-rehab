// TEST: POST /api/exercises/plan-script — планировщик скрипта (этап 4), structuringLlm замокан.
// Проверяем контракт: auth-гейт, валидацию title, 503-noop, проброс { script, review_points },
// маппинг ошибок LLM.

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

jest.mock('../../services/structuringLlm', () => ({
  isConfigured: jest.fn(() => true),
  planExerciseScript: jest.fn(),
  structureExercise: jest.fn(),
  chatCompletion: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { query } = require('../../database/db');
const structuringLlm = require('../../services/structuringLlm');

const instructor = { id: 1, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(instructor, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const authOk = () => query.mockResolvedValueOnce({ rows: [{ is_active: true }] });
const inst = (req) => req.set('Authorization', `Bearer ${instructorToken}`);

beforeEach(() => {
  query.mockReset();
  structuringLlm.isConfigured.mockReset();
  structuringLlm.planExerciseScript.mockReset();
  structuringLlm.isConfigured.mockReturnValue(true);
});

describe('POST /api/exercises/plan-script', () => {
  it('401 без токена', async () => {
    const res = await request(app).post('/api/exercises/plan-script').send({ title: 'Маятник Кодмана' });
    expect(res.status).toBe(401);
    expect(structuringLlm.planExerciseScript).not.toHaveBeenCalled();
  });

  it('400 без названия (короче 2 символов)', async () => {
    authOk();
    const res = await inst(request(app).post('/api/exercises/plan-script')).send({ title: 'я' });
    expect(res.status).toBe(400);
    expect(structuringLlm.planExerciseScript).not.toHaveBeenCalled();
  });

  it('503 когда LLM не настроен', async () => {
    authOk();
    structuringLlm.isConfigured.mockReturnValue(false);
    const res = await inst(request(app).post('/api/exercises/plan-script')).send({ title: 'Маятник Кодмана' });
    expect(res.status).toBe(503);
    expect(structuringLlm.planExerciseScript).not.toHaveBeenCalled();
  });

  it('200 → { script, review_points } проброшены; регион/тип из формы доходят', async () => {
    authOk();
    structuringLlm.planExerciseScript.mockResolvedValueOnce({
      script: 'Маятник Кодмана. Регион — плечо. ...',
      review_points: ['Уточните длительность удержания', 'Подтвердите противопоказания'],
    });
    const res = await inst(request(app).post('/api/exercises/plan-script'))
      .send({ title: 'Маятник Кодмана', body_region: 'shoulder', exercise_type: 'mobilization' });
    expect(res.status).toBe(200);
    expect(res.body.data.script).toMatch(/Маятник/);
    expect(res.body.data.review_points).toHaveLength(2);
    expect(structuringLlm.planExerciseScript).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Маятник Кодмана', body_region: 'shoulder', exercise_type: 'mobilization' }),
    );
  });

  it('504 на таймаут LLM', async () => {
    authOk();
    const e = new Error('timeout'); e.code = 'LLM_TIMEOUT';
    structuringLlm.planExerciseScript.mockRejectedValueOnce(e);
    const res = await inst(request(app).post('/api/exercises/plan-script')).send({ title: 'Маятник Кодмана' });
    expect(res.status).toBe(504);
  });

  it('502 на пустой ответ LLM', async () => {
    authOk();
    const e = new Error('empty'); e.code = 'LLM_EMPTY';
    structuringLlm.planExerciseScript.mockRejectedValueOnce(e);
    const res = await inst(request(app).post('/api/exercises/plan-script')).send({ title: 'Маятник Кодмана' });
    expect(res.status).toBe(502);
  });
});
