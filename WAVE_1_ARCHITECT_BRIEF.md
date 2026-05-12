# Wave 1 Architect Brief — запрос на executable plan

**Дата:** 2026-05-12
**От:** Vadim (через Claude Code в основном чате)
**Кому:** Claude Architect (отдельная сессия)
**Контекст:** Wave 0 закрыта в проде, нужен executable plan для Wave 1.

---

## Что произошло (короткий статус)

### Wave 0 закрыта 2026-05-11–12 (в проде)

Полный пакет 6 PR смерджен в main как squash-коммиты `b699271` → `f368c97` → `cd274c2` → `97b569f` → `200cdfc` → `12a90ad`. Prod-smoke 5/6 пройден 2026-05-12 (юзером в браузере на https://my.azarean.ru). Подробности — [memory/wave_0_complete.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_0_complete.md).

**Метрики после Wave 0:**
- Backend: 338/338 тестов
- Frontend: 236/236 тестов
- 2 миграции (`20260508_streak_days`, `20260508_messages_extend`) — обе идемпотентны

**Закрыто из открытых багов:**
- Bug #11 (стрик не инкрементировался) — полностью
- Bug #12 (hardcoded «ПКС» в HomeScreen) — частично, остатки в `services/telegramBot.js:170` (`WHERE program_type = 'acl'`) и `RoadmapScreen.js` (`?type=acl` дефолт) переходят в Wave 1

**Бонус-фиксы после Wave 0 (P3 баги вскрыты в prod-smoke 2026-05-12):**
- `455f731` — модальные стили RehabProgramModal/InviteCodeModal (последствие CSS-Modules миграции 2026-05-04)
- `55a3205` — avatar 404 не шумит в ops-bot
- `b478977` — ExerciseModal подгружает обогащённые поля (cues/tips/contraindications)
- `631017e` — dark theme на инструкторских формах (CreateComplex/EditComplex/EditExerciseModal/EditTemplate)
- `e8fcd0f` — Exercises библиотека primary tokens + ExerciseModal inputs

---

## Что нужно от тебя

### 1. Executable plan для Wave 1 в формате как Wave 0

Создать файлы в корне проекта:
- `TZ_WAVE_1_INDEX.md` — карта волны: список коммитов, порядок, зависимости, принципы исполнения, журнал прогресса
- `TZ_WAVE_1_NN_*.md` — отдельный файл на каждый атомарный коммит (N штук)

**Образец стиля и структуры:** см. `TZ_WAVE_0_INDEX.md` + `TZ_WAVE_0_01_streak_no_reset.md` … `TZ_WAVE_0_06_roadmap_stuck_banner.md` в корне.

**Принципы те же:**
- Один файл = один атомарный коммит
- Между коммитами обязательная пауза + smoke + ⛔ STOP до подтверждения от Vadim'а
- Smoke в реальном браузере (правило `feedback_smoke_real_browser.md`)
- Push в main только по явному «ок» (правило `feedback_no_direct_main_push_for_ui.md`)
- Не миксовать миграцию + новую фичу в одной сессии (`feedback_one_change_per_session.md`)
- Не делать P3 спонтанной инициативой (`feedback_no_p3_initiative.md`)

### 2. Учесть свежие открытые баги при дизайне

Эти баги обнаружены в prod-smoke 2026-05-12. Часть из них тематически пересекается с Wave 1 — реши, поглощается ли каждый волной или остаётся в backlog:

- **Bug #13 — RehabProgramModal: «Комплекс #N» в селекторе.** У комплексов нет `title`, фронт показывает fallback `Комплекс #${id}`. Инструктор не понимает что выбирает. Wave 1 переписывает RehabProgramModal в wizard с template selector — стоит ли поглотить здесь?
- **Bug #14 — `is_registered=false` для OAuth-пациентов.** Флаг считается через `password_hash IS NOT NULL`. У Yandex/Telegram OAuth `password_hash IS NULL` → инструктор всегда видит «Пациент ещё не зарегистрирован». Условие должно быть `password_hash IS NOT NULL OR last_login_at IS NOT NULL`. Тривиальный фикс на 30 мин — Wave 1 или отдельным коммитом перед волной?
- **Bug #15 — MDEditor (поле «Описание») + global input/textarea не подхватывают dark theme.** Тех-долг, требует дизайн-spec. См. [memory/bug_dark_theme_mdeditor_global_inputs.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_dark_theme_mdeditor_global_inputs.md). НЕ Wave 1, но если у тебя готовится дизайн-spec — учти.

### 3. Open questions из roadmap v2

Эти 5 пунктов оставлены открытыми в v2 (PATIENT_UX_ROADMAP_2026-05-08_v2.md строки 791-803). Wave 1 может стартовать без них, но **#1 program_types seed** в Wave 1 потребует базовый список, а не deep-research контент:

1. Плечо — какие окружности (mid-deltoid + mid-biceps + acromial?) — для Wave 2
2. Голеностоп — техника замера «сам голеностоп» (figure-of-eight vs над лодыжками) — для Wave 2
3. Позвоночник — какие ROM движения — для Wave 2
4. ТБС — точка замера «бедро» — для Wave 2
5. Star Tracker референс — отдельный трек, после Wave 1 минимум

Для Wave 1 нужен **минимальный seed** в `program_types`: acl, knee_general, shoulder_general (по roadmap v2 строки 60-64). Vadim наполнит остальное через AdminContent UI который Wave 1 же и строит.

---

## Скоп Wave 1 из roadmap v2

Полностью описано в `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт 3 «Шаблоны программ» + пункт 1 «Не-ПКС пациент». Объём оценки **30-40 ч кода + 4-6 ч на скелеты-сиды**.

### Ключевые компоненты

**1. Динамический `program_type` (доделать остатки Bug #12)**

```sql
ALTER TABLE rehab_programs
  ADD COLUMN program_type VARCHAR(50) NOT NULL DEFAULT 'acl';

CREATE TABLE program_types (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  joint VARCHAR(50),
  body_side_relevant BOOLEAN DEFAULT TRUE,
  surgery_required BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO program_types (code, label, joint) VALUES
  ('acl', 'ПКС реабилитация', 'knee'),
  ('knee_general', 'Реабилитация колена', 'knee'),
  ('shoulder_general', 'Реабилитация плеча', 'shoulder');
```

Изменения в коде:
- `routes/rehab.js`: `/my/dashboard` возвращает `program.program_type`
- `services/telegramBot.js:170`: `WHERE program_type = $1` через программу пациента
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js:344`: тянет `?type={program.program_type}` из dashboard

**2. Шаблоны программ + AdminContent UI**

```sql
CREATE TABLE program_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  program_type VARCHAR(50) NOT NULL REFERENCES program_types(code),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  surgery_required BOOLEAN DEFAULT FALSE,
  default_phase_count SMALLINT,
  variant_of INTEGER REFERENCES program_templates(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE program_template_phase_complexes (
  id SERIAL PRIMARY KEY,
  program_template_id INTEGER NOT NULL REFERENCES program_templates(id) ON DELETE CASCADE,
  phase_number SMALLINT NOT NULL,
  complex_template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  is_recommended BOOLEAN DEFAULT TRUE,
  notes TEXT,
  UNIQUE (program_template_id, phase_number)
);

ALTER TABLE rehab_programs
  ADD COLUMN program_template_id INTEGER REFERENCES program_templates(id);

ALTER TABLE templates
  ADD COLUMN program_type VARCHAR(50) REFERENCES program_types(code);
```

**3. Backend endpoints**
- `GET /api/rehab/program-templates`
- `GET /api/rehab/program-templates/:id/phases`
- `POST /api/rehab/programs` — принимает `program_template_id`
- AdminContent CRUD endpoints для шаблонов + phases + criteria

**4. Frontend**
- `RehabProgramModal.js` → wizard: шаг 1 шаблон → шаг 2 surgery_date/side → шаг 3 review
- Новый `ProgramTemplateSelector` компонент
- AdminContent → Phases расширить колонкой program_type
- Управление program_templates через AdminContent

**5. Скелеты-сиды**
- `knee_general` — 4 фазы с базовой структурой (название, длительность, заглушки)
- `shoulder_general` — 4 фазы с базовой структурой

---

## Технический контекст для дизайна

### Текущая БД (29 миграций применены)

Все миграции в `backend/database/migrations/`. Последние:
- `20260508_streak_days.sql` — Wave 0 commit 01
- `20260508_messages_extend.sql` — Wave 0 commit 03 (добавил `message_kind`)

Migration tracking автоматизирован через `_migrations` table + `deploy/migrate.sh` (с checksum). Schema drift detection через daily cron (`deploy/check-schema-drift.sh` 04:00 МСК).

**Правило миграций:** обязательная идемпотентность (`IF NOT EXISTS`, `DO`-блоки с проверкой) + тест-цикл createdb → schema → миграции дважды → drop ДО коммита. См. CLAUDE.md «Общие правила».

### Текущий стек

См. CLAUDE.md «Стек». Основное: Express 5.1 + pg 8.16 (raw SQL через `query()`), React 19.2 + CRA + JavaScript (нет TS), CSS Modules (с 2026-05-04, миграция в commit `c8834b5`). Тесты Jest+Supertest.

### Auth и токены

Два JWT: instructor (`token`/`refresh_token` localStorage) + patient (httpOnly cookies, SameSite=Lax). См. CLAUDE.md «Система авторизации».

### Параллельная работа — что НЕ ТРОГАТЬ

В каждом TZ_WAVE_1_NN_* добавь секцию «Параллельная работа — координация» / «НЕ ТРОГАТЬ» — как в Wave 0. Особенно:
- 5 файлов uncommitted dark-theme от 2026-05-04 (`PatientDashboard/PatientDashboard.js`, `DiaryScreen.css`, `tokens.css` × 2, `CLAUDE.md`) — Vadim сам решит когда залить
- ExerciseRunner LOCKED — внутрь логики/CSS НЕ ходить (только если явно в TZ)
- PatientDashboard `pd-*` стили / `--az-*` palette / iOS layout — НЕ трогать без отдельного TZ

---

## Формат коммитов и memory

Коммиты — Conventional Commits на русском (см. примеры в `git log`). Co-author trailer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

После каждого commit обновлять `wave_1_progress.md` (создать в корне рядом с TZ-файлами).

Memory обновлять при:
- Принятии нетривиального архитектурного решения → `memory/wave_1_*.md`
- Обнаружении смежного бага в smoke → `memory/bug_*.md` или `memory/feature_*.md`
- Закрытии Wave 1 → `memory/wave_1_complete.md` (финальная сводка)

---

## Ограничения и риски

**Время.** Vadim не торопит, но pilot-проект в подготовке. Не растягивать волну дольше 1.5-2 недель.

**Риск merge-конфликтов.** Routes файлы (особенно `routes/rehab.js`, `routes/admin.js`) — если параллельная сессия их трогает, координировать.

**Bcompat.** Не ломать существующие API форматы (`{ data, message? }`). Не ломать backwards compatibility миграций (только additive ALTER, никаких DROP без миграции с DEFAULT).

**Pilot scope.** Сейчас 0 пациентов в проде. Можем себе позволить агрессивные refactor'ы внутри Wave 1, но финальный prod-smoke обязателен перед закрытием.

---

## Ожидаемый результат от тебя

1. `TZ_WAVE_1_INDEX.md` — карта волны
2. `TZ_WAVE_1_01_*.md` … `TZ_WAVE_1_NN_*.md` — атомарные коммиты с STOP-маркерами
3. (опционально) Memory entry для архитектурных решений за пределами roadmap v2
4. (опционально) Уточнения к open questions если что-то блокирует Wave 1

После получения TZ-файлов Claude Code в основном чате стартует кодить с коммита 1, ждёт ⛔ STOP, smoke от Vadim'а, push, и переходит к коммиту 2.

---

## Связанные документы

1. `PATIENT_UX_ROADMAP_2026-05-08_v2.md` — roadmap (источник правды)
2. `TZ_WAVE_0_INDEX.md` + `TZ_WAVE_0_01..06_*.md` — образец формата
3. `CLAUDE.md` — стек, правила, структура (всегда подгружается)
4. `memory/wave_0_complete.md` — итог Wave 0
5. `memory/wave_0_batch_merge_policy.md` — политика merge'а волн
6. `memory/project_post_ui_ux_backlog.md` — отложенные задачи (8 шт)
