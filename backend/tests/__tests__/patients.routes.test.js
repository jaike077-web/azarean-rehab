// =====================================================
// TESTS: patients routes (Wave 1 #1.09 — is_stuck_on_phase)
// =====================================================
// Mock-based — никаких реальных DB. Покрываем расширение GET /api/patients
// с новым полем is_stuck_on_phase (EXISTS-агрегат от phase_stuck_alerts).

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
  getClient: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { query } = require('../../database/db');

const instructorToken = jwt.sign(
  { id: 1, email: 'instructor@test.com', role: 'instructor' },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/patients — is_stuck_on_phase', () => {
  it('возвращает is_stuck_on_phase в payload', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })             // auth
      .mockResolvedValueOnce({                                            // SELECT patients
        rows: [
          {
            id: 14, full_name: 'Тест', email: 'test@example.com',
            phone: null, birth_date: null, diagnosis: null, notes: null,
            is_active: true, avatar_url: null, last_login_at: null,
            telegram_chat_id: null, created_at: '2026-05-01', updated_at: '2026-05-01',
            is_registered: false, complexes_count: '0',
            is_stuck_on_phase: true,
          },
          {
            id: 15, full_name: 'Норма', email: null,
            phone: null, birth_date: null, diagnosis: null, notes: null,
            is_active: true, avatar_url: null, last_login_at: null,
            telegram_chat_id: null, created_at: '2026-05-02', updated_at: '2026-05-02',
            is_registered: true, complexes_count: '2',
            is_stuck_on_phase: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                   // audit log INSERT

    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].is_stuck_on_phase).toBe(true);
    expect(res.body.data[1].is_stuck_on_phase).toBe(false);
  });

  it('SQL включает EXISTS-агрегат по phase_stuck_alerts', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${instructorToken}`);

    // 2-й query — SELECT patients. Проверяем что текст SQL содержит EXISTS
    // от phase_stuck_alerts с фильтрами по активной программе.
    const selectCall = query.mock.calls[1];
    expect(selectCall[0]).toMatch(/phase_stuck_alerts/);
    expect(selectCall[0]).toMatch(/is_stuck_on_phase/);
    expect(selectCall[0]).toMatch(/resolved_at IS NULL/);
  });

  it('SELECT включает zone_link_note (M2.1)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(query.mock.calls[1][0]).toMatch(/zone_link_note/);
  });
});

describe('PUT /api/patients/:id — zone_link_note (M2.1)', () => {
  it('сохраняет zone_link_note и возвращает его', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })            // auth
      .mockResolvedValueOnce({                                           // UPDATE RETURNING
        rows: [{ id: 14, full_name: 'Тест', zone_link_note: 'Слабость ТБС перегружает колено' }],
      });

    const res = await request(app)
      .put('/api/patients/14')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ full_name: 'Тест', zone_link_note: 'Слабость ТБС перегружает колено' });

    expect(res.status).toBe(200);
    expect(res.body.data.zone_link_note).toBe('Слабость ТБС перегружает колено');

    // UPDATE SQL содержит колонку + значение передано параметром (index 6 = $7)
    const updateCall = query.mock.calls[1];
    expect(updateCall[0]).toMatch(/zone_link_note = \$7/);
    expect(updateCall[1][6]).toBe('Слабость ТБС перегружает колено');
  });

  it('пустая/пробельная zone_link_note → null', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 14, zone_link_note: null }] });

    await request(app)
      .put('/api/patients/14')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ full_name: 'Тест', zone_link_note: '   ' });

    expect(query.mock.calls[1][1][6]).toBeNull();
  });
});
