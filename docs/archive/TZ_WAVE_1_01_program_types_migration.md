# TZ Wave 1 · Коммит 1.01 — Миграция program_types + rehab_programs.program_type

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #1 (фундамент multi-protocol)
**Brief:** `WAVE_1_ARCHITECT_BRIEF.md` ключевой компонент 1
**Цель:** ввести справочник `program_types` (минимальный seed) и поле `rehab_programs.program_type`. Без UI-изменений, без новых endpoints — это фундамент, на котором стоят все следующие коммиты волны.
**Объём:** 2-3 часа
**Риск:** низкий — только миграция БД + минимальные тесты

---

## Что блокирует

Сейчас `rehab_programs` НЕ имеет поля `program_type` — тип реабилитационной программы вычисляется ad hoc через regex по `diagnosis` (Wave 0 коммит #02 как временное решение). `rehab_phases.program_type` существует, но всегда `'acl'` в seed.

В нескольких местах кода жёстко прибит хардкод `'acl'`:
- `services/telegramBot.js:170` — `WHERE program_type = 'acl'`
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js:344` — `?type=acl` дефолт

Это блокирует:
- Полноценный показ корректных программ не-ACL пациентам
- Расширение системы на другие протоколы (мениск, плечо, TKA, грыжа)
- Wave 2 (клинический дневник) — measurements и ROM defaults зависят от `program_type`
- Шаблоны программ (Wave 1 Блок B) — `program_templates.program_type` FK на справочник

**После этого коммита:** в БД есть справочник `program_types` с 3 кодами + поле `rehab_programs.program_type` populated для всех существующих программ. Никаких функциональных изменений в UI — это только инфраструктурный фундамент.

**Что НЕ делается этим коммитом:**
- Не меняется backend код использующий `program_type` (это в #02-04)
- Не меняется UI (это в #03-05)
- AdminContent CRUD для program_types — в #05
- Никаких `program_templates` — это блок B
- Не убирается временный маппинг из HomeScreen Wave 0 #02 — это в #03

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- Создаём новый файл миграции `backend/database/migrations/20260513_program_types.sql`
- Создаём новый файл seed `backend/database/seeds/program_types.sql`
- (опционально) `backend/database/schema.sql` — добавить таблицу `program_types` для свежих createdb (но миграция первичный источник правды)

**НЕ ТРОГАТЬ:**
- Никакой backend/frontend код в этом коммите
- Существующие миграции (только additive новая)
- `rehab_phases.program_type` колонка остаётся как есть (она уже NOT NULL DEFAULT 'acl')
- AdminContent UI (это в #05)
- Hot-fix Bug #14 должен быть смержен ДО этого коммита (см. `TZ_HOTFIX_BUG_14_is_registered_oauth.md`)

---

## Backend — миграция

### Файл `backend/database/migrations/20260513_program_types.sql`

```sql
-- Миграция Wave 1 коммит 1.01: справочник program_types + rehab_programs.program_type
-- Идемпотентна (IF NOT EXISTS, DO-блоки с проверками)

BEGIN;

-- 1. Справочник типов реабилитационных программ
CREATE TABLE IF NOT EXISTS program_types (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  joint VARCHAR(50),
  body_side_relevant BOOLEAN DEFAULT TRUE,
  surgery_required BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  position SMALLINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_types_joint ON program_types(joint);
CREATE INDEX IF NOT EXISTS idx_program_types_active ON program_types(is_active);

-- 2. Поле program_type на rehab_programs (с дефолтом 'acl' для обратной совместимости)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rehab_programs' AND column_name = 'program_type'
  ) THEN
    ALTER TABLE rehab_programs
      ADD COLUMN program_type VARCHAR(50) NOT NULL DEFAULT 'acl';
  END IF;
END $$;

-- 3. Минимальный seed program_types
INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('acl', 'ПКС реабилитация', 'knee', TRUE, 1),
  ('knee_general', 'Реабилитация колена', 'knee', FALSE, 2),
  ('shoulder_general', 'Реабилитация плеча', 'shoulder', FALSE, 3)
ON CONFLICT (code) DO NOTHING;

-- 4. FK на program_types (после seed, иначе FK не создастся при пустой program_types)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'rehab_programs' AND constraint_name = 'fk_rehab_programs_program_type'
  ) THEN
    ALTER TABLE rehab_programs
      ADD CONSTRAINT fk_rehab_programs_program_type
      FOREIGN KEY (program_type) REFERENCES program_types(code) ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Backfill для существующих программ — попытка определить program_type по diagnosis
-- (после backfill DEFAULT 'acl' уже сработал на ALTER ADD COLUMN, поэтому это только refinement)
-- Очень осторожно: если diagnosis содержит маркер плеча — обновить на shoulder_general
-- Иначе оставить 'acl' (90% наших пациентов колено по статистике Vadim'а)
UPDATE rehab_programs
SET program_type = 'shoulder_general'
WHERE program_type = 'acl'
  AND diagnosis ~* '(плеч|shoulder|манжет|надостн|cuff|frozen)';

-- 6. Schema.sql sync пометка (для drift detection)
-- (этот блок чисто декларативный, никак не влияет на БД — он для check-schema-drift.sh)

COMMIT;
```

**Принципы миграции:**
- Идемпотентность через `IF NOT EXISTS` + `DO-блоки` + `ON CONFLICT DO NOTHING` + проверки information_schema
- Транзакционность через BEGIN/COMMIT — atomicity при ошибке
- Backfill осторожный: только явные маркеры плеча, остальное → дефолт `'acl'` (статистика Vadim'а: 90% колено)
- FK добавляется ПОСЛЕ seed, иначе если таблица program_types пустая — backfill упадёт

### Файл `backend/database/seeds/program_types.sql`

Этот файл — повтор seed-INSERT из миграции, для повторного запуска при пересоздании БД без миграций.

```sql
-- Seed: типы реабилитационных программ
-- Минимальный набор для Wave 1, расширяется через AdminContent UI

INSERT INTO program_types (code, label, joint, surgery_required, position) VALUES
  ('acl', 'ПКС реабилитация', 'knee', TRUE, 1),
  ('knee_general', 'Реабилитация колена', 'knee', FALSE, 2),
  ('shoulder_general', 'Реабилитация плеча', 'shoulder', FALSE, 3)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  joint = EXCLUDED.joint,
  surgery_required = EXCLUDED.surgery_required,
  position = EXCLUDED.position,
  updated_at = NOW();
```

### Регистрация в `deploy/migrate.sh`

Если migrate.sh использует automated discovery (по дате в имени файла) — ничего делать не надо, миграция обнаружится автоматически.

Если регистрация явная — добавить строку в список миграций для применения.

Проверить также `CLAUDE.md` секцию «1. PostgreSQL» — там перечислены миграции. Добавить:
```
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260513_program_types.sql
```

---

## Тесты

### Тест 1 — idempotency cycle миграции

```bash
# Создать чистую тестовую БД
createdb azarean_test_migrate
psql -U postgres -d azarean_test_migrate -f backend/database/schema.sql

# Применить все миграции по порядку
for f in backend/database/migrations/*.sql; do
  psql -U postgres -d azarean_test_migrate -f "$f" || exit 1
done

# Применить миграции ВТОРОЙ РАЗ (idempotency check)
for f in backend/database/migrations/*.sql; do
  psql -U postgres -d azarean_test_migrate -f "$f" || exit 1
done

# Проверить что таблица создана и seed применился
psql -U postgres -d azarean_test_migrate -c "SELECT code, label FROM program_types ORDER BY position;"
# Должно вернуть 3 строки: acl, knee_general, shoulder_general

# Проверить что rehab_programs имеет колонку
psql -U postgres -d azarean_test_migrate -c "\d rehab_programs" | grep program_type

# Cleanup
dropdb azarean_test_migrate
```

### Тест 2 — backfill корректность

Создать в dev-БД программу с diagnosis «Импинджмент плеча» и проверить что после миграции она получила `program_type = 'shoulder_general'`:

```sql
-- В dev-БД ДО миграции (если миграция уже применена — пропустить, или откатиться через backup)
INSERT INTO patients (full_name, diagnosis) VALUES ('Test Shoulder', 'Импинджмент плеча');
-- ...создать программу для этого пациента...

-- После применения миграции:
SELECT id, diagnosis, program_type FROM rehab_programs WHERE patient_id = (SELECT id FROM patients WHERE full_name = 'Test Shoulder');
-- Ожидание: program_type = 'shoulder_general'
```

### Backend unit-тесты

Новый файл `backend/tests/__tests__/program_types.test.js`:

```javascript
const { query } = require('../../database/db');

describe('program_types справочник', () => {
  it('содержит 3 минимальных кода', async () => {
    const res = await query('SELECT code FROM program_types ORDER BY position');
    const codes = res.rows.map(r => r.code);
    expect(codes).toEqual(expect.arrayContaining(['acl', 'knee_general', 'shoulder_general']));
  });

  it('код acl привязан к knee и surgery_required', async () => {
    const res = await query("SELECT joint, surgery_required FROM program_types WHERE code = 'acl'");
    expect(res.rows[0].joint).toBe('knee');
    expect(res.rows[0].surgery_required).toBe(true);
  });

  it('код shoulder_general привязан к shoulder и НЕ surgery_required', async () => {
    const res = await query("SELECT joint, surgery_required FROM program_types WHERE code = 'shoulder_general'");
    expect(res.rows[0].joint).toBe('shoulder');
    expect(res.rows[0].surgery_required).toBe(false);
  });

  it('FK rehab_programs.program_type работает', async () => {
    // Попытка вставить программу с несуществующим program_type → ошибка FK
    await expect(
      query("INSERT INTO rehab_programs (patient_id, program_type, current_phase, status) VALUES (1, 'nonexistent_code', 1, 'active')")
    ).rejects.toThrow();
  });
});
```

**Команда запуска:**
```bash
cd backend && npm test -- --testPathPattern=program_types
```

---

## NOT TOUCH

- Любой `routes/*.js`, `services/*.js`, frontend файлы — в этом коммите не трогаем
- `rehab_phases` таблица — она уже имеет `program_type`, ничего не меняем
- Существующие миграции — не редактируем
- Никаких `program_templates` (это коммит 1.06)
- Никаких функциональных изменений UI

---

## Smoke test

В этом коммите нет UI — smoke сводится к проверке БД.

### Сценарий 1 — миграция применилась

```bash
# В dev-БД
psql -U postgres -d azarean_rehab -c "SELECT * FROM program_types ORDER BY position;"
```
**Ожидание:** 3 строки.

### Сценарий 2 — backfill отработал

```bash
psql -U postgres -d azarean_rehab -c "SELECT id, current_phase, program_type, diagnosis FROM rehab_programs;"
```
**Ожидание:** все активные программы имеют непустой `program_type`. Если у Vadim'а в dev есть программа с плечом — её `program_type` должен стать `'shoulder_general'`.

### Сценарий 3 — UI пациента не сломан

Войти как пациент `avi707@mail.ru` / `Test1234`. Открыть HomeScreen. **Ожидание:** работает как до миграции (Wave 0 коммит #02 показывает `program_label` через временный маппинг, поле `program_type` есть в БД но фронт его пока не использует).

### Сценарий 4 — UI инструктора не сломан

Войти как инструктор `vadim@azarean.com`. Открыть карточку пациента, список программ. **Ожидание:** работает как до.

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260513_program_types.sql` — миграция
- `backend/database/seeds/program_types.sql` — seed для re-create
- `backend/tests/__tests__/program_types.test.js` — unit-тесты справочника

### Изменить
- `CLAUDE.md` — секция «1. PostgreSQL» список миграций (добавить запись `20260513_program_types`)
- (опционально) `backend/database/schema.sql` — если синхронизируется со схемой, добавить `CREATE TABLE program_types`

### НЕ ТРОГАТЬ
- `routes/*`, `services/*`, frontend файлы, существующие миграции

---

## Текст коммита

```
feat(db): справочник program_types + поле rehab_programs.program_type

Wave 1 коммит 1.01 — фундамент multi-protocol.

- Новая таблица program_types: code/label/joint/surgery_required
- Минимальный seed: acl, knee_general, shoulder_general
- rehab_programs.program_type NOT NULL DEFAULT 'acl' + FK
- Backfill для существующих программ по diagnosis (90% knee)
- Идемпотентная миграция (cycle createdb→migrate×2→drop проверен)

Без функциональных изменений UI. Использование program_type
во фронтенде и Telegram-боте — в коммитах 1.02-1.04.

Closes часть Bug #12 (остатки хардкода 'acl').
Test: backend +4 кейса
```

---

## Пост-коммит

### Обновить документацию

**`CLAUDE.md`:**
- Секция «1. PostgreSQL» — добавить строку про новую миграцию
- Секция «Схема БД» — добавить описание таблицы `program_types`
- Секция «Открытые баги» Bug #12 — отметить «частично, хардкоды в коде убираются в коммитах 1.03-1.04»

**Memory:**
- `memory/wave_1_progress.md` — статус коммита 1.01 → `🟡 готов к smoke` после прохождения локальных тестов

---

## Definition of Done

- [ ] Миграция `20260513_program_types.sql` создана и применена в dev-БД
- [ ] Seed `program_types.sql` создан
- [ ] Idempotency cycle пройден: createdb → migrate × 2 → SELECT 3 строки → drop
- [ ] Backfill отработал на dev-БД (если есть программа с плечом — стала `shoulder_general`)
- [ ] FK `fk_rehab_programs_program_type` создан и работает (тест с несуществующим кодом возвращает ошибку)
- [ ] Все 4 unit-теста зелёные
- [ ] Существующие тесты не сломаны (минимум 338 backend, минимум 236 frontend)
- [ ] CLAUDE.md обновлён (миграции + схема)
- [ ] Коммит создан с указанным текстом
- [ ] `wave_1_progress.md` обновлён: статус 1.01 → `⏸ заморожен` (ждёт batch merge всей волны)
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR открыт, остаётся висеть до конца Wave 1
