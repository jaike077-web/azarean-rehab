// =====================================================
// TEST: ROM photo upload + consent + GET photo (Wave 2 коммит 2.07)
// =====================================================
// Покрывает: POST /api/patient-auth/photo-consent, POST /my/rom/:id/photo
// (multer+sharp pipeline + consent gate + ownership + cleanup),
// GET /my/rom/:id/photo (id-based ownership, containment защита).
//
// Hybrid integration — sharp работает реально (быстрый), filesystem тоже,
// query() мокается чтобы не нужна БД. Сгенерированный fixture JPEG
// удаляется в afterAll. Загруженные test-файлы (в uploads/measurements/)
// удаляются в afterEach.
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
const crypto = require('crypto');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { query } = require('../../database/db');

const testPatient = { id: 14, email: 'avi707@mail.ru', full_name: 'Тест Пациент' };
const patientToken = jwt.sign(
  testPatient,
  process.env.PATIENT_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);
const instructorUser = { id: 1, email: 'inst@test.com', role: 'instructor' };
const instructorToken = jwt.sign(
  instructorUser,
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);

const FIXTURE_DIR = path.join(__dirname, '..', 'tmp-fixtures');
const FIXTURE_JPEG = path.join(FIXTURE_DIR, 'rom-photo-100x100.jpg');
const FIXTURE_PDF = path.join(FIXTURE_DIR, 'fake.pdf');
const MEASUREMENTS_DIR = path.join(__dirname, '../../uploads/measurements');

beforeAll(async () => {
  // Создать tmp fixtures
  if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  // Маленькая валидная JPEG для нормального flow
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg({ quality: 90 })
    .toFile(FIXTURE_JPEG);

  // Фейковый PDF — для INVALID_FILE_TYPE теста
  fs.writeFileSync(FIXTURE_PDF, '%PDF-1.4\nfake pdf content\n%%EOF');

  // FIXTURE_BIG больше не нужен — большой файл генерируем inline в тесте
  // (Buffer.alloc + контент-тайп image/jpeg). См. соответствующий it() ниже.
});

afterAll(() => {
  // Cleanup fixtures
  for (const f of [FIXTURE_JPEG, FIXTURE_PDF]) {
    try { fs.unlinkSync(f); } catch (_) { /* ignore */ }
  }
  try { fs.rmdirSync(FIXTURE_DIR); } catch (_) { /* ignore */ }
});

afterEach(() => {
  jest.clearAllMocks();
  // Cleanup любые test файлы созданные в uploads/measurements/
  if (fs.existsSync(MEASUREMENTS_DIR)) {
    fs.readdirSync(MEASUREMENTS_DIR)
      .filter((f) => f.startsWith('rom_') && f.endsWith('.jpg'))
      .forEach((f) => {
        try { fs.unlinkSync(path.join(MEASUREMENTS_DIR, f)); } catch (_) { /* ignore */ }
      });
  }
});

// =====================================================
// POST /api/patient-auth/photo-consent
// =====================================================

describe('POST /api/patient-auth/photo-consent', () => {
  it('valid POST → 200, photo_consent_at ISO, version=v1', async () => {
    const consentTime = new Date('2026-05-19T14:00:00Z');
    query.mockResolvedValueOnce({
      rows: [{ id: 14, photo_consent_at: consentTime, photo_consent_version: 'v1' }],
    });

    const res = await request(app)
      .post('/api/patient-auth/photo-consent')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.patient_id).toBe(14);
    expect(res.body.data.photo_consent_version).toBe('v1');
    expect(new Date(res.body.data.photo_consent_at).toISOString()).toBe(consentTime.toISOString());
  });

  it('без JWT → 401', async () => {
    const res = await request(app)
      .post('/api/patient-auth/photo-consent')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('idempotent re-POST обновляет timestamp', async () => {
    const t1 = new Date('2026-05-19T14:00:00Z');
    const t2 = new Date('2026-05-19T14:05:00Z');
    query
      .mockResolvedValueOnce({ rows: [{ id: 14, photo_consent_at: t1, photo_consent_version: 'v1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 14, photo_consent_at: t2, photo_consent_version: 'v1' }] });

    const r1 = await request(app)
      .post('/api/patient-auth/photo-consent')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${patientToken}`);
    const r2 = await request(app)
      .post('/api/patient-auth/photo-consent')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    // Оба раза UPDATE с photo_consent_at=NOW()
    expect(query.mock.calls[0][0]).toMatch(/photo_consent_at = NOW\(\)/);
    expect(query.mock.calls[1][0]).toMatch(/photo_consent_at = NOW\(\)/);
  });
});

// =====================================================
// POST /api/rehab/my/rom/:id/photo
// =====================================================

describe('POST /api/rehab/my/rom/:id/photo', () => {
  it('upload БЕЗ consent → 412 CONSENT_REQUIRED, файл cleaned up', async () => {
    query
      // 1. SELECT measurement → ownership OK
      .mockResolvedValueOnce({ rows: [{ id: 50, patient_id: 14, photo_url: null }] })
      // 2. SELECT consent → NULL (нет consent)
      .mockResolvedValueOnce({ rows: [{ photo_consent_at: null }] });

    const res = await request(app)
      .post('/api/rehab/my/rom/50/photo')
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', FIXTURE_JPEG);

    expect(res.status).toBe(412);
    expect(res.body.error).toBe('CONSENT_REQUIRED');

    // Файл cleaned (не должен остаться в measurements dir)
    const leftover = fs.readdirSync(MEASUREMENTS_DIR).filter((f) => f.startsWith('rom_'));
    expect(leftover).toHaveLength(0);
  });

  it('valid upload с consent → 201, файл сохранён, photo_url returned', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 51, patient_id: 14, photo_url: null }] })
      .mockResolvedValueOnce({ rows: [{ photo_consent_at: new Date('2026-05-19T14:00:00Z') }] })
      // 3. UPDATE rom_measurements
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/rehab/my/rom/51/photo')
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', FIXTURE_JPEG);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(51);
    expect(res.body.data.photo_url).toMatch(/^\/uploads\/measurements\/rom_51_\d+_[a-f0-9]+\.jpg$/);

    // UPDATE SQL содержит photo_url + measurement id
    const updateCall = query.mock.calls[2];
    expect(updateCall[0]).toMatch(/UPDATE rom_measurements SET photo_url/);
    expect(updateCall[1][1]).toBe(51);

    // Файл существует на диске
    const filename = res.body.data.photo_url.split('/').pop();
    expect(fs.existsSync(path.join(MEASUREMENTS_DIR, filename))).toBe(true);
  });

  it('overwrite: старый photo удаляется, новый создаётся', async () => {
    // Создаём dummy "старый" файл
    const oldFilename = `rom_52_${Date.now()}_old.jpg`;
    const oldFilepath = path.join(MEASUREMENTS_DIR, oldFilename);
    fs.writeFileSync(oldFilepath, 'dummy old content');
    const oldPhotoUrl = `/uploads/measurements/${oldFilename}`;

    query
      .mockResolvedValueOnce({ rows: [{ id: 52, patient_id: 14, photo_url: oldPhotoUrl }] })
      .mockResolvedValueOnce({ rows: [{ photo_consent_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/rehab/my/rom/52/photo')
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', FIXTURE_JPEG);

    expect(res.status).toBe(201);
    // Старый файл удалён
    expect(fs.existsSync(oldFilepath)).toBe(false);
    // Новый существует
    const newFilename = res.body.data.photo_url.split('/').pop();
    expect(fs.existsSync(path.join(MEASUREMENTS_DIR, newFilename))).toBe(true);
  });

  it('foreign measurement (другой patient_id) → 404, файл cleaned', async () => {
    // SELECT measurement → 0 rows (cross-patient blocked)
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/rehab/my/rom/9999/photo')
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', FIXTURE_JPEG);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');

    const leftover = fs.readdirSync(MEASUREMENTS_DIR).filter((f) => f.startsWith('rom_'));
    expect(leftover).toHaveLength(0);
  });

  it('invalid measurement id (abc) → 400', async () => {
    const res = await request(app)
      .post('/api/rehab/my/rom/abc/photo')
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', FIXTURE_JPEG);

    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('PDF вместо image → отклоняется (фильтр или ECONNRESET)', async () => {
    // multer fileFilter возвращает Error('Неверный формат...') — может
    // привести к connection reset на streaming upload. Acceptable исходы:
    // - 400 / 500 status с error в body
    // - ECONNRESET (multer killed stream)
    // В любом случае query() НЕ должен быть вызван (handler не достигнут).
    let res, err;
    try {
      res = await request(app)
        .post('/api/rehab/my/rom/53/photo')
        .set('Authorization', `Bearer ${patientToken}`)
        .attach('photo', FIXTURE_PDF);
    } catch (e) {
      err = e;
    }

    if (res) {
      expect([400, 500]).toContain(res.status);
    } else {
      expect(err && (err.code === 'ECONNRESET' || /aborted|reset/i.test(err.message))).toBeTruthy();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('файл > 10MB → multer прерывает, handler не вызван', async () => {
    // Inline 11MB buffer с фейковым JPEG content-type — multer fileFilter
    // пропустит (видит mimetype=image/jpeg), но fileSize limit сработает.
    // JPEG-фикстура через sharp не гарантирует >10MB после quantization.
    const bigBuf = Buffer.alloc(11 * 1024 * 1024, 0xff);

    let res, err;
    try {
      res = await request(app)
        .post('/api/rehab/my/rom/54/photo')
        .set('Authorization', `Bearer ${patientToken}`)
        .attach('photo', bigBuf, { filename: 'big.jpg', contentType: 'image/jpeg' });
    } catch (e) {
      err = e;
    }

    if (res) {
      expect([413, 500]).toContain(res.status);
    } else {
      expect(err && (err.code === 'ECONNRESET' || /aborted|reset/i.test(err.message))).toBeTruthy();
    }
    // Multer должен прервать ДО SELECT measurement
    expect(query).not.toHaveBeenCalled();
  });

  it('без файла → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/rehab/my/rom/55/photo')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('POST без JWT (без file) → 401', async () => {
    // .attach() с large payload вызывает ECONNRESET если 401 приходит до
    // полного upload. Без file auth check первый.
    const res = await request(app)
      .post('/api/rehab/my/rom/56/photo');
    expect(res.status).toBe(401);
  });
});

// =====================================================
// GET /api/rehab/my/rom/:id/photo
// =====================================================

describe('GET /api/rehab/my/rom/:id/photo', () => {
  let testFilepath;
  const testFilename = `rom_60_${Date.now()}_test.jpg`;

  beforeEach(async () => {
    // Создаём реальный файл для GET тестов
    testFilepath = path.join(MEASUREMENTS_DIR, testFilename);
    await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg()
      .toFile(testFilepath);
  });

  it('пациент GET своё фото → 200, Content-Type image/jpeg', async () => {
    query.mockResolvedValueOnce({
      rows: [{ photo_url: `/uploads/measurements/${testFilename}` }],
    });

    const res = await request(app)
      .get('/api/rehab/my/rom/60/photo')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('пациент GET чужое фото → 404 (SQL ownership returns 0 rows)', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/rehab/my/rom/9999/photo')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(404);
  });

  it('measurement существует, но photo_url=NULL → 404', async () => {
    query.mockResolvedValueOnce({ rows: [{ photo_url: null }] });

    const res = await request(app)
      .get('/api/rehab/my/rom/61/photo')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not uploaded/i);
  });

  it('файл отсутствует на диске → 404', async () => {
    query.mockResolvedValueOnce({
      rows: [{ photo_url: '/uploads/measurements/rom_62_ghost.jpg' }],
    });

    const res = await request(app)
      .get('/api/rehab/my/rom/62/photo')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(404);
  });

  it('path traversal через contaminated photo_url → 400 PATH_TRAVERSAL', async () => {
    // Симулируем corrupted БД row с path traversal — defense-in-depth
    query.mockResolvedValueOnce({
      rows: [{ photo_url: '/uploads/measurements/../../etc/passwd' }],
    });

    const res = await request(app)
      .get('/api/rehab/my/rom/63/photo')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PATH_TRAVERSAL');
  });

  it('GET invalid id (abc) → 400', async () => {
    const res = await request(app)
      .get('/api/rehab/my/rom/abc/photo')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('GET без JWT → 401', async () => {
    const res = await request(app).get('/api/rehab/my/rom/60/photo');
    expect(res.status).toBe(401);
  });

  it('instructor GET со СВОИМ ?patient_id → 200', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // is_active (middleware)
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] }) // instructorCanAccessPatient → владеет
      .mockResolvedValueOnce({ rows: [{ photo_url: `/uploads/measurements/${testFilename}` }] });

    const res = await request(app)
      .get('/api/rehab/my/rom/60/photo?patient_id=14')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
  });

  it('IDOR: instructor GET с ?patient_id ЧУЖОГО пациента → 404 (нет ownership)', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // is_active (middleware)
      .mockResolvedValueOnce({ rows: [] }); // instructorCanAccessPatient → НЕ владеет

    const res = await request(app)
      .get('/api/rehab/my/rom/60/photo?patient_id=999')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(404);
    // основной SELECT фото НЕ должен был выполниться (биометрика не утекла)
    const photoQuery = query.mock.calls.find(c => /FROM rom_measurements WHERE id/.test(c[0]));
    expect(photoQuery).toBeUndefined();
  });

  it('instructor без ?patient_id → 400', async () => {
    query.mockResolvedValueOnce({ rows: [{ is_active: true }] });

    const res = await request(app)
      .get('/api/rehab/my/rom/60/photo')
      .set('Authorization', `Bearer ${instructorToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/patient_id/);
  });
});
