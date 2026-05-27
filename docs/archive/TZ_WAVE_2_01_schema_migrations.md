# TZ Wave 2 · Коммит 2.01 — Schema migrations (единая миграция всех таблиц Wave 2)

**Дата:** 2026-05-16
**Roadmap:** PATIENT_UX_ROADMAP_2026-05-08_v2.md Волна 2 + clinical foundation 2026-05-13—16
**Цель:** одна идемпотентная миграция создаёт всю schema-инфраструктуру Wave 2: measurements, pain tracking, criteria, ALTER patients. После этого коммита БД готова к UI/API из остальных 13 коммитов. Без бэкенд-логики, без UI.
**Объём:** 3-4 часа
**Риск:** низкий-средний — много таблиц, но все additive, миграция идемпотентна

---

## Verify-step перед стартом (правило 2026-05-13)

**Обязательно сделай grep до начала кода:**

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# Проверить состояние существующих таблиц
psql -U postgres -d azarean_rehab -c "\d rehab_phases" | grep -E "(criteria_next|program_type)"
psql -U postgres -d azarean_rehab -c "\d patients" | grep "measurement_reference"
psql -U postgres -d azarean_rehab -c "\d diary_entries"

# Проверить что нет уже существующих таблиц Wave 2 (могли быть в чьём-то experimental branch)
psql -U postgres -d azarean_rehab -c "\dt rom_measurements"
psql -U postgres -d azarean_rehab -c "\dt girth_measurements"
psql -U postgres -d azarean_rehab -c "\dt pain_entries"
psql -U postgres -d azarean_rehab -c "\dt phase_transition_criteria"

# Проверить что нет конфликтов с миграциями
ls backend/database/migrations/ | grep -E "(measurement|pain|criteria)"
```

**Зачем:**
- Подтвердить что таблиц Wave 2 ещё нет (новая миграция должна создавать с нуля, не ALTER existing)
- Проверить актуальную structure `rehab_phases` — связь с `phase_transition_criteria` через FK
- Проверить структуру `diary_entries` — она existing (Wave 0), Wave 2 НЕ заменяет её, pain_entries — отдельная сущность

**Если grep покажет что:**
- Какая-то таблица из Wave 2 уже существует → стопись, обсудим (возможно, в проде остались артефакты от experimental branches)
- `diary_entries` имеет колонки которые я не учитываю → проверь что моя миграция не конфликтует
- Существует миграция с похожим именем → переименуй мою (как сделали в 1.01 с дата-collision)

---

## Зависимости

После Wave 1 в main. Hot-fixes из Wave 1 retrospective (5 mini-PR'ов) должны быть смерджены до старта Wave 2. Ветка `wave-2/01-schema-migrations` от `main`.

---

## Что блокирует

Wave 2 целиком зависит от этой schema. Без неё:
- Нет таблиц для measurements → нет UI пациента → нет AI integration
- Нет pain_entries → нет pain tracking
- Нет phase_transition_criteria → нет structured criteria UI

Поэтому 2.01 = первый коммит, **блокер для всех остальных 13 коммитов Wave 2.**

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- Новый файл `backend/database/migrations/20260516_wave2_schema.sql`
- Новый файл `backend/database/seeds/pain_locations.sql` (только структура файла, seed-данных в 2.02)
- Новый файл `backend/tests/__tests__/wave2_schema.test.js` (sanity SQL tests)
- `CLAUDE.md` — добавить запись о миграции + описание новых таблиц в секции «Схема БД»

**НЕ ТРОГАТЬ:**
- Любой существующий backend/frontend код
- Существующие миграции (только additive новая)
- AdminContent (это в 2.02, 2.03)
- Endpoints (это в 2.04+)
- UI (это в 2.05+)

---

## Schema design

### Таблица 1: `rom_measurements` (ROM degrees + HBD cm + HBB categorical)

```sql
CREATE TABLE IF NOT EXISTS rom_measurements (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  measurement_type VARCHAR(50) NOT NULL,
    -- shoulder: 'shoulder_forward_flexion_degrees', 'shoulder_abduction_degrees',
    --          'shoulder_er_0_degrees', 'shoulder_ir_90_abd_degrees', 'shoulder_hbb_categorical'
    -- knee:     'knee_flexion_degrees', 'knee_extension_degrees', 'knee_flexion_hbd_cm'
  side VARCHAR(10) NOT NULL CHECK (side IN ('L', 'R')),
  
  -- ровно ОДНО из value_* должно быть заполнено
  value_degrees NUMERIC(5,1),
  value_cm NUMERIC(5,2),
  value_categorical VARCHAR(20),  -- 'T1'..'T12', 'L1'..'L5', 'sacrum', 'great_trochanter'
  
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  measured_by VARCHAR(20) NOT NULL CHECK (measured_by IN (
    'instructor_direct',    -- инструктор гониометром очно
    'instructor_markup',    -- инструктор по фото вручную (Tier 2)
    'ai_assisted',          -- MediaPipe + verified инструктором (Tier 3)
    'ai_unverified',        -- MediaPipe, ожидает verify
    'patient_self'          -- пациент вписал число (Tier 1)
  )),
  
  -- фото infrastructure
  photo_url VARCHAR(500),
  
  -- AI tracking
  ai_confidence NUMERIC(4,3),         -- 0.000-1.000, NULL для non-AI
  ai_raw_landmarks JSONB,              -- 33 точки MediaPipe для re-analysis
  ai_suggested_degrees NUMERIC(5,1),   -- что предложил AI (для validation tracking)
  
  -- Manual markup tracking
  markup_points JSONB,                 -- [{x,y}, {x,y}, {x,y}] координаты для Tier 2
  
  -- Bilateral grouping
  measurement_session_id INT,          -- группирует L+R замеры одной сессии
  
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- CHECK: ровно один value_* не NULL
  CONSTRAINT rom_value_exactly_one CHECK (
    (CASE WHEN value_degrees IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN value_cm IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN value_categorical IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_rom_patient_type_date ON rom_measurements(patient_id, measurement_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_rom_session ON rom_measurements(measurement_session_id);
CREATE INDEX IF NOT EXISTS idx_rom_pending_verify ON rom_measurements(measured_at DESC) WHERE measured_by = 'ai_unverified';
```

### Таблица 2: `girth_measurements`

```sql
CREATE TABLE IF NOT EXISTS girth_measurements (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  measurement_type VARCHAR(50) NOT NULL,
    -- shoulder: 'shoulder_mid_deltoid_cm', 'shoulder_mid_biceps_cm'
    -- knee: 'knee_joint_line_cm', 'knee_suprapatellar_5cm_cm', 'knee_suprapatellar_10cm_cm',
    --       'knee_suprapatellar_15cm_cm', 'knee_calf_max_cm'
  side VARCHAR(10) NOT NULL CHECK (side IN ('L', 'R')),
  value_cm NUMERIC(5,2) NOT NULL CHECK (value_cm > 0 AND value_cm < 200),
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  measured_by VARCHAR(20) NOT NULL CHECK (measured_by IN ('instructor_direct', 'patient_self')),
  measurement_session_id INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_girth_patient_type_date ON girth_measurements(patient_id, measurement_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_girth_session ON girth_measurements(measurement_session_id);
```

### Таблица 3: `pain_locations` (справочник)

```sql
CREATE TABLE IF NOT EXISTS pain_locations (
  code VARCHAR(50) PRIMARY KEY,
  program_type VARCHAR(50) NOT NULL REFERENCES program_types(code) ON UPDATE CASCADE,
  label VARCHAR(100) NOT NULL,
  position SMALLINT DEFAULT 0,
  is_red_flag BOOLEAN DEFAULT FALSE,    -- триггер ops-alert на появление
  red_flag_reason VARCHAR(255),          -- "Возможный DVT" / "Возможная радикулопатия"
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pain_locations_program_type ON pain_locations(program_type, is_active);
```

**Seed данных в этой миграции нет** — это в 2.02 (16 locations + AdminContent CRUD).

### Таблица 4: `pain_entries`

```sql
CREATE TABLE IF NOT EXISTS pain_entries (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Tier 1: VAS slider (всегда есть)
  vas_score SMALLINT NOT NULL CHECK (vas_score BETWEEN 0 AND 10),
  
  -- Tier 2: расширенные данные (опционально)
  trigger_type VARCHAR(50) CHECK (trigger_type IN (
    'at_rest', 'on_flexion', 'on_extension', 'on_walking',
    'at_night', 'after_exercise', 'on_lifting', 'other'
  )),
  pain_character VARCHAR(50) CHECK (pain_character IN (
    'aching',    -- ноющая
    'sharp',     -- острая
    'burning',   -- жгучая
    'shooting',  -- простреливающая
    'throbbing', -- пульсирующая
    'other'
  )),
  notes TEXT,
  
  -- Pain Event vs daily entry
  is_event BOOLEAN DEFAULT FALSE NOT NULL,
  photo_url VARCHAR(500),                -- опциональное фото (биометрика → consent required)
  
  -- Red flag tracking
  red_flag_triggered BOOLEAN DEFAULT FALSE,
  ops_alert_sent_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Один daily entry на дату, multiple events возможны
CREATE UNIQUE INDEX IF NOT EXISTS idx_pain_daily_unique
  ON pain_entries(patient_id, entry_date) WHERE is_event = FALSE;
CREATE INDEX IF NOT EXISTS idx_pain_events
  ON pain_entries(patient_id, entry_date) WHERE is_event = TRUE;
CREATE INDEX IF NOT EXISTS idx_pain_red_flag
  ON pain_entries(created_at DESC) WHERE red_flag_triggered = TRUE;
```

### Таблица 5: `pain_entry_locations` (junction)

```sql
CREATE TABLE IF NOT EXISTS pain_entry_locations (
  pain_entry_id INT NOT NULL REFERENCES pain_entries(id) ON DELETE CASCADE,
  location_code VARCHAR(50) NOT NULL REFERENCES pain_locations(code) ON UPDATE CASCADE,
  PRIMARY KEY (pain_entry_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_pain_locations_entry ON pain_entry_locations(pain_entry_id);
```

### Таблица 6: `phase_transition_criteria`

```sql
CREATE TABLE IF NOT EXISTS phase_transition_criteria (
  id SERIAL PRIMARY KEY,
  phase_id INT NOT NULL REFERENCES rehab_phases(id) ON DELETE CASCADE,
  criterion_code VARCHAR(50) NOT NULL,  -- 'full_extension', 'flexion_90', etc
  label VARCHAR(255) NOT NULL,
  criterion_type VARCHAR(20) NOT NULL CHECK (criterion_type IN (
    'measurement',         -- auto-check против rom_measurements/girth_measurements/pain_entries
    'self_report',         -- пациент сам отмечает yes/no
    'instructor_check'     -- куратор подтверждает очно
  )),
  
  -- Для measurement-based
  measurement_type VARCHAR(50),       -- 'knee_flexion_degrees' | 'vas_score' | 'girth_asymmetry_cm' | etc
  measurement_source VARCHAR(20),     -- 'rom' | 'girth' | 'pain' (какая таблица)
  threshold_operator VARCHAR(5) CHECK (threshold_operator IN ('>=', '<=', '=', '>', '<', 'between')),
  threshold_value NUMERIC(7,2),
  threshold_value2 NUMERIC(7,2),      -- для between
  staleness_days SMALLINT DEFAULT 7,  -- свежесть measurement — старше N дней = pending
  
  -- Для self_report
  self_report_question TEXT,           -- "Можете ли стоять без боли?"
  self_report_hint TEXT,               -- "Попробуйте простоять 10 секунд"
  
  -- Common
  position SMALLINT DEFAULT 0,
  is_required BOOLEAN DEFAULT TRUE,    -- если FALSE — desired but not blocking
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (phase_id, criterion_code)
);

CREATE INDEX IF NOT EXISTS idx_criteria_phase ON phase_transition_criteria(phase_id, position) WHERE is_active = TRUE;
```

### Таблица 7: `patient_criterion_answers` (self_report + instructor_check tracking)

```sql
CREATE TABLE IF NOT EXISTS patient_criterion_answers (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE CASCADE,
  criterion_id INT NOT NULL REFERENCES phase_transition_criteria(id) ON DELETE CASCADE,
  answer_bool BOOLEAN NOT NULL,
  
  -- Кто подтвердил
  answered_by_type VARCHAR(20) NOT NULL CHECK (answered_by_type IN ('patient', 'instructor')),
  answered_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,  -- NULL для answered_by_type='patient'
  
  answered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  
  -- Один current answer на (patient, criterion) — новый отменяет старый через app-level логику
  -- (исторические answers нужны для аудита, не удаляем)
  CONSTRAINT answer_by_user_consistency CHECK (
    (answered_by_type = 'patient' AND answered_by_user_id IS NULL) OR
    (answered_by_type = 'instructor' AND answered_by_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_criterion_answers_patient_criterion ON patient_criterion_answers(patient_id, criterion_id, answered_at DESC);
```

### ALTER patients

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'measurement_reference_photo_url'
  ) THEN
    ALTER TABLE patients ADD COLUMN measurement_reference_photo_url VARCHAR(500);
  END IF;
END $$;
```

`measurement_reference_photo_url` — personal эталон-фото для пациента (загружается инструктором в студии при baseline). Если NULL — UI пациента использует общие reference photos из content layer.

### Photo consent tracking

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'photo_consent_at'
  ) THEN
    ALTER TABLE patients ADD COLUMN photo_consent_at TIMESTAMP;
    ALTER TABLE patients ADD COLUMN photo_consent_version VARCHAR(20);
  END IF;
END $$;
```

При первом фото-upload'е (ROM или pain event) — пациент tap'ает consent → backend заполняет `photo_consent_at = NOW()` + `photo_consent_version = 'v1.0'`. Дальше при каждом upload checking `photo_consent_at IS NOT NULL`. Если NULL — UI redirects на consent flow.

---

## Полная миграция файлом

### `backend/database/migrations/20260516_wave2_schema.sql`

```sql
-- Wave 2 коммит 2.01 — клинический дневник schema
-- Создаёт все таблицы Wave 2 одной идемпотентной миграцией
-- Sanity-tested + idempotency cycle verified

BEGIN;

-- ================================================================
-- 1. rom_measurements (ROM degrees + HBD cm + HBB categorical)
-- ================================================================
CREATE TABLE IF NOT EXISTS rom_measurements (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  measurement_type VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('L', 'R')),
  value_degrees NUMERIC(5,1),
  value_cm NUMERIC(5,2),
  value_categorical VARCHAR(20),
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  measured_by VARCHAR(20) NOT NULL CHECK (measured_by IN (
    'instructor_direct', 'instructor_markup', 'ai_assisted', 'ai_unverified', 'patient_self'
  )),
  photo_url VARCHAR(500),
  ai_confidence NUMERIC(4,3),
  ai_raw_landmarks JSONB,
  ai_suggested_degrees NUMERIC(5,1),
  markup_points JSONB,
  measurement_session_id INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT rom_value_exactly_one CHECK (
    (CASE WHEN value_degrees IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN value_cm IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN value_categorical IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_rom_patient_type_date ON rom_measurements(patient_id, measurement_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_rom_session ON rom_measurements(measurement_session_id);
CREATE INDEX IF NOT EXISTS idx_rom_pending_verify ON rom_measurements(measured_at DESC) WHERE measured_by = 'ai_unverified';

-- ================================================================
-- 2. girth_measurements
-- ================================================================
CREATE TABLE IF NOT EXISTS girth_measurements (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  measurement_type VARCHAR(50) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('L', 'R')),
  value_cm NUMERIC(5,2) NOT NULL CHECK (value_cm > 0 AND value_cm < 200),
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  measured_by VARCHAR(20) NOT NULL CHECK (measured_by IN ('instructor_direct', 'patient_self')),
  measurement_session_id INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_girth_patient_type_date ON girth_measurements(patient_id, measurement_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_girth_session ON girth_measurements(measurement_session_id);

-- ================================================================
-- 3. pain_locations (справочник, seed в 2.02)
-- ================================================================
CREATE TABLE IF NOT EXISTS pain_locations (
  code VARCHAR(50) PRIMARY KEY,
  program_type VARCHAR(50) NOT NULL REFERENCES program_types(code) ON UPDATE CASCADE,
  label VARCHAR(100) NOT NULL,
  position SMALLINT DEFAULT 0,
  is_red_flag BOOLEAN DEFAULT FALSE,
  red_flag_reason VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pain_locations_program_type ON pain_locations(program_type, is_active);

-- ================================================================
-- 4. pain_entries
-- ================================================================
CREATE TABLE IF NOT EXISTS pain_entries (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vas_score SMALLINT NOT NULL CHECK (vas_score BETWEEN 0 AND 10),
  trigger_type VARCHAR(50) CHECK (trigger_type IN (
    'at_rest', 'on_flexion', 'on_extension', 'on_walking',
    'at_night', 'after_exercise', 'on_lifting', 'other'
  )),
  pain_character VARCHAR(50) CHECK (pain_character IN (
    'aching', 'sharp', 'burning', 'shooting', 'throbbing', 'other'
  )),
  notes TEXT,
  is_event BOOLEAN NOT NULL DEFAULT FALSE,
  photo_url VARCHAR(500),
  red_flag_triggered BOOLEAN DEFAULT FALSE,
  ops_alert_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pain_daily_unique
  ON pain_entries(patient_id, entry_date) WHERE is_event = FALSE;
CREATE INDEX IF NOT EXISTS idx_pain_events
  ON pain_entries(patient_id, entry_date) WHERE is_event = TRUE;
CREATE INDEX IF NOT EXISTS idx_pain_red_flag
  ON pain_entries(created_at DESC) WHERE red_flag_triggered = TRUE;

-- ================================================================
-- 5. pain_entry_locations (junction)
-- ================================================================
CREATE TABLE IF NOT EXISTS pain_entry_locations (
  pain_entry_id INT NOT NULL REFERENCES pain_entries(id) ON DELETE CASCADE,
  location_code VARCHAR(50) NOT NULL REFERENCES pain_locations(code) ON UPDATE CASCADE,
  PRIMARY KEY (pain_entry_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_pain_locations_entry ON pain_entry_locations(pain_entry_id);

-- ================================================================
-- 6. phase_transition_criteria
-- ================================================================
CREATE TABLE IF NOT EXISTS phase_transition_criteria (
  id SERIAL PRIMARY KEY,
  phase_id INT NOT NULL REFERENCES rehab_phases(id) ON DELETE CASCADE,
  criterion_code VARCHAR(50) NOT NULL,
  label VARCHAR(255) NOT NULL,
  criterion_type VARCHAR(20) NOT NULL CHECK (criterion_type IN (
    'measurement', 'self_report', 'instructor_check'
  )),
  measurement_type VARCHAR(50),
  measurement_source VARCHAR(20),
  threshold_operator VARCHAR(5) CHECK (threshold_operator IN ('>=', '<=', '=', '>', '<', 'between')),
  threshold_value NUMERIC(7,2),
  threshold_value2 NUMERIC(7,2),
  staleness_days SMALLINT DEFAULT 7,
  self_report_question TEXT,
  self_report_hint TEXT,
  position SMALLINT DEFAULT 0,
  is_required BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (phase_id, criterion_code)
);

CREATE INDEX IF NOT EXISTS idx_criteria_phase ON phase_transition_criteria(phase_id, position) WHERE is_active = TRUE;

-- ================================================================
-- 7. patient_criterion_answers
-- ================================================================
CREATE TABLE IF NOT EXISTS patient_criterion_answers (
  id SERIAL PRIMARY KEY,
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INT REFERENCES rehab_programs(id) ON DELETE CASCADE,
  criterion_id INT NOT NULL REFERENCES phase_transition_criteria(id) ON DELETE CASCADE,
  answer_bool BOOLEAN NOT NULL,
  answered_by_type VARCHAR(20) NOT NULL CHECK (answered_by_type IN ('patient', 'instructor')),
  answered_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT answer_by_user_consistency CHECK (
    (answered_by_type = 'patient' AND answered_by_user_id IS NULL) OR
    (answered_by_type = 'instructor' AND answered_by_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_criterion_answers_patient_criterion
  ON patient_criterion_answers(patient_id, criterion_id, answered_at DESC);

-- ================================================================
-- 8. ALTER patients (personal reference + photo consent)
-- ================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'measurement_reference_photo_url'
  ) THEN
    ALTER TABLE patients ADD COLUMN measurement_reference_photo_url VARCHAR(500);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'photo_consent_at'
  ) THEN
    ALTER TABLE patients ADD COLUMN photo_consent_at TIMESTAMP;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'photo_consent_version'
  ) THEN
    ALTER TABLE patients ADD COLUMN photo_consent_version VARCHAR(20);
  END IF;
END $$;

COMMIT;
```

---

## Idempotency cycle тест (обязательно)

```bash
createdb azarean_test_w2_migrate

# Применить schema + все миграции по порядку 2 раза
psql -U postgres -d azarean_test_w2_migrate -f backend/database/schema.sql
for f in backend/database/migrations/*.sql; do
  psql -U postgres -d azarean_test_w2_migrate -f "$f" || exit 1
done
for f in backend/database/migrations/*.sql; do
  psql -U postgres -d azarean_test_w2_migrate -f "$f" || exit 1
done

# Проверить что все 7 новых таблиц существуют
for t in rom_measurements girth_measurements pain_locations pain_entries pain_entry_locations phase_transition_criteria patient_criterion_answers; do
  psql -U postgres -d azarean_test_w2_migrate -c "\d $t" | head -3 || exit 1
done

# Проверить ALTER patients
psql -U postgres -d azarean_test_w2_migrate -c "\d patients" | grep -E "(measurement_reference|photo_consent)"

# Cleanup
dropdb azarean_test_w2_migrate
```

---

## Mock-based sanity тесты

### `backend/tests/__tests__/wave2_schema.test.js`

```javascript
// Sanity-тесты SQL-структуры миграции (правило 2026-05-13: mock-based, без реальной БД)
const fs = require('fs');
const path = require('path');

describe('Wave 2 schema migration — SQL sanity', () => {
  const migrationPath = path.join(__dirname, '../../database/migrations/20260516_wave2_schema.sql');
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('создаёт все 7 таблиц Wave 2', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS rom_measurements/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS girth_measurements/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS pain_locations/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS pain_entries/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS pain_entry_locations/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS phase_transition_criteria/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS patient_criterion_answers/);
  });

  it('rom_measurements имеет 5 measured_by values', () => {
    expect(sql).toMatch(/measured_by VARCHAR\(20\) NOT NULL CHECK.*instructor_direct.*instructor_markup.*ai_assisted.*ai_unverified.*patient_self/s);
  });

  it('rom_measurements CHECK ровно одно value_*', () => {
    expect(sql).toMatch(/CONSTRAINT rom_value_exactly_one CHECK/);
  });

  it('pain_entries CHECK vas_score 0-10', () => {
    expect(sql).toMatch(/vas_score SMALLINT NOT NULL CHECK \(vas_score BETWEEN 0 AND 10\)/);
  });

  it('pain_entries UNIQUE daily entry partial index', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_pain_daily_unique[\s\S]+WHERE is_event = FALSE/);
  });

  it('pain_locations FK на program_types', () => {
    expect(sql).toMatch(/program_type VARCHAR\(50\) NOT NULL REFERENCES program_types\(code\)/);
  });

  it('phase_transition_criteria три типа', () => {
    expect(sql).toMatch(/criterion_type VARCHAR\(20\) NOT NULL CHECK.*measurement.*self_report.*instructor_check/s);
  });

  it('patient_criterion_answers consistency CHECK', () => {
    expect(sql).toMatch(/CONSTRAINT answer_by_user_consistency CHECK/);
  });

  it('ALTER patients добавляет 3 колонки', () => {
    expect(sql).toMatch(/ADD COLUMN measurement_reference_photo_url VARCHAR\(500\)/);
    expect(sql).toMatch(/ADD COLUMN photo_consent_at TIMESTAMP/);
    expect(sql).toMatch(/ADD COLUMN photo_consent_version VARCHAR\(20\)/);
  });

  it('идемпотентность — все CREATE TABLE имеют IF NOT EXISTS', () => {
    const createTableMatches = sql.match(/CREATE TABLE[\s\S]*?;/g) || [];
    createTableMatches.forEach(stmt => {
      expect(stmt).toMatch(/CREATE TABLE IF NOT EXISTS/);
    });
  });

  it('идемпотентность — все ALTER в DO-блоках с информационной проверкой', () => {
    const alterMatches = sql.match(/ALTER TABLE patients ADD COLUMN[\s\S]*?;/g) || [];
    expect(alterMatches.length).toBeGreaterThanOrEqual(3);
    // Должны быть в DO $$ блоках
    expect(sql).toMatch(/DO \$\$[\s\S]+?IF NOT EXISTS[\s\S]+?ADD COLUMN measurement_reference_photo_url/);
  });

  it('транзакционность BEGIN/COMMIT', () => {
    expect(sql.trim()).toMatch(/^BEGIN;/m);
    expect(sql.trim()).toMatch(/COMMIT;\s*$/);
  });

  it('все индексы IF NOT EXISTS', () => {
    const indexes = sql.match(/CREATE (?:UNIQUE )?INDEX[\s\S]*?;/g) || [];
    indexes.forEach(idx => {
      expect(idx).toMatch(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS/);
    });
  });
});
```

---

## NOT TOUCH

- Существующие миграции
- `diary_entries` таблица — Wave 0 entity, остаётся как есть (Wave 2 pain — отдельная сущность)
- AdminContent (это в 2.02, 2.03)
- API endpoints (это в 2.04+)
- Frontend (это в 2.05+)
- LOCKED-зоны
- OAuth flow

---

## Smoke test

В этом коммите нет UI — smoke сводится к БД.

### Сценарий 1 — миграция применилась

```bash
psql -U postgres -d azarean_rehab -c "\dt rom_measurements girth_measurements pain_locations pain_entries pain_entry_locations phase_transition_criteria patient_criterion_answers"
```

**Ожидание:** 7 таблиц перечислены.

### Сценарий 2 — FK работают

```bash
# Попытка вставить pain_entry с несуществующим program_id — должен fail
psql -U postgres -d azarean_rehab -c "INSERT INTO pain_entries (patient_id, program_id, vas_score) VALUES (1, 99999999, 5);"
```

**Ожидание:** ошибка FK constraint.

### Сценарий 3 — UI не сломан

Войти как пациент / инструктор — ничего не должно сломаться (схема additive, никакой бэкенд код её ещё не использует).

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260516_wave2_schema.sql`
- `backend/tests/__tests__/wave2_schema.test.js`

### Изменить
- `CLAUDE.md` — секция «Запуск проекта → 1. PostgreSQL» список миграций (добавить `20260516_wave2_schema`)
- `CLAUDE.md` — секция «Схема БД» добавить описание 7 новых таблиц + ALTER patients

### НЕ ТРОГАТЬ
- `backend/database/schema.sql` — миграция является источником правды
- Любой backend/frontend код
- Существующие миграции

---

## Текст коммита

```
feat(db): Wave 2 schema — measurements, pain, criteria

Wave 2 коммит 2.01 — единая миграция всех таблиц клинического дневника.

Создаёт 7 таблиц:
- rom_measurements (ROM degrees + HBD cm + HBB categorical, AI + markup поля)
- girth_measurements (окружности)
- pain_locations (справочник, FK program_types)
- pain_entries (daily + Pain Event с is_event flag)
- pain_entry_locations (junction many-to-many)
- phase_transition_criteria (three types: measurement/self_report/instructor_check)
- patient_criterion_answers (audit trail для self_report и instructor_check)

ALTER patients: + measurement_reference_photo_url, photo_consent_at, photo_consent_version.

Идемпотентная миграция, idempotency cycle createdb→migrate×2→drop пройден.
Mock-based sanity SQL тесты по правилу 2026-05-13.

Без бэкенд-логики и UI — это фундамент для 2.02-2.14.

Test: backend +13 sanity SQL

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Секция «Запуск проекта → 1. PostgreSQL» — добавить строку про новую миграцию
- Секция «Схема БД» — добавить описание 7 новых таблиц (формат как существующие entries для program_types/program_templates)
- Секция «Завершённые исправления» — запись «Wave 2 коммит 2.01: schema infrastructure»

**Memory:**
- `wave_2_progress.md` — статус 2.01 → `⏸ заморожен` после прохождения тестов

---

## Definition of Done

- [ ] Verify-step выполнен (grep по существующим таблицам, проверка наличия conflicts)
- [ ] Миграция `20260516_wave2_schema.sql` создана
- [ ] Idempotency cycle пройден (createdb → schema → migrate × 2 → 7 таблиц + 3 ALTER patients колонки видны → drop)
- [ ] FK constraints работают (тест с несуществующим reference fails)
- [ ] CHECK constraints работают (тест с invalid vas_score=15 fails, rom без value_* fails)
- [ ] UNIQUE partial index работает (нельзя 2 daily pain_entries на одну дату, можно N events)
- [ ] Все 13+ sanity SQL тестов зелёные
- [ ] Существующие тесты не сломаны (backend ≥ 430, frontend ≥ 255 после Wave 1 + hot-fixes)
- [ ] CLAUDE.md обновлён (миграции + схема)
- [ ] Коммит создан с указанным текстом + Co-Authored-By trailer
- [ ] `wave_2_progress.md` создан, статус 2.01 → `⏸ заморожен`
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR открыт, остаётся висеть до конца Wave 2 (batch merge policy)
