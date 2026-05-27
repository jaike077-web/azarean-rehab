# TZ Wave 2 · Коммит 2.07 — ROM photo upload + AI consent + GET photo

**Дата:** 2026-05-19
**Базовая ветка:** `73e558e` (HF#11 BIGINT)
**Новая ветка:** `wave-2/2.07-photo-upload-consent`
**Roadmap:** Wave 2 Block C продолжение (memory #24).
**Цель:** Tier 2 infrastructure для ROM photo + AI consent. Три endpoint'а: POST consent, POST ROM photo (multer+sharp), GET photo (JWT-guarded). НЕ trogaem girth (schema без photo_url by design).
**Объём:** 3-4 часа
**Риск:** средний — много moving parts (multer + sharp + filesystem + consent gate + path traversal защита). Mitigates: копируем существующий паттерн из `/my/diary/:entry_id/photos`.

---

## Verify-step перед стартом (правило #15 — КРИТИЧНО)

**Без точного output по diary_photos pattern — НЕ начинай код.** TZ опирается на copy-from-pattern, угадывать недопустимо.

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. ТОЧНЫЙ endpoint для diary_photos — full source
grep -nE "'/my/diary/.*photo|router\.(post|get).*photo" backend/routes/rehab.js | head -20
# Затем для каждой найденной строки — view ±30 строк контекста

# 2. multer config — где определён storage, fileFilter, limits
grep -rn "multer\.|multer(" backend/ --include="*.js" | head -10
cat backend/middleware/upload.js 2>/dev/null || grep -rn "const upload\|require.*multer" backend/ --include="*.js" | head -5

# 3. sharp pipeline для diary_photos — точная команда (resize, format, quality)
grep -rn "sharp(" backend/ --include="*.js" | head -10

# 4. Filesystem structure
ls -la backend/uploads/diary_photos/ | head -5
# Сколько файлов, какие имена (uuid? patient_id_entry_id_*?), какое расширение

# 5. Static serve для uploads — express.static или custom handler?
grep -rn "express\.static.*uploads\|/uploads/\|sendFile.*uploads" backend/ --include="*.js"

# 6. authenticatePatientOrInstructor middleware
grep -rn "authenticatePatientOrInstructor\|patientOrInstructor" backend/middleware/ backend/routes/ | head -5

# 7. ENV variable для uploads dir? (или hardcoded path.join)
grep -rn "UPLOADS_DIR\|UPLOADS_BASE\|process\.env\..*UPLOAD" backend/ --include="*.js" | head -5

# 8. Подтверждение patients consent колонок
psql -U postgres -d azarean_rehab -c "\d patients" | grep -E "(photo_consent|measurement_reference)"

# 9. Подтверждение rom_measurements.photo_url
psql -U postgres -d azarean_rehab -c "\d rom_measurements" | grep "photo_url"

# 10. helper для multipart в tests (если нужно — Supertest .attach())
grep -rn "\.attach\(\|multipart" backend/tests/__tests__/*.test.js | head -5
```

**Output ВСЕХ команд → в commit report текстом** (rule #15).

**Stop-условия:**
- Если diary_photos endpoint не найден → Vadim говорил он существует; если grep пустой — остановись и доложи (возможно in other файл)
- Если multer config в отдельном middleware (`backend/middleware/upload.js` или similar) → НЕ создавай новый файл с другим конфигом, переиспользуй
- Если `authenticatePatientOrInstructor` отсутствует → используй два endpoint'а или создай middleware (см. секцию реализации)

---

## Зависимости

Ветка `wave-2/2.07-photo-upload-consent` от `73e558e` (HF#11).
После DoD ⏸ frozen. Стек становится **12 PR**.

---

## Что блокирует

**Блокирует:** TZ 2.08 frontend Tier 1 UI (photo capture/upload + consent dialog) — без backend endpoint'ов фронт не работает.
**НЕ блокирует:** другие планируемые features.

---

## ❌ НЕ создавать / ❌ НЕ трогать

- ❌ Photo для **girth** — `girth_measurements` НЕ имеет `photo_url` column (schema 2.01, observation 2.06 verify). Girth photo — отдельная фича Wave 3 если потребуется
- ❌ DELETE / PUT photo endpoint — для MVP пациент создаёт новый measurement если photo плохой. Cleanup job stale файлов — Wave 3 backlog
- ❌ Multiple photos per measurement — одна photo_url column, один photo. Multi-photo — Wave 3
- ❌ Photo audit log — patient self-actions не логируем (audit только для admin actions, memory #17). Photo-consent тоже patient self-action, no audit
- ❌ Encryption at-rest для photo files — выявлено как backlog (compliance disclaimer был неточен)
- ❌ AI processing photo (MediaPipe ROM analysis) — Block D, не 2.07
- ❌ Reference photo для пациента (`patients.measurement_reference_photo_url`) — это инструктор показывает пример позы; отдельный flow, **не в 2.07**
- ❌ ExerciseRunner, PainEventForm, DailyPainSection — LOCKED / out of scope
- ❌ Frontend — TZ 2.08
- ❌ Schema изменения — нет миграций, columns уже на месте из 2.01

---

## ✅ Переиспользуем

- **Multer + sharp pattern** из `routes/rehab.js` endpoint'а `/my/diary/:entry_id/photos` — точный config копируем (verify-step output подтвердит)
- `middleware/patientAuth.js` — `authenticatePatient`, `req.patient.id` (memory #17)
- `middleware/patientOrInstructorAuth.js` (или `authenticatePatientOrInstructor` если есть, memory #5) — composite для GET photo
- `database/db.js` — `query()` (memory #14)
- API format `{data, message?, total?}` (memory #11)
- `backend/uploads/` структура — `backend/uploads/measurements/` рядом с `avatars/` и `diary_photos/`

---

## Реализация

### Часть A — Создать директорию

```bash
mkdir -p backend/uploads/measurements
touch backend/uploads/measurements/.gitkeep
```

В `.gitignore` уже должно быть `backend/uploads/*/!.gitkeep` или подобное (verify через `cat backend/.gitignore`). Если нет — добавить:
```
backend/uploads/avatars/*
backend/uploads/diary_photos/*
backend/uploads/measurements/*
!backend/uploads/*/.gitkeep
```

### Часть B — POST /api/auth/patient/photo-consent

В `backend/routes/patientAuth.js` (или где находятся `/api/auth/patient/*` endpoints — verify-step подтвердит):

```javascript
// POST /api/auth/patient/photo-consent
// Idempotent — пациент может re-confirm (updates timestamp).
router.post('/photo-consent', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const version = 'v1';  // legal text version, hardcode для MVP

    const result = await query(`
      UPDATE patients
      SET photo_consent_at = NOW(),
          photo_consent_version = $2
      WHERE id = $1
      RETURNING id, photo_consent_at, photo_consent_version
    `, [patientId, version]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Patient not found' });
    }

    res.json({
      data: {
        patient_id: result.rows[0].id,
        photo_consent_at: result.rows[0].photo_consent_at,
        photo_consent_version: result.rows[0].photo_consent_version,
      },
      message: 'Photo consent recorded',
    });
  } catch (err) {
    console.error('POST /auth/patient/photo-consent error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to record consent' });
  }
});
```

**Замечание:** consent версия `'v1'` hardcode'на. Когда legal обновит текст соглашения — incrementing к `'v2'`; frontend должен показать новое соглашение если consent_version устарел. Это Wave 3 (current scope: единственная version).

### Часть C — POST /api/rehab/my/rom/:id/photo (multer + sharp)

В `backend/routes/rehab.js`:

```javascript
// === Multer + sharp config — копируем из diary_photos endpoint (verify-step подтвердит) ===
// Если diary_photos использует shared middleware (backend/middleware/upload.js) — import оттуда
// Если inline в routes/rehab.js — копируем точную конструкцию

const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const sharp = require('sharp');

const MEASUREMENTS_UPLOAD_DIR = path.join(__dirname, '../uploads/measurements');

// multer — in-memory для последующего sharp processing (НЕ direct-to-disk)
const measurementsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },  // 10MB raw upload, sharp downscales
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'), false);
    }
    cb(null, true);
  },
});

// POST /api/rehab/my/rom/:id/photo
router.post(
  '/my/rom/:id/photo',
  authenticatePatient,
  measurementsUpload.single('photo'),
  async (req, res) => {
    try {
      const patientId = req.patient.id;
      const measurementId = parseInt(req.params.id, 10);

      if (!Number.isFinite(measurementId) || measurementId <= 0) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid measurement id' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Photo file required (field name: photo)' });
      }

      // 1. Проверить ownership + существование measurement
      const measurement = await query(
        'SELECT id, patient_id, photo_url FROM rom_measurements WHERE id = $1 AND patient_id = $2',
        [measurementId, patientId]
      );
      if (measurement.rows.length === 0) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Measurement not found' });
      }

      // 2. Проверить consent (412 Precondition Failed — observation #7 из 2.06 verify)
      const consent = await query(
        'SELECT photo_consent_at FROM patients WHERE id = $1',
        [patientId]
      );
      if (!consent.rows[0] || consent.rows[0].photo_consent_at == null) {
        return res.status(412).json({
          error: 'CONSENT_REQUIRED',
          message: 'Patient must accept photo consent before uploading photos',
        });
      }

      // 3. sharp pipeline — 1200max JPEG q82 (копия diary_photos, memory #22)
      const filename = `${patientId}_${measurementId}_${Date.now()}.jpg`;
      const filepath = path.join(MEASUREMENTS_UPLOAD_DIR, filename);

      await sharp(req.file.buffer)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(filepath);

      // 4. Обновить photo_url в DB. URL — относительный, фронт строит полный.
      const photoUrl = `/api/uploads/measurements/${filename}`;
      await query(
        'UPDATE rom_measurements SET photo_url = $1, updated_at = NOW() WHERE id = $2',
        [photoUrl, measurementId]
      );

      // 5. Если был старый photo — удалить файл (cleanup)
      const oldPhotoUrl = measurement.rows[0].photo_url;
      if (oldPhotoUrl && oldPhotoUrl !== photoUrl) {
        const oldFilename = path.basename(oldPhotoUrl);
        const oldFilepath = path.join(MEASUREMENTS_UPLOAD_DIR, oldFilename);
        // Защита: убедиться что resolved path действительно в MEASUREMENTS_UPLOAD_DIR
        if (oldFilepath.startsWith(MEASUREMENTS_UPLOAD_DIR + path.sep)) {
          try { await fs.unlink(oldFilepath); } catch (e) { /* ignore — старый файл может отсутствовать */ }
        }
      }

      res.status(201).json({
        data: { id: measurementId, photo_url: photoUrl },
        message: 'Photo uploaded',
      });
    } catch (err) {
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: 'INVALID_FILE_TYPE', message: 'Allowed: jpeg, png, webp' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'Max 10MB' });
      }
      console.error('POST /my/rom/:id/photo error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to upload photo' });
    }
  }
);
```

**Важно по multer error handling:** `fileFilter` ошибки попадают в `err.message`, `limits` ошибки в `err.code`. Если diary_photos использует Express error middleware для multer — копируем тот же подход.

### Часть D — GET /api/uploads/measurements/:filename

Новый endpoint (НЕ через `express.static` — нужна JWT защита + ownership check):

```javascript
// GET /api/uploads/measurements/:filename
// JWT-guarded + ownership check через filename pattern: {patient_id}_{measurement_id}_{ts}.jpg
router.get('/measurements/:filename', authenticatePatientOrInstructor, async (req, res) => {
  try {
    const { filename } = req.params;

    // 1. Whitelist filename — только safe chars (path traversal защита)
    if (!/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      return res.status(400).json({ error: 'INVALID_FILENAME', message: 'Bad filename format' });
    }

    // 2. Resolve путь и проверить containment
    const filepath = path.resolve(MEASUREMENTS_UPLOAD_DIR, filename);
    if (!filepath.startsWith(MEASUREMENTS_UPLOAD_DIR + path.sep)) {
      return res.status(400).json({ error: 'PATH_TRAVERSAL', message: 'Forbidden path' });
    }

    // 3. Ownership check
    // - Инструктор видит любое фото (req.user — instructor JWT)
    // - Пациент видит только свои (filename начинается с `${req.patient.id}_`)
    if (req.patient) {
      // Patient JWT
      const prefix = `${req.patient.id}_`;
      if (!filename.startsWith(prefix)) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your photo' });
      }
    } else if (!req.user || req.user.role !== 'instructor') {
      // Если не patient и не instructor — composite middleware пропустил неправильно
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Authentication required' });
    }

    // 4. Existence check + serve
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Photo not found' });
    }

    // Content-Type по расширению
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png'
                      : ext === '.webp' ? 'image/webp'
                      : 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=3600');  // private — JWT-guarded
    res.sendFile(filepath);
  } catch (err) {
    console.error('GET /uploads/measurements/:filename error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch photo' });
  }
});
```

**Mount location:** этот route НЕ под `/api/rehab/my/*` (это not "my" measurement, а static-like resource). Лучше под `/api/uploads/measurements/*`. Если в существующем коде есть `/api/uploads/*` router — добавить туда. Если нет — create `backend/routes/uploads.js` и mount в `app.js`:
```javascript
const uploadsRouter = require('./routes/uploads');
app.use('/api/uploads', uploadsRouter);
```

**Verify-step должен подсказать**: есть ли уже `/api/uploads/*` mount (для avatars/diary_photos) — если есть, переиспользуем структуру.

### Если authenticatePatientOrInstructor отсутствует

Если middleware composite нет, два опции:
1. Создать `backend/middleware/patientOrInstructorAuth.js` — пытается `authenticatePatient`, если fail → пытается `authenticateInstructor`, если оба fail → 401
2. Сделать два endpoint'а — `/api/uploads/measurements/:filename` для пациентов, `/api/admin/uploads/measurements/:filename` для инструкторов

Вариант 1 cleaner. Создать middleware, ~30 строк.

---

## Tests — `backend/tests/__tests__/rehab_photo_upload.test.js`

15+ тестов. Шаблон из существующего `rehab_pain.test.js` / `rehab_measurements.test.js` + Supertest `.attach()` для multipart.

### POST consent (3)
1. **Valid POST** → 200, `data.photo_consent_at` is ISO timestamp, `data.photo_consent_version === 'v1'`
2. **POST без JWT** → 401
3. **Idempotent re-POST** → 200, timestamp обновился (или равен — допустимо в зависимости от millisecond precision)

### POST photo (8-10)
4. **Valid photo upload без consent** → 412 CONSENT_REQUIRED
5. **POST consent → valid photo upload** → 201, photo_url возвращён, файл существует в `backend/uploads/measurements/`
6. **DB photo_url обновлён** после upload (`SELECT photo_url FROM rom_measurements WHERE id = ...`)
7. **Upload второго photo на тот же measurement** → 201, старый файл удалён, новый создан
8. **Invalid measurement id** (`/rom/abc/photo`) → 400
9. **Measurement другого пациента** (patient A создал measurement, patient B пытается upload) → 404
10. **Без файла в multipart** → 400 VALIDATION_ERROR
11. **PDF файл вместо image** → 400 INVALID_FILE_TYPE
12. **Файл > 10MB** → 413 FILE_TOO_LARGE
13. **POST без JWT** → 401

### GET photo (5)
14. **GET своё фото** (filename начинается с `${req.patient.id}_`) → 200, Content-Type image/jpeg, file bytes
15. **GET чужое фото** → 403 FORBIDDEN
16. **GET с path traversal** (`../../etc/passwd`) → 400 PATH_TRAVERSAL
17. **GET non-existent file** → 404
18. **GET без JWT** → 401
19. **GET как instructor** (любое фото) → 200

### Fixture helper для multipart

```javascript
const path = require('path');
const fixtureImage = path.join(__dirname, '../fixtures/test-photo.jpg');
// Если fixtures/test-photo.jpg отсутствует — создать через sharp в beforeAll:
// await sharp({create: {width: 100, height: 100, channels: 3, background: {r:255,g:0,b:0}}})
//   .jpeg().toFile(fixtureImage);
```

Использование в тесте:
```javascript
const res = await request(app)
  .post(`/api/rehab/my/rom/${measurementId}/photo`)
  .set('Cookie', patientAuthCookie(testPatientId))
  .attach('photo', fixtureImage);
expect(res.status).toBe(201);
```

---

## NOT TOUCH

- ❌ Migrations (schema на месте из 2.01)
- ❌ Существующие endpoints в `rehab.js`, `auth.js`, `admin.js` — только ADD
- ❌ ExerciseRunner v4 / PainEventForm / DailyPainSection
- ❌ Frontend
- ❌ `backend/uploads/avatars/`, `backend/uploads/diary_photos/` — не трогать содержимое
- ❌ multer config diary_photos — если он inline в diary endpoint, копируем НО не модифицируем оригинал

---

## Smoke test (5 cards)

### Сценарий 1 — POST consent

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| curl/Postman | POST `/api/auth/patient/photo-consent` с cookie patient_access (id=14) | Empty body | 200 + `data.photo_consent_at` ISO timestamp + `version: 'v1'`. В БД: `SELECT photo_consent_at FROM patients WHERE id=14` → NOT NULL. |

### Сценарий 2 — Photo upload без consent

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| curl/Postman | Test patient без consent (создать нового через AdminContent или сбросить `photo_consent_at = NULL`) | POST `/api/rehab/my/rom/:id/photo` с photo file | **412 Precondition Failed**, error: 'CONSENT_REQUIRED'. Файл НЕ создан в uploads/measurements/. |

### Сценарий 3 — Полный flow: consent → upload → DB → GET

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| curl/Postman | После POST consent + POST measurement (получить `id`) | POST `/api/rehab/my/rom/{id}/photo` с jpeg файлом → потом GET photo_url из response | 201 upload, файл в `backend/uploads/measurements/14_X_*.jpg` (size ≤ 1200px max). DB `photo_url` обновлён. GET возвращает image/jpeg bytes. |

### Сценарий 4 — Ownership protection

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| curl/Postman | Two test patients, один с uploaded photo | GET `/api/uploads/measurements/{filename_of_other_patient}.jpg` как not-owner | 403 FORBIDDEN. File body не отдаётся. |

### Сценарий 5 — Path traversal попытка

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| curl | GET `/api/uploads/measurements/..%2F..%2Fetc%2Fpasswd` (URL-encoded `../../etc/passwd`) | — | 400 INVALID_FILENAME (regex отсекает). Никакого FS access. |

---

## Файлы — итоговый чеклист

### Создать
- `backend/uploads/measurements/.gitkeep`
- `backend/tests/__tests__/rehab_photo_upload.test.js` (~18 тестов)
- `backend/tests/fixtures/test-photo.jpg` (если не существует — генерация в `beforeAll`)
- (Опционально) `backend/middleware/patientOrInstructorAuth.js` — если composite middleware отсутствует
- (Опционально) `backend/routes/uploads.js` — если нет existing `/api/uploads/*` mount

### Изменить
- `backend/routes/rehab.js` — добавить POST `/my/rom/:id/photo`
- `backend/routes/patientAuth.js` (или где `/api/auth/patient/*`) — добавить POST `/photo-consent`
- `backend/routes/uploads.js` или `app.js` — mount GET `/measurements/:filename`
- `backend/.gitignore` — добавить `backend/uploads/measurements/*` + `!*/.gitkeep` (если шаблон ещё не покрывает)
- `CLAUDE.md` — секция «Запуск проекта» (новые ENV? нет, hardcoded path); секция «Эндпоинты пациента» добавить три новых

### НЕ ТРОГАТЬ
- Migrations
- diary_photos endpoint (только читаем, не модифицируем)
- `backend/uploads/avatars/`, `backend/uploads/diary_photos/` содержимое
- Frontend
- LOCKED zones

---

## Текст коммита

```
feat(api): Wave 2 коммит 2.07 — ROM photo upload + AI consent

Три endpoint'а для Tier 2 measurement photos:

- POST /api/auth/patient/photo-consent
    Идемпотентный, sets patients.photo_consent_at = NOW(),
    photo_consent_version = 'v1'. Required перед photo upload.

- POST /api/rehab/my/rom/:id/photo
    multipart/form-data field 'photo'. multer in-memory + sharp 1200max
    JPEG q82 (паттерн скопирован из /my/diary/:entry_id/photos).
    Ownership: SELECT WHERE id=$1 AND patient_id=$2. Consent gate:
    412 Precondition Failed если photo_consent_at IS NULL.
    UPDATE rom_measurements.photo_url, удаляет старый файл при overwrite.
    Storage: backend/uploads/measurements/{patient_id}_{id}_{ts}.jpg.

- GET /api/uploads/measurements/:filename
    JWT-guarded (composite patient OR instructor). Whitelist regex
    [a-zA-Z0-9_.-]+ + path resolve containment check (path traversal
    защита). Patient видит только свои (prefix match), instructor
    видит все. Content-Type по расширению, Cache-Control: private.

Storage decisions (memory #22): local disk для 152-FZ residency,
sharp 1200max JPEG q82 standard clinical photos.

НЕ затронуты: girth_measurements (нет photo_url by design),
DELETE/PUT photo (Wave 3), multi-photo (Wave 3), encryption at-rest
(backlog), AI processing (Block D).

Verify-step output (rule #15) — в commit description ниже.

Tests: backend +~18 (POST consent + POST photo + GET photo).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Verify output как section после message.

---

## Definition of Done

- [ ] Verify-step выполнен, output 10 команд в commit report
- [ ] Директория `backend/uploads/measurements/` существует с `.gitkeep`, в `.gitignore` корректно настроен whitelist
- [ ] POST `/api/auth/patient/photo-consent` работает (идемпотентно, обновляет timestamp + version)
- [ ] POST `/api/rehab/my/rom/:id/photo` работает:
  - Multer + sharp 1200max JPEG q82 точно копирует diary_photos pattern
  - 412 при отсутствии consent
  - 404 при foreign measurement
  - Старый photo file удаляется при overwrite
  - photo_url обновляется в DB
- [ ] GET `/api/uploads/measurements/:filename` работает:
  - 401 без auth
  - 403 для чужого photo (patient ownership)
  - 200 для своего / для instructor
  - 400 для path traversal попытки
  - 404 для несуществующего файла
- [ ] **Сценарий 3 smoke прошёл** — полный flow consent → upload → GET round trip
- [ ] **Сценарий 2 smoke прошёл** — 412 без consent (критичный gate)
- [ ] **Сценарий 4 + 5 smoke прошли** — security barriers (ownership + path traversal)
- [ ] ~18 jest тестов зелёные
- [ ] **Backend tests ≥589** (571 после HF#11 + ~18 новых)
- [ ] Frontend tests 304 (без изменений)
- [ ] CLAUDE.md обновлён
- [ ] Коммит с текстом + Co-Authored-By trailer
- [ ] Ветка `wave-2/2.07-photo-upload-consent` от `73e558e`
- [ ] **`git push` ТОЛЬКО после явного «ок» от Vadim'а**
- [ ] PR ⏸ frozen, стек становится **12 PR**:
      `... → 73e558e(HF#11) → [2.07]`

---

## После 2.07

**Следующий TZ:** `TZ_WAVE_2_08_frontend_tier1_measurements.md`

Архитектор пишет 2.08 из:
- Verify-step output 2.07 (rule #15 — пути и структура patientApi.rehab namespace, ChipGroup конвенции)
- Memory #25 (PatientDashboard frontend conventions): UI компоненты в `components/ui/`, ChipGroup prop `selected`, pd-* prefix, useEffect deps НЕ context functions
- Memory #7 (PatientDashboard 6 screens, teal palette)
- Memory #27 (timezone rule — frontend local date через getFullYear)
- Memory #28 (CSS specificity hover:not(.--selected))
- Memory #30 (BIGINT — Date.now() для session_id)

Scope 2.08 (preview):
- Новый экран MeasurementsScreen в PatientDashboard (или новая секция в существующем)
- NumericInputForm — input degrees/cm + bilateral L/R selector (один session_id для пары)
- ROM type picker (8 значений) + Girth type picker (7 значений)
- HBB categorical picker (19 позвонков) для `shoulder_hbb_categorical`
- Photo capture flow (input type=file + preview) — после measurement создан, отдельный submit
- Consent dialog — modal при первом upload, POST consent → unlock photo flow
- History list — последние measurements через GET /my/measurements
- Reference photos display — если `patients.measurement_reference_photo_url` set, показать инструкторский пример

**Backlog (deferred):**
- Photo encryption at-rest — отдельный TZ когда compliance дойдёт
- AI ROM analysis (MediaPipe) — Block D
- Reference photo upload by instructor — отдельный flow (instructor → patient.measurement_reference_photo_url)
- Stale photos cleanup job (orphan files если DB row удалена) — Wave 3
- Photo audit log (если compliance потребует) — Wave 3
- Multiple photos per measurement — Wave 3
- DELETE photo endpoint — Wave 3
- Photo для girth_measurements (требует schema migration) — Wave 3+
