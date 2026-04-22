// =====================================================
// Тесты на utils/audit.js — GDPR логирование
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
}));

const { query } = require('../../database/db');
const { logAudit } = require('../../utils/audit');

describe('logAudit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Отключаем console.warn чтобы не спамить в выводе тестов
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('записывает в audit_logs с user_id, action, entity_type и метаданными', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const req = {
      user: { id: 42 },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'Mozilla/5.0' },
    };

    await logAudit(req, 'READ', 'patient', 14, {
      patientId: 14,
      details: { complexes: 3 },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO audit_logs/);
    expect(params).toEqual([
      42,                       // user_id
      'READ',                   // action
      'patient',                // entity_type
      14,                       // entity_id
      14,                       // patient_id
      '127.0.0.1',              // ip
      'Mozilla/5.0',            // user_agent
      JSON.stringify({ complexes: 3 }),
    ]);
  });

  it('не записывает если req.user нет (патиентский запрос)', async () => {
    const req = { ip: '10.0.0.1', headers: {} };
    await logAudit(req, 'READ', 'diary', 1);
    expect(query).not.toHaveBeenCalled();
  });

  it('подставляет null для необязательных полей', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const req = { user: { id: 1 }, headers: {} };

    await logAudit(req, 'READ', 'patients_list', null);

    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe(1);
    expect(params[3]).toBeNull();            // entity_id
    expect(params[4]).toBeNull();            // patient_id
    expect(params[5]).toBeNull();            // ip
    expect(params[6]).toBeNull();            // user_agent
    expect(params[7]).toBe('{}');            // empty details
  });

  it('не кидает ошибку если запись в БД упала (fire-and-forget)', async () => {
    query.mockRejectedValueOnce(new Error('DB down'));
    const req = { user: { id: 1 }, ip: '1.1.1.1', headers: {} };

    await expect(
      logAudit(req, 'READ', 'patient', 1)
    ).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});
