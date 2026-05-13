// =====================================================
// TEST: GET /api/rehab/program-types
// Wave 1 commit 1.02 — справочник для UI селекторов
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

const request = require('supertest');
const app = require('../../server');
const { query } = require('../../database/db');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/rehab/program-types', () => {
  const seedRows = [
    { code: 'acl', label: 'ПКС реабилитация', joint: 'knee', body_side_relevant: true, surgery_required: true, position: 1 },
    { code: 'knee_general', label: 'Реабилитация колена', joint: 'knee', body_side_relevant: true, surgery_required: false, position: 2 },
    { code: 'shoulder_general', label: 'Реабилитация плеча', joint: 'shoulder', body_side_relevant: true, surgery_required: false, position: 3 },
  ];

  it('возвращает минимальный seed из 3 кодов', async () => {
    query.mockResolvedValueOnce({ rows: seedRows });

    const res = await request(app).get('/api/rehab/program-types').expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data).toHaveLength(3);
    const codes = res.body.data.map((pt) => pt.code);
    expect(codes).toEqual(expect.arrayContaining(['acl', 'knee_general', 'shoulder_general']));
  });

  it('каждая запись содержит code/label/joint/surgery_required', async () => {
    query.mockResolvedValueOnce({ rows: seedRows });

    const res = await request(app).get('/api/rehab/program-types').expect(200);

    const aclEntry = res.body.data.find((pt) => pt.code === 'acl');
    expect(aclEntry).toEqual(
      expect.objectContaining({
        code: 'acl',
        label: 'ПКС реабилитация',
        joint: 'knee',
        surgery_required: true,
        body_side_relevant: true,
      })
    );
  });

  it('сохраняет порядок из SQL (ORDER BY position)', async () => {
    query.mockResolvedValueOnce({ rows: seedRows });

    const res = await request(app).get('/api/rehab/program-types').expect(200);

    expect(res.body.data[0].code).toBe('acl');
    expect(res.body.data[1].code).toBe('knee_general');
    expect(res.body.data[2].code).toBe('shoulder_general');
  });

  it('SQL фильтрует is_active = true и ORDER BY position', async () => {
    query.mockResolvedValueOnce({ rows: seedRows });

    await request(app).get('/api/rehab/program-types').expect(200);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/WHERE is_active = true/);
    expect(sql).toMatch(/ORDER BY position/i);
  });

  it('endpoint доступен без авторизации (публичный справочник)', async () => {
    query.mockResolvedValueOnce({ rows: seedRows });

    // без Authorization header и без cookies
    await request(app).get('/api/rehab/program-types').expect(200);
  });

  it('returns { data, total } format (no success field)', async () => {
    query.mockResolvedValueOnce({ rows: seedRows });

    const res = await request(app).get('/api/rehab/program-types').expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total', 3);
    expect(res.body).not.toHaveProperty('success');
  });

  it('возвращает пустой массив если справочник пуст', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/rehab/program-types').expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('возвращает 500 при ошибке БД', async () => {
    query.mockRejectedValueOnce(new Error('connection terminated'));

    const res = await request(app).get('/api/rehab/program-types').expect(500);

    expect(res.body).toHaveProperty('error');
  });
});
