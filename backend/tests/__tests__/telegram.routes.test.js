// =====================================================
// TESTS: Telegram Linking Endpoints
// Sprint 3 — Telegram-бот
// =====================================================

// CRITICAL: Mock db BEFORE any imports
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

// =====================================================
// TEST DATA
// =====================================================

const testPatient = { id: 14, email: 'test@patient.com', full_name: 'Тест Пациент' };
const validToken = jwt.sign(testPatient, process.env.PATIENT_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// =====================================================
// SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// POST /api/telegram/link-code
// =====================================================
describe('POST /api/telegram/link-code', () => {

  it('should return 401 without token', async () => {
    const res = await request(app)
      .post('/api/telegram/link-code');

    expect(res.status).toBe(401);
  });

  it('should generate a 6-char link code', async () => {
    // Mock: invalidate old codes (UPDATE)
    query.mockResolvedValueOnce({ rows: [] });
    // Mock: insert new code (INSERT)
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/telegram/link-code')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.code).toBeDefined();
    expect(res.body.data.code.length).toBe(6);
    expect(res.body.data.expires_at).toBeDefined();
    expect(res.body.data.bot_username).toBe('azarean_rehab_bot');
  });

  it('should invalidate old codes before generating new one', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // UPDATE old codes
    query.mockResolvedValueOnce({ rows: [] }); // INSERT new code

    await request(app)
      .post('/api/telegram/link-code')
      .set('Authorization', `Bearer ${validToken}`);

    // First query should be UPDATE (invalidate old)
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toMatch(/UPDATE telegram_link_codes SET used = true/);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .post('/api/telegram/link-code')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
  });
});

// =====================================================
// GET /api/telegram/status
// =====================================================
describe('GET /api/telegram/status', () => {

  it('should return 401 without token', async () => {
    const res = await request(app)
      .get('/api/telegram/status');

    expect(res.status).toBe(401);
  });

  it('should return connected: true when telegram_chat_id exists', async () => {
    query.mockResolvedValueOnce({
      rows: [{ telegram_chat_id: 123456789 }],
    });

    const res = await request(app)
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(true);
  });

  it('should return connected: false when telegram_chat_id is null', async () => {
    query.mockResolvedValueOnce({
      rows: [{ telegram_chat_id: null }],
    });

    const res = await request(app)
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
  });
});

// =====================================================
// DELETE /api/telegram/unlink
// =====================================================
describe('DELETE /api/telegram/unlink', () => {

  it('should return 401 without token', async () => {
    const res = await request(app)
      .delete('/api/telegram/unlink');

    expect(res.status).toBe(401);
  });

  it('should successfully unlink telegram', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // UPDATE patients SET telegram_chat_id = NULL

    const res = await request(app)
      .delete('/api/telegram/unlink')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.connected).toBe(false);
    expect(res.body.message).toMatch(/отвязан/i);
  });

  it('should return 500 on database error', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .delete('/api/telegram/unlink')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
  });
});
