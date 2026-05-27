# TZ Wave 2 · Hot-fix #11 — BIGINT migration для measurement_session_id

**Дата:** 2026-05-19
**Базовая ветка:** `c33cac8` (2.06 measurements endpoints)
**Новая ветка:** `wave-2/hotfix-11-session-id-bigint`
**Цель:** ALTER `measurement_session_id` INTEGER → BIGINT в `rom_measurements` + `girth_measurements`. Закрывает drift #25 (TZ 2.06 smoke сценарий 2 использовал millis 13 digits → int4 overflow → 22003 → 500).
**Объём:** 30-45 минут
**Риск:** низкий — additive type change (int4 ⊂ int8), full table rewrite но dev таблицы пустые / минимальные, prod ещё не deployed.

---

## Источник — drift #25 из отчёта 2.06

> TZ smoke сценарий 2 использовал `measurement_session_id=1716100000000` (13-digit Unix millis), но схема INTEGER (PG int4 max = 2_147_483_647) → overflow → 22003 → 500. Smoke прошёл только после fallback на `Date.now()/1000`.

**Architect decision (memory #30 + memory #24 updated):**
Опция C из четырёх — миграция INTEGER → BIGINT.

| Опция | Verdict | Reason |
|---|---|---|
| A. seconds (10 digits) | ❌ | Timebomb до 2038-01-19 |
| B. Server MAX+1 per patient | ❌ | +1 round trip + race condition |
| **C. BIGINT migration** | ✅ | One-time, no frontend complexity, no race, millis = natural unique |
| D. Random int4 | ❌ | Collision probability |

---

## Verify-step перед стартом (правило #15 — output в commit report)

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. Текущий тип колонок (должен быть integer)
psql -U postgres -d azarean_rehab -c "
  SELECT table_name, column_name, data_type, numeric_precision
  FROM information_schema.columns
  WHERE table_name IN ('rom_measurements', 'girth_measurements')
    AND column_name = 'measurement_session_id';
"

# 2. Существующие индексы по session_id (должны автоматически работать после migration)
psql -U postgres -d azarean_rehab -c "
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename IN ('rom_measurements', 'girth_measurements')
    AND indexdef ILIKE '%measurement_session_id%';
"

# 3. Подтверждение что таблицы существуют и не пусты (для прод-ready подхода в будущем)
psql -U postgres -d azarean_rehab -c "
  SELECT 'rom_measurements' AS tbl, COUNT(*) FROM rom_measurements
  UNION ALL
  SELECT 'girth_measurements', COUNT(*) FROM girth_measurements;
"

# 4. Конфликт с другой миграцией?
ls backend/database/migrations/ | grep -E "(bigint|session_id|hotfix_11|hf11)"
```

**Output всех команд → в commit report текстом** (rule #15).

**Stop-условия:**
- Если колонки уже `bigint` → миграция уже применена в каком-то experimental branch; остановись, доложи
- Если таблицы не существуют → 2.01/2.06 не применены, остановись
- Если есть похожая миграция в `backend/database/migrations/` → переименуй / coordinate

---

## Зависимости

Ветка `wave-2/hotfix-11-session-id-bigint` от `c33cac8` (2.06).
После DoD ⏸ frozen. Стек становится **11 PR**.

---

## Что блокирует

**Блокирует:** TZ 2.08 frontend Tier 1 UI — frontend будет генерировать `Date.now()` (13-digit millis) для bilateral pair session_id. Без BIGINT всё упадёт в overflow 500.

**НЕ блокирует:** TZ 2.07 photo upload + consent — photo flow не использует session_id.

**Ordering:** HF#11 → 2.07 → 2.08. HF#11 первым потому что compact и закрывает критический баг до того как frontend начнёт его эксплуатировать.

---

## ❌ НЕ создавать / ❌ НЕ трогать

- ❌ Photo upload (2.07)
- ❌ Frontend (2.08)
- ❌ Существующие endpoints в `routes/rehab.js` — backend код не меняется (JS Number принимает BIGINT range без проблем, INSERT/SELECT работают одинаково)
- ❌ Другие schema columns — только `measurement_session_id` в двух таблицах
- ❌ FK или CHECK constraints на этой колонке — их нет (session_id просто INTEGER без FK, memory #24)
- ❌ Удалять / переименовывать индексы — `idx_rom_session`, `idx_girth_session` остаются

---

## ✅ Переиспользуем

- Migration pattern из 2.01 — `BEGIN/COMMIT`, идемпотентность через `information_schema.columns` check
- Sanity SQL test pattern из `backend/tests/__tests__/wave2_schema.test.js` (если файл существует — иначе из 2.01 шаблона)

---

## Реализация

### Шаг 1 — миграция `backend/database/migrations/20260519_session_id_bigint.sql`

```sql
-- HF#11: ALTER measurement_session_id INTEGER → BIGINT
-- Закрывает drift #25: client-generated Date.now() (13 digits) переполняет int4.
-- Backwards-compatible: все существующие INTEGER values укладываются в BIGINT.

BEGIN;

-- rom_measurements
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rom_measurements'
      AND column_name = 'measurement_session_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE rom_measurements
      ALTER COLUMN measurement_session_id TYPE BIGINT;
    RAISE NOTICE 'rom_measurements.measurement_session_id: integer → bigint';
  ELSE
    RAISE NOTICE 'rom_measurements.measurement_session_id: already bigint or column missing, skip';
  END IF;
END $$;

-- girth_measurements
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'girth_measurements'
      AND column_name = 'measurement_session_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE girth_measurements
      ALTER COLUMN measurement_session_id TYPE BIGINT;
    RAISE NOTICE 'girth_measurements.measurement_session_id: integer → bigint';
  ELSE
    RAISE NOTICE 'girth_measurements.measurement_session_id: already bigint or column missing, skip';
  END IF;
END $$;

COMMIT;
```

**Замечания:**
- ALTER COLUMN TYPE с int4 → int8 — это full table rewrite в PostgreSQL. На пустых dev таблицах мгновенно. **Для будущего prod** (когда таблицы наполнятся) — потребуется maintenance window или альтернативная стратегия (new column + backfill + swap). Сейчас не актуально.
- Идемпотентность через `information_schema.columns` check — повторный run не сломает.
- Никаких backfill не нужно — все существующие values валидны в BIGINT.

### Шаг 2 — обновить `CLAUDE.md`

В секции «Запуск проекта → 1. PostgreSQL» добавить строку про новую миграцию:
```
- 20260519_session_id_bigint.sql — measurement_session_id INTEGER → BIGINT (HF#11)
```

В секции «Схема БД» — обновить описание `rom_measurements` и `girth_measurements`, изменить тип `measurement_session_id` с INTEGER на BIGINT.

### Шаг 3 — backend код

**Никаких изменений в `routes/rehab.js` НЕ нужно.** JS `Number` парсит INTEGER и BIGINT одинаково (до Number.MAX_SAFE_INTEGER = 2^53 ≈ 9×10^15, что покрывает Unix millis на ближайшие 285 тыс лет).

Existing validation в TZ 2.06:
```javascript
sessionId = parseInt(measurement_session_id, 10);
if (!Number.isFinite(sessionId)) { return res.status(400)... }
```
— работает для BIGINT range без модификации.

### Шаг 4 — Tests

#### `backend/tests/__tests__/wave2_session_id_bigint.test.js` (sanity SQL)

```javascript
const fs = require('fs');
const path = require('path');

describe('HF#11 — measurement_session_id BIGINT migration SQL sanity', () => {
  const migrationPath = path.join(
    __dirname, '../../database/migrations/20260519_session_id_bigint.sql'
  );
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('ALTER COLUMN TYPE BIGINT для rom_measurements', () => {
    expect(sql).toMatch(/ALTER TABLE rom_measurements[\s\S]+ALTER COLUMN measurement_session_id TYPE BIGINT/);
  });

  it('ALTER COLUMN TYPE BIGINT для girth_measurements', () => {
    expect(sql).toMatch(/ALTER TABLE girth_measurements[\s\S]+ALTER COLUMN measurement_session_id TYPE BIGINT/);
  });

  it('идемпотентность — оба ALTER в DO-блоках с information_schema check', () => {
    const doBlocks = sql.match(/DO \$\$[\s\S]+?END \$\$;/g) || [];
    expect(doBlocks.length).toBe(2);
    doBlocks.forEach(block => {
      expect(block).toMatch(/information_schema\.columns/);
      expect(block).toMatch(/data_type = 'integer'/);
    });
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;\s*$/);
  });
});
```

#### Расширить `backend/tests/__tests__/rehab_measurements.test.js` (e2e подтверждение)

Добавить два теста после существующих POST rom / POST girth:

```javascript
describe('measurement_session_id BIGINT range (HF#11)', () => {
  const UNIX_MILLIS = 1716100000000; // 13 digits, overflowed int4

  it('POST rom принимает Date.now() millis как session_id', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/rom')
      .set('Cookie', patientAuthCookie(testPatientId))
      .send({
        measurement_type: 'knee_flexion_degrees',
        side: 'L',
        value: 120,
        measurement_session_id: UNIX_MILLIS,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.measurement_session_id).toBe(UNIX_MILLIS);
  });

  it('POST girth принимает Date.now() millis как session_id', async () => {
    const res = await request(app)
      .post('/api/rehab/my/measurements/girth')
      .set('Cookie', patientAuthCookie(testPatientId))
      .send({
        measurement_type: 'knee_joint_line_cm',
        side: 'R',
        value_cm: 42.5,
        measurement_session_id: UNIX_MILLIS,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.measurement_session_id).toBe(UNIX_MILLIS);
  });

  it('GET возвращает measurement_session_id как Number, не string', async () => {
    const res = await request(app)
      .get('/api/rehab/my/measurements?type=rom')
      .set('Cookie', patientAuthCookie(testPatientId));
    expect(res.status).toBe(200);
    const withSession = res.body.data.rom.find(m => m.measurement_session_id === UNIX_MILLIS);
    expect(withSession).toBeTruthy();
    expect(typeof withSession.measurement_session_id).toBe('number');
  });
});
```

**Note по pg-node BIGINT парсинг:** по умолчанию pg-node возвращает BIGINT как **string** (через `pg-types`), чтобы избежать precision loss на values > Number.MAX_SAFE_INTEGER. Unix millis (1.7×10^12) намного меньше MAX_SAFE_INTEGER (9×10^15) → safe для Number conversion.

**Если последний тест fail'ится** (`typeof === 'string'`) — добавь в `backend/database/db.js`:
```javascript
const types = require('pg').types;
// Cast bigint (oid 20) → JS Number (safe для measurement_session_id range, < 2^53)
types.setTypeParser(20, val => val === null ? null : parseInt(val, 10));
```

Это **глобальный** override для всего проекта, не для одной колонки. Если кто-то использует BIGINT для значений > 2^53 в будущем — потеря precision. Currently — only measurement_session_id использует BIGINT, safe. Зафиксировать в commit description как известный constraint.

**Альтернатива** (если не хочешь global override) — на backend в response `Number(row.measurement_session_id)` для rom + girth SELECT'ов. Менее clean, но локальнее.

**Решение:** попробуй сначала e2e тест без любых изменений pg-node. Если string — добавь global setTypeParser. Если Number — оставь как есть.

---

## NOT TOUCH

- ❌ Migrations старше `20260519_session_id_bigint.sql` — не модифицировать
- ❌ Frontend
- ❌ Routes / middleware — schema-only change
- ❌ ExerciseRunner, PainEventForm, DailyPainSection — LOCKED / out of scope
- ❌ `rom_measurements.id`, `girth_measurements.id` — SERIAL (int4), не меняются (для них millis не используется, это PK)

---

## Smoke test (4-card)

### Сценарий 1 — миграция применилась, тип колонок

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| psql | Тип `measurement_session_id` | `\d rom_measurements` и `\d girth_measurements` | Оба показывают `bigint` (НЕ `integer`). |

### Сценарий 2 — POST rom с millis 13 digits

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| Postman / curl | POST с millis session_id | `{"measurement_type":"knee_flexion_degrees","side":"L","value":120,"measurement_session_id":1716100000000}` | 201 success (НЕ 500 / 22003). `data.measurement_session_id = 1716100000000`. |

### Сценарий 3 — bilateral pair с одним session_id (как в 2.08 будет)

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| Postman / curl | Два POST с одинаковым millis | POST L затем R с одним `measurement_session_id` (millis) | Оба 201. GET возвращает обе entries с этим session_id. Bilateral grouping работает. |

### Сценарий 4 — идемпотентность

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| psql | Повторный run миграции | `psql -f backend/database/migrations/20260519_session_id_bigint.sql` второй раз | NOTICE «already bigint, skip». Никаких ошибок, тип не меняется. |

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260519_session_id_bigint.sql`
- `backend/tests/__tests__/wave2_session_id_bigint.test.js`

### Изменить
- `backend/tests/__tests__/rehab_measurements.test.js` — добавить 3 теста по millis range
- `CLAUDE.md` — секция «Запуск проекта → 1. PostgreSQL» (новая миграция в списке); секция «Схема БД» (тип `measurement_session_id` в rom + girth → BIGINT)
- (Условно) `backend/database/db.js` — global `types.setTypeParser(20, ...)` если e2e тест fail'ится на typeof string

### НЕ ТРОГАТЬ
- `routes/rehab.js` (никакой backend код менять не надо)
- Frontend
- Любые другие миграции / schema файлы

---

## Текст коммита

```
fix(db): HF#11 — measurement_session_id INTEGER → BIGINT

Закрывает drift #25 (TZ 2.06 smoke сценарий 2): client-generated
Date.now() millis (13 digits, ~1.7×10^12) переполняет int4
(max 2.15×10^9) → PG 22003 numeric_value_out_of_range → 500.

ALTER COLUMN TYPE BIGINT для:
- rom_measurements.measurement_session_id
- girth_measurements.measurement_session_id

Backwards-compatible: int4 values ⊂ int8 range, no backfill.
Идемпотентная миграция через information_schema.columns check.

Существующие индексы (idx_rom_session, idx_girth_session) автоматически
адаптируются. Routes/middleware не меняются — JS Number парсит BIGINT
range до 2^53 без модификации.

Tests: backend +6 (3 sanity SQL + 3 e2e POST/GET с millis).

Frontend (TZ 2.08) сможет генерировать session_id = Date.now() для
bilateral L/R pair без overflow.

Verify-step output (rule #15) — в commit description ниже.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Verify-step output как text section после message.

---

## Definition of Done

- [ ] Verify-step выполнен (тип integer подтверждён до миграции), output в commit report
- [ ] Миграция `20260519_session_id_bigint.sql` создана
- [ ] Миграция применилась — `\d rom_measurements` и `\d girth_measurements` показывают `bigint`
- [ ] Идемпотентность — повторный run не падает, NOTICE «already bigint»
- [ ] Sanity SQL тесты зелёные (4 шт)
- [ ] E2E тесты с millis зелёные (3 шт)
- [ ] Если pg-node вернул string → setTypeParser добавлен; если Number — оставлено как есть
- [ ] **Backend tests ≥570** (564 после 2.06 + 6 новых)
- [ ] Все существующие тесты остались зелёными (frontend 304)
- [ ] CLAUDE.md обновлён (миграции + схема)
- [ ] Коммит с текстом + Co-Authored-By trailer
- [ ] Ветка `wave-2/hotfix-11-session-id-bigint` от `c33cac8`
- [ ] **`git push` ТОЛЬКО после явного «ок» от Vadim'а**
- [ ] PR ⏸ frozen, стек становится **11 PR**:
      `... → c33cac8(2.06) → [HF#11]`

---

## После HF#11

**Следующий TZ:** `TZ_WAVE_2_07_photo_upload_consent.md`

Архитектор пишет 2.07 из:
- Verify-step output HF#11 (rule #15)
- Memory #22 (Block C storage decisions): local disk, sharp 1200max JPEG q=80, JWT-only
- Observation #6 verify 2.06: «Photo upload pattern уже есть в routes/rehab.js для diary_photos (/my/diary/:entry_id/photos) — Multer + Sharp 1200×1200 JPEG q82»
- Memory #11 API format `{data, message?, total?}`

Scope 2.07:
- Создать директорию `backend/uploads/measurements/` + `.gitkeep`
- POST `/api/rehab/my/rom/:id/photo` — multer+sharp 1200max JPEG q82 (паттерн скопирован из diary_photos), обновляет `rom_measurements.photo_url`
- 412 Precondition Failed если `patients.photo_consent_at IS NULL`
- GET `/api/uploads/measurements/:filename` — JWT-guarded retrieve
- POST `/api/auth/patient/photo-consent` — sets `patients.photo_consent_at = NOW()`, `photo_consent_version = 'v1'`
- Tests

**Backlog (deferred):**
- Production migration strategy для big rom/girth tables (new column + backfill + swap) — Wave 3 если потребуется
- pg-types global override audit (если setTypeParser для BIGINT добавлен) — periodic check что не вылезли значения > 2^53 в каких-то columns
