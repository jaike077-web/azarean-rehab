// TEST: POST /api/exercises/structure — надиктовка → поля упражнения (is*ai замокан).
// Сервис is*ai мокается целиком (сеть не трогаем); проверяем контракт эндпоинта:
// auth-гейт, валидацию входа, 503-noop, проброс { fields, warnings }, маппинг ошибок.

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

jest.mock('../../services/isai', () => ({
  isConfigured: jest.fn(() => true),
  structureExercise: jest.fn(),
  chatCompletion: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { query } = require('../../database/db');
const isai = require('../../services/isai');

const instructor = { id: 1, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(instructor, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const authOk = () => query.mockResolvedValueOnce({ rows: [{ is_active: true }] }); // authenticateToken is_active
const inst = (req) => req.set('Authorization', `Bearer ${instructorToken}`);

beforeEach(() => {
  query.mockReset();
  isai.isConfigured.mockReset();
  isai.structureExercise.mockReset();
  isai.isConfigured.mockReturnValue(true);
});

describe('POST /api/exercises/structure', () => {
  it('401 без токена', async () => {
    const res = await request(app).post('/api/exercises/structure').send({ transcript: 'Маятник плечо' });
    expect(res.status).toBe(401);
    expect(isai.structureExercise).not.toHaveBeenCalled();
  });

  it('400 на пустую расшифровку', async () => {
    authOk();
    const res = await inst(request(app).post('/api/exercises/structure')).send({ transcript: '' });
    expect(res.status).toBe(400);
    expect(isai.structureExercise).not.toHaveBeenCalled();
  });

  it('400 на слишком длинную расшифровку', async () => {
    authOk();
    const res = await inst(request(app).post('/api/exercises/structure')).send({ transcript: 'я'.repeat(8001) });
    expect(res.status).toBe(400);
    expect(isai.structureExercise).not.toHaveBeenCalled();
  });

  it('503 когда is*ai не настроен', async () => {
    authOk();
    isai.isConfigured.mockReturnValue(false);
    const res = await inst(request(app).post('/api/exercises/structure'))
      .send({ transcript: 'Маятник, плечо, без оборудования' });
    expect(res.status).toBe(503);
    expect(isai.structureExercise).not.toHaveBeenCalled();
  });

  it('200 → { fields, warnings } проброшены', async () => {
    authOk();
    isai.structureExercise.mockResolvedValueOnce({
      fields: { title: 'Маятник', body_region: 'shoulder' },
      warnings: ['equipment: не распознано «палка»'],
    });
    const res = await inst(request(app).post('/api/exercises/structure'))
      .send({ transcript: 'Маятник, плечо' });
    expect(res.status).toBe(200);
    expect(res.body.data.fields.title).toBe('Маятник');
    expect(res.body.data.fields.body_region).toBe('shoulder');
    expect(res.body.data.warnings).toContain('equipment: не распознано «палка»');
    expect(isai.structureExercise).toHaveBeenCalledWith('Маятник, плечо');
  });

  it('504 на таймаут is*ai', async () => {
    authOk();
    const e = new Error('timeout'); e.code = 'ISAI_TIMEOUT';
    isai.structureExercise.mockRejectedValueOnce(e);
    const res = await inst(request(app).post('/api/exercises/structure')).send({ transcript: 'Маятник, плечо' });
    expect(res.status).toBe(504);
  });

  it('502 на HTTP-ошибку is*ai', async () => {
    authOk();
    const e = new Error('http'); e.code = 'ISAI_HTTP'; e.status = 500;
    isai.structureExercise.mockRejectedValueOnce(e);
    const res = await inst(request(app).post('/api/exercises/structure')).send({ transcript: 'Маятник, плечо' });
    expect(res.status).toBe(502);
  });
});
