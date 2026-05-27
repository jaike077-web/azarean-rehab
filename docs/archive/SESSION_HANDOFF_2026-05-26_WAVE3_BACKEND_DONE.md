# SESSION HANDOFF — Wave 3 Backend (Owner Command-Center) CLOSED

**Дата:** 2026-05-26
**Точка входа в новый чат.** Прочитай этот файл первым.

---

## 0. TL;DR

> Wave 3 **backend** (C1→C4) ЗАКРЫТ локально, 701 PASS, 36 suites. 4 endpoint'а под `/api/admin/command-center` + 1 PATCH `/patients/:id/assign-instructor` + миграция. Прод не трогался — всё на dev-БД и feature-ветке. **Не стартовать C5 фронт** пока архитектор не выкатит `MEMORY_RULES.md` + `WAVE_3_COMMAND_CENTER_API_CONTRACT.md` в project files. Tip `wave-3/owner-command-center` = `b5d59c7`.

---

## 1. Где мы

- **Ветка:** `wave-3/owner-command-center` (от main `3907034`, **не push'ена**)
- **Tip SHA:** `b5d59c7`
- **Дельта от main:** +88 тестов, +5 файлов тестов, +1 миграция, 4 новых endpoint, 1 PATCH, 2 колонки `patients`, 3 колонки + CHECK на `complexes`.
- **Prod статус:** не трогался. Все 7 коммитов в feature-ветке.

## 2. Что закрыто (C1→C4 + revert)

| Chk | Commit | Что |
|---|---|---|
| C1 mig | `1568eeb` | `patients.assigned_instructor_id` + `complexes.target_min/max/unit` + CHECK + бэкфилл |
| C1 code | `29d6b47` | Auto-assign в `complexes.js` POST + PATCH `/patients/:id/assign-instructor` (admin-only) |
| C2 | `e62f5cc` | `GET /admin/command-center` — воронка + сегменты + адхеренс |
| C2 fix | `0acc0d4` | Пол at_risk `MAX(2*gap, gap+3)` для дневных + tie-breaker streak_pick |
| C3 | `a51b4f2` | `GET /command-center/instructors` + `GET /command-center/attention` (Слой 0) |
| C4 | `aedadc6` | `GET /command-center/dynamics` — 3 оси трендов + конфликт перетрена |
| revert | `b5d59c7` | Откат hygiene-fix `980a7f5` — admin.js имеет ЛОКАЛЬНЫЙ logAudit (см. §5) |

### 4 endpoint'а под `/api/admin/command-center` (admin-only через `router.use` glob)

1. **`GET /command-center?period=&instructor_id=`** — воронка (created/registered/active_program/active/adhering), сегменты (active/at_risk/dormant/churned), `funnel_gaps.registered_no_active_program`, `segments_note.no_target_set`.
2. **`GET /command-center/instructors?period=`** — per-instructor строки: caseload, no_program, сегменты × 4, unanswered, red_flags, stuck. Сорт caseload DESC.
3. **`GET /command-center/attention?limit=&severity=`** — UNION ALL ленты: ops_alerts (pain_red_flag) + phase_stuck_alerts (phase_stuck), оба `resolved_at IS NULL`. Сорт severity DESC → created_at DESC.
4. **`GET /command-center/dynamics?period=&instructor_id=`** — 3 оси (pain/adherence/phase) **раздельно** + `conflicts.overtraining_candidates` (pain↑+adh↑, отдельная корзина без вычитания).

## 3. Дисциплина размерностей (anti-175%) — ОБЯЗАТЕЛЬНО

Главный урок Wave 3. Не миксовать размерности в одном выражении.

- **Сессия** = `COUNT(DISTINCT pl.session_id) FILTER (WHERE pl.session_id IS NOT NULL)`. **НЕ** `COUNT(pl.id)`.
- **Свежесть** → day-grained, `streaks.last_activity_date` (materialized в `updateStreak`).
- **Адхеренс** → session-grained, окно `CURRENT_DATE - (window_days - 1)`.
- **Тренд боли** → daily из `diary_entries.pain_level` (НЕ `pain_entries.vas_score` — то для red flags / SOS).

Существующий баг 175% в `routes/dashboard.js:27-42` — числитель=сессии, знаменатель=слоты `complex_exercises`. Тренировка 3 раза → 300%. **Тот самый скрин «Выполнение 175%» на главной у админа.** C5 фронт должен заменить welcome-default для роли admin на корректные агрегаты из `/admin/command-center`.

## 4. Caliibration knobs (вынесены константами для pilot-данных)

`backend/routes/admin.js` module-level:

```js
const PAIN_DELTA_THRESHOLD = 0.5;   // VAS пунктов между половинами для классификации
const ADHERENCE_RATIO_HI   = 1.2;   // >= 1.2x rate_first → improving
const ADHERENCE_RATIO_LO   = 0.8;   //  <= 0.8x          → worsening
const MIN_DIARY_POINTS     = 2;     // мин. записей в каждой половине окна
```

`classifySegment`: `ceiling_at_risk = MAX(2*gap, gap+3)` — пол at_risk для дневных режимов (без пола 2*gap=2 слишком туго — пропуск 3 дней при дневной рутине = dormant).

**После старта пилота** калибровать пороги здесь — это первое место, не код логики.

## 5. Архитектурная грабля — два `logAudit`

В проекте **две функции с именем `logAudit` и РАЗНОЙ сигнатурой**:

| | `backend/utils/audit.js:24` | `backend/routes/admin.js:17` (local) |
|---|---|---|
| Сигнатура | `(req, action, type, id, options={ patientId?, details? })` | `(req, action, type, id, details = {})` |
| SQL | 8 колонок (с `patient_id`) | 7 колонок (БЕЗ `patient_id`) |
| 5-й аргумент | options object, destructure | прямо details плоско |
| Импортируют | `patients/progress/rehab/...` | nobody — внутренняя в admin.js |

**Перед тем как «фиксить» вызов `logAudit` — посмотри какой импортирован в файле.** Я сам наступил на грабли в `980a7f5` (заменил плоский `{ resolution_notes }` на `{ details: { resolution_notes } }` для admin.js, который ждёт плоско → двойная вложенность в БД). Откатил в `b5d59c7`.

**Grep-sweep всех 32 callsites** — больше дефектов не найдено, все формы корректны для своей импортированной утилиты.

**Backlog для архитектора:** консолидировать в одну утилиту с явным контрактом. После C5/C6.

## 6. Pre-flight для C5 (фронт)

### Жёсткие предусловия

Архитектор обещал перед C5 выкатить **2 деливерабла**:

1. **`MEMORY_RULES.md`** — обновлённый артефакт с durable rules командного центра. **Должен лежать в project files**, не в репо.
2. **`WAVE_3_COMMAND_CENTER_API_CONTRACT.md`** — снимок реальных ответов 5 endpoint'ов + семантика полей + карта «панель → endpoint» + порядок экрана.

Пока эти файлы не появились — **не стартовать C5 TZ**.

### Три открытых вопроса (мои ответы для C5)

**Q1: Все панели одним вызовом или по-панельно?**
По-панельно. 4 раздельных `useEffect` + независимые loading-state. Ошибка одной панели не блокирует остальные.

**Q2: Источник модалки инструктора — фильтр существующих endpoint'ов?**
Расширить `GET /api/patients` query-фильтром `?assigned_instructor_id=NN`. Текущий фильтр по `created_by` — старая логика. После C1 ownership живёт в `assigned_instructor_id`. Маленький backend-fix (~10 строк + тест), сделать ДО C5 UI.

**Q3: Drill-down (клик по сегменту → список пациентов)?**
Не в этой волне. ТЗ C1-C4 явно ставили это в backlog. На пилоте 2 пациента ценности почти нет. Post-pilot.

## 7. RECON C5-front (уже сделан в этом чате)

Не дублировать в новом чате — итог зафиксирован:

- **Dashboard.js** — tab container (НЕ роуты). Admin-пункты гейтятся `user?.role==='admin'`. Default welcome-секция и есть тот скрин 175%.
- **api.js** — `admin` namespace (api.js:569-642), методы возвращают `response.data` (uwrapped из `{data}`).
- **Routing** — не трогать App.js. Достаточно нового case в `Dashboard.renderContent()` + кнопка в сайдбар.
- **Готовые компоненты:** ConfirmModal, AdminUserModal (шаблон), TableSkeleton, ToastContext, lucide-react. **Готового Table компонента нет** — inline `<table>` в каждом Admin*.js.
- **CSS:** Modules везде, **camelCase обязателен** в module.css (grep-grabель c8834b5). Tokens: `--color-bg/surface/surface-2/border/text/...`. Pattern: `clamp()` + `min-height: 44px`.

## 8. Live verify — real-world кейс на dev (2 пациента)

Patient #14 («Вадим» под админом id=1):
- Висит без ответа 3 месяца (последнее сообщение от пациента 2026-05-19, последний ответ инструктора 2026-02-09).
- 4 unresolved `ops_alerts` (red_flag_pain).
- 2 unresolved `phase_stuck_alerts` (yellow + red на phase 1).
- Активность недавно есть → segment=`active`.

`/instructors` сразу показал: id=1 `caseload=1, unanswered=1, red_flags=1, stuck=1` — **ровно тот неглект**, который старая главная (175%) прятала. Доказательство, что инструмент работает.

## 9. Структура admin.js после Wave 3

```
module-level:
  parsePeriod/parseInstructorId/parseSeverity → нормализация query
  classifySegment(row)                        → active|at_risk|dormant|churned
  isAdhering(row, windowDays)                 → bool|null
  classifyPainTrend(row)                      → improving|stable|worsening|insufficient_data
  classifyAdherenceTrend(row, windowDays)     → idem
  PAIN_DELTA_THRESHOLD/ADHERENCE_RATIO_HI/LO/MIN_DIARY_POINTS → calibration knobs
  PER_PATIENT_STATE_SQL                       → shared SQL для C2 + C3

  function logAudit(...)                      ← LOCAL, см. §5

endpoints (router.use(authenticateToken, requireAdmin) glob):
  GET /command-center                         (C2)
  GET /command-center/instructors             (C3)
  GET /command-center/attention               (C3, отдельный SQL UNION ALL)
  GET /command-center/dynamics                (C4, отдельный SQL с half-buckets)
  + existing 40+ admin endpoints
```

`PER_PATIENT_STATE_SQL` — единственный источник классификации «активен/соблюдает» для system-wide И per-instructor. Не разъезжается между endpoint'ами (гарантия C3).

## 10. Файлы контекста (этого чата)

- `TZ_WAVE_3_C1_instructor_assignment_cadence.md`
- `TZ_WAVE_3_C2_command_center_aggregates.md`
- `TZ_WAVE_3_C3_instructor_cross_section_attention.md`
- `TZ_WAVE_3_C4_dynamics.md`
- `ARCHITECT_RECON_2026-05-26.md` — initial recon (схема + код)

## 11. Backup

`~/backups/pre_w3_c1_20260526_1318.dump` (217 KB) — dev-снимок до миграции C1. Миграция аддитивная, но снимок есть.

---

## Что НЕ делать в новом чате

- **Не push'ить ветку на remote** без явного запроса.
- **Не мержить в main** — C5 фронт ещё не готов, нужны архитектурные деливераблы.
- **Не дёргать прод-БД.** Все verify только локально.
- **Не дублировать RECON C5-front** — он уже сделан, итог в §7.
- **Не «фиксить» logAudit вызовы** без проверки откуда импортирован.
