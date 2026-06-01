// =====================================================
// TEST: ARC-CYCLE AC2 — инструкторский CRUD блоков программы
// program_blocks (gymnastics/training) + program_block_complexes (дни).
//
// Каркас 1:1 с rehab.routes.test.js: мок db ДО импортов, инструкторский
// JWT (process.env.JWT_SECRET, role 'instructor'), ПЕРВЫЙ query.mock = auth
// is_active. Локальный query.mockReset()/getClient.mockReset() в beforeEach
// против Once-queue leak (feedback_mock_queue_leftover).
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
const { query, getClient } = require('../../database/db');
const jwt = require('jsonwebtoken');

const AUTH_OK = { rows: [{ is_active: true }] }; // auth middleware SELECT is_active

function makeClient() {
  // mockClient для транзакций: INSERT INTO program_blocks возвращает строку блока,
  // остальное (BEGIN/COMMIT/DELETE/INSERT day/UPDATE) → пустой результат.
  const client = { query: jest.fn(), release: jest.fn() };
  client.query.mockImplementation((sql) => {
    if (/INSERT INTO program_blocks/i.test(sql)) {
      return Promise.resolve({
        rows: [{ id: 100, program_id: 1, block_type: 'training', current_day_index: 1, is_active: true }],
      });
    }
    return Promise.resolve({ rows: [] });
  });
  return client;
}

describe('ARC-CYCLE AC2 — CRUD блоков программы', () => {
  let token;

  beforeEach(() => {
    query.mockReset();
    getClient.mockReset();
    query.mockResolvedValue({ rows: [] }); // safety default (logAudit post-response и т.п.)
    token = jwt.sign(
      { id: 1, email: 'instructor@test.com', role: 'instructor' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
  });

  // ─── GET /programs/:id/blocks ───
  describe('GET /api/rehab/programs/:id/blocks', () => {
    it('404 если программа не принадлежит инструктору', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)        // auth
        .mockResolvedValueOnce({ rows: [] });  // owner — пусто
      const res = await request(app)
        .get('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      expect(res.body.error).toBe('Not Found');
    });

    it('200 возвращает список блоков с вложенными комплексами', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)                       // auth
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })        // owner
        .mockResolvedValueOnce({ rows: [                      // blocks
          { id: 10, block_type: 'gymnastics', current_day_index: null, complexes: [] },
          { id: 11, block_type: 'training', current_day_index: 1, complexes: [{ complex_id: 5, day_index: 1 }] },
        ] });
      const res = await request(app)
        .get('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      // ownership через created_by (anti-regression)
      const ownerSql = query.mock.calls[1][0];
      expect(ownerSql).toMatch(/rehab_programs WHERE id = \$1 AND created_by = \$2/);
    });
  });

  // ─── POST /programs/:id/blocks ───
  describe('POST /api/rehab/programs/:id/blocks', () => {
    it('400 при неверном block_type (без БД кроме auth)', async () => {
      query.mockResolvedValueOnce(AUTH_OK);
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'foo', complexes: [{ complex_id: 10 }] })
        .expect(400);
      expect(res.body.message).toMatch(/block_type/);
    });

    it('400 gymnastics с единицей week (нарушает per-type unit)', async () => {
      query.mockResolvedValueOnce(AUTH_OK);
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'gymnastics', target_min: 1, target_max: 2, target_unit: 'week', complexes: [{ complex_id: 10 }] })
        .expect(400);
      expect(res.body.message).toMatch(/day/);
    });

    it('400 training без day_index у комплекса', async () => {
      query.mockResolvedValueOnce(AUTH_OK);
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'training', complexes: [{ complex_id: 10 }] })
        .expect(400);
      expect(res.body.message).toMatch(/day_index/);
    });

    it('400 training с разрывом дней [1,3] (нарушает контигуозность 1..N)', async () => {
      query.mockResolvedValueOnce(AUTH_OK);
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'training', complexes: [{ complex_id: 10, day_index: 1 }, { complex_id: 11, day_index: 3 }] })
        .expect(400);
      expect(res.body.message).toMatch(/подряд/);
    });

    it('400 target_max за пределом SMALLINT (чистый 400, не 500)', async () => {
      query.mockResolvedValueOnce(AUTH_OK);
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'gymnastics', target_min: 1, target_max: 40000, target_unit: 'day', complexes: [{ complex_id: 10 }] })
        .expect(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('400 дубль complex_id в одном блоке (защита UNIQUE до INSERT)', async () => {
      query.mockResolvedValueOnce(AUTH_OK);
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'gymnastics', complexes: [{ complex_id: 10 }, { complex_id: 10 }] })
        .expect(400);
      expect(res.body.message).toMatch(/повторяться/);
    });

    it('404 если программа не принадлежит инструктору', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [] }); // owner empty
      await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'gymnastics', complexes: [{ complex_id: 10 }] })
        .expect(404);
    });

    it('400 если комплекс не принадлежит пациенту/инструктору', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [{ id: 1, patient_id: 14 }] }) // owner
        .mockResolvedValueOnce({ rows: [{ id: 10 }] });               // allComplexes: 1 из 2
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'gymnastics', complexes: [{ complex_id: 10 }, { complex_id: 11 }] })
        .expect(400);
      expect(res.body.message).toMatch(/не принадлежат/i);
    });

    it('201 создаёт gymnastics блок', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [{ id: 1, patient_id: 14 }] })  // owner
        .mockResolvedValueOnce({ rows: [{ id: 10 }, { id: 11 }] });    // allComplexes ok
      const client = makeClient();
      getClient.mockResolvedValue(client);
      const res = await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'gymnastics', target_min: 1, target_max: 2, target_unit: 'day', complexes: [{ complex_id: 10 }, { complex_id: 11 }] })
        .expect(201);
      expect(res.body.message).toMatch(/создан/i);
      // BEGIN + INSERT block + 2 day-INSERT + COMMIT
      const insertBlock = client.query.mock.calls.find((c) => /INSERT INTO program_blocks/i.test(c[0]));
      expect(insertBlock).toBeDefined();
      expect(insertBlock[1][1]).toBe('gymnastics');       // block_type
      expect(insertBlock[1][7]).toBeNull();               // current_day_index (gymnastics → null)
      const dayInserts = client.query.mock.calls.filter((c) => /INSERT INTO program_block_complexes/i.test(c[0]));
      expect(dayInserts).toHaveLength(2);
      expect(client.query.mock.calls.some((c) => c[0] === 'COMMIT')).toBe(true);
    });

    it('201 создаёт training блок с current_day_index = минимальный день', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [{ id: 1, patient_id: 14 }] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }, { id: 11 }] });
      const client = makeClient();
      getClient.mockResolvedValue(client);
      await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          block_type: 'training',
          target_min: 2, target_max: 4, target_unit: 'week',
          complexes: [{ complex_id: 10, day_index: 1, label: 'День А' }, { complex_id: 11, day_index: 2, label: 'День Б' }],
        })
        .expect(201);
      const insertBlock = client.query.mock.calls.find((c) => /INSERT INTO program_blocks/i.test(c[0]));
      expect(insertBlock[1][1]).toBe('training');
      expect(insertBlock[1][7]).toBe(1); // current_day_index = min(day_index)
    });

    it('INSERT блока кастует $8::smallint в CASE (защита от 42P08 на untyped-параметре)', async () => {
      // Регресс: node-postgres шлёт параметры без OID. $8 в «CASE WHEN $8 IS NOT NULL»
      // без каста → Postgres не выводит тип → 42P08 «не удалось определить тип данных $8»
      // → 500 на создании ЛЮБОГО блока. Mock-тесты SQL против схемы не гоняют, поэтому
      // sanity-grep что каст на месте. (Найдено живым smoke 2026-05-30, до этого все 11
      // AC2-тестов зелёные при сломанном INSERT.)
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [{ id: 1, patient_id: 14 }] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] });
      const client = makeClient();
      getClient.mockResolvedValue(client);
      await request(app)
        .post('/api/rehab/programs/1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ block_type: 'gymnastics', complexes: [{ complex_id: 10 }] })
        .expect(201);
      const insertBlock = client.query.mock.calls.find((c) => /INSERT INTO program_blocks/i.test(c[0]));
      expect(insertBlock[0]).toMatch(/\$8::smallint IS NOT NULL/);
    });
  });

  // ─── PUT /blocks/:blockId ───
  describe('PUT /api/rehab/blocks/:blockId', () => {
    it('404 если блок не принадлежит инструктору', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [] }); // owner JOIN empty
      await request(app)
        .put('/api/rehab/blocks/5')
        .set('Authorization', `Bearer ${token}`)
        .send({ complexes: [{ complex_id: 10, day_index: 1 }] })
        .expect(404);
    });

    it('200 пересобирает дни блока', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [{ id: 5, block_type: 'training', current_day_index: 2, patient_id: 14 }] }) // owner JOIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }, { id: 11 }, { id: 12 }] }); // allComplexes ok
      const client = makeClient();
      getClient.mockResolvedValue(client);
      const res = await request(app)
        .put('/api/rehab/blocks/5')
        .set('Authorization', `Bearer ${token}`)
        .send({
          complexes: [
            { complex_id: 10, day_index: 1 },
            { complex_id: 11, day_index: 2 },
            { complex_id: 12, day_index: 3 },
          ],
        })
        .expect(200);
      expect(res.body.data.id).toBe(5);
      // пересборка: DELETE дней + 3 INSERT
      expect(client.query.mock.calls.some((c) => /DELETE FROM program_block_complexes/i.test(c[0]))).toBe(true);
      const dayInserts = client.query.mock.calls.filter((c) => /INSERT INTO program_block_complexes/i.test(c[0]));
      expect(dayInserts).toHaveLength(3);
    });
  });

  // ─── DELETE /blocks/:blockId ───
  describe('DELETE /api/rehab/blocks/:blockId', () => {
    it('404 если блок не найден / не принадлежит', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [] }); // soft-delete UPDATE returns 0
      await request(app)
        .delete('/api/rehab/blocks/5')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('200 мягко удаляет блок (is_active=false)', async () => {
      query
        .mockResolvedValueOnce(AUTH_OK)
        .mockResolvedValueOnce({ rows: [{ id: 5, patient_id: 14 }] }); // UPDATE RETURNING
      const res = await request(app)
        .delete('/api/rehab/blocks/5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data.id).toBe(5);
      // soft delete = UPDATE is_active=false (anti-regression)
      const delSql = query.mock.calls[1][0];
      expect(delSql).toMatch(/UPDATE program_blocks/i);
      expect(delSql).toMatch(/is_active = false/i);
    });
  });
});
