# Wave 3 — Command Center API Contract (для C5 frontend)

**Date:** 2026-05-26 · **Backend:** C1–C4 closed (`wave-3/owner-command-center`, tip `aedadc6`)
**Назначение:** фронт (C5) строится строго по этому контракту. Это снимок реальных ответов с dev + семантика полей.

---

## Cross-cutting

- **Auth:** все — `requireAdmin` glob (`Authorization: Bearer <admin/instructor JWT>`). Non-admin → `403`. (instructor-scope = C6, пока все admin-only.)
- **Envelope:** success `{ "data": {...}, "message"?: string }`; error `{ "error": string, "message": string }`. Нет `success` поля. Axios-интерсептор разворачивает `response.data = payload`.
- **Период** (`?period=`): `7d` | `30d` (default) | `all`. Влияет **только** на адхеренс-окно и динамику. Воронка-этапы 1–4 и сегменты — current-state снимок (не меняются от периода). `all` → окно 30 дней (`adherence_window_days: 30`). **UI:** селектор периода активен для панелей адхеренса/динамики; для воронки/сегментов — индифферентен (можно показать подсказку «текущее состояние»).
- **`instructor_id`** (`?instructor_id=`, опц.) — фильтр по `patients.assigned_instructor_id`. Нет → admin-wide.
- **Пустые состояния:** все счётчики могут быть 0 / массивы пустыми (пилот не начат). UI обязан иметь honest empty-states, не «загрузка вечно».

---

## 1. `GET /api/admin/command-center` — воронка + сегменты + адхеренс

Питает: верхние KPI (воронка), панель сегментов.

```json
{ "data": {
  "period": "30d", "adherence_window_days": 30, "instructor_id": null,
  "funnel": { "created": 4, "registered": 3, "active_program": 2, "active": 1, "adhering": 0 },
  "funnel_gaps": { "registered_no_active_program": 2 },
  "segments": { "active": 1, "at_risk": 0, "dormant": 1, "churned": 0 },
  "segments_note": { "no_target_set": 2 }
}}
```
**Семантика:**
- `funnel` монотонна: `created ≥ registered ≥ active_program ≥ active ≥ adhering`.
- `funnel.active_program` = есть активная программа (= «пациент может тренироваться»). Комплекс без программы сюда НЕ входит.
- `funnel_gaps.registered_no_active_program` — зарегистрирован, нет активной программы = **недоделанный онбординг инструктора**. UI: подсветить (amber), это сигнал, не просто число.
- `segments` (среди онбордингованных): `active`+`at_risk`+`dormant`+`churned` == `funnel.active_program`. UI: success/warning/secondary/danger.
- `segments_note.no_target_set` — программы без заданной cadence (адхеренс не оценим). UI: сноска «N программ без цели».

---

## 2. `GET /api/admin/command-center/instructors` — срез по инструкторам

Питает: таблицу «Срез по инструкторам».

```json
{ "data": {
  "period": "30d", "adherence_window_days": 30,
  "instructors": [
    { "instructor_id": 1, "instructor_name": "Администратор", "role": "admin",
      "caseload": 1, "no_program": 0,
      "active": 1, "at_risk": 0, "dormant": 0, "churned": 0,
      "unanswered": 1, "red_flags": 1, "stuck": 1 }
  ]
}}
```
**Семантика:**
- Строка на инструктора с ≥1 привязанным пациентом (нулевые не показываются).
- `active`+`at_risk`+`dormant`+`churned` == `caseload − no_program`.
- `unanswered` — пациенты с unanswered (последнее сообщение от пациента). `red_flags` — нерезолвленные ops_alerts. `stuck` — застрявшие на фазе.
- UI таблица (по макету): Инструктор · Пациентов(`caseload`) · Без прогр.(`no_program`) · Активны(`active`, можно %) · Под риском(`at_risk`) · Без ответа(`unanswered`) · Flags(`red_flags`). `stuck`/`dormant`/`churned` — в JSON есть, показывать опц.
- **Клик по строке → модалка инструктора** (правила: НЕ modal-on-modal; клик по пациенту в модалке уводит в его профиль; «...» = быстрые действия вкл. переназначить через `PATCH` #5). Данные пациентов для модалки — пока нет отдельного endpoint'а (это C5-решение: либо фильтрованный `/attention?instructor_id` + список, либо новый endpoint — обсудим на C5).

---

## 3. `GET /api/admin/command-center/attention` — Слой 0 (лента)

Питает: блок «Требует внимания» (топ дашборда). `?limit=` (default 50, max 200), `?severity=`.

```json
{ "data": {
  "items": [
    { "kind": "phase_stuck", "patient_id": 14, "patient_name": "Вадим",
      "instructor_id": 1, "instructor_name": "Администратор",
      "severity": "high", "summary": "Застрял на фазе 1",
      "created_at": "2026-05-19T06:00:00Z" },
    { "kind": "pain_red_flag", "patient_id": 14, "patient_name": "Вадим",
      "instructor_id": 1, "instructor_name": "Администратор",
      "severity": "high", "summary": "Резкая боль (VAS 8)",
      "created_at": "2026-05-..." }
  ],
  "total": 6
}}
```
**Семантика:**
- Объединяет нерезолвленные `ops_alerts` (`kind:"pain_red_flag"`) + `phase_stuck_alerts` (`kind:"phase_stuck"`).
- `severity` ∈ {low, medium, high, critical}. Сорт: severity DESC → created_at DESC.
- `created_at` нормализован (phase_stuck отдаёт свой `detected_at` под этим именем).
- UI: строка = цветной dot по severity + summary + «пациент · куратор · дата» + chevron. Клик → профиль пациента / деталь алерта.
- Резолв из дашборда (acknowledge) — НЕ в этой волне (`PUT /ops-alerts/:id/resolve` существует, но triage-UI = backlog post-pilot).

---

## 4. `GET /api/admin/command-center/dynamics` — 3 оси трендов

Питает: панель «Динамика». `?period=` (окно тренда), `?instructor_id=`.

```json
{ "data": {
  "period": "30d", "window_days": 30, "instructor_id": null, "cohort": 2,
  "pain":      { "improving": 0, "stable": 0, "worsening": 0, "insufficient_data": 2 },
  "adherence": { "improving": 0, "stable": 0, "worsening": 2, "insufficient_data": 0 },
  "phase":     { "on_track": 1, "stalled": 1 },
  "conflicts": { "overtraining_candidates": 0 }
}}
```
**Семантика:**
- `cohort` = пациенты с активной программой. Сумма корзин каждой оси (вкл. `insufficient_data`) == `cohort`. `phase.on_track + phase.stalled` == `cohort`.
- **Три оси показывать раздельно** — НЕ сводить в один индикатор. UI: три мини-блока ↗/→/↘ (как макет) + строка фаз on_track/stalled.
- `insufficient_data` — мало записей дневника для классификации. UI: показать честно («недостаточно данных: N»), не прятать в stable.
- `conflicts.overtraining_candidates` — боль↑ И приверженность↑. UI: **отдельный warning-бейдж** («возможный перетрен: N»), не растворять в осях.
- ⚠️ На пилоте первые ~2 недели боль будет преимущественно `insufficient_data` (нужны daily-записи) — это ожидаемо, UI не должен выглядеть сломанным.

---

## 5. `PATCH /api/patients/:id/assign-instructor` — передача (C1)

Действие (не дашборд-чтение). Основной поток — из профиля пациента; shortcut — из модалки инструктора.

```
PATCH /api/patients/:id/assign-instructor
body: { "instructor_id": number, "reason"?: string }
→ { "data": { "id": 14, "assigned_instructor_id": 5 }, "message": "Инструктор назначен" }
```
- admin-only. Невалидный пациент/инструктор → 400/404. Пишет audit `PATIENT_REASSIGNED`.

---

## Панель → endpoint (карта для C5)

| Панель дашборда | Endpoint |
|---|---|
| Требует внимания (Слой 0) | `/attention` |
| Воронка онбординга | `/command-center` → `funnel` + `funnel_gaps` |
| Сегменты активности | `/command-center` → `segments` + `segments_note` |
| Динамика (3 оси + перетрен) | `/dynamics` |
| Срез по инструкторам (таблица) | `/instructors` |
| Модалка инструктора | TBD на C5 (фильтр существующих или новый endpoint) |
| Переназначение | `PATCH /patients/:id/assign-instructor` |

**Порядок на экране (по макету, сверху вниз по срочности):** Требует внимания → Воронка → Сегменты → Динамика → Инструкторы. Шапка: «С возвращением, {имя}» (имя, НЕ «{имя} Администратор»; роль — pill отдельно) + селектор периода.

**Открытые на C5:** один общий вызов всех панелей разом или по-панельно (loading states); источник данных модалки инструктора; нужен ли drill-down список пациентов в корзине сегмента.
