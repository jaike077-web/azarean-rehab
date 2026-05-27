# TZ Wave 3 — C1: Instructor assignment + complex cadence (foundation)

**Architect:** Claude Opus 4.7 · **Date:** 2026-05-26 · **Executor:** Claude Code (VS Code, Windows)
**Branch:** feature ветка от текущего main · **Checkpoint:** C1 of C1–C5 (owner command-center)
**Grounding:** RECON 2026-05-26 (round 1 + round 2), подтверждения Vadim 2026-05-26.

---

## 0. Контекст и scope

C1 кладёт фундамент под кураторский дашборд: **ответственный инструктор у пациента** и **целевая частота на комплексе**. Без UI и без агрегатов — это C2+.

**В C1 входит:**
1. Миграция: `patients.assigned_instructor_id` + `complexes.target_min/target_max/target_unit` + бэкфилл + CHECK.
2. Бэкенд: автозаполнение `assigned_instructor_id` при создании комплекса (`routes/complexes.js`).
3. Бэкенд: endpoint переназначения инструктора + audit (`routes/patients.js`).
4. Тесты на всё перечисленное.

**НЕ входит (C2+):** агрегаты дашборда, воронка, сегменты, динамика, Слой 0 (ops_alerts/phase_stuck_alerts UI), инструкторский срез, модалка, RBAC-фильтрация, UI выбора частоты в форме комплекса.

**Решения, зафиксированные до написания (overridable только до apply миграции — после она immutable):**
- Частота — на `complexes` (single static `rehab_programs.complex_id`; при подмене комплекса на фазе новый комплекс несёт свою частоту). Диапазон `target_min`–`target_max` + `target_unit` ∈ {day, week}.
- Передача пациента — через существующий `audit_logs` (verb `PATIENT_REASSIGNED`), без отдельной таблицы истории.
- `status DEFAULT 'active'` уже в миграции `20260210` (на проде есть) — status-fix НЕ нужен, backlog-пункт устарел.
- Переназначение — admin-only на старте (`requireAdmin`). Инструктор-инициированная передача — позже.

---

## TZ-COMPLIANCE — cited rules (architect signature)

- **#15** verify-step — commit-отчёт включает `\d` + `pg_get_constraintdef` dump (см. секцию Verify-step).
- **#16 / migration-конвенции (по `20260520`)** — `BEGIN/COMMIT`, идемпотентность (`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` перед `ADD`), verification-queries комментариями. `_migrations` tracking делает `deploy/migrate.sh`, не сама миграция.
- **#17** — `logAudit(req, action, entity_type, entity_id, details)`, action UPPERCASE, без CHECK-enum (новый verb допустим без правок схемы).
- **#23** — per-checkpoint, NO batching. STOP после C1.
- **meta copy-existing (#25/#26)** — endpoint и тест писать ПО существующим аналогам в `routes/patients.js` и тестах. `grep -rn` ДО написания, не «улучшать» чужой паттерн.
- **Section 8** — миграция immutable после apply; локальное применение через `APP_DIR=<local> bash deploy/migrate.sh`; на прод попадёт только при wave-деплое через CI.
- **Standard API response** — `{data, message?}` success / `{error, message}` error. Без `success:true`.

---

## Pre-flight

Миграция аддитивная (ADD COLUMN, без изменения типов) — риск низкий, но по привычке:

```bash
# Локальный dev snapshot перед apply (Git Bash / pgpass.conf, НЕ PGPASSWORD)
pg_dump -U postgres -d azarean_rehab -Fc -f ~/backups/pre_w3_c1_$(date +%Y%m%d_%H%M).dump
```

Прод не трогаем — C1 применяется локально через `migrate.sh`, на прод уйдёт при деплое волны.

---

## Step 1 — Миграция

Файл: `backend/database/migrations/20260526_instructor_assignment_and_cadence.sql`

```sql
-- Wave 3 — C1: instructor assignment + complex cadence
-- Аддитивно: ADD COLUMN x4 + индекс + бэкфилл + CHECK. Без изменения типов.
-- Идемпотентно (ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS перед ADD).
-- _migrations tracking — через deploy/migrate.sh (SHA-256 checksum), не здесь.

BEGIN;

-- 1. patients.assigned_instructor_id — текущий ответственный инструктор
--    (отдельно от created_by = «кто завёл»)
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS assigned_instructor_id INTEGER
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_assigned_instructor
  ON patients (assigned_instructor_id) WHERE is_active = true;

-- 2. Бэкфилл: последний активный комплекс пациента → его instructor_id,
--    иначе fallback на created_by. Только где ещё не проставлено (идемпотентно).
UPDATE patients p
SET assigned_instructor_id = COALESCE(
      (SELECT c.instructor_id
         FROM complexes c
        WHERE c.patient_id = p.id
          AND c.is_active = true
          AND c.instructor_id IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT 1),
      p.created_by)
WHERE p.assigned_instructor_id IS NULL;

-- 3. complexes — целевая частота (диапазон + единица).
--    Все три NULL = «частота не задана» (legacy-комплексы и до заполнения формой).
ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS target_min  SMALLINT,
  ADD COLUMN IF NOT EXISTS target_max  SMALLINT,
  ADD COLUMN IF NOT EXISTS target_unit VARCHAR(10);

-- 4. CHECK: либо все три NULL, либо все три заданы и валидны.
--    (min>=1, max>=min, unit ∈ {day, week})
ALTER TABLE complexes DROP CONSTRAINT IF EXISTS chk_complexes_cadence;
ALTER TABLE complexes ADD CONSTRAINT chk_complexes_cadence CHECK (
  (target_min IS NULL AND target_max IS NULL AND target_unit IS NULL)
  OR (
    target_min IS NOT NULL AND target_max IS NOT NULL AND target_unit IS NOT NULL
    AND target_min >= 1
    AND target_max >= target_min
    AND target_unit IN ('day', 'week')
  )
);

COMMIT;

-- ── Verification queries (выполнить после apply) ─────────────────────────────
-- 1. Колонки существуют:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='patients' AND column_name='assigned_instructor_id';
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='complexes' AND column_name IN ('target_min','target_max','target_unit')
--    ORDER BY column_name;   -- ожидание: 3 строки
-- 2. Бэкфилл проставлен:
--    SELECT id, created_by, assigned_instructor_id FROM patients ORDER BY id;
--    SELECT count(*) FROM patients
--    WHERE is_active=true AND assigned_instructor_id IS NULL AND created_by IS NOT NULL;
--    -- ожидание: 0 (NULL остаётся только у пациентов без created_by И без комплекса)
-- 3. CHECK существует:
--    SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='complexes'::regclass AND conname='chk_complexes_cadence';
```

Применение локально:

```bash
APP_DIR=/c/Users/Вадим/Desktop/Azarean_rehab bash deploy/migrate.sh
# (или твой реальный local APP_DIR — путь к корню репо)
```

---

## Step 2 — Бэкенд: автозаполнение при создании комплекса

Файл: `routes/complexes.js`, POST-хендлер создания комплекса.

**Перед написанием — verify-step:**
```bash
grep -n "INSERT INTO complexes" backend/routes/complexes.js
grep -n "instructor_id" backend/routes/complexes.js   # как берётся: req.body.instructor_id или req.user.id
grep -n "getClient\|BEGIN\|query(" backend/routes/complexes.js   # транзакция или одиночные query()
```

**Логика:** после успешного `INSERT INTO complexes` — если у пациента ещё нет ответственного, проставить его тем же `instructor_id`, с которым создан комплекс. Не перезаписывать существующее назначение.

```js
// После INSERT комплекса. instructorId — та же переменная, что ушла в complexes.instructor_id.
// Если хендлер в транзакции (getClient) — выполнять тем же client, не отдельным query().
await query(
  `UPDATE patients
      SET assigned_instructor_id = $1, updated_at = now()
    WHERE id = $2 AND assigned_instructor_id IS NULL`,
  [instructorId, patientId]
);
```

Если `instructor_id` комплекса может быть NULL — `UPDATE` с `$1 = NULL` ничего вредного не сделает (WHERE отфильтрует по `assigned_instructor_id IS NULL`, но проставит NULL); добавь guard `AND $1 IS NOT NULL` если такой кейс реален (проверь по grep, ставится ли instructor_id всегда).

---

## Step 3 — Бэкенд: переназначение инструктора + audit

Файл: `routes/patients.js`. Новый endpoint.

**Перед написанием — verify-step (copy-existing):**
```bash
grep -n "router\.\(patch\|put\|post\)" backend/routes/patients.js   # стиль хендлеров
grep -n "requireAdmin\|authenticateToken" backend/routes/patients.js  # auth middleware
grep -n "logAudit" backend/routes/patients.js                       # порядок аргументов + примеры verb
grep -n "res.json" backend/routes/patients.js                       # форма ответа {data, message?}
```

**Endpoint:**
```
PATCH /api/patients/:id/assign-instructor
auth:  authenticateToken + requireAdmin
body:  { instructor_id: number, reason?: string }
```

**Логика:**
1. Валидация: `:id` — существующий пациент; `instructor_id` — существующий активный `users` (любая роль admin|instructor). Невалидно → 400/404 в стиле существующих хендлеров.
2. Прочитать текущее `assigned_instructor_id` (= `from`).
3. `UPDATE patients SET assigned_instructor_id = $instructor_id, updated_at = now() WHERE id = $id`.
4. Audit (Rule #17), тем же порядком аргументов, что в существующих вызовах:
   ```js
   await logAudit(req, 'PATIENT_REASSIGNED', 'patient', patientId, {
     from_user_id: from,
     to_user_id: instructorId,
     reason: req.body.reason ?? null,
   });
   ```
5. Ответ: `{ data: { id, assigned_instructor_id }, message: 'Инструктор назначен' }` (форма — по существующим хендлерам).

**RBAC-заметка:** на C1 — только admin. Инструктор-инициированная передача (свой → другой) добавляется отдельным шагом при C5 (RBAC), если понадобится.

---

## Step 4 — Тесты

**Перед написанием — verify-step:**
```bash
ls backend/**/*.test.js 2>/dev/null; grep -rln "rehab_programs\|complexes" backend/__tests__ 2>/dev/null
grep -rn "supertest\|describe(" backend/routes/__tests__/patients*.test.js 2>/dev/null  # ближайший аналог
```

Писать в стиле существующих Jest+Supertest сьютов. Покрыть:

**Миграция / схема:**
- Колонки `assigned_instructor_id`, `target_min/max/unit` существуют.
- CHECK отклоняет: `target_min` без `unit`; `target_max < target_min`; `target_unit='month'`; принимает: все NULL; валидный диапазон `(1,3,'week')`.

**Автозаполнение (Step 2):**
- Создание комплекса пациенту с `assigned_instructor_id IS NULL` → проставляется `= instructor_id` комплекса.
- Создание второго комплекса (другим инструктором) НЕ перезаписывает уже назначенного.

**Переназначение (Step 3):**
- admin переназначает → поле обновлено, в `audit_logs` появилась строка `PATIENT_REASSIGNED` с корректными `from_user_id`/`to_user_id`.
- non-admin (instructor) → 403.
- несуществующий `instructor_id` → 400/404.

---

## Verify-step (Rule #15) — для commit-отчёта

В отчёт архитектору вставить сырой вывод:

```bash
# Схема
psql -d azarean_rehab -c "\d patients"   | sed -n '/assigned_instructor_id/p'
psql -d azarean_rehab -c "\d complexes"  | sed -n '/target_/p'
psql -d azarean_rehab -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='complexes'::regclass AND conname='chk_complexes_cadence';"

# Бэкфилл
psql -d azarean_rehab -c "SELECT id, created_by, assigned_instructor_id FROM patients ORDER BY id;"
psql -d azarean_rehab -c "SELECT count(*) FROM patients WHERE is_active=true AND assigned_instructor_id IS NULL AND created_by IS NOT NULL;"

# Тесты
npx jest --silent 2>&1 | tail -20   # суммарь suites/tests, должны быть зелёные + новые
```

---

## STOP — commit report

После C1 — **остановиться**, не начинать C2. Отчёт архитектору:
1. SHA коммита C1.
2. Verify-step вывод (схема + бэкфилл + constraintdef).
3. Дельта тестов (было → стало, suites/tests).
4. Любые drift'ы: где TZ разошёлся с реальным кодом (`complexes.js` структура INSERT, `patients.js` форма ответа/auth, ближайший test-аналог) и как поправлено.

Только после отчёта — C2 (агрегаты дашборда: воронка, сегменты по `streak_days`, адхеренс по `target_min`, динамика; endpoint с параметром периода).

---

## NOT in scope (явно — чтобы не расползлось)

- UI выбора частоты в форме комплекса (frontend) — отдельно, при C4 или мелким фиксом.
- Любые агрегаты, GROUP BY по инструктору, чтение `ops_alerts`/`phase_stuck_alerts` — C2/C3.
- RBAC-фильтрация дашборда (admin видит всех / instructor свою группу) — C5.
- Историко-оконная атрибуция инструктора (кто вёл в течение периода) — post-pilot; C1 хранит только текущего владельца.
- Seed фаз для `shoulder_general`/`knee_general`, дочтение `phase_transition_criteria` — отдельные фичи, не часть командного центра.
