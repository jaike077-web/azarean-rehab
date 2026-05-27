# TZ Wave 2 · Коммит 2.06 — Backend measurements endpoints (ROM + girth)

**Дата:** 2026-05-19
**Базовая ветка:** `a206c24` (HF#10)
**Новая ветка:** `wave-2/2.06-measurements-backend`
**Roadmap:** Wave 2 Block C старт (memory #24 после split).
**Цель:** три endpoint'а Tier 1 для пациента — POST ROM + POST girth + GET measurements (rom/girth/all). БЕЗ photo (2.07), БЕЗ consent (2.07), БЕЗ frontend (2.08).
**Объём:** 2.5-3 часа
**Риск:** средний — много validation paths (8 ROM types + 7 girth types × 2 sides × 3 value-полей в ROM), но schema additive и подтверждена verify-step.

---

## Verify-step перед стартом (правило #15)

Verify уже сделан архитектором 2026-05-19 — output в [SESSION_HANDOFF_2026-05-19.md]. Подтверждённые facts:

```
rom_measurements ✓ — 5 measured_by enum, CHECK rom_value_exactly_one (XOR 3 value-полей)
girth_measurements ✓ — 2 measured_by enum, CHECK value_cm > 0 AND < 200, NO AI fields by design
patients ✓ — photo_consent_at/version + measurement_reference_photo_url существуют (для 2.07)
measurement_session_id ✓ — INTEGER без FK таблицы (group L+R одной сессии)
multer 2.0.2 + sharp 0.34.5 ✓ — установлены (для 2.07)
backend/uploads/measurements/ ❌ — НЕ создавать в 2.06 (это для 2.07)
```

**Дополнительный verify перед кодом — output в commit report:**

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. Подтвердить что в routes/rehab.js НЕТ существующих measurement endpoints
grep -nE "/measurements/(rom|girth)|/measurements['\"]" backend/routes/rehab.js

# 2. Найти test helper для patient JWT cookie
grep -rn "patient.*cookie\|loginPatient\|patientTestHelper" backend/tests/__tests__/*.test.js \
  backend/tests/helpers/ 2>/dev/null | head -10

# 3. Найти reusable test fixture для патient id
grep -rn "test.*patient.*id.*14\|TEST_PATIENT_ID" backend/tests/ | head -5

# 4. Стандарт response для validation errors в routes/rehab.js
grep -nE "status\(400\).*\.json|VALIDATION_ERROR" backend/routes/rehab.js | head -10
```

**Stop-условия:**
- Если в `routes/rehab.js` уже есть `/measurements/rom` или `/measurements/girth` — конфликт с experimental branch, остановись
- Если нет helper'а для patient JWT cookie в tests — выведи find и сообщи в чат (architect напишет inline helper для tests)

---

## Зависимости

Ветка `wave-2/2.06-measurements-backend` от `a206c24` (HF#10, последний в Wave 2 stack).
После DoD — push в feature branch, ⏸ frozen. Стек становится **10 PR**.

---

## Что блокирует

**Блокирует:** TZ 2.08 frontend Tier 1 UI (numeric inputs + bilateral L/R) — без endpoints невозможен POST.
**НЕ блокирует:** TZ 2.07 photo upload + consent — независимые feature'ы.

---

## ❌ НЕ создавать / ❌ НЕ трогать

- ❌ POST `/api/uploads/photo` или `/api/rehab/my/rom/:id/photo` — это **TZ 2.07** (multer+sharp infrastructure)
- ❌ POST `/api/auth/patient/photo-consent` — это **TZ 2.07**
- ❌ Директория `backend/uploads/measurements/` — создаётся в **TZ 2.07**
- ❌ Колонки `rom_measurements.photo_url`, `ai_confidence`, `ai_raw_landmarks`, `ai_suggested_degrees`, `markup_points` — существуют (из 2.01), но endpoint 2.06 их **НЕ принимает на POST и НЕ возвращает на GET**. Tier 2/3 поля, активируются позже
- ❌ Таблица `measurement_sessions` — не создаём, FK на неё нет, INTEGER хранится как-есть
- ❌ Frontend — это **TZ 2.08**
- ❌ Migrations folder — schema из 2.01, новых .sql нет
- ❌ Shared validator для rom/girth measured_by — у них РАЗНЫЕ enum (5 vs 2), копипаст без consolidation
- ❌ ExerciseRunner v4, PainEventForm, DailyPainSection — LOCKED / out of scope
- ❌ Encryption at-rest — отдельный backlog (memory: compliance disclaimer найден неточным)

---

## ✅ Переиспользуем

- `backend/middleware/patientAuth.js` — `authenticatePatient`. Использует **`req.patient.id`** (НЕ `req.user.patient_id`, memory #17)
- `backend/database/db.js` — `query()` (NOT pool напрямую, memory #14)
- `backend/routes/rehab.js` — добавляем три route'а в существующий router, **новый файл НЕ создавать**
- API format `{data, message?, total?}` (memory #11) — NO `success: true/false`
- Jest+Supertest конвенция из `backend/tests/__tests__/rehab_pain.test.js` (или аналогичный) как шаблон

---

## Validation конвенции (NO Zod, stack memory #4)

Валидация — manual в route handler, в порядке:

1. `measurement_type` ∈ whitelist (объект с маппингом type → value-поле для ROM, или Set для girth)
2. `side ∈ ['L', 'R']`
3. `value` валидируется исходя из типа (degrees/cm/categorical для ROM; всегда cm для girth)
4. Optional fields (`program_id`, `measurement_session_id`, `notes`) — type coercion + bounds check
5. 400 error format: `{error: 'VALIDATION_ERROR', message: 'human-readable'}` (memory #11)
6. FK violation (PG code 23503) → 400 `{error: 'FK_VIOLATION', message: 'program_id does not exist'}`
7. INTERNAL_ERROR → 500 `{error: 'INTERNAL_ERROR', message: '...'}` + `console.error`

---

## Реализация

### Файл `backend/routes/rehab.js` — добавления

В верху файла (после существующих imports/constants) — whitelist constants:

```javascript
// === Wave 2 коммит 2.06: Measurements endpoints ===

// ROM measurement types → maps в какое value-поле писать
// (источник: TZ_WAVE_2_01_schema_migrations.md comments в rom_measurements schema)
const ROM_TYPES = {
  // shoulder
  'shoulder_forward_flexion_degrees': 'degrees',
  'shoulder_abduction_degrees':       'degrees',
  'shoulder_er_0_degrees':            'degrees',
  'shoulder_ir_90_abd_degrees':       'degrees',
  'shoulder_hbb_categorical':         'categorical',
  // knee
  'knee_flexion_degrees':             'degrees',
  'knee_extension_degrees':           'degrees',
  'knee_flexion_hbd_cm':              'cm',
};

// Girth types — все cm, всегда value_cm
const GIRTH_TYPES = new Set([
  // shoulder
  'shoulder_mid_deltoid_cm',
  'shoulder_mid_biceps_cm',
  // knee
  'knee_joint_line_cm',
  'knee_suprapatellar_5cm_cm',
  'knee_suprapatellar_10cm_cm',
  'knee_suprapatellar_15cm_cm',
  'knee_calf_max_cm',
]);

// HBB (Hand-Behind-Back) категориальные значения позвонков
const HBB_VERTEBRAE = [
  'T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12',
  'L1','L2','L3','L4','L5',
  'sacrum', 'great_trochanter',
];
```

---

### Endpoint 1: POST /api/rehab/my/measurements/rom

```javascript
router.post('/my/measurements/rom', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const {
      measurement_type, side, value,
      program_id, measurement_session_id, notes,
    } = req.body;

    // 1. measurement_type whitelist
    const valueKind = ROM_TYPES[measurement_type];
    if (!valueKind) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Unknown measurement_type. Allowed: ${Object.keys(ROM_TYPES).join(', ')}`,
      });
    }

    // 2. side
    if (!['L', 'R'].includes(side)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'side must be "L" or "R"',
      });
    }

    // 3. value по типу — XOR 3 поля (защита перед SQL CHECK rom_value_exactly_one)
    let value_degrees = null, value_cm = null, value_categorical = null;

    if (valueKind === 'degrees') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 360) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'value must be a number 0..360 for *_degrees types',
        });
      }
      value_degrees = Math.round(n * 10) / 10;  // NUMERIC(5,1) — 1 знак после запятой
    } else if (valueKind === 'cm') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 200) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'value must be a number 0..200 for *_cm types',
        });
      }
      value_cm = Math.round(n * 100) / 100;  // NUMERIC(5,2) — 2 знака
    } else if (valueKind === 'categorical') {
      if (typeof value !== 'string' || !HBB_VERTEBRAE.includes(value)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `value must be one of: ${HBB_VERTEBRAE.join(', ')}`,
        });
      }
      value_categorical = value;
    }

    // 4. Optional program_id (FK validate — на уровне SQL через 23503)
    let programIdParam = null;
    if (program_id != null && program_id !== '') {
      programIdParam = parseInt(program_id, 10);
      if (!Number.isFinite(programIdParam) || programIdParam <= 0) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'program_id must be a positive integer or null',
        });
      }
    }

    // 5. Optional measurement_session_id (INTEGER без FK — memory: just grouping ID)
    let sessionId = null;
    if (measurement_session_id != null && measurement_session_id !== '') {
      sessionId = parseInt(measurement_session_id, 10);
      if (!Number.isFinite(sessionId)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'measurement_session_id must be an integer or null',
        });
      }
    }

    // 6. notes — truncate, не валидируем
    const notesParam = notes != null ? String(notes).slice(0, 1000) : null;

    // 7. INSERT — measured_by жёстко 'patient_self' для Tier 1
    // Timezone rule #27: RETURNING measured_at::text
    const result = await query(`
      INSERT INTO rom_measurements (
        patient_id, program_id, measurement_type, side,
        value_degrees, value_cm, value_categorical,
        measured_by, measurement_session_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'patient_self', $8, $9)
      RETURNING
        id, patient_id, program_id, measurement_type, side,
        value_degrees, value_cm, value_categorical,
        measured_by, measurement_session_id, notes,
        measured_at::text AS measured_at,
        created_at
    `, [
      patientId, programIdParam, measurement_type, side,
      value_degrees, value_cm, value_categorical,
      sessionId, notesParam,
    ]);

    res.status(201).json({
      data: result.rows[0],
      message: 'ROM measurement saved',
    });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'FK_VIOLATION', message: 'program_id does not exist' });
    }
    if (err.code === '23514') {
      // CHECK violation — теоретически уже отловили в JS-валидации, но если schema drift
      return res.status(400).json({ error: 'CHECK_VIOLATION', message: err.message });
    }
    console.error('POST /my/measurements/rom error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to save ROM measurement' });
  }
});
```

---

### Endpoint 2: POST /api/rehab/my/measurements/girth

```javascript
router.post('/my/measurements/girth', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const {
      measurement_type, side, value_cm,
      program_id, measurement_session_id, notes,
    } = req.body;

    // 1. measurement_type whitelist (girth — отдельный Set, НЕ shared с ROM)
    if (!GIRTH_TYPES.has(measurement_type)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Unknown girth measurement_type. Allowed: ${[...GIRTH_TYPES].join(', ')}`,
      });
    }

    // 2. side
    if (!['L', 'R'].includes(side)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'side must be "L" or "R"',
      });
    }

    // 3. value_cm — required, NUMERIC(5,2), CHECK > 0 AND < 200
    const n = Number(value_cm);
    if (!Number.isFinite(n) || n <= 0 || n >= 200) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'value_cm must be a number (0, 200) exclusive',
      });
    }
    const valueCmRounded = Math.round(n * 100) / 100;

    // 4-6. Optional params — same logic как ROM
    let programIdParam = null;
    if (program_id != null && program_id !== '') {
      programIdParam = parseInt(program_id, 10);
      if (!Number.isFinite(programIdParam) || programIdParam <= 0) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'program_id must be positive integer or null' });
      }
    }

    let sessionId = null;
    if (measurement_session_id != null && measurement_session_id !== '') {
      sessionId = parseInt(measurement_session_id, 10);
      if (!Number.isFinite(sessionId)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'measurement_session_id must be integer or null' });
      }
    }

    const notesParam = notes != null ? String(notes).slice(0, 1000) : null;

    // 7. INSERT — measured_by='patient_self' (girth CHECK: only 2 values, patient_self допустим)
    const result = await query(`
      INSERT INTO girth_measurements (
        patient_id, program_id, measurement_type, side,
        value_cm, measured_by, measurement_session_id, notes
      ) VALUES ($1, $2, $3, $4, $5, 'patient_self', $6, $7)
      RETURNING
        id, patient_id, program_id, measurement_type, side,
        value_cm, measured_by, measurement_session_id, notes,
        measured_at::text AS measured_at,
        created_at
    `, [
      patientId, programIdParam, measurement_type, side,
      valueCmRounded, sessionId, notesParam,
    ]);

    res.status(201).json({
      data: result.rows[0],
      message: 'Girth measurement saved',
    });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'FK_VIOLATION', message: 'program_id does not exist' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'CHECK_VIOLATION', message: err.message });
    }
    console.error('POST /my/measurements/girth error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to save girth measurement' });
  }
});
```

---

### Endpoint 3: GET /api/rehab/my/measurements

Query params:
- `type` ∈ `'rom' | 'girth' | 'all'` (default `'all'`)
- `program_id` (optional int) — фильтр
- `limit` (optional int, default 100, max 500) — per-table limit
- `since` (optional `YYYY-MM-DD`) — measured_at >= since

```javascript
router.get('/my/measurements', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const type = req.query.type || 'all';
    if (!['rom', 'girth', 'all'].includes(type)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'type must be one of: rom, girth, all',
      });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    let programFilter = null;
    if (req.query.program_id) {
      programFilter = parseInt(req.query.program_id, 10);
      if (!Number.isFinite(programFilter)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'program_id must be integer' });
      }
    }

    let sinceFilter = null;
    if (req.query.since) {
      // Простая проверка YYYY-MM-DD (Date parse, потом back to string)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.since)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'since must be YYYY-MM-DD' });
      }
      sinceFilter = req.query.since;
    }

    const result = { rom: [], girth: [] };

    if (type === 'rom' || type === 'all') {
      const conditions = ['patient_id = $1'];
      const params = [patientId];
      let i = 2;
      if (programFilter != null) { conditions.push(`program_id = $${i++}`); params.push(programFilter); }
      if (sinceFilter)         { conditions.push(`measured_at >= $${i++}::date`); params.push(sinceFilter); }
      params.push(limit);

      const rom = await query(`
        SELECT
          id, program_id, measurement_type, side,
          value_degrees, value_cm, value_categorical,
          measured_by, measurement_session_id, notes,
          measured_at::text AS measured_at,
          created_at
        FROM rom_measurements
        WHERE ${conditions.join(' AND ')}
        ORDER BY measured_at DESC, id DESC
        LIMIT $${i}
      `, params);
      result.rom = rom.rows;
    }

    if (type === 'girth' || type === 'all') {
      const conditions = ['patient_id = $1'];
      const params = [patientId];
      let i = 2;
      if (programFilter != null) { conditions.push(`program_id = $${i++}`); params.push(programFilter); }
      if (sinceFilter)         { conditions.push(`measured_at >= $${i++}::date`); params.push(sinceFilter); }
      params.push(limit);

      const girth = await query(`
        SELECT
          id, program_id, measurement_type, side,
          value_cm, measured_by, measurement_session_id, notes,
          measured_at::text AS measured_at,
          created_at
        FROM girth_measurements
        WHERE ${conditions.join(' AND ')}
        ORDER BY measured_at DESC, id DESC
        LIMIT $${i}
      `, params);
      result.girth = girth.rows;
    }

    res.json({
      data: result,
      total: result.rom.length + result.girth.length,
    });
  } catch (err) {
    console.error('GET /my/measurements error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch measurements' });
  }
});
```

---

## Tests — `backend/tests/__tests__/rehab_measurements.test.js`

Шаблон по существующему `rehab_pain.test.js`. Жёсткий список tests:

### POST /my/measurements/rom (8-10 тестов)

1. **valid degrees** → 201, data.value_degrees = округлённое число (NUMERIC(5,1)), measured_by='patient_self', measured_at — `'YYYY-MM-DD'` string (НЕ ISO timestamp — timezone rule #27)
2. **valid cm** (`knee_flexion_hbd_cm`) → 201, data.value_cm заполнено, остальные value_* null
3. **valid categorical HBB** (`shoulder_hbb_categorical` + `value: 'L3'`) → 201, data.value_categorical = 'L3'
4. **invalid measurement_type** → 400 VALIDATION_ERROR, сообщение содержит список валидных
5. **invalid side** (`side: 'X'`) → 400 VALIDATION_ERROR
6. **degrees out of range** (`value: 500`) → 400 VALIDATION_ERROR
7. **categorical invalid vertebra** (`value: 'Z99'`) → 400
8. **non-numeric value для degrees** (`value: 'abc'`) → 400
9. **measurement_session_id передан** → INSERT с этим session_id, возвращается в response
10. **program_id FK violation** (`program_id: 99999`) → 400 FK_VIOLATION

### POST /my/measurements/girth (5-6 тестов)

11. **valid** (`knee_joint_line_cm`, value_cm=42.5, side='L') → 201, NUMERIC(5,2) сохранено правильно
12. **invalid measurement_type** (попытка ROM type вроде `knee_flexion_degrees`) → 400 (т.к. не в GIRTH_TYPES set)
13. **value_cm <= 0** → 400
14. **value_cm >= 200** → 400
15. **invalid side** → 400
16. **measured_by в response = 'patient_self'** (girth CHECK only 2 enum)

### GET /my/measurements (5-7 тестов)

17. **GET без params** → 200, `data: {rom: [], girth: []}` (либо с предзаполненными из INSERT'ов)
18. **GET type=rom** → только `data.rom`, `data.girth` пустой массив
19. **GET type=girth** → только `data.girth`
20. **GET с program_id filter** → возвращает только measurements этого program_id
21. **GET с since='2026-05-19'** → только measured_at >= указанной даты
22. **GET measured_at — string 'YYYY-MM-DD'**, НЕ JS Date / ISO (timezone rule #27 verify)
23. **GET с limit=5** + создать 7 measurements → max 5 в каждой таблице

### Cross-cutting (3-4 теста)

24. **POST rom без JWT** → 401
25. **POST rom с просроченным JWT** → 401
26. **POST с patient_id другого юзера** через `req.body.patient_id` override — НЕ должен работать, всегда `req.patient.id` из middleware
27. **GET возвращает только свои measurements** (создать как patient A, GET как patient B → пустой response)

**Test helper:** используй существующий шаблон patient JWT cookie из `rehab_pain.test.js` или подобного. Если не нашёл — сделай inline:

```javascript
const jwt = require('jsonwebtoken');

function patientAuthCookie(patientId) {
  const token = jwt.sign({ patientId, role: 'patient' }, process.env.PATIENT_JWT_SECRET, { expiresIn: '1h' });
  return [`patient_access=${token}`];
}
```

(Точную форму подсмотри в существующих тестах — там может быть подпись `patient_id` или `sub`.)

---

## NOT TOUCH

- ❌ `backend/database/migrations/*` — schema из 2.01 не трогать
- ❌ `frontend/*` — TZ 2.08
- ❌ `routes/admin.js` — Wave 2 admin закрыт
- ❌ `utils/opsAlert.js`, `services/telegramBot.js` — Wave 1 infra, не вызываем из measurements (red-flag только для pain_entries)
- ❌ ExerciseRunner, PainEventForm, DailyPainSection
- ❌ `routes/rehab.js` существующие pain/diary/program endpoints — не модифицировать, только ADD три новых

---

## Smoke test (4-card)

### Сценарий 1 — POST ROM (degrees) + сразу GET

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| Postman / curl | POST `/api/rehab/my/measurements/rom` с cookie `patient_access` (id=14) | Body: `{"measurement_type":"knee_flexion_degrees","side":"L","value":120}`. После 201 → GET `/api/rehab/my/measurements?type=rom` | 201 returned с `data.measured_at = "2026-05-19"` (string!), `data.value_degrees = 120.0`, `data.measured_by = "patient_self"`. GET возвращает массив с этим entry. |

### Сценарий 2 — POST girth + bilateral via session_id

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| Postman / curl | POST дважды для L и R с одинаковым `measurement_session_id` | `{"measurement_type":"knee_joint_line_cm","side":"L","value_cm":42.5,"measurement_session_id":1716100000000}` и потом такой же с `side:"R"`, `value_cm:42.8` | Оба 201. GET возвращает 2 girth entries с одинаковым session_id. |

### Сценарий 3 — validation errors

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| Postman / curl | POST ROM с невалидным типом | `{"measurement_type":"foo_bar","side":"L","value":50}` | 400 VALIDATION_ERROR, message с списком валидных типов. Никакой entry не создаётся в БД. |

### Сценарий 4 — cross-patient isolation

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| Postman / curl | GET measurements с JWT другого пациента | Login as instructor, открой Patients UI, найди другого test patient (если есть) или создай через AdminContent. Получи cookie → GET `/api/rehab/my/measurements` | Возвращает только measurements этого пациента, **не патиента id=14** (cross-isolation работает). |

### Сценарий 5 — timezone rule #27 verify

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| Postman / curl | GET measurements | После POST в 17:00 МСК | `measured_at` в response = `"2026-05-19"` (string YYYY-MM-DD), а **НЕ** `"2026-05-18T19:00:00.000Z"`. Подтверждение что `::text` cast работает. |

---

## Файлы — итоговый чеклист

### Создать
- `backend/tests/__tests__/rehab_measurements.test.js` (~25 тестов)

### Изменить
- `backend/routes/rehab.js` — добавить:
  - Три whitelist constants (`ROM_TYPES`, `GIRTH_TYPES`, `HBB_VERTEBRAE`)
  - POST `/my/measurements/rom`
  - POST `/my/measurements/girth`
  - GET `/my/measurements`

### НЕ ТРОГАТЬ
- `backend/database/migrations/*`
- `backend/uploads/` (директорию `measurements/` НЕ создавать — это в 2.07)
- Любой frontend код
- Существующие routes в `rehab.js`

---

## Текст коммита

```
feat(api): Wave 2 коммит 2.06 — measurements endpoints (ROM + girth)

Три endpoint'а для Tier 1 measurements пациента:

- POST /api/rehab/my/measurements/rom
    8 ROM types (5 shoulder + 3 knee), validation XOR 3 value-полей
    (degrees/cm/categorical) перед SQL CHECK rom_value_exactly_one.
    HBB категориальный — 19 валидных позвонков (T1-L5 + sacrum + great_trochanter).
    measured_by='patient_self' жёстко (Tier 1).

- POST /api/rehab/my/measurements/girth
    7 girth types (2 shoulder + 5 knee), value_cm NUMERIC(5,2),
    CHECK value_cm > 0 AND < 200. measured_by='patient_self'.
    НЕ shared validator с ROM — у girth 2 measured_by enum vs ROM 5.

- GET /api/rehab/my/measurements?type=rom|girth|all&program_id&since&limit
    Возврат измерений пациента, фильтры опциональны, max 500 per table.
    measured_at::text AS measured_at — timezone rule #27 (HF#10).

Photo upload и AI consent — отдельный TZ 2.07.
Frontend Tier 1 UI — TZ 2.08.

Verify-step output (rule #15) — в commit description ниже.

Tests: backend +~25 (rehab_measurements.test.js).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

После основного message — секция:

```
=== VERIFY OUTPUT (rule #15) ===

[грeps/cats output из верхней секции Verify-step + повторный run psql \d для подтверждения что schema не сдвинулась с момента предыдущего отчёта]
```

---

## Definition of Done

- [ ] Verify-step выполнен, output в commit report текстом
- [ ] Три endpoint'а в `backend/routes/rehab.js` (POST rom, POST girth, GET)
- [ ] Три whitelist constants на месте (`ROM_TYPES`, `GIRTH_TYPES`, `HBB_VERTEBRAE`)
- [ ] Test файл `rehab_measurements.test.js` с ~25 тестами зелёный
- [ ] **Backend tests total ≥560** (535 после HF#10 + ~25 новых)
- [ ] Все существующие тесты остались зелёными (frontend 304, backend 535+25)
- [ ] **Сценарий 1 smoke прошёл** — POST returns measured_at как `'YYYY-MM-DD'` string (НЕ ISO timestamp)
- [ ] **Сценарий 5 smoke прошёл** — timezone rule #27 явно подтверждён в response
- [ ] Сценарии 2, 3, 4 прошли
- [ ] Коммит с текстом + Co-Authored-By trailer
- [ ] Ветка `wave-2/2.06-measurements-backend` от `a206c24`
- [ ] **`git push` ТОЛЬКО после явного «ок» от Vadim'а**
- [ ] PR ⏸ frozen, стек становится **10 PR**:
      `... → d6a0b36 → a206c24 → [2.06]`

---

## После 2.06 ⏸

**Следующий TZ:** `TZ_WAVE_2_07_photo_upload_consent.md`

Архитектор пишет 2.07 из:
- Verify-step output 2.06 (rule #15 — пути к существующему diary_photos endpoint для копирования multer+sharp паттерна)
- Memory #22 (Block C storage decisions): local disk `/var/www/azarean/uploads/measurements/`, sharp 1200max JPEG q=80, JWT-only access
- Memory #24 (Block C plan updated)
- Observation #6 verify HF#10: «Photo upload pattern уже есть в routes/rehab.js для diary_photos (/my/diary/:entry_id/photos) — Multer + Sharp 1200×1200 JPEG q82»

Scope 2.07:
- Создать директорию `backend/uploads/measurements/` (или `/var/www/azarean/uploads/measurements/` для prod) + `.gitkeep`
- POST `/api/rehab/my/rom/:id/photo` — multer+sharp 1200max JPEG q82, обновляет `rom_measurements.photo_url`, requires `patients.photo_consent_at IS NOT NULL` → 412 если нет
- GET `/api/uploads/measurements/:filename` — JWT-guarded retrieve
- POST `/api/auth/patient/photo-consent` — sets `patients.photo_consent_at = NOW()`, `photo_consent_version = 'v1'`
- Tests

**Backlog (deferred):**
- Encryption at-rest для measurement photos — заявка legal/compliance, отдельный backlog
- `measurement_sessions` таблица с metadata (start_time, instructor_signoff) — Wave 3 если понадобится
- Pagination для GET measurements (сейчас просто limit, нет cursor) — Wave 3
