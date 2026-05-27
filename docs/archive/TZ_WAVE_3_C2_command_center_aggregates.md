# TZ Wave 3 — C2: Command-center aggregates (funnel + segments + adherence)

**Architect:** Claude Opus 4.7 · **Date:** 2026-05-26 · **Executor:** Claude Code (VS Code, Windows)
**Branch:** `wave-3/owner-command-center` (продолжаем от C1 tip `29d6b47`) · **Checkpoint:** C2 of C1–C6
**Grounding:** RECON 2026-05-26 round 1/2 + **RECON C2** (canonical dimensions подтверждены по живому коду).

---

## 0. Scope

C2 — один **read-only** агрегатный endpoint, питающий верх дашборда: воронка жизненного цикла, сегменты активности, адхеренс. Без UI, без записи, без миграций.

**В C2 входит:**
1. `GET /api/admin/command-center?period=&instructor_id=` — `requireAdmin`.
2. Воронка (5 этапов) + разрыв «зарегистрирован без активной программы».
3. Сегменты активности (cadence-relative) среди онбордингованных.
4. Адхеренс («соблюдает») по `complexes.target_min` в окне периода.
5. Тесты.

**НЕ входит:** инструкторский срез (GROUP BY assigned_instructor_id) → C3; Слой 0 ops_alerts/phase_stuck/без-ответа → C3; динамика (3 оси) → C4; фронт → C5; RBAC-скоупинг для роли instructor → C6. UI выбора частоты в форме комплекса — отдельно.

**Бэкап:** не нужен — C2 без миграций.

---

## ⚠️ Главное ограничение C2 — дисциплина размерностей (anti-175%)

Баг 175% и баг `sessions_last_week` (`patients.js:131`) — оба от смешения размерностей. В C2 **запрещено**:
- считать сессии как `COUNT(progress_logs.id)`. Сессия = `COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)`.
- делить величины разной размерности (сессии / слоты, дни / сессии).

Две метрики — две размерности, и они НЕ пересекаются:
- **Свежесть / сегменты** → day-grained, из `streaks.last_activity_date` (materialized: progress + diary).
- **Адхеренс / «соблюдает»** → session-grained, `COUNT(DISTINCT session_id)` из `progress_logs` в окне.

---

## Canonical dimensions (зафиксированы recon — использовать дословно)

- **Сессия:** `COUNT(DISTINCT pl.session_id) FILTER (WHERE pl.session_id IS NOT NULL)`.
- **Активная программа:** `rp.is_active = true AND rp.status = 'active'`. Один пациент может иметь N программ (нет UNIQUE) → берём самую свежую: `DISTINCT ON (rp.patient_id) ... ORDER BY rp.patient_id, rp.created_at DESC` (как app's `LIMIT 1`).
- **Свежесть активности:** `streaks.last_activity_date` (per patient/program, materialized в `updateStreak`). `days_since = CURRENT_DATE - last_activity_date`. Пациент без `streaks`-строки = активности не было ни разу.
- **Зарегистрирован:** `patients.password_hash IS NOT NULL`.
- **Ответственный инструктор:** `patients.assigned_instructor_id` (из C1).
- **Сессии пациента:** `progress_logs` через `complex_id` (нет FK на пациента) → `complexes.patient_id`. Для адхеренса берём сессии по `complex_id` активной программы пациента.

---

## Параметры и поведение периода

- `period` ∈ {`7d`, `30d`, `all`}, default `30d`.
- `instructor_id` (опц.) — фильтр `patients.assigned_instructor_id = :instructor_id`. Нет → все (admin-wide).
- **Период влияет ТОЛЬКО на адхеренс-окно** (и на динамику в C4). Воронка-этапы 1–4 и сегменты — current-state снимок (не оконные величины). Этап «соблюдает» — оконный.
  - `7d`/`30d` → окно адхеренса 7/30 дней.
  - `all` → адхеренс считать в окне **30 дней** (sane default, адхеренс — это rate, бессрочный rate бессмыслен). Отметить это в ответе (`adherence_window_days: 30`).

---

## Step 1 — Endpoint skeleton

Файл: `routes/admin.js` (рядом с прочими admin-роутами; auth-обёртка `requireAdmin` как у соседей).

**Verify-step перед написанием:**
```bash
grep -n "router\.get('/stats'\|requireAdmin\|router.use" backend/routes/admin.js   # auth-паттерн admin-роутов
grep -n "res.json({ data" backend/routes/admin.js                                  # форма ответа
```

```
GET /api/admin/command-center?period=30d&instructor_id=
auth: тот же механизм, что у остальных /api/admin/* (admin.js монтируется в server.js:760;
      проверь, requireAdmin на router.use или на каждом хендлере — повторить как у /stats)
```

Ответ (форма `{data, message?}`, без `success`):
```json
{
  "data": {
    "period": "30d",
    "adherence_window_days": 30,
    "instructor_id": null,
    "funnel": {
      "created": 50, "registered": 43, "active_program": 39,
      "active": 28, "adhering": 21
    },
    "funnel_gaps": { "registered_no_active_program": 4 },
    "segments": { "active": 28, "at_risk": 7, "dormant": 3, "churned": 1 },
    "segments_note": { "no_target_set": 0 }
  }
}
```

---

## Step 2 — Воронка (current-state, кроме `adhering`)

Базис — все активные пациенты (с опц. фильтром инструктора):

```sql
WITH base AS (
  SELECT p.id, p.password_hash, p.assigned_instructor_id
  FROM patients p
  WHERE p.is_active = true
    AND ($1::int IS NULL OR p.assigned_instructor_id = $1)   -- instructor_id
),
active_program AS (
  SELECT DISTINCT ON (rp.patient_id)
         rp.patient_id, rp.id AS program_id, rp.complex_id
  FROM rehab_programs rp
  WHERE rp.is_active = true AND rp.status = 'active'
  ORDER BY rp.patient_id, rp.created_at DESC
)
SELECT
  COUNT(*)                                                          AS created,
  COUNT(*) FILTER (WHERE password_hash IS NOT NULL)                 AS registered,
  COUNT(*) FILTER (WHERE ap.patient_id IS NOT NULL)                 AS active_program,
  COUNT(*) FILTER (WHERE password_hash IS NOT NULL
                     AND ap.patient_id IS NULL)                     AS registered_no_active_program
FROM base b
LEFT JOIN active_program ap ON ap.patient_id = b.id;
```

`active` и `adhering` берутся из Step 3/4 (per-patient state), чтобы не дублировать логику. Воронка «активная программа» = есть активная `rehab_programs` (это и есть «пациент может тренироваться» — `/my/exercises` требует активную программу с `complex_id`). Комплекс без программы в воронку «программа» НЕ попадает — это и есть разрыв `registered_no_active_program` (инструктор создал комплекс, программу не оформил → пациент не видит).

---

## Step 3 — Per-patient state (сегменты + основа для active/adhering)

Считаем по **онбордингованным** (есть активная программа). Один CTE — одна строка на пациента:

```sql
patient_state AS (
  SELECT
    ap.patient_id,
    c.target_min, c.target_unit,
    s.last_activity_date,
    CASE WHEN s.last_activity_date IS NULL THEN NULL
         ELSE (CURRENT_DATE - s.last_activity_date)::int END AS days_since,
    -- ожидаемый интервал между активностями (дни), из cadence комплекса:
    CASE
      WHEN c.target_unit = 'day'  THEN 1
      WHEN c.target_unit = 'week' THEN CEIL(7.0 / NULLIF(c.target_min,0))::int
      ELSE 7   -- target не задан → дефолтный интервал 7 дней
    END AS expected_gap_days
  FROM active_program ap
  JOIN base b           ON b.id = ap.patient_id
  LEFT JOIN complexes c ON c.id = ap.complex_id
  LEFT JOIN streaks   s ON s.patient_id = ap.patient_id
                       AND (s.program_id = ap.program_id OR s.program_id IS NULL)
)
```

Заметка: `streaks` UNIQUE(patient_id, program_id). Бери строку по `program_id` активной программы; если у пациента стрик standalone (program_id NULL) — тоже учесть (как `getStreakSummary`). Если несколько подходящих — `DISTINCT ON (patient_id) ORDER BY current_streak DESC` (как существующий util).

**Сегмент** (по `days_since` vs `expected_gap_days`, backstop 30):
```
active   : days_since IS NOT NULL AND days_since <= expected_gap_days
at_risk  : expected_gap_days < days_since <= 2*expected_gap_days  (и <=30)
dormant  : 2*expected_gap_days < days_since <= 30
churned  : days_since > 30   (backstop, независимо от cadence)
```
Edge — новые без активности: `days_since IS NULL` (стрика нет). Если активной программе ≤ 7 дней (`active_program.created_at`... добавь в CTE `rp.created_at` для grace) → НЕ считать churned, отнести к отдельному «новый/не начинал» (можно класть в `active` для воронки или вынести — на твоё усмотрение, но НЕ в churned). Минимально: `days_since IS NULL AND program_age <= 7 → active`; иначе `dormant`.

---

## Step 4 — Адхеренс («соблюдает») — session-grained, в окне

```sql
-- сессии пациента за окно (window_days = 7 | 30; для 'all' → 30)
sessions_in_window AS (
  SELECT ap.patient_id,
         COUNT(DISTINCT pl.session_id) FILTER (WHERE pl.session_id IS NOT NULL) AS sessions
  FROM active_program ap
  LEFT JOIN progress_logs pl
         ON pl.complex_id = ap.complex_id
        AND pl.completed = true
        AND pl.completed_at >= (CURRENT_DATE - ($2::int - 1))   -- window_days
  GROUP BY ap.patient_id
)
```

**Формула «соблюдает»** (per patient, только где `target_min` задан):
```
units_in_window  = window_days / (target_unit='day' ? 1 : 7)
expected_min     = target_min * units_in_window
adhering         = sessions >= 0.6 * expected_min
```
- `target_min IS NULL` (частота не задана) → пациент НЕ считается `adhering` (цель неизвестна), но идёт в `segments_note.no_target_set`. Не штрафуем как «не соблюдает» — просто не можем оценить.
- Порог 0.6 от **нижней границы** диапазона (зафиксировано). `target_max` в C2 не используется (информативный потолок, понадобится в динамике/UI).

`funnel.adhering` = COUNT пациентов с `adhering = true`. `funnel.active` = COUNT с сегментом `active`.

**Вся арифметика — в SQL/коде, не в голове.** Привести expected_min к числу через явный расчёт, округление round() только на финальном проценте (если будешь отдавать %).

---

## Step 5 — Тесты

**Verify-step:** `grep -rln "command-center\|admin.*stats" backend/**/*.test.js` → ближайший admin-endpoint тест как шаблон (Supertest + admin JWT).

Покрыть на сидовых данных (создать фикстуры в тесте, не полагаться на dev-БД):
- Воронка: пациент без password_hash не в `registered`; зарегистрированный без активной программы → в `registered_no_active_program`, не в `active_program`.
- Сегмент cadence-relative: пациент с `target_unit='week', target_min=1` и `days_since=10` → `active` (gap 7, 10 ≤ 14 = at_risk... проверь границы!). Пациент `target_unit='day', target_min=1`, `days_since=3` → `at_risk` (gap 1, 3 > 2). **Тест на оба unit'а — это суть фичи.**
- Backstop: `days_since=40` → `churned` независимо от cadence.
- Адхеренс размерность: пациент сделал один комплекс 3 раза за неделю (3 разных `session_id`, ~9 строк progress_logs) при `target_min=2/week`, window=7 → expected_min ≈ 2, sessions=3 → adhering=true. **Тест явно проверяет, что считается 3 сессии, а НЕ 9 строк** (anti-175% regression guard).
- `target_min IS NULL` → не adhering, попадает в `no_target_set`.
- `instructor_id` фильтр: пациенты другого инструктора исключены из всех счётчиков.

---

## Verify-step (Rule #15) — для commit-отчёта

```bash
# Реальный вывод endpoint'а на dev (4 пациента) — все 3 периода
curl -s "localhost:5000/api/admin/command-center?period=30d"  -H "Authorization: Bearer <admin>" | jq .data
curl -s "localhost:5000/api/admin/command-center?period=7d"   -H "Authorization: Bearer <admin>" | jq .data.funnel
# Санити: funnel.created >= registered >= active_program >= active >= adhering (монотонность воронки)
# Санити: segments active+at_risk+dormant+churned == active_program (все онбордингованные распределены)
npx jest --silent 2>&1 | tail -15
```
В отчёт — сырой `jq .data` + подтверждение монотонности воронки и суммы сегментов.

---

## STOP — commit report

После C2 — стоп. Отчёт: tip SHA, сырой вывод endpoint'а (3 периода), дельта тестов, drift'ы (особенно: реальные имена колонок/джойнов `streaks`/`progress_logs`, форма auth у admin-роутов, был ли `program_age` доступен для grace-эджа).

Только после отчёта — C3 (инструкторский срез + Слой 0). Приложи к отчёту, если попадётся: форма `GET /api/admin/ops-alerts` (поля) и `is_stuck_on_phase` EXISTS-агрегат из `GET /api/patients` — заберу на C3.

---

## NOT in scope (явно)

- GROUP BY assigned_instructor_id, per-инструктор метрики, «без ответа» (derived из messages) — C3.
- Чтение ops_alerts / phase_stuck_alerts в дашборд (Слой 0) — C3.
- Динамика (тренды боли/приверженности/фаз) — C4.
- Любой фронт, селектор периода в UI — C5.
- RBAC: instructor видит только свою группу (сейчас endpoint admin-only) — C6.
- `target_max` в расчётах — пока не используется (потолок диапазона).
