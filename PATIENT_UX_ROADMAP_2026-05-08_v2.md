# Azarean Rehab — Patient UX Roadmap (v2 — final)

**Дата:** 2026-05-08
**Статус:** все 7 ключевых решений согласованы с Vadim'ом. Это финальная версия roadmap'а, executable планы для Claude Code пишутся отдельно по каждой волне.
**Заменяет:** `PATIENT_UX_ROADMAP_2026-05-08.md` (v1)

---

## Что изменилось относительно v1

| Пункт | Было в v1 | Стало в v2 (после согласования) |
|---|---|---|
| #7 Стрик | Variant A или Variant B (weekly compliance) | **Variant A с модификацией: не обнуляем при пропуске**, мягкое предупреждение. Активность = любая. Star Tracker (валюта/freeze) — отдельный трек, детали ждут от Vadim'а |
| #2 Stuck banner | Один вариант для всех волн | **Разделено**: простой инфо-баннер в Волне 0, расширение до checklist с автоматической самооценкой в Волне 2 (зависит от measurements/ROM) |
| #11 Measurements | Абстрактные measurement_types | **Конкретный клинический контент**: точки замера для колена, ТБС, голеностопа от Vadim'а. Замеры раз в 7-10 дней (не до/после сессии) |
| #12 ROM | Универсальная схема | **Конкретные движения**: колено flex+ext, голеностоп flex+ext, плечо 7 движений. Источники замера: лента, гониометр, по фото, ортез |
| #10 Pain events | Timeline с 0-N эпизодов и timestamp'ами | **Упрощено**: multi-select чипсы + slider + комментарий для каждого активного. Без timestamp'ов |
| #6 Session report | Новая таблица session_reports | **Computed VIEW из progress_logs** — таблица не нужна. Поле `complexes.kind` различает 'session' (полноценная, с отчётом) и 'routine' (домашняя гимнастика, тихо). Термин «online_session» убран — зарезервирован для отдельного продукта (видеосвязь с инструктором) |
| Hop test | В Волне 2 как measurement | **Исключён**: это functional test, не measurement. Отдельная категория для будущих волн |
| #4 Accordion | Висел вопрос про LOCKED | **LOCKED разрешено трогать**. Вариант A (без миграции БД) в Волне 0 |

---

## Сводка волн (финал)

| Волна | Что внутри | Объём | Когда |
|---|---|---|---|
| **0. Срочные фиксы** | Стрик с не-обнулением, литерал «ПКС», отчёт через messages, разблок повторного захода, accordion упражнения, простой stuck banner | ~15-22 ч | Один-два дня |
| **1. Multi-protocol** | program_type динамика, шаблоны программ, AdminContent UI для управления шаблонами, скелеты knee/shoulder | ~30-40 ч + клинический контент | 1.5 недели |
| **2. Дневник клинический** | Pain events (упрощённые), measurements в см с photo-tag и напоминаниями раз в 7-10 дней, ROM extended, criteria checkboxes (Б из stuck banner) | ~50-60 ч | 2 недели |
| **3. Multi-complex и compliance** | complexes.kind ('session' / 'routine'), program_complexes junction, frequency_per_day, session_summary VIEW + UI «История тренировок», push куратору при завершении session | ~40-50 ч | 1.5-2 недели |
| **4. Advanced ROM (опц.)** | DeviceOrientation IMU, видеогайды, functional tests как отдельная категория | ~25-30 ч | По мере надобности |
| **Star Tracker (отдельный трек)** | Внутренняя валюта, начисления, freeze, магазин в приложении | TBD после получения референса от Vadim'а | После Волны 1 минимум |

Суммарный объём кода: 135-180 часов работы Claude Code, плюс клинический контент от Vadim'а (шаблоны программ, инструкции по замерам, видео правил).

---

## По каждому пункту — финальные решения

### 1. Не-ПКС пациент

**Решение.** Динамический `program_type` на `rehab_programs`, тянется на фронт и в Telegram-бот. Семь литералов «ПКС» удаляются.

**Модель.**
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
-- Полный список наполняется в Волне 1, пока минимум для unblock
```

**Изменения в коде.**
- `routes/rehab.js`: `/my/dashboard` возвращает `program.program_type` и `program.program_label`
- `routes/rehab.js`: `/api/rehab/phases?type=...` уже параметризован, не меняем
- `services/telegramBot.js:170`: `WHERE program_type = $1` через программу пациента
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js:7`: убрать литерал «ПКС», брать `program_label` из dashboard
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js:344`: тянет `?type={program.program_type}` из dashboard
- `frontend/src/pages/PatientDashboard/components/DiaryScreen.js:91-97`: ROM-секция — lookup по `program_types.joint` вместо regex по diagnosis (это правка перенесена в Волну 2 вместе с расширением ROM)

**Объём.** 4-6 часов в Волне 1. Минимальный фикс HomeScreen — 1-2 часа в Волне 0.

---

### 2. Застрял на фазе

**Решение разделено на две стадии.**

**Стадия 1 (Волна 0).** Простой инфо-баннер для пациента, ничего сложного:
- Если `phase_started_at + duration_weeks * 7 * 1.5 < NOW()` — на RoadmapScreen появляется баннер:

> «Ты на этой фазе уже 8 недель. Это нормально, у разных людей сроки разные.»
> [Связаться с куратором]

- Кнопка открывает ContactScreen с пред-заполненным сообщением.
- Без чекбоксов критериев, без автоматической самооценки.

**Объём стадии 1.** 3-4 часа.

**Стадия 2 (Волна 2 — после measurements/ROM).** Расширяем баннер до полноценного checklist'а готовности к переходу:

```
Критерии перехода в фазу 4:
✓ Сгибание колена ≥ 120° (по последним замерам — 125°, 5 мая)
✓ Разгибание колена 0° без lag (по замерам — 0°, 5 мая)
✗ Боль ≤ 2/10 при ходьбе (по дневнику — 4/10)
✗ Окружность над пателлой не больше +1 см от здоровой (разница 1.8 см)

Ещё 2 критерия не достигнуты. Продолжай тренировки.
[Связаться с куратором]
```

**Модель для стадии 2.**
```sql
CREATE TABLE phase_criteria (
  id SERIAL PRIMARY KEY,
  phase_id INTEGER NOT NULL REFERENCES rehab_phases(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  text TEXT NOT NULL,
  type VARCHAR(20) CHECK (type IN ('rom', 'measurement', 'pain', 'functional', 'other')),
  measurable_field VARCHAR(50),                -- 'rom_knee_flexion', 'measurement_knee_above_patella_10cm_diff', 'pain_walking_max'
  measurable_threshold NUMERIC,
  comparison VARCHAR(5) DEFAULT '>=',          -- '>=', '<=', '=='
  UNIQUE (phase_id, position)
);

-- При просмотре RoadmapScreen эндпоинт автоматически вычисляет met/not-met
-- по последним записям из diary_rom, diary_measurements, diary_pain_observations.
-- Стейт состояния не хранится — вычисляется on-the-fly.
```

Миграция текста `criteria_next` в `phase_criteria.text`: парсинг по строкам в Волне 1 при создании AdminContent UI.

**Инструктор-сторона.** В Волне 0:
- Бейдж «застрял на фазе» в Patients.js при превышении 1.5× duration_weeks (yellow)
- Telegram push куратору в `@az_zari_bot` при превышении 1.7× duration_weeks (red)
- Cron weekly понедельник 09:00 МСК

**Объём стадии 2.** 10-14 часов в Волне 2.

---

### 3. Шаблоны программ

**Решение.** Делаем правильную инфраструктуру в Волне 1. AdminContent UI для редактирования шаблонов и фаз без правки кода. Первые шаблоны — knee и shoulder (общие). Vadim наполняет deep-research'ем потом.

**Модель.**
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

**Backend.**
- `GET /api/rehab/program-templates` — список доступных
- `GET /api/rehab/program-templates/:id/phases` — фазы шаблона с рекомендованными complex_templates
- `POST /api/rehab/programs` — принимает `program_template_id`, копирует структуру при создании
- AdminContent endpoints для CRUD шаблонов + phases + criteria

**Frontend.**
- `RehabProgramModal.js` переписать в wizard:
  - Шаг 1: выбор шаблона (карточки с группировкой по joint)
  - Шаг 2: surgery_date (если требуется), сторона (L/R), comorbidities
  - Шаг 3: review + create
- Новый компонент `ProgramTemplateSelector`
- AdminContent → Phases расширить:
  - Колонка program_type
  - Управление criteria_next как структурой (для Волны 2)
  - Управление program_templates как сущностью

**Контент seed (минимум для Волны 1):**
- Скелет 'knee_general' — 4 фазы с базовой структурой (название, длительность, заглушка для goals/restrictions/criteria)
- Скелет 'shoulder_general' — 4 фазы с базовой структурой
- Инструктор наполняет конкретикой через AdminContent UI

**Объём.** 24-32 часа кода + 4-6 часов на скелеты-сиды.

---

### 4. Описание упражнения

**Решение.** Расширить accordion в ExerciseRunner с 3 до 4 секций. **LOCKED разрешено трогать.** Без миграции БД (Вариант A).

**Что добавляется в accordion.**

Текущее (3 секции):
- Описание (description)
- Инструкции (instructions)
- Противопоказания (contraindications)

Новое (4 секции):
- **Описание** (description) — что это за упражнение
- **Как делать** (instructions + cues внизу как «Подсказки во время выполнения») — пошаговая техника + активные напоминания
- **Полезно знать** (tips) — общие советы, не строго про технику
- **Безопасность** ⚠️ (contraindications + absolute_contraindications + red_flags объединены, отображаются последовательно с красным заголовком). Внизу — badge «✓ Безопасно при воспалении» если safe_with_inflammation = true.

**Backend.** `/api/rehab/my/exercises` уже возвращает все поля. Не меняется.

**Frontend.**
- `ExerciseRunner.js`: расширить accordion-блок (трогаем LOCKED-зону, разрешено)
- НЕ ТРОГАЕМ: timer, RPE zones, pain slider, анимации `pdIn`/`pdBk`, layout `.pg`, CSS-классы `.crd/.sec/.dot/.btn/.tmr/.fb-toggle`
- Smoke-тест в реальном браузере перед коммитом обязателен (правило `feedback_smoke_real_browser.md`)
- `ExerciseModal.js` (для инструктора): рядом с каждым полем — иконка ℹ с tooltip «Показывается пациенту в разделе X»
- `ExerciseCard.js` в библиотеке: badge «✓ Можно при воспалении»

**Объём.** 4-6 часов в Волне 0.

---

### 5. Таймер отдыха — учёт

**Решение.** Не делать. Звук + вибрация уже есть. Учёт фактической длительности отдыха не критичен. Опционально в P3 — `progress_logs.rest_seconds_actual`.

**Объём.** 0 часов.

---

### 6. Отчёт по занятию

**Решение.** Различение через `complexes.kind`:
- `kind = 'session'` — полноценная тренировка по программе. После завершения автоматически собирается отчёт, уходит куратору в Telegram, сохраняется в ЛК пациента
- `kind = 'routine'` — домашняя гимнастика. Тихий режим, только факт «делал сегодня» для стрика

Отчёт — НЕ новая таблица, а **computed VIEW** из существующих `progress_logs`.

**Модель.**
```sql
ALTER TABLE complexes
  ADD COLUMN kind VARCHAR(20) DEFAULT 'session'
    CHECK (kind IN ('session', 'routine'));

-- VIEW для агрегации сессии из progress_logs
CREATE VIEW session_summary AS
SELECT
  pl.session_id,
  c.patient_id,
  c.id AS complex_id,
  c.kind AS complex_kind,
  MIN(pl.created_at) AS started_at,
  MAX(pl.completed_at) AS finished_at,
  EXTRACT(EPOCH FROM (MAX(pl.completed_at) - MIN(pl.created_at)))/60 AS duration_minutes,
  COUNT(*) FILTER (WHERE pl.completed) AS done_count,
  COUNT(*) FILTER (WHERE NOT pl.completed) AS skipped_count,
  MAX(pl.pain_level) AS peak_pain,
  ROUND(AVG(pl.difficulty_rating)::numeric, 1) AS avg_difficulty,
  -- session_comment пишется в progress_logs пациентом в финальном экране
  STRING_AGG(DISTINCT pl.session_comment, '; ') FILTER (WHERE pl.session_comment IS NOT NULL) AS session_comment
FROM progress_logs pl
JOIN complexes c ON c.id = pl.complex_id
GROUP BY pl.session_id, c.patient_id, c.id, c.kind;

-- messages расширены для типизации
ALTER TABLE messages
  ADD COLUMN message_kind VARCHAR(30) DEFAULT 'text',
  ADD COLUMN linked_session_id BIGINT;
-- kind: 'text', 'diary_report', 'session_report', 'system_alert'
```

**Backend.**
- `GET /api/rehab/my/sessions` — список сессий пациента с агрегатами (для ЛК)
- `GET /api/rehab/my/sessions/:id` — деталь сессии (для расширенного просмотра)
- `GET /api/rehab/programs/:id/sessions` — для инструктора, все сессии пациента + графики динамики
- При финализации сессии (POST /progress последнее упражнение) проверка `complex.kind`:
  - `kind = 'session'` → собрать summary, отправить Telegram куратору, создать запись в `messages` с `message_kind = 'session_report'`, `linked_session_id`
  - `kind = 'routine'` → ничего из этого. Только обновление стрика и progress_log по факту выполнения

**Frontend.**
- `ExerciseRunner.js`: финальный экран сессии (после последнего упражнения):
  - Поле «Комментарий ко всей тренировке» (опционально)
  - Кнопка «Завершить и отправить отчёт» (для kind='session') / «Завершить» (для kind='routine')
- Новый экран в ЛК пациента — «История тренировок»:
  - Timeline сессий с превью (дата, длительность, peak pain)
  - Тап на сессию → деталь с per-exercise разбивкой
- На странице пациента у инструктора:
  - Список сессий + графики динамики (peak pain trend, avg difficulty trend, completion rate)
- В ContactScreen у пациента:
  - Сообщения с `message_kind = 'session_report'` отображаются как expandable card с кнопкой «Открыть тренировку»

**Замеры окружностей раз в 7-10 дней — отдельный flow:**
- Scheduler шлёт пациенту напоминание «пора замеряться» через bot если прошло 7+ дней с последнего замера
- В DiaryScreen в день замеров активируется блок «Сегодня день замеров» с активными measurement_types
- НЕ привязано к session отчёту

**«Отправить отчёт» из дневника (Волна 0):**
- Кнопка `handleReportCopy` в DiaryScreen → POST в `messages` с `message_kind = 'diary_report'`, `linked_diary_id` (вместо clipboard)
- MessengerCTA становится опциональной кнопкой «Также продублировать в Telegram»
- В ContactScreen у инструктора — превью отчёта с кнопкой «Открыть запись дневника»

**Объём.** 
- Волна 0 (диария отчёт через messages, без session отчёта): 2-3 часа
- Волна 3 (полная история тренировок + push куратору + complexes.kind): 12-16 часов

---

### 7. Стрик — финальная механика

**Решение.** Variant A с критической модификацией: **НЕ обнуляем** при пропуске. Активность = любая (тренировка / мини-комплекс / заполнение дневника / отметка «делал зарядку»).

**Логика.**

Сейчас (сломано):
```
last_activity_date = вчера → current_streak += 1
last_activity_date != вчера → current_streak = 1   ← обнуление, удаляем
```

Новая логика:
```
ЛЮБАЯ активность сегодня → INSERT/UPDATE в streak_days(patient_id, date) UNIQUE
streaks.current_streak = COUNT(дней в streak_days за всю программу)
streaks.last_activity_date = MAX(date)
streaks.longest_streak = MAX(consecutive run, computed) — для retrospective view, НЕ для UI

Если разрыв >= 1 день между сегодня и last_activity_date:
  → UI показывает мягкое уведомление «Ты пропустил вчерашний день. Давай вернёмся.»
  → НЕ обнуляем current_streak
```

**Модель.**
```sql
-- streaks таблица остаётся, но смысл колонок меняется
-- current_streak = total active days, не consecutive
-- longest_streak — максимальный consecutive run, для будущих наградных систем

-- Опционально: отдельная таблица для уникальных активных дней
CREATE TABLE streak_days (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  program_id INTEGER REFERENCES rehab_programs(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  source VARCHAR(20),                          -- 'progress', 'diary', 'mini', 'manual'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (patient_id, activity_date, program_id)
);

-- Backfill из существующих streaks: сложно (нет истории по дням), оставляем total_days как best estimate

CREATE INDEX idx_streak_days_patient_date ON streak_days(patient_id, activity_date);
```

**Backend.**
- Триггеры активности (вызывают `recordStreakDay(patient_id, source)`):
  - `routes/progress.js` POST — при completion exercise (source='progress')
  - `routes/rehab.js` POST /my/diary — при создании/апдейте diary_entry (source='diary')
  - Будущие: при отметке «делал зарядку» в mini-routine (Волна 3)
- `recordStreakDay()`:
  ```sql
  INSERT INTO streak_days (patient_id, program_id, activity_date, source)
  VALUES ($1, $2, CURRENT_DATE, $3)
  ON CONFLICT (patient_id, activity_date, program_id) DO NOTHING;

  -- Обновить streaks aggregate
  UPDATE streaks SET
    current_streak = (SELECT COUNT(*) FROM streak_days WHERE patient_id = $1 AND program_id = $2),
    last_activity_date = CURRENT_DATE,
    total_days = (SELECT COUNT(*) FROM streak_days WHERE patient_id = $1 AND program_id = $2)
  WHERE patient_id = $1 AND program_id = $2;
  ```

**Frontend.**
- `StreakBadge.js`: показывать `current_streak` дней
- При `last_activity_date < CURRENT_DATE - 1` — мягкое уведомление под бейджем «Пропущен вчерашний день — продолжай!»
- НЕ красный, не паникёрский. Нейтральный цвет.

**Объём.** 3-4 часа в Волне 0.

**Star Tracker (gamification) — отдельный трек.**

Vadim соберёт референс-материал по Star Tracker (детский проект, который он упомянул — за активности начисляется внутренняя валюта, в магазине покупки за неё). После получения референса:
- Спроектируем модель валюты, начислений, магазина
- Связь с freeze (купить заморозку через Star Tracker)
- Отдельный трек разработки, ~30-50 часов TBD

Пока в Волне 0 чиним стрик без freeze. Freeze докрутим в Star Tracker трек.

---

### 8. Комплекс несколько раз в день

**Решение.** В Волне 0 — разблокировать повторный заход (минимальный фикс). В Волне 3 — полная поддержка `frequency_per_day` через junction.

**Волна 0 (минимальный фикс).**
- `HomeScreen.js`: после `dashboardData.todayDone = true` показывать вторичную кнопку «Начать ещё раз ↻»
- Без подсчётов «1 из 5» — просто разблокировка повторного входа
- Для пациентов которым клинически нужно делать quad-set 5×/день — это снимает главный блокер

**Объём Волны 0.** 2-3 часа.

**Волна 3 (полная поддержка).**

```sql
ALTER TABLE complexes
  ADD COLUMN frequency_per_day SMALLINT DEFAULT 1
    CHECK (frequency_per_day BETWEEN 1 AND 10),
  ADD COLUMN target_duration_minutes SMALLINT;
```

- HomeScreen показывает counter «Тренировка 2/5 на сегодня»
- Scheduler шлёт `frequency_per_day` напоминаний с интервалом из `notification_settings`
- `EditComplex.js` / `CreateComplex.js`: поле `frequency_per_day` с подсказкой

**Объём Волны 3.** 6-8 часов (с учётом junction в #9).

---

### 9. Мини-комплекс / домашняя гимнастика

**Решение.** Через `complexes.kind` ('session' / 'routine') + junction `program_complexes`.

**Модель (Волна 3).**
```sql
-- complexes.kind уже описано в #6

CREATE TABLE program_complexes (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES rehab_programs(id) ON DELETE CASCADE,
  complex_id INTEGER NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  position SMALLINT DEFAULT 0,
  UNIQUE (program_id, complex_id)
);

-- Backfill
INSERT INTO program_complexes (program_id, complex_id, position)
SELECT id, complex_id, 0 FROM rehab_programs WHERE complex_id IS NOT NULL;

-- rehab_programs.complex_id оставляем DEPRECATED для backwards compat,
-- новый код ходит через program_complexes. Удалить FK можно через 2-3 месяца после Волны 3.
```

**Поведение по kind:**

| Действие | kind='session' | kind='routine' |
|---|---|---|
| Trigger полного отчёта | ✅ | ❌ |
| Push куратору при finish | ✅ | ❌ |
| `progress_logs` запись | ✅ полная | ✅ минимальная (completed/skipped только) |
| Запись в `streak_days` | ✅ source='progress' | ✅ source='routine' |
| UI «История тренировок» | ✅ | ❌ (factum только в текущей неделе) |
| Final screen с комментарием | ✅ | ❌ (просто «Готово») |

**UI Волны 3:**
- `HomeScreen.js`: разделы для kind:
  - Полноценные тренировки — hero CTA
  - Домашние комплексы — карточками ниже с прогрессом если frequency_per_day > 1
- `ExercisesScreen.js`: группировка по kind с заголовками «Полноценные тренировки» / «Домашняя гимнастика»
- `RehabProgramModal.js` Wizard step «Комплексы» — таблица с возможностью добавить, выбрать kind, frequency_per_day

**Объём.** 12-16 часов в Волне 3 (включая UI рефакторинг HomeScreen).

---

### 10. Pain events — упрощённая версия

**Решение.** Multi-select чипсы + slider VAS + опциональный комментарий для каждого активного. Без timestamp'ов и timeline'ов.

**Модель (Волна 2).**
```sql
CREATE TABLE diary_pain_observations (
  id SERIAL PRIMARY KEY,
  diary_entry_id INTEGER NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  context_code VARCHAR(40),                    -- 'morning', 'day', 'evening', 'exercise', 'walking', 'custom'
  custom_label TEXT,                           -- если context_code='custom'
  vas SMALLINT NOT NULL CHECK (vas BETWEEN 0 AND 10),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (diary_entry_id, context_code)        -- один эпизод на context_code в день
);

CREATE INDEX idx_diary_pain_obs_entry ON diary_pain_observations(diary_entry_id);

-- Справочник контекстов (предзаготовленные чипсы)
CREATE TABLE pain_contexts (
  code VARCHAR(40) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  category VARCHAR(20),                        -- 'time_of_day', 'activity'
  position SMALLINT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO pain_contexts (code, label, category, position) VALUES
  ('morning', 'Утром', 'time_of_day', 1),
  ('day', 'Днём', 'time_of_day', 2),
  ('evening', 'Вечером', 'time_of_day', 3),
  ('exercise', 'При упражнениях', 'activity', 10),
  ('walking', 'При ходьбе', 'activity', 11),
  ('custom', 'Другое', 'activity', 99);

-- diary_entries.pain_when (старое поле) НЕ удаляем сразу, deprecated
-- diary_entries.pain_level — оставляем как «общий уровень за день»
-- (peak / mean считаем on-the-fly из observations)
```

**UI.**
- DiaryScreen: новая секция «Когда болит»:
  - Сетка чипсов: Утром / Днём / Вечером / При упражнениях / При ходьбе / Другое
  - Multi-select — можно активировать сколько угодно
  - Тап → expand inline блок:
    - Slider VAS 0-10
    - Поле для комментария (опционально)
    - Если context='custom' — также поле «Когда именно» (текстовое)
  - Можно тапнуть второй раз — collapse + удалить запись
- Тап другой день — observations за тот день показываются в режиме чтения

**Объём.** 8-10 часов в Волне 2.

---

### 11. Замеры окружностей

**Решение.** Универсальная таблица `diary_measurements` + клинический контент по суставам от Vadim'а. Замеры **раз в 7-10 дней**, не до/после сессии. `diary_photos` получает tag.

**Клинический контент (от Vadim'а):**

**Колено** (90% пациентов):
- Голень (максимальная окружность)
- По центру коленной чашечки
- 5 см над верхним краем надколенника
- 15 см над верхним краем надколенника
- Все 4 точки на обеих сторонах (L+R)

**ТБС:**
- Бедро (точка уточняется — типично середина бедра 15 см над верхним краем надколенника или средняя треть)
- По колену
- Голень

**Голеностоп:**
- Бедро
- По колену
- Голень
- Голеностоп — точная техника уточняется (figure-of-eight стандарт vs над лодыжками)

**Плечо:** уточняется. Кандидаты: mid-deltoid + mid-biceps. Возможно + acromial.

**Позвоночник:** окружности не нужны.

**Модель (Волна 2).**
```sql
CREATE TABLE measurement_types (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  short_label VARCHAR(40),
  joint VARCHAR(40),
  body_side_relevant BOOLEAN DEFAULT TRUE,
  unit VARCHAR(10) DEFAULT 'cm',
  default_active_for_program_types JSONB DEFAULT '[]',
  instructions_text TEXT,                      -- «Сидя, нога расслаблена, лента на 10 см выше верхнего края коленной чашечки»
  instructions_video_url VARCHAR(500),
  position SMALLINT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO measurement_types (code, label, joint, default_active_for_program_types) VALUES
  ('knee_calf_max', 'Голень (макс. окружность)', 'knee', '["knee_general", "acl"]'),
  ('knee_at_center', 'По центру колена', 'knee', '["knee_general", "acl"]'),
  ('knee_5cm_above', '5 см над надколенником', 'knee', '["knee_general", "acl"]'),
  ('knee_15cm_above', '15 см над надколенником', 'knee', '["knee_general", "acl"]'),
  -- ТБС
  ('hip_thigh_mid', 'Бедро (середина)', 'hip', '["hip_general"]'),
  ('hip_at_knee', 'По колену', 'hip', '["hip_general"]'),
  ('hip_calf', 'Голень', 'hip', '["hip_general"]'),
  -- Голеностоп
  ('ankle_thigh_mid', 'Бедро (середина)', 'ankle', '["ankle_general"]'),
  ('ankle_at_knee', 'По колену', 'ankle', '["ankle_general"]'),
  ('ankle_calf', 'Голень', 'ankle', '["ankle_general"]'),
  ('ankle_at_ankle', 'Голеностоп', 'ankle', '["ankle_general"]');
  -- Плечо: добавится после согласования с Vadim'ом

CREATE TABLE diary_measurements (
  id SERIAL PRIMARY KEY,
  diary_entry_id INTEGER NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  measurement_type_code VARCHAR(50) NOT NULL REFERENCES measurement_types(code),
  body_side VARCHAR(10),                       -- 'left', 'right', NULL
  value NUMERIC(6,2) NOT NULL,
  unit VARCHAR(10) DEFAULT 'cm',
  photo_id INTEGER REFERENCES diary_photos(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (diary_entry_id, measurement_type_code, body_side)
);

ALTER TABLE diary_photos ADD COLUMN tag VARCHAR(20)
  CHECK (tag IN ('swelling', 'wound', 'rom_pose', 'bruise', 'skin', 'other'));

ALTER TABLE rehab_programs
  ADD COLUMN active_measurement_codes JSONB DEFAULT '[]';

-- Старая swelling 0..3 шкала остаётся как «общая оценка отёка»
```

**Backend.**
- `POST /api/rehab/my/diary/:id/measurements`
- `PUT /api/rehab/my/diary/:id/measurements/:mid`
- `DELETE /api/rehab/my/diary/:id/measurements/:mid`
- `GET /api/rehab/my/measurements/trend?type=knee_above_patella_10cm&side=left&days=30`
- `GET /api/rehab/my/measurements/due` — есть ли сегодня день замеров (последний замер ≥ 7 дней назад)
- Scheduler shed cron 09:00 МСК ежедневно: для пациентов с active_measurement_codes — если 7+ дней с last_measurement → push в Telegram-бот «Сегодня день замеров»

**UI.**
- DiaryScreen: новая секция «Замеры» (показывается только если `due` или пациент сам нажал «Сделать замер»):
  - Для каждого активного measurement_type — карточка:
    - Лейбл + side (L/R), две карточки на каждый билатеральный замер
    - Number input 0-150 с шагом 0.5 см (или slider)
    - Дельта от прошлого: «−0.3 см с 5 мая» с цветом
    - Кнопка «❓ Как замерить» → modal с instructions_text + видео
    - Кнопка камеры (фото с auto tag='swelling')
- Trend graph внутри карточки (последние 14 дней sparkline)
- Полный график trends — отдельный экран `MeasurementsHistory`
- `RehabProgramModal.js` (инструктор): вкладка «Замеры», multi-select из measurement_types для program_type. Default из `default_active_for_program_types`.

**Объём.** 16-20 часов в Волне 2.

---

### 12. ROM — multi-joint, multi-movement, multi-source

**Решение.** Таблица `diary_rom` с поддержкой multiple movements per diary entry + источник + опциональное фото.

**Клинический контент (от Vadim'а):**

**Колено:**
- Сгибание колена (knee flexion)
- Разгибание колена (knee extension, включая extension lag)

**Голеностоп:**
- Сгибание (dorsiflexion)
- Разгибание (plantarflexion)

**Плечо** — 7 движений:
- Сгибание (flexion)
- Разгибание (extension)
- Отведение (abduction)
- Внутренняя ротация (internal rotation)
- Наружная ротация (external rotation)
- Внутренняя ротация в отведении 90° (internal rotation @ 90° abd)
- Наружная ротация в отведении 90° (external rotation @ 90° abd)

**Позвоночник** — уточняется (вероятно flex/ext/lateral/rotation для поясничного и шейного отделов).

**Источники замера:**
- `gonio` — гониометр (в зале студии)
- `tape` — сантиметровая лента (для измерений преимущественно ROM не используется, но как опция)
- `phone_imu` — DeviceOrientation датчик телефона (в Волне 4)
- `photo` — по фото (CV в backlog, P3)
- `subjective` — субъективная оценка («согнул на четверть/половину/три четверти/полностью»)
- `instructor_estimate` — инструктор записывает по визуальной оценке
- `orthosis` — умный ортез (если есть)

**Модель (Волна 2).**
```sql
CREATE TABLE joint_movements (
  code VARCHAR(50) PRIMARY KEY,
  joint VARCHAR(40) NOT NULL,
  body_side VARCHAR(10),                       -- 'left', 'right', 'bilateral', NULL
  plane VARCHAR(20),
  motion VARCHAR(40) NOT NULL,
  label VARCHAR(100) NOT NULL,
  short_label VARCHAR(40),
  normal_min SMALLINT,
  normal_max SMALLINT,
  imu_supported BOOLEAN DEFAULT FALSE,
  default_active_for_program_types JSONB DEFAULT '[]',
  instructions_text TEXT,
  instructions_video_url VARCHAR(500),
  position SMALLINT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO joint_movements (code, joint, body_side, motion, label, normal_max, default_active_for_program_types) VALUES
  -- Колено
  ('knee_flexion_l', 'knee', 'left', 'flexion', 'Сгибание левого колена', 140, '["knee_general", "acl"]'),
  ('knee_flexion_r', 'knee', 'right', 'flexion', 'Сгибание правого колена', 140, '["knee_general", "acl"]'),
  ('knee_extension_l', 'knee', 'left', 'extension', 'Разгибание левого колена', 0, '["knee_general", "acl"]'),
  ('knee_extension_r', 'knee', 'right', 'extension', 'Разгибание правого колена', 0, '["knee_general", "acl"]'),
  -- Голеностоп
  ('ankle_dorsi_l', 'ankle', 'left', 'dorsiflexion', 'Сгибание левого голеностопа', 20, '["knee_general", "acl", "ankle_general"]'),
  -- ... аналогично для правой
  -- Плечо (7 движений × 2 стороны = 14)
  ('shoulder_flexion_l', 'shoulder', 'left', 'flexion', 'Сгибание левого плеча', 180, '["shoulder_general"]'),
  -- ... etc
  ;

CREATE TABLE diary_rom (
  id SERIAL PRIMARY KEY,
  diary_entry_id INTEGER NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
  joint_movement_code VARCHAR(50) NOT NULL REFERENCES joint_movements(code),
  degrees NUMERIC(5,1) NOT NULL CHECK (degrees BETWEEN 0 AND 360),
  source VARCHAR(20) NOT NULL CHECK (source IN ('gonio', 'tape', 'phone_imu', 'photo', 'subjective', 'instructor_estimate', 'orthosis')),
  confidence VARCHAR(10) CHECK (confidence IN ('low', 'medium', 'high')),
  photo_id INTEGER REFERENCES diary_photos(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (diary_entry_id, joint_movement_code)
);

ALTER TABLE rehab_programs
  ADD COLUMN active_rom_codes JSONB DEFAULT '[]';

-- Migration старого diary_entries.rom_degrees → diary_rom (см. v1 roadmap)
-- diary_entries.rom_degrees DEPRECATED, не удаляем сразу
```

**UI без IMU (Волна 2).**
- DiaryScreen: новая секция «Подвижность» вместо хардкод-regex
- Для каждого active_rom_code — карточка:
  - Label + side
  - Number input 0-180 с шагом 1° + slider с goal-маркером (normal_max)
  - Selector source (выпадающий: лента / гониометр / на глаз / по фото / умный ортез)
  - Confidence dropdown (low/medium/high), default по source (gonio→high, subjective→low)
  - Опциональная кнопка камеры (фото для замера, photo.tag='rom_pose')
  - Кнопка «❓ Как замерить» → modal с instructions_text + видео
- Subjective fallback (когда source='subjective'):
  - Радио «согнул на четверть / половину / три четверти / полностью» = 25/50/75/100% от normal_max
  - Автоматически проставляет degrees + confidence='low'

**Frontend (Волна 4 — IMU integration).**
- Кнопка «📱 Измерить телефоном» рядом с input
- Permission flow для iOS Safari
- UI измерения: «Положите телефон на голень и согните колено медленно»
- Save: source='phone_imu', confidence='medium'

**Объём.** Без IMU: 16-20 часов в Волне 2. С IMU: +8-10 часов в Волне 4.

---

## Сводно: что меняется в UI

| Экран | Волна 0 | Волна 1 | Волна 2 | Волна 3 |
|---|---|---|---|---|
| HomeScreen | Убрать «ПКС», разблок повторного захода | Динамический program_label | — | Multi-complex layout (session/routine), counter «1/5» |
| RoadmapScreen | Простой stuck banner | Динамический program_type из dashboard | Чекбоксы критериев с автоматической самооценкой | — |
| DiaryScreen | — | — | Pain observations multi-select, Measurements section, ROM section | — |
| ExerciseRunner | Расширить accordion на 4 секции (LOCKED ok), final screen с комментарием для kind='session' | — | — | session vs routine final screen branching |
| ExercisesScreen | — | — | — | Группировка по kind |
| ContactScreen | Превью diary_report через linked_diary_id | — | — | Превью session_report через linked_session_id |
| ProfileScreen | — | — | — | — |
| Patients.js (instructor) | LED-dot новой активности | Бейдж program_type, бейдж застрял (yellow) | — | Графики динамики сессий |
| RehabProgramModal | — | Wizard с template выбором, AdminContent для phases | Вкладка Замеры, Вкладка ROM | Вкладка Комплексы (kind, frequency) |
| ExerciseModal (instructor) | Hint'ы рядом с полями | — | — | — |
| AdminContent → Phases | — | program_type column, criteria editor | criteria → phase_criteria миграция | — |
| (новый) MeasurementsHistory | — | — | Полный график трендов | — |
| (новый) SessionsHistory (ЛК) | — | — | — | Timeline сессий с деталями |
| (новый) ProgramTemplateSelector | — | Карточки шаблонов | — | — |

---

## Зависимости (DAG, обновлённый)

```
Волна 0: ─ независимая, фиксы и quick wins

Волна 1: program_type ──┬──> Волна 2 measurement default codes
                        ├──> Волна 2 rom default codes
                        └──> Волна 2 phase_criteria переход в structured

Волна 2: pain observations ─ независимо
         measurements ──┐
         rom ───────────┴──> Волна 2 phase_criteria автоматическая самооценка

Волна 3: complexes.kind ─ независимо
         program_complexes ──> переписка HomeScreen
         frequency_per_day ──> зависит от program_complexes
         session_summary VIEW ─ независимо

Волна 4: ROM IMU ─ зависит от Волны 2 ROM
         functional tests ─ независимо

Star Tracker (отдельный трек) ─ зависит от Волны 0 стрика
```

---

## Открытые вопросы (мелочи для Волн 2-3)

Не блокируют Волну 0 и большую часть Волны 1. Нужны до начала Волны 2:

1. **Плечо — какие окружности.** Mid-deltoid + mid-biceps ОК, или нужен ещё acromial? Vadim попросил предложить варианты.
2. **Голеностоп — точная техника замера «сам голеностоп».** Figure-of-eight (стандарт ICF) или просто над лодыжками?
3. **Позвоночник — какие ROM движения.** Для поясничного и шейного отделов отдельно или единый набор?
4. **ТБС — точка замера «бедро».** Середина бедра (15 см над верхним краем надколенника)? Или другая?

Vadim — пиши в чат когда будет готов. Я добавлю в seed измерений Волны 2 в момент написания executable плана.

5. **Star Tracker референс.** Vadim соберёт инфу. После получения — спроектируем gamification трек как отдельный документ.

---

## Что дальше — Волна 0

После согласования этой v2 версии — пишется отдельный executable plan для Claude Code:

```
TZ_WAVE_0_QUICK_FIXES.md
```

Формат: 6 атомарных коммитов с STOP-маркерами между. Каждый коммит — отдельная команда Claude Code (start → commit → STOP → smoke test → next). Не миксовать.

Содержание:

| # | Коммит | Файлы | Объём |
|---|---|---|---|
| 1 | fix(streak): не обнулять при пропуске | backend/services/streaks.js, routes/progress.js, routes/rehab.js, frontend StreakBadge.js | 3-4 ч |
| 2 | feat(home): убрать литерал «ПКС», динамический program_label | HomeScreen.js, /api/rehab/my/dashboard в routes/rehab.js | 1-2 ч |
| 3 | feat(diary): отчёт через POST в messages, не clipboard | DiaryScreen.js, MessengerCTA.js, routes/rehab.js POST /my/messages | 2-3 ч |
| 4 | feat(home): разблок повторного захода в комплекс | HomeScreen.js | 2-3 ч |
| 5 | feat(runner): расширить accordion (description / how_to+cues / tips / safety merged) + safe_with_inflammation badge | ExerciseRunner.js (LOCKED ok), ExerciseModal.js, ExerciseCard.js | 4-6 ч |
| 6 | feat(roadmap): простой stuck banner для пациента | RoadmapScreen.js, новый endpoint GET /api/rehab/my/stuck-status, scheduler weekly | 3-4 ч |

Между коммитами — обязательная пауза, smoke-тест в реальном браузере (правило `feedback_smoke_real_browser.md`), git push, проверка что прод не сломан.

---

**Подпись.** Финальная согласованная версия roadmap'а после 4 итераций уточнения с Vadim'ом. Все архитектурные решения зафиксированы. Open questions сведены к 5 мелочам которые не блокируют ни одну волну.

При обновлении в будущем — создать v3 с пометкой что v2 заменена, не редактировать v2.
