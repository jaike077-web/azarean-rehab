// =====================================================
// TEST: Admin API Routes (Sprint 4)
// =====================================================

// CRITICAL: Mock db BEFORE any imports
jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

const request = require('supertest');
const app = require('../../server');
const { query, testConnection } = require('../../database/db');
const jwt = require('jsonwebtoken');
const fixtures = require('../fixtures');

// =====================================================
// TEST DATA
// =====================================================

const adminUser = { id: 1, email: 'admin@test.com', role: 'admin' };
const instructorUser = { id: 2, email: 'inst@test.com', role: 'instructor' };

const adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const instructorToken = jwt.sign(instructorUser, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// =====================================================
// SETUP
// =====================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// AUTH GUARD TESTS
// =====================================================

describe('Admin Auth Guards', () => {
  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('should return 403 for instructor role', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Требуются права администратора');
  });

  it('should return 200 for admin role', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockUserRow] });
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// =====================================================
// USER MANAGEMENT
// =====================================================

describe('GET /api/admin/users', () => {
  it('should return list of users', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockUserRow, fixtures.mockInstructorRow] });
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should filter by role', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockUserRow] });
    const res = await request(app)
      .get('/api/admin/users?role=admin')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('role = $'),
      expect.arrayContaining(['admin'])
    );
  });

  it('should handle DB error', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/admin/users', () => {
  it('should create user successfully', async () => {
    // Check for existing user
    query.mockResolvedValueOnce({ rows: [] });
    // Insert user
    query.mockResolvedValueOnce({ rows: [{ id: 3, email: 'new@test.com', full_name: 'New User', role: 'instructor', is_active: true, created_at: new Date() }] });
    // Audit log
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new@test.com', password: 'Test1234', full_name: 'New User', role: 'instructor' });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('new@test.com');
  });

  it('should return 400 on missing fields', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('обязательны');
  });

  it('should return 400 on duplicate email', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'existing@test.com', password: 'Test1234', full_name: 'Dup User' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('уже существует');
  });

  it('should return 400 on weak password', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'new@test.com', password: '123', full_name: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Пароль');
  });
});

describe('PUT /api/admin/users/:id', () => {
  it('should update user', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...fixtures.mockUserRow, full_name: 'Updated' }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .put('/api/admin/users/2')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Пользователь обновлён');
  });

  it('should prevent self-deactivation', async () => {
    const res = await request(app)
      .put('/api/admin/users/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('свой аккаунт');
  });

  it('should return 404 for non-existent user', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/admin/users/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Test' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/users/:id/deactivate', () => {
  it('should deactivate user', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, email: 'inst@test.com', full_name: 'Instructor' }] });
    query.mockResolvedValueOnce({ rows: [] }); // delete refresh tokens
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .patch('/api/admin/users/2/deactivate')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Пользователь деактивирован');
  });

  it('should prevent self-deactivation', async () => {
    const res = await request(app)
      .patch('/api/admin/users/1/deactivate')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/users/:id/activate', () => {
  it('should activate user', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, email: 'inst@test.com', full_name: 'Instructor' }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .patch('/api/admin/users/2/activate')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Пользователь активирован');
  });
});

describe('PATCH /api/admin/users/:id/unlock', () => {
  it('should unlock user', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, email: 'inst@test.com', full_name: 'Instructor' }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .patch('/api/admin/users/2/unlock')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Аккаунт разблокирован');
  });
});

// =====================================================
// STATISTICS
// =====================================================

describe('GET /api/admin/stats', () => {
  it('should return all statistics', async () => {
    // 13 Promise.all queries
    const mockCount = (overrides = {}) => ({ rows: [{ total: '10', active: '8', admins: '2', instructors: '8', ...overrides }] });
    for (let i = 0; i < 13; i++) {
      query.mockResolvedValueOnce(mockCount());
    }

    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('users');
    expect(res.body.data).toHaveProperty('patients');
    expect(res.body.data).toHaveProperty('programs');
    expect(res.body.data).toHaveProperty('exercises');
    expect(res.body.data).toHaveProperty('tips');
    expect(res.body.data).toHaveProperty('audit_logs');
  });

  it('should handle DB error', async () => {
    query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(500);
  });
});

// =====================================================
// AUDIT LOGS
// =====================================================

describe('GET /api/admin/audit-logs', () => {
  it('should return paginated logs', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '50' }] }); // count
    query.mockResolvedValueOnce({ rows: [fixtures.mockAuditLogRow] }); // data

    const res = await request(app)
      .get('/api/admin/audit-logs?page=1&limit=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(50);
    expect(res.body.page).toBe(1);
    expect(res.body.totalPages).toBe(3);
  });

  it('should filter by action and entity_type', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '5' }] });
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/admin/audit-logs?action=CREATE&entity_type=patient')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('al.action = $'),
      expect.arrayContaining(['CREATE', 'patient'])
    );
  });

  it('should handle date range filters', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '2' }] });
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/admin/audit-logs?from=2026-01-01&to=2026-02-01')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});

// =====================================================
// PHASES CRUD
// =====================================================

describe('Phase CRUD', () => {
  it('GET /api/admin/phases should return all phases', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });

    const res = await request(app)
      .get('/api/admin/phases')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // JSON fields should be parsed
    expect(Array.isArray(res.body.data[0].goals)).toBe(true);
  });

  it('POST /api/admin/phases should create phase', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...fixtures.mockPhaseRow, id: 10 }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .post('/api/admin/phases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New Phase', phase_number: 7, program_type: 'acl' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Фаза создана');
  });

  it('PUT /api/admin/phases/:id should update phase', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockPhaseRow] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .put('/api/admin/phases/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Phase' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Фаза обновлена');
  });

  it('DELETE /api/admin/phases/:id should soft delete', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Phase 1' }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .delete('/api/admin/phases/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Фаза деактивирована');
  });
});

// =====================================================
// TIPS CRUD
// =====================================================

describe('Tip CRUD', () => {
  it('POST /api/admin/tips should create tip', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...fixtures.mockTipRow, id: 10 }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .post('/api/admin/tips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New Tip', body: 'Tip body text', category: 'motivation' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Совет создан');
  });

  it('PUT /api/admin/tips/:id should update tip', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockTipRow] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .put('/api/admin/tips/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Tip' });

    expect(res.status).toBe(200);
  });

  it('DELETE /api/admin/tips/:id should soft delete', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Tip 1' }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .delete('/api/admin/tips/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Совет деактивирован');
  });
});

// =====================================================
// VIDEOS CRUD
// =====================================================

describe('Video CRUD', () => {
  it('POST /api/admin/videos should create video', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // phase check
    query.mockResolvedValueOnce({ rows: [{ ...fixtures.mockVideoRow, id: 10 }] }); // insert
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .post('/api/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phase_id: 1, title: 'New Video', video_url: 'https://example.com/vid' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Видео создано');
  });

  it('PUT /api/admin/videos/:id should update video', async () => {
    query.mockResolvedValueOnce({ rows: [fixtures.mockVideoRow] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .put('/api/admin/videos/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Video' });

    expect(res.status).toBe(200);
  });

  it('DELETE /api/admin/videos/:id should soft delete', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Video 1' }] });
    query.mockResolvedValueOnce({ rows: [] }); // audit

    const res = await request(app)
      .delete('/api/admin/videos/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Видео деактивировано');
  });
});

// =====================================================
// SYSTEM INFO
// =====================================================

describe('GET /api/admin/system', () => {
  it('should return system info', async () => {
    testConnection.mockResolvedValueOnce(true);
    query.mockResolvedValueOnce({ rows: [{ size: '25 MB' }] });

    const res = await request(app)
      .get('/api/admin/system')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('server_uptime');
    expect(res.body.data).toHaveProperty('node_version');
    expect(res.body.data).toHaveProperty('environment');
    expect(res.body.data).toHaveProperty('db_connected');
    expect(res.body.data).toHaveProperty('db_size');
    expect(res.body.data).toHaveProperty('telegram_bot_active');
  });

  it('should handle testConnection failure', async () => {
    testConnection.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .get('/api/admin/system')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.db_connected).toBe(false);
  });
});
