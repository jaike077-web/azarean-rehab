# TZ #02 — Data infrastructure: seed `rehab_phases` для `shoulder_general` / `knee_general`

**Дата:** 2026-05-16
**Severity:** MEDIUM (data infrastructure debt, не код)
**Тип:** SQL seed + опциональная миграция-обёртка
**Связано:** [memory/backlog_seed_phases_for_non_acl_program_types.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_seed_phases_for_non_acl_program_types.md), Wave 1 #1.01 (program_types справочник), #1.04 (RoadmapScreen+telegramBot уже готовы к N program_types).

**КРИТИЧНО:** clinical content **не выдумывается Claude** — это медицинский контент, требует review архитектором и/или Vadim'ом. Этот ТЗ описывает только **техническую структуру + варианты доставки**. Заполнение полей (`goals`, `restrictions`, `criteria_next`, `red_flags`, `faq` и т.д.) — отдельная итерация после получения content от Vadim'а / архитектора.

---

## Контекст (verified)

### Текущее состояние БД

| program_type code | Фаз в `rehab_phases` |
|---|---|
| `acl` | **6** (seed в [backend/database/seeds/acl_phases.sql](backend/database/seeds/acl_phases.sql)) |
| `knee_general` | **0** |
| `shoulder_general` | **0** |

Все три типа существуют в справочнике `program_types` (миграция [20260512_program_types.sql:46-48](backend/database/migrations/20260512_program_types.sql#L46-L48)):

```sql
('acl', 'ПКС реабилитация', 'knee', TRUE, 1),
('knee_general', 'Реабилитация колена', 'knee', FALSE, 2),
('shoulder_general', 'Реабилитация плеча', 'shoulder', FALSE, 3)
```

### Что произойдёт у пациента без фаз

**Подтверждено** [memory/backlog_seed_phases_for_non_acl_program_types.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_seed_phases_for_non_acl_program_types.md):

- HomeScreen у `shoulder_general` пациента: **label «Реабилитация плеча» рендерится корректно** (Wave 1 #1.02 JOIN с `program_types`).
- HomeScreen `phase.title`, `phase.color`, `phase.icon`, `phase.duration_weeks` — **пустые** (Wave 1 retro PR #61 уже починил параметризацию запроса, но в БД нет данных → null).
- RoadmapScreen: **пустой список** (graceful — не падает, но бесполезен).
- Stuck-detection: **не сработает** (нет `duration_weeks` для threshold-расчёта; это by-design для open-ended протоколов).
- Tips в `/my/dashboard`: **не покажутся** для shoulder/knee_general (фильтр `program_type = $1 OR 'general'`; общие tips category=`'general'` есть, для plate-specific — нет).

### Схема `rehab_phases` (verified)

Из [backend/database/migrations/20260210_rehab_tables.sql](backend/database/migrations/20260210_rehab_tables.sql) + расширения:

```
id SERIAL PK
program_type VARCHAR(100) NOT NULL DEFAULT 'acl'  -- FK на program_types.code добавлен Wave 1
phase_number INT NOT NULL
title VARCHAR(255)
subtitle VARCHAR(255)
duration_weeks VARCHAR  -- "0-2" / "12-20" / "36+" — диапазон или upper-open
description TEXT
goals JSONB DEFAULT '[]'             -- array строк, парсится через parseTextArray
restrictions JSONB DEFAULT '[]'      -- array строк
criteria_next JSONB DEFAULT '[]'     -- array строк (что должно быть для перехода в след. фазу)
icon VARCHAR(50)                     -- lucide-react имя ('shield', 'move', 'dumbbell', 'activity', 'trophy', 'star')
color VARCHAR(20)                    -- hex основной (#EF4444)
color_bg VARCHAR(20)                 -- hex фон (#FEF2F0)
teaser TEXT                          -- одна строка тизер
allowed JSONB DEFAULT '[]'           -- array «что разрешено»
pain JSONB DEFAULT '[]'              -- array норм боли
daily JSONB DEFAULT '[]'             -- array бытовых правил
red_flags JSONB DEFAULT '[]'         -- array красных флагов
faq JSONB DEFAULT '[]'               -- array {q, a} объектов
is_active BOOLEAN DEFAULT true
created_at TIMESTAMP
UNIQUE(program_type, phase_number)
```

**ON CONFLICT (program_type, phase_number) DO UPDATE** для идемпотентности (см. acl_phases.sql:111-127).

---

## Два пути доставки (выбор за Vadim'ом)

### Путь A — SQL seed-файлы (рекомендуется для bulk-наполнения)

**Структура:**
- [backend/database/seeds/shoulder_general_phases.sql](backend/database/seeds/shoulder_general_phases.sql) (новый)
- [backend/database/seeds/knee_general_phases.sql](backend/database/seeds/knee_general_phases.sql) (новый)

**Применение:**
- Локально: `psql -U postgres -d azarean_rehab -f backend/database/seeds/shoulder_general_phases.sql`
- Prod: завернуть в миграцию [20260516_seed_non_acl_phases.sql](backend/database/migrations/20260516_seed_non_acl_phases.sql) — `migrate.sh` отработает на CI/CD.

**Плюсы:**
- Bulk-операция: 6 фаз × 2 program_type = 12 inserts за один прогон
- Идемпотентно (`ON CONFLICT DO UPDATE`)
- Version-controlled в git → можно откатить
- Если контент меняется — переписать seed и применить заново

**Минусы:**
- SQL-разметка (escape кавычек в JSONB)
- Прямое редактирование SQL для коррекций medical content — не самый удобный UX для Vadim'а

### Путь B — UI через AdminContent (рекомендуется для итеративной разработки)

**Verified:** [frontend/src/pages/Admin/AdminContent.js:145-214](frontend/src/pages/Admin/AdminContent.js#L145-L214) — `PhaseForm` поддерживает все поля **кроме faq** (см. ограничение ниже).

**Применение:**
- Vadim открывает Dashboard → Sidebar → Контент → Фазы → Создать
- Выбирает program_type из select (Wave 1 #1.05)
- Заполняет 6 фаз вручную для каждого типа = 12 ручных сохранений

**Плюсы:**
- WYSIWYG, валидация в реальном времени
- FK check на program_type (защищает от опечаток)
- Не требует разработчика

**Минусы:**
- **UI не поддерживает `faq`** ([AdminContent.js PhaseForm](frontend/src/pages/Admin/AdminContent.js#L145-L214) — нет `faq_text` input'а). Backend POST/PUT [`/api/admin/phases`](backend/routes/admin.js#L507) **принимает** faq, но через UI он будет всегда `null`.
- Долго — 12 фаз вручную через UI
- Для коррекций нужно открывать каждую фазу

**Workaround для faq через UI-путь:**
- После UI-заполнения 12 фаз — отдельный SQL UPDATE для faq:
  ```sql
  UPDATE rehab_phases SET faq = $1::jsonb WHERE program_type = $2 AND phase_number = $3;
  ```
- Или открыть backlog «AdminContent: добавить faq_text input» (~30 минут разработки).

### Рекомендация

**Путь A (SQL seed)** — потому что:
- 12 фаз с ~15 полями каждая = много данных, в UI это часы кликов
- Clinical content — обычно готовится в Markdown / Word документе → проще копипастить в SQL string literals
- Идемпотентность через миграцию даёт защиту от двойного применения
- Семантически правильно: medical protocol data = code-managed, не runtime UI input

---

## Открытые вопросы — нужны ответы Vadim'а / архитектора

Перед написанием seed-файлов нужны ответы на:

### Q1. Структура фаз для `shoulder_general`

Сколько фаз? Стандартные shoulder rehab протоколы используют 4-5 фаз:
- **Phase 1 — Protection / acute** (0-2 нед): immobilization, pain control, gentle pendulum
- **Phase 2 — Motion / mobility** (2-6 нед): passive → active assisted ROM, постепенное увеличение ROM
- **Phase 3 — Strengthening** (6-12 нед): isometrics → isotonics, scapular control
- **Phase 4 — Functional / return-to-activity** (12-20 нед): sport-specific, plyometrics
- **Phase 5 — Maintenance** (20+ нед): prevention, return to full activity

**Вопрос:** 4 / 5 / 6 фаз? Названия / duration_weeks?

### Q2. Структура фаз для `knee_general` (НЕ ACL)

ACL имеет 6 фаз (хирургический протокол). `knee_general` — это любой non-ACL knee (menisectomy, chondromalacia, conservative ОА). Сколько фаз и какие?

### Q3. Содержание полей

Для каждой фазы каждого program_type нужно:
- `title` (255 символов)
- `subtitle` (255 символов) — обычно «X-Y недель»
- `duration_weeks` — диапазон "X-Y" или "Y+" для последней фазы
- `description` (TEXT) — 1-2 предложения
- `goals` — массив 3-5 целей
- `restrictions` — массив 4-8 запретов
- `criteria_next` — массив 3-5 критериев перехода
- `icon` — lucide-react имя (примеры из acl: shield/move/dumbbell/activity/trophy/star)
- `color` + `color_bg` — hex (примеры из acl: #EF4444 + #FEF2F0)
- `teaser` — 1 строка
- `allowed` — массив 4-6 разрешенных действий
- `pain` — массив 3-5 норм боли
- `daily` — массив 4-5 бытовых правил
- `red_flags` — массив 4-6 красных флагов
- `faq` — массив 3-5 объектов `{q, a}`

### Q4. Tips для не-acl program_types

В acl seed есть tips (`category` IN `motivation/exercise/nutrition/recovery`) — нужны ли аналогичные для shoulder/knee_general? Или используем только `category='general'` (которые уже есть и shareable)?

См. фильтр в [backend/routes/rehab.js:414](backend/routes/rehab.js#L414) — после Wave 1 retro подсказки фильтруются по `(program_type = $1 OR program_type = 'general')`, поэтому общие tips покажутся всем. Plate-specific tips — опционально.

---

## Template SQL seed-файла

**Файл-образец:** [backend/database/seeds/shoulder_general_phases.sql](backend/database/seeds/shoulder_general_phases.sql) (создаётся в этой задаче)

Структура идентична `acl_phases.sql` (110 строк):

```sql
-- =====================================================
-- SEED: Фазы реабилитации плеча (универсальные, non-surgical)
-- N фаз, протокол по [Vadim/архитектор источник]
-- =====================================================

INSERT INTO rehab_phases (program_type, phase_number, title, subtitle, duration_weeks,
                          description, goals, restrictions, criteria_next, icon, color, color_bg,
                          teaser, allowed, pain, daily, red_flags, faq)
VALUES
(
    'shoulder_general', 1,
    '<TITLE_PHASE_1>',
    '<SUBTITLE_PHASE_1>',
    '<DURATION_PHASE_1>',
    '<DESCRIPTION_PHASE_1>',
    '[<GOALS_PHASE_1_JSON_ARRAY>]',
    '[<RESTRICTIONS_PHASE_1_JSON_ARRAY>]',
    '[<CRITERIA_NEXT_PHASE_1_JSON_ARRAY>]',
    '<ICON_PHASE_1>', '<COLOR_PHASE_1>', '<COLOR_BG_PHASE_1>',
    '<TEASER_PHASE_1>',
    '[<ALLOWED_PHASE_1_JSON_ARRAY>]',
    '[<PAIN_PHASE_1_JSON_ARRAY>]',
    '[<DAILY_PHASE_1_JSON_ARRAY>]',
    '[<RED_FLAGS_PHASE_1_JSON_ARRAY>]',
    '[<FAQ_PHASE_1_JSON_ARRAY_OF_QA_OBJECTS>]'
),
-- ... фазы 2..N
ON CONFLICT (program_type, phase_number) DO UPDATE SET
    title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle,
    duration_weeks = EXCLUDED.duration_weeks,
    description = EXCLUDED.description,
    goals = EXCLUDED.goals,
    restrictions = EXCLUDED.restrictions,
    criteria_next = EXCLUDED.criteria_next,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    color_bg = EXCLUDED.color_bg,
    teaser = EXCLUDED.teaser,
    allowed = EXCLUDED.allowed,
    pain = EXCLUDED.pain,
    daily = EXCLUDED.daily,
    red_flags = EXCLUDED.red_flags,
    faq = EXCLUDED.faq;
```

**Опциональная миграция-обёртка** [backend/database/migrations/20260516_seed_non_acl_phases.sql](backend/database/migrations/20260516_seed_non_acl_phases.sql):

```sql
-- =====================================================
-- Миграция: применить shoulder_general + knee_general phases seeds
-- Идемпотентна через ON CONFLICT DO UPDATE в дочерних seed-файлах
-- =====================================================

\i backend/database/seeds/shoulder_general_phases.sql
\i backend/database/seeds/knee_general_phases.sql
```

Альтернатива (без `\i`): inline INSERT'ы прямо в файле миграции. Это более надёжно для CI/CD `migrate.sh` (не нужны относительные пути).

---

## Тесты

### Идемпотентность

После применения seed дважды подряд:
```sql
SELECT COUNT(*) FROM rehab_phases WHERE program_type = 'shoulder_general';
-- Ожидается: N (то же что после 1-го применения)
```

### FK constraint

После применения seed:
```sql
-- Проверка что FK с program_types работает
INSERT INTO rehab_phases (program_type, phase_number, title) VALUES ('nonexistent_type', 1, 'X');
-- Ожидается: ERROR foreign key violation (если FK добавлен Wave 1; иначе not applicable)
```

### Интеграционные

После seed — пациент с `program.program_type='shoulder_general'`:
- `GET /api/rehab/my/dashboard` возвращает `phase: { title, color, icon, ... }` (не null)
- `GET /api/rehab/phases?type=shoulder_general` возвращает массив N фаз
- RoadmapScreen в браузере показывает фазы

### Регрессии

- `cd backend && npm test` — должны остаться 437/437
- Существующие acl phases в БД **не изменены** (seed не трогает acl)

---

## Smoke checklist (после применения seed на dev)

**Пациент-плечо в браузере:**

| Шаг | Ожидание |
|---|---|
| Создать пациента с диагнозом «плечо» через инструктор UI | OK |
| Создать RehabProgram через RehabProgramModal с program_type=`shoulder_general` | OK |
| Залогиниться как пациент | OK |
| HomeScreen | hero label «Реабилитация плеча», phase.title виден, phase.color применён к hero card |
| RoadmapScreen | N фаз отображаются, текущая выделена |
| Telegram /status (если бот привязан) | Возвращает phase.title (не fallback "Фаза N") |

**Пациент-knee_general:** аналогично.

**Регрессия для acl-пациентов:** все по-прежнему работает (seed acl не затронут).

---

## Что НЕ ожидаем от этой задачи

- Stuck detection для shoulder/knee_general — by-design open-ended, threshold-расчёт не сработает без явных `duration_weeks` upper bound (см. [backend/utils/phaseDuration.js](backend/utils/phaseDuration.js)).
- Phase-specific tips для shoulder/knee_general — отдельный backlog item (Q4).
- Видео для phases (`phase_videos` таблица) — отдельная задача через AdminContent → Видео.
- Программные шаблоны (`program_templates`) для shoulder/knee_general — отдельная задача через AdminContent → Шаблоны (Wave 1 #1.07).

---

## Деплой план (когда content получен)

1. Vadim / архитектор присылает clinical content (Markdown / JSON / Word).
2. Claude конвертирует в SQL string literals + JSONB arrays, создаёт 2 файла seed.
3. Опционально создаёт миграцию-обёртку (если решено доставлять через `migrate.sh`).
4. Stash dirty файлов (изоляция).
5. Локальный smoke: применить seed на dev БД, проверить через psql + ручной браузер-smoke.
6. `cd backend && npm test` — 437/437.
7. Commit + PR.
8. После squash-merge на main → restore stash.
9. CI/CD применяет миграцию на prod БД (если выбран Путь A через миграцию).
10. Prod-smoke: создать тестового shoulder-пациента, проверить HomeScreen + RoadmapScreen.

---

## Триггер закрытия задачи

Первый реальный shoulder/knee_general пациент в проде — после этого данные обязательны. До тех пор это backlog с ясной structure-готовностью.

---

## Связано

- [memory/backlog_seed_phases_for_non_acl_program_types.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_seed_phases_for_non_acl_program_types.md)
- [backend/database/seeds/acl_phases.sql](backend/database/seeds/acl_phases.sql) — образец структуры
- [backend/database/migrations/20260512_program_types.sql](backend/database/migrations/20260512_program_types.sql) — справочник program_types
- Wave 1 #1.04 — RoadmapScreen + telegramBot уже корректно используют `program_type` (см. CLAUDE.md)
- Wave 1 retrospective PR #61 — `/my/dashboard` phase lookup параметризован (был хардкод `'acl'`)
