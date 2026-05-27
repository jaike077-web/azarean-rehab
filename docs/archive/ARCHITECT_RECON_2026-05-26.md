# Recon для архитектора — 2026-05-26

Сырой вывод по запросу RECON ONLY (локальный репо + локальная dev-БД, prod не трогался). Сохранено для передачи архитектору.

---

## A. СХЕМА (dev-БД, после всех миграций)

### A.1 — `\dt` (45 таблиц)

```
_migrations, audit_logs, complex_exercises, complexes, diagnoses, diary_entries,
diary_photos, exercise_muscle_groups, exercise_presets, exercise_tag_links,
exercise_tags, exercises, girth_measurements, messages, muscle_groups,
notification_settings, ops_alerts, pain_entries, pain_entry_locations,
pain_locations, patient_criterion_answers, patient_deletion_queue,
patient_invite_codes, patient_oauth_states, patient_password_resets,
patient_refresh_tokens, patients, phase_stuck_alerts, phase_transition_criteria,
phase_videos, program_template_phase_complexes, program_templates, program_types,
progress_logs, refresh_tokens, rehab_phases, rehab_programs, rom_measurements,
streak_days, streaks, telegram_link_codes, template_exercises, templates, tips, users
```

### A.2 — Ключевые таблицы (полные `\d+`)

#### patients (24 колонки)

```
 id                              | integer                     | not null | nextval('patients_id_seq'::regclass)
 full_name                       | character varying(255)      | not null
 email                           | character varying(255)      |
 phone                           | character varying(50)       |
 birth_date                      | date                        |
 notes                           | text                        |
 created_by                      | integer                     |  -> users(id) ON DELETE SET NULL
 is_active                       | boolean                     | default true
 created_at                      | timestamp without time zone | default now()
 updated_at                      | timestamp without time zone | default now()
 diagnosis                       | text                        |
 password_hash                   | character varying(255)      |
 email_verified                  | boolean                     | default false
 auth_provider                   | character varying(20)       | default 'local'
 provider_id                     | character varying(255)      |
 avatar_url                      | character varying(500)      |
 last_login_at                   | timestamp without time zone |
 telegram_chat_id                | numeric(20,0)               | UNIQUE
 failed_login_attempts           | smallint                    | default 0
 locked_until                    | timestamp without time zone |
 preferred_messenger             | character varying(20)       | not null default 'telegram'
 measurement_reference_photo_url | character varying(500)      |
 photo_consent_at                | timestamp without time zone |
 photo_consent_version           | character varying(20)       |

Indexes:
    "patients_pkey" PRIMARY KEY, btree (id)
    "idx_patients_active" btree (is_active)
    "idx_patients_created_active" btree (created_by, is_active) WHERE is_active = true
    "idx_patients_created_by" btree (created_by)
    "idx_patients_email" btree (email)
    "idx_patients_email_unique" UNIQUE, btree (email) WHERE email IS NOT NULL
    "idx_patients_is_active" btree (is_active) WHERE is_active = true
    "idx_patients_preferred_messenger" btree (preferred_messenger) WHERE is_active = true
    "idx_patients_telegram_chat" btree (telegram_chat_id)
    "patients_telegram_chat_id_key" UNIQUE CONSTRAINT, btree (telegram_chat_id)
Check constraints:
    "patients_email_format_check" CHECK (email IS NULL OR email::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)
    "patients_preferred_messenger_check" CHECK (preferred_messenger::text = ANY (ARRAY['telegram','whatsapp','max']::text[]))
Foreign-key constraints:
    "patients_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
Referenced by (FK CASCADE из 15 таблиц): complexes, diary_entries, girth_measurements,
    notification_settings, ops_alerts, pain_entries, patient_criterion_answers,
    patient_deletion_queue, patient_invite_codes, patient_password_resets,
    patient_refresh_tokens, rehab_programs, rom_measurements, streak_days, streaks,
    telegram_link_codes
```

#### complexes (11 колонок)

```
 id              | integer                | not null
 patient_id      | integer                | NOT NULL  -> patients(id) ON DELETE CASCADE
 instructor_id   | integer                |           -> users(id) ON DELETE SET NULL
 diagnosis_id    | integer                |           -> diagnoses(id) ON DELETE SET NULL
 diagnosis_note  | character varying(500) |
 recommendations | text                   |
 warnings        | text                   |
 is_active       | boolean                | default true
 created_at      | timestamp              | default now()
 updated_at      | timestamp              | default now()
 title           | character varying(255) |           -- nullable, отсюда баг #13 «Комплекс #N»

Indexes:
    "complexes_pkey" PRIMARY KEY, btree (id)
    "idx_complexes_active" btree (is_active)
    "idx_complexes_instructor" btree (instructor_id)
    "idx_complexes_instructor_active" btree (instructor_id, is_active) WHERE is_active = true
    "idx_complexes_is_active" btree (is_active) WHERE is_active = true
    "idx_complexes_patient" btree (patient_id)
    "idx_complexes_patient_active" btree (patient_id, is_active) WHERE is_active = true
Referenced by: complex_exercises (CASCADE), progress_logs (CASCADE),
              rehab_programs (SET NULL)
-- access_token дропнут миграцией 20260409
```

#### complex_exercises (10 колонок)

```
 id               | integer | not null
 complex_id       | integer |           -> complexes(id) ON DELETE CASCADE
 exercise_id      | integer |           -> exercises(id) ON DELETE CASCADE
 order_number     | integer | NOT NULL
 sets             | integer | default 3
 reps             | integer | default 10
 duration_seconds | integer |
 rest_seconds     | integer | default 30
 notes            | text    |
 created_at       | timestamp                | default now()

Indexes:
    "complex_exercises_pkey" PRIMARY KEY, btree (id)
    "complex_exercises_complex_id_order_number_key" UNIQUE CONSTRAINT, btree (complex_id, order_number)
    "idx_complex_exercises_complex" btree (complex_id)
    "idx_complex_exercises_exercise" btree (exercise_id)
```

#### rehab_programs (17 колонок)

```
 id                  | integer                | not null
 patient_id          | integer                | NOT NULL -> patients(id) ON DELETE CASCADE
 complex_id          | integer                |          -> complexes(id) ON DELETE SET NULL
 title               | character varying(255) | NOT NULL
 diagnosis           | character varying(255) |
 surgery_date        | date                   |
 current_phase       | integer                | default 1
 phase_started_at    | date                   | default CURRENT_DATE
 status              | character varying(20)  | default 'active'  CHECK IN (active,paused,completed)
 notes               | text                   |
 created_by          | integer                |          -> users(id) ON DELETE SET NULL
 is_active           | boolean                | default true
 created_at          | timestamp              | default now()
 updated_at          | timestamp              | default now()
 program_type        | character varying(50)  | NOT NULL default 'acl' -> program_types(code) ON UPDATE CASCADE
 program_template_id | integer                |          -> program_templates(id) ON DELETE SET NULL

Indexes:
    "rehab_programs_pkey" PRIMARY KEY
    "idx_rehab_programs_patient" btree (patient_id)
    "idx_rehab_programs_status" btree (status)
    "idx_rehab_programs_template" btree (program_template_id)
-- НЕТ UNIQUE на patient_id → допускает N программ на одного пациента
Referenced by: diary_entries (SET NULL), girth_measurements (SET NULL),
               messages (CASCADE), pain_entries (SET NULL),
               patient_criterion_answers (CASCADE), phase_stuck_alerts (CASCADE),
               rom_measurements (SET NULL), streak_days (CASCADE), streaks (SET NULL)
```

#### rehab_phases (21 колонка)

```
 id             | integer                | not null
 program_type   | character varying(100) | NOT NULL default 'acl'
 phase_number   | integer                | NOT NULL
 title          | character varying(255) | NOT NULL
 subtitle       | character varying(255) |
 duration_weeks | character varying(50)  |  -- ВАЖНО: строка (диапазоны "0-2", "36+")
 description    | text                   |
 goals          | text                   |
 restrictions   | text                   |
 criteria_next  | text                   |
 icon           | character varying(50)  |
 color          | character varying(20)  |
 is_active      | boolean                | default true
 created_at     | timestamp              | default now()
 allowed        | text                   |
 pain           | text                   |
 daily          | text                   |
 red_flags      | text                   |
 faq            | text                   |
 color_bg       | character varying(20)  |
 teaser         | text                   |

Indexes:
    "rehab_phases_pkey" PRIMARY KEY
    "idx_rehab_phases_type" btree (program_type)
    "rehab_phases_program_type_phase_number_key" UNIQUE CONSTRAINT, btree (program_type, phase_number)
Referenced by: phase_transition_criteria (CASCADE), phase_videos (CASCADE)
```

#### progress_logs (11 колонок)

```
 id                | integer  | not null
 complex_id        | integer  |  -> complexes(id) ON DELETE CASCADE
 exercise_id       | integer  |  -> exercises(id) ON DELETE CASCADE
 completed         | boolean  | default false
 pain_level        | smallint |  CHECK 0..10
 difficulty_rating | smallint |  CHECK 1..10
 notes             | text     |
 completed_at      | timestamp|
 created_at        | timestamp| default now()
 session_id        | bigint   |  -- ID тренировочной сессии (timestamp)
 session_comment   | text     |

Indexes:
    "progress_logs_pkey" PRIMARY KEY
    "idx_progress_complex" btree (complex_id)
    "idx_progress_logs_complex_completed" btree (complex_id, completed_at DESC NULLS LAST)
    "idx_progress_logs_complex_exercise" btree (complex_id, exercise_id)
    "idx_progress_logs_session" btree (session_id) WHERE session_id IS NOT NULL

-- ВАЖНО: НЕТ FK на patient_id или user_id.
-- Пациент определяется транзитивно через complex_id → complexes.patient_id.
```

#### diary_entries (17 колонок)

```
 id             | integer | not null
 patient_id     | integer | NOT NULL -> patients CASCADE
 program_id     | integer |          -> rehab_programs SET NULL
 entry_date     | date    | NOT NULL default CURRENT_DATE
 pain_level     | integer | CHECK 0..10
 swelling       | integer | CHECK 0..3
 mobility       | integer | CHECK 0..10
 mood           | integer | CHECK 1..5
 exercises_done | boolean | default false
 sleep_quality  | integer | CHECK 1..5
 notes          | text    |
 created_at     | timestamp default now()
 updated_at     | timestamp default now()
 pgic_feel      | character varying(10)  | CHECK (better|same|worse|NULL)
 rom_degrees    | integer                | CHECK 0..180
 better_list    | jsonb                  | NOT NULL default '[]'
 pain_when      | character varying(20)  | CHECK (morning|day|evening|exercise|walking|NULL)

UNIQUE(patient_id, entry_date)
Referenced by: diary_photos (CASCADE), messages.linked_diary_id (SET NULL)
```

#### streaks

```
 id                 | integer  | not null
 patient_id         | integer  | NOT NULL -> patients CASCADE
 program_id         | integer  |          -> rehab_programs SET NULL
 current_streak     | integer  | default 0  -- ВНИМАНИЕ: теперь = total active days (Wave 0)
 longest_streak    | integer  | default 0
 total_days         | integer  | default 0
 last_activity_date | date     |
 updated_at         | timestamp| default now()

UNIQUE(patient_id, program_id)
```

#### pain_entries (14 колонок)

```
 id                 | integer                | not null
 patient_id         | integer                | NOT NULL -> patients CASCADE
 program_id         | integer                |          -> rehab_programs SET NULL
 entry_date         | date                   | NOT NULL default CURRENT_DATE
 vas_score          | smallint               | NOT NULL CHECK 0..10
 trigger_type       | character varying(50)  | CHECK enum (at_rest|on_flexion|on_extension|on_walking|at_night|after_exercise|on_lifting|other)
 pain_character     | text[]                 | CHECK subset of (aching|sharp|burning|shooting|throbbing|other), COALESCE(array_length,0)>0
 notes              | text                   |
 is_event           | boolean                | NOT NULL default false
 photo_url          | character varying(500) |
 red_flag_triggered | boolean                | default false
 ops_alert_sent_at  | timestamp              |
 created_at         | timestamp              | default now()
 updated_at         | timestamp              | default now()

Indexes:
    "pain_entries_pkey" PRIMARY KEY
    "idx_pain_daily_unique" UNIQUE, btree (patient_id, entry_date) WHERE is_event = false
    "idx_pain_events" btree (patient_id, entry_date) WHERE is_event = true
    "idx_pain_red_flag" btree (created_at DESC) WHERE red_flag_triggered = true
Referenced by: pain_entry_locations (CASCADE)
```

#### messages (10 колонок)

```
 id              | integer                | not null
 program_id      | integer                |  -> rehab_programs ON DELETE CASCADE
 sender_type     | character varying(20)  | NOT NULL CHECK (patient|instructor)
 sender_id       | integer                | NOT NULL  -- БЕЗ FK (полиморфно patients.id или users.id)
 body            | text                   | NOT NULL
 is_read         | boolean                | default false
 created_at      | timestamp              | default now()
 linked_diary_id | integer                |  -> diary_entries ON DELETE SET NULL
 channel         | character varying(20)  | CHECK (telegram|whatsapp|max|in_app|NULL)
 message_kind    | character varying(30)  | NOT NULL default 'text' CHECK (text|diary_report|session_report|system_alert)

Indexes: idx_messages_created, idx_messages_linked_diary_id (partial WHERE NOT NULL), idx_messages_program
```

#### users

```
 id                    | integer                | not null
 email                 | character varying(255) | NOT NULL UNIQUE
 password_hash         | character varying(255) | NOT NULL
 full_name             | character varying(255) | NOT NULL
 role                  | character varying(50)  | default 'instructor' CHECK (admin|instructor)
 is_active             | boolean                | default true
 created_at            | timestamp              | default now()
 updated_at            | timestamp              | default now()
 failed_login_attempts | smallint               | default 0
 locked_until          | timestamp              |
```

#### audit_logs

```
 id          | integer    | not null
 user_id     | integer    |  -> users(id)
 action      | character varying(50)  | NOT NULL
 entity_type | character varying(50)  | NOT NULL
 entity_id   | integer    |
 patient_id  | integer    |
 ip_address  | inet       |
 user_agent  | text       |
 details     | jsonb      |
 created_at  | timestamp  | default now()

7 индексов: action, created_at(×2), details_gin, entity, entity_type, patient_id, user_id
```

#### notification_settings

```
 id                    | integer  | not null
 patient_id            | integer  | NOT NULL UNIQUE -> patients CASCADE
 exercise_reminders    | boolean  | default true
 diary_reminders       | boolean  | default true
 message_notifications | boolean  | default true
 reminder_time         | time     | default '09:00:00'
 timezone              | character varying(50)  | default 'Europe/Moscow'
 updated_at            | timestamp              | default now()
```

### A.3 — Таблицы measurement / rom / consent

#### rom_measurements

```
 id                     | integer                | not null
 patient_id             | integer                | NOT NULL -> patients CASCADE
 program_id             | integer                |          -> rehab_programs SET NULL
 measurement_type       | character varying(50)  | NOT NULL
 side                   | character varying(10)  | NOT NULL CHECK (L|R)
 value_degrees          | numeric(5,1)           |
 value_cm               | numeric(5,2)           |
 value_categorical      | character varying(20)  |
 measured_at            | date                   | NOT NULL default CURRENT_DATE
 measured_by            | character varying(20)  | NOT NULL CHECK (instructor_direct|instructor_markup|ai_assisted|ai_unverified|patient_self)
 photo_url              | character varying(500) |
 ai_confidence          | numeric(4,3)           |
 ai_raw_landmarks       | jsonb                  |
 ai_suggested_degrees   | numeric(5,1)           |
 markup_points          | jsonb                  |
 measurement_session_id | bigint                 |
 notes                  | text                   |
 created_at             | timestamp              | default now()
 updated_at             | timestamp              | default now()

CHECK rom_value_exactly_one: ровно одно из value_degrees/value_cm/value_categorical NOT NULL.
Indexes:
    "rom_measurements_pkey"
    "idx_rom_patient_type_date" btree (patient_id, measurement_type, measured_at DESC)
    "idx_rom_pending_verify" btree (measured_at DESC) WHERE measured_by='ai_unverified'
    "idx_rom_session" btree (measurement_session_id)
```

#### girth_measurements

```
 id                     | integer                | not null
 patient_id             | integer                | NOT NULL -> patients CASCADE
 program_id             | integer                |          -> rehab_programs SET NULL
 measurement_type       | character varying(50)  | NOT NULL
 side                   | character varying(10)  | NOT NULL CHECK (L|R)
 value_cm               | numeric(5,2)           | NOT NULL CHECK 0 < value_cm < 200
 measured_at            | date                   | NOT NULL default CURRENT_DATE
 measured_by            | character varying(20)  | NOT NULL CHECK (instructor_direct|patient_self)
 measurement_session_id | bigint                 |
 notes                  | text                   |
 created_at             | timestamp              | default now()
 updated_at             | timestamp              | default now()
```

#### patient_criterion_answers

```
 id                  | integer                | not null
 patient_id          | integer                | NOT NULL -> patients CASCADE
 program_id          | integer                |          -> rehab_programs CASCADE
 criterion_id        | integer                | NOT NULL -> phase_transition_criteria CASCADE
 answer_bool         | boolean                | NOT NULL
 answered_by_type    | character varying(20)  | NOT NULL CHECK (patient|instructor)
 answered_by_user_id | integer                |          -> users SET NULL
 answered_at         | timestamp              | NOT NULL default now()
 notes               | text                   |

CHECK answer_by_user_consistency: patient↔NULL, instructor↔NOT NULL.
```

**«Consent» отдельной таблицей нет** — три поля живут в `patients`:
- `measurement_reference_photo_url VARCHAR(500)`
- `photo_consent_at TIMESTAMP`
- `photo_consent_version VARCHAR(20)`

### A.4 — Файлы миграций (40 + README.md)

```
20240910_add_progress_session_columns.sql
20240930_add_complexes_access_token.sql
20251223_create_templates_tables.sql
20251224_add_rest_seconds.sql
20251225_add_kinescope_id.sql
20260204_security_updates.sql
20260205_database_audit_fixes.sql
20260210_patient_auth.sql
20260210_rehab_tables.sql
20260211_add_complexes_title.sql
20260211_extend_rehab_phases.sql
20260212_telegram_bot.sql
20260213_admin_panel.sql
20260406_audit_schema_fixes.sql
20260408_hash_tokens.sql
20260408_patient_lockout.sql
20260409_complexes_access_token_nullable.sql
20260409_complexes_drop_access_token.sql
20260421_diary_structured_fields.sql
20260421_patient_preferred_messenger.sql
20260421_progress_difficulty_rpe10.sql
20260424_prod_schema_recovery.sql
20260424b_exercises_description_nullable.sql
20260427_normalize_patient_phones.sql
20260427_oauth_pkce_nonce.sql
20260427_patient_invite_codes.sql
20260429_create_migrations_table.sql
20260429_patient_deletion_queue.sql
20260429_telegram_chat_id_numeric.sql
20260508_messages_extend.sql
20260508_streak_days.sql
20260512_program_types.sql
20260513_phase_stuck_alerts.sql
20260513_program_templates.sql
20260516_wave2_schema.sql
20260517_pain_locations_seed.sql
20260518_acl_criteria_seed.sql
20260519_ops_alerts.sql
20260519_session_id_bigint.sql
20260520_pain_character_to_array.sql
README.md
```

### A.5 — Последняя миграция (целиком) — `20260520_pain_character_to_array.sql`

Конвенции, видимые из файла:
- **Транзакция:** `BEGIN; ... COMMIT;`
- **Идемпотентность:** `DO $$ ... END $$` блок с проверкой `data_type` в `information_schema.columns`; dynamic constraint name lookup через `pg_constraint`; `DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT`.
- **Verification queries** комментариями внизу файла.
- **Defensive CHECK** — `COALESCE(array_length(...), 0) > 0` (PostgreSQL `NULL > 0 = NULL`, не false; empty array без COALESCE прошёл бы CHECK).
- **`_migrations` tracking** — миграция сама в неё не вписывает запись. Этим занимается wrapper [deploy/migrate.sh](deploy/migrate.sh) с SHA-256 checksum (см. CLAUDE.md fix #49).

```sql
-- Wave 2 Hot-fix #9 v2 — pain_character VARCHAR(50) → TEXT[]
-- Закрывает архитектурный drift #12 — multi-character клинически верный
-- (sharp+burning при cervical radiculopathy, throbbing+aching при vascular).
--
-- Идемпотентно — re-run после миграции пропускает (DO block + data_type check).
-- ВАЖНО: pg_dump backup ОБЯЗАТЕЛЕН перед applied. Conversion column type не
-- реверсируется без backup.

BEGIN;

DO $$
DECLARE
  v_column_type TEXT;
  v_constraint_name TEXT;
BEGIN
  -- 1. Проверить текущий тип колонки
  SELECT data_type INTO v_column_type
  FROM information_schema.columns
  WHERE table_name = 'pain_entries' AND column_name = 'pain_character';

  IF v_column_type = 'character varying' THEN
    -- 2. Найти и удалить старый CHECK constraint (имя может варьироваться)
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'pain_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pain_character%'
    LIMIT 1;

    IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE pain_entries DROP CONSTRAINT %I', v_constraint_name);
      RAISE NOTICE 'Dropped old CHECK constraint: %', v_constraint_name;
    END IF;

    -- 3. Преобразовать column type VARCHAR → TEXT[]
    -- USING обрабатывает existing data: single string → ARRAY[string], NULL/'' → NULL.
    ALTER TABLE pain_entries
      ALTER COLUMN pain_character TYPE TEXT[]
      USING (
        CASE
          WHEN pain_character IS NULL THEN NULL
          WHEN pain_character::text = '' THEN NULL
          ELSE ARRAY[pain_character::TEXT]
        END
      );

    RAISE NOTICE 'Migrated pain_character VARCHAR(50) → TEXT[]';
  ELSE
    RAISE NOTICE 'pain_character already type %, skipping conversion', v_column_type;
  END IF;
END $$;

-- 4. Добавить новый CHECK constraint поэлементно (idempotent — DROP IF EXISTS перед ADD)
-- ВАЖНО: `array_length(ARRAY[]::TEXT[], 1) = NULL` в PostgreSQL, и `NULL > 0 = NULL` (не false),
-- поэтому пустой массив прошёл бы CHECK. Используем COALESCE → 0 для defensive отклонения.
-- Backend (routes/rehab.js) уже валидирует empty array → 400 как primary guard;
-- CHECK тут secondary defense на уровне БД.
ALTER TABLE pain_entries DROP CONSTRAINT IF EXISTS chk_pain_character_array;
ALTER TABLE pain_entries ADD CONSTRAINT chk_pain_character_array
CHECK (
  pain_character IS NULL OR (
    COALESCE(array_length(pain_character, 1), 0) > 0
    AND pain_character <@ ARRAY['aching', 'sharp', 'burning', 'shooting', 'throbbing', 'other']::TEXT[]
  )
);

COMMIT;

-- Verification queries (выполнить после миграции):
-- 1. Тип колонки = ARRAY
--    SELECT data_type FROM information_schema.columns
--    WHERE table_name='pain_entries' AND column_name='pain_character';
--    Ожидание: ARRAY
-- 2. CHECK constraint существует с новым def
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid='pain_entries'::regclass AND contype='c'
--    AND pg_get_constraintdef(oid) LIKE '%pain_character%';
--    Ожидание: chk_pain_character_array с array_length + <@ check
-- 3. Existing data (если была) preserved as 1-element arrays
--    SELECT id, pain_character FROM pain_entries WHERE pain_character IS NOT NULL;
```

---

## B. КОД — ключевые маршруты

### B.6 — `backend/routes/admin.js` GET `/stats` (строки 357-410)

13 счётчиков через `Promise.all`, **completion %% не считается**:

```js
router.get('/stats', async (req, res) => {
  try {
    const [
      usersCount, patientsCount, programsCount, complexesCount, exercisesCount,
      diaryCount, messagesCount, tipsCount, phasesCount, videosCount,
      auditCount, registrationsMonth, activeStreaks
    ] = await Promise.all([
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE role = 'admin') as admins, COUNT(*) FILTER (WHERE role = 'instructor') as instructors, COUNT(*) FILTER (WHERE is_active = true) as active FROM users"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM patients"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM rehab_programs"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM complexes"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM exercises"),
      query("SELECT COUNT(*) as total FROM diary_entries"),
      query("SELECT COUNT(*) as total FROM messages"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM tips"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM rehab_phases"),
      query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM phase_videos"),
      query("SELECT COUNT(*) as total FROM audit_logs"),
      query("SELECT COUNT(*) as total FROM users WHERE created_at >= date_trunc('month', CURRENT_DATE)"),
      query("SELECT COUNT(*) as total FROM streaks WHERE current_streak > 0")
    ]);

    res.json({
      data: {
        users: usersCount.rows[0],
        patients: patientsCount.rows[0],
        programs: programsCount.rows[0],
        complexes: complexesCount.rows[0],
        exercises: exercisesCount.rows[0],
        diary_entries: { total: diaryCount.rows[0].total },
        messages: { total: messagesCount.rows[0].total },
        tips: tipsCount.rows[0],
        phases: phasesCount.rows[0],
        videos: videosCount.rows[0],
        audit_logs: { total: auditCount.rows[0].total },
        registrations_this_month: registrationsMonth.rows[0].total,
        active_streaks: activeStreaks.rows[0].total
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка получения статистики' });
  }
});
```

**Карточка «Выполнение 175 %% » в этом endpoint НЕ возвращается.** Она приходит из `/api/dashboard/stats` (см. B.7).

### B.7 — `backend/routes/dashboard.js` (целиком — 62 строки)

Один endpoint `GET /api/dashboard/stats`. Считает 4 числа. Источник бага 175 %% :

```js
const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Получить статистику для dashboard
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Количество пациентов
    const patientsResult = await query(
      'SELECT COUNT(*) as count FROM patients WHERE created_by = $1 AND is_active = true',
      [req.user.id]
    );

    // Количество комплексов
    const complexesResult = await query(
      'SELECT COUNT(*) as count FROM complexes WHERE instructor_id = $1 AND is_active = true',
      [req.user.id]
    );

    // Количество упражнений (всего в базе)
    const exercisesResult = await query(
      'SELECT COUNT(*) as count FROM exercises WHERE is_active = true'
    );

    // Средний процент выполнения
    const completionResult = await query(
      `SELECT 
         COUNT(DISTINCT ce.id) as total_exercises,
         COUNT(DISTINCT pl.id) FILTER (WHERE pl.completed = true) as completed_exercises
       FROM complexes c
       LEFT JOIN complex_exercises ce ON c.id = ce.complex_id
       LEFT JOIN progress_logs pl ON ce.exercise_id = pl.exercise_id AND ce.complex_id = pl.complex_id
       WHERE c.instructor_id = $1 AND c.is_active = true`,
      [req.user.id]
    );

    const totalExercises = parseInt(completionResult.rows[0].total_exercises) || 0;
    const completedExercises = parseInt(completionResult.rows[0].completed_exercises) || 0;
    const completionPercent = totalExercises > 0 
      ? Math.round((completedExercises / totalExercises) * 100) 
      : 0;

    res.json({
      data: {
        patients_count: parseInt(patientsResult.rows[0].count),
        complexes_count: parseInt(complexesResult.rows[0].count),
        exercises_count: parseInt(exercisesResult.rows[0].count),
        completion_percent: completionPercent,
      },
    });

  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ 
      error: 'Server Error',
      message: 'Ошибка при получении статистики' 
    });
  }
});

module.exports = router;
```

**Корень 175 %% :**
- `total_exercises` = `COUNT DISTINCT ce.id` — это **слоты в комплексах** (одна строка `complex_exercises` = одно упражнение в одном комплексе).
- `completed_exercises` = `COUNT DISTINCT pl.id` где `completed=true` — это **каждая выполненная сессия** (`progress_logs.id` уникальный на каждое нажатие «Выполнено»).
- Пациент сделал тот же комплекс 3 раза → completed = 3, total = 1 → 300 %% .
- На dev (~14 слотов, 25 progress_logs.completed=true) даёт `25/14 ≈ 178 %% `.
- Никакой нормализации по сессиям / датам / пациентам нет; знаменатель и числитель в разных размерностях.

### B.8 — Messages: где читается / пишется, как моделируется «прочитано / без ответа»

`grep "messages" backend/routes/` → файлы: `admin.js, rehab.js, patientAuth.js, patients.js`. Реальные роуты только в **rehab.js**:

| Метод | Путь | Auth | Что делает |
|---|---|---|---|
| GET | `/api/rehab/my/messages?program_id=` | patient | `SELECT FROM messages` + LEFT JOIN на patients/users/diary_entries; затем `UPDATE messages SET is_read=true WHERE program_id=$1 AND sender_type='instructor' AND is_read=false` |
| POST | `/api/rehab/my/messages` | patient | `INSERT INTO messages (program_id, sender_type='patient', sender_id, body, message_kind, linked_diary_id)` |
| GET | `/api/rehab/my/messages/unread` | patient | `SELECT COUNT FROM messages JOIN rehab_programs WHERE rp.patient_id=$1 AND m.sender_type='instructor' AND m.is_read=false` |
| GET | `/api/rehab/programs/:id/messages` | instructor | SELECT по program_id + `UPDATE messages SET is_read=true WHERE sender_type='patient' AND is_read=false` (читая, инструктор отмечает входящие от пациента как прочитанные) |
| POST | `/api/rehab/programs/:id/messages` | instructor | `INSERT INTO messages (program_id, sender_type='instructor', sender_id, body)` |

**Модель «прочитано / без ответа»:**
- Есть только `messages.is_read BOOLEAN DEFAULT false`. Флипается на `true` при GET соответствующей стороной.
- **Поле «без ответа» отсутствует.** Нет `responded_at`, нет `replied_to_id`, нет `unanswered`. Косвенно можно вычислить: «последнее сообщение от пациента, после которого нет messages с `sender_type='instructor'` и большим `id` в том же `program_id`», но текущий код этого не делает.
- Linkage только к дневнику: `linked_diary_id INT → diary_entries(id) ON DELETE SET NULL` — куратор отвечает на конкретную запись дневника.

### B.9 — `backend/utils/opsAlert.js` — сигнатура

```js
/**
 * Отправить alert в ops-bot.
 * @param {string} title — короткий заголовок (1 строка, попадает в дедуп-ключ)
 * @param {string} [body] — детали (stack trace, контекст). Опционально.
 */
async function sendOpsAlert(title, body = '')

// Поведение:
// - hourly cap 30 алертов / час, после — drop + служебная нотификация «X алертов подавлено»
//   каждые 10 минут.
// - dedup hash(title + первая строка body) с TTL 10 минут.
// - Без config.opsBot.token / config.opsBot.chatId → noop через console.log
//   (тег [ops-alert dry-run] для dev/test).
// - postToTelegram нативный fetch на api.telegram.org/sendMessage (НЕ через
//   node-telegram-bot-api), timeout 5 секунд через AbortSignal.
// - parse_mode не используется (произвольный текст из stack trace может ломать HTML/Markdown).

module.exports = {
  sendOpsAlert,
  formatFrontendAlertBody, // (payload) => string
  formatBackendAlertBody,  // (err, req)  => string
  describePage, describeUA,
  categorizeFrontendError, categorizeBackendError,
  _resetState, // для тестов
};
```

### B.10 — `backend/server.js` блок регистрации роутов (строки 188-258)

```js
app.use('/api/health',                              require('./routes/health'));
app.use('/api/log-error',                           require('./routes/log-error'));
app.use('/api/auth/login',                          authLimiter);
app.use('/api/auth/register',                       authLimiter);
app.use('/api/auth',                                authRouter);
app.use('/api/patients',                            require('./routes/patients'));
app.use('/api/diagnoses',                           require('./routes/diagnoses'));
app.use('/api/complexes',                           require('./routes/complexes'));
app.use('/api/exercises',                           require('./routes/exercises'));
app.use('/api/import',                              require('./routes/import'));
app.use('/api/progress',         requireSameOrigin, require('./routes/progress'));
app.use('/api/dashboard',                           require('./routes/dashboard'));   // ← /stats → Выполнение 175%
app.use('/api/templates',                           require('./routes/templates'));
app.use('/api/patient-auth/login',                  authLimiter);
app.use('/api/patient-auth/register',               authLimiter);
app.use('/api/patient-auth/oauth/telegram',         oauthCallbackLimiter);
app.use('/api/patient-auth/oauth/yandex',           oauthCallbackLimiter);
app.use('/api/patient-auth',     requireSameOrigin, require('./routes/patientAuth'));
app.use('/api/rehab/phases',                        generalLimiter);
app.use('/api/rehab/tips',                          generalLimiter);
app.use('/api/rehab/my',                            requireSameOrigin);
app.use('/api/rehab',                               require('./routes/rehab'));
app.use('/api/telegram',         requireSameOrigin, require('./routes/telegram'));
app.use('/api/admin',                               require('./routes/admin'));       // ← AdminStats /admin/stats
```

`requireSameOrigin` — CSRF guard для cookie-auth (см. `backend/middleware/originCheck.js`).

---

## C. Что реально живо (dev counts)

### C.11

```
       t        | count 
----------------+-------
 complexes      |     4
 rehab_programs |     2
 progress_logs  |    25
 diary_entries  |    12
 pain_entries   |    10
 patients       |     4
 users          |     3
 exercises      |    13
 messages       |    10
```

**Соотношение `complexes(4) != rehab_programs(2)`:** комплекс может существовать без программы (инструктор создал комплекс, но `rehab_programs` запись не сделал — это и есть текущий runtime-баг «POST /programs не ставит status='active' по умолчанию», см. CLAUDE.md backlog Wave 3). Программа без `complex_id` тоже допустима (`complex_id` nullable, FK SET NULL). На dev: 4 комплекса = библиотека упражнений на пациентов, 2 программы = только 2 из 4 пациентов имеют активную rehab-программу.

### C.12 — Какой endpoint пациент дёргает для «своей программы / комплекса»

`grep "my/dashboard\|my/program\|my/complex" backend/routes/` →

```
backend/routes/rehab.js:355  GET /api/rehab/my/program        (@deprecated, zombie)
backend/routes/rehab.js:415  GET /api/rehab/my/dashboard      ← основной
backend/routes/rehab.js:1788 GET /api/rehab/my/exercises      ← полный комплекс с упражнениями
```

#### `/my/program` (deprecated)

JSDoc: `@deprecated Wave 1 #1.02 заменил этот endpoint на GET /api/rehab/my/dashboard. Фронт не вызывает getMyProgram() из services/api.js (0 callsites после Wave 1). Endpoint оставлен на 2 версии для возможных прямых API-консьюмеров.`

`LIMIT 1` по `rehab_programs WHERE patient_id=$1 AND is_active=true AND status='active' ORDER BY created_at DESC`. Дополнительно JOIN на `rehab_phases` для текущей фазы.

#### `/my/dashboard` (основной — HomeScreen пациента)

Возвращает **`{ program, phase, streak, lastDiary, tip, diaryFilledToday, exercisesDoneToday }`**.

- `program` — `LIMIT 1` JOIN `rehab_programs × program_types` (`program_type → label/joint/surgery_required`). Самая свежая активная.
- `phase` — JOIN `rehab_phases WHERE program_type=$1 AND phase_number=$2 AND is_active=true`. Трансформация: `name=title`, `color2=color_bg||color`, `duration_weeks=parseInt(duration_weeks) || 12`.
- `streak` — из `utils/streaks.js::getStreakSummary(patientId)`. Возвращает `current/best/total_days/last_activity_date/days_since_last_activity/missed_yesterday/atRisk` (atRisk если ≥2 дня без активности).
- `lastDiary` — `SELECT id, entry_date, pain_level, mood, exercises_done, notes FROM diary_entries WHERE patient_id=$1 ORDER BY entry_date DESC LIMIT 1`.
- `tip` — `SELECT FROM tips WHERE is_active=true AND (phase_number=$1 OR phase_number IS NULL) AND (program_type=$2 OR program_type='general') ORDER BY RANDOM() LIMIT 1`. `'general'` sentinel для tips «общие для всех program_type».
- `diaryFilledToday` — exists запись в `diary_entries` на сегодня.
- `exercisesDoneToday` — exists запись в `progress_logs.completed=true AND completed_at::date = today` для комплексов этого пациента.

#### `/my/exercises` (ExerciseRunner)

Большой JOIN `rehab_programs × complexes × complex_exercises × exercises × diagnoses × users` с `json_agg` упражнений. `LIMIT 1` на программу. 404 если активной программы с `complex_id` нет.

---

## D. Frontend

### D.13 — Главный экран админки (он же — экран инструктора)

Файл: [frontend/src/pages/Dashboard.js](frontend/src/pages/Dashboard.js) — единый компонент для admin и instructor (default-ветка `switch(activeTab)`, строки 132-211).

«Добро пожаловать, Вадим Администратор!» с `<HeartHandshake>` иконкой, 4 statCard'а («Пациентов», «Комплексов», «Выполнение», «Упражнений») и 3 actionCard'а («Добавить пациента», «Создать комплекс», «Найти упражнение»).

**Цифры берёт из:**

[frontend/src/pages/Dashboard.js:12](frontend/src/pages/Dashboard.js#L12):
```js
import { dashboard } from '../services/api';
```

[frontend/src/pages/Dashboard.js:47-53](frontend/src/pages/Dashboard.js#L47-L53):
```js
useEffect(() => {
  let alive = true;
  dashboard.getStats()
    .then((res) => { if (alive) setStats(res.data || null); })
    .catch(() => { if (alive) setStats(null); });
  return () => { alive = false; };
}, []);
```

[frontend/src/pages/Dashboard.js:148](frontend/src/pages/Dashboard.js#L148):
```jsx
<div className={s.statValue}>{stats?.patients_count ?? '—'}</div>
<div className={s.statLabel}>Пациентов</div>
```

[frontend/src/pages/Dashboard.js:158](frontend/src/pages/Dashboard.js#L158):
```jsx
<div className={s.statValue}>{stats?.complexes_count ?? '—'}</div>
<div className={s.statLabel}>Комплексов</div>
```

[frontend/src/pages/Dashboard.js:169](frontend/src/pages/Dashboard.js#L169):
```jsx
<div className={s.statValue}>
  {stats?.completion_percent != null ? `${stats.completion_percent}%` : '—'}
</div>
<div className={s.statLabel}>Выполнение</div>
```

[frontend/src/pages/Dashboard.js:184](frontend/src/pages/Dashboard.js#L184):
```jsx
<div className={s.statValue}>{stats?.exercises_count ?? '—'}</div>
<div className={s.statLabel}>Упражнений</div>
```

**Сайдбар:** admin-только пункты `admin-stats / admin-users / admin-audit / admin-content / admin-system` (Dashboard.js:337-361, видны только при `user.role === 'admin'`). `admin-stats` рендерит отдельный компонент [AdminStats.js](frontend/src/pages/Admin/AdminStats.js) — он дёргает `/api/admin/stats` (см. D.14) и **completion_percent там НЕ показывается** (другие 14 карточек).

### D.14 — Admin API service

[frontend/src/services/api.js](frontend/src/services/api.js):

```js
// строка 234 — dashboard service (используется главным экраном Dashboard.js)
getStats: () => api.get('/dashboard/stats'),

// строка 579 — admin service (используется AdminStats.js)
getStats: () => api.get('/admin/stats'),
```

Два разных endpoint'а, две разные карты данных, два разных смысла «статистики».

[frontend/src/pages/Admin/AdminStats.js](frontend/src/pages/Admin/AdminStats.js):
```js
import { admin } from '../../services/api';
// ...
const response = await admin.getStats();   // → /api/admin/stats
setStats(response.data);
// рендерит 14 карточек: users/active users/patients/programs/complexes/exercises/
// diary_entries/messages/tips/phases/videos/active_streaks/audit_logs/registrations_this_month
```

---

## Ключевые находки одной строкой

1. **«Выполнение 175 %% » — баг размерности в `backend/routes/dashboard.js:27-42`.** Знаменатель = слоты `complex_exercises`, числитель = сессии `progress_logs.id`. Нет нормализации по сессиям/пациентам/датам.
2. **Главная админки и AdminStats — два разных экрана с двумя разными endpoint'ами.** Главная (Dashboard.js default) → `/api/dashboard/stats`. AdminStats (только для admin role) → `/api/admin/stats`. `completion_percent` есть только в первом.
3. **`progress_logs` не имеет FK на пациента.** Пациент через `complex_id → complexes.patient_id`.
4. **`messages.is_read` — единственный флаг «прочитано». «Без ответа» как поля нет** — только косвенный вывод через ORDER BY id и sender_type.
5. **`rehab_programs` без UNIQUE на patient_id** — допускает N программ на пациента (но UI работает с `LIMIT 1`).
6. **`/my/program` — zombie endpoint после Wave 1 #1.02** (0 callsites из фронта), оставлен на 2 версии. Основной endpoint пациента — `/my/dashboard`.
7. **`complexes.title` nullable** → fallback `derived_title` на бэке (`COALESCE(NULLIF(title,''), first-2-exercises joined ' · ')`) для UI селекторов.
8. **«Consent» отдельной таблицы нет** — 3 поля живут в `patients`: `measurement_reference_photo_url`, `photo_consent_at`, `photo_consent_version`.
9. **Конвенции миграций (по 20260520):** `BEGIN/COMMIT`, идемпотентный `DO $$ ... END $$` с `information_schema` / `pg_constraint` lookup, defensive CHECK с COALESCE, verification queries комментариями. Tracking в `_migrations` делает `deploy/migrate.sh` (SHA-256 checksum), не сама миграция.
10. **`sendOpsAlert(title, body)`** — единый канал для Telegram-алертов от backend/frontend ошибок, hourly cap 30, dedup 10 мин по `hash(title + первая строка body)`.
