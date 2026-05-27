# TZ Wave 3 — C3: Instructor cross-section + attention feed (Слой 0)

**Architect:** Claude Opus 4.7 · **Date:** 2026-05-26 · **Executor:** Claude Code (VS Code, Windows)
**Branch:** `wave-3/owner-command-center` (от C2 micro tip `980a7f5`) · **Checkpoint:** C3 of C1–C6
**Grounding:** RECON 2026-05-26 r1/r2 + RECON C2 + **RECON messages**. Все каноники подтверждены по живому коду.

---

## 0. Scope

C3 — слой надзора: **кто ведёт пациентов и как** + лента «что требует внимания». Read-only, без записи, без миграций, без аудита, без бэкапа.

**В C3 входит:**
1. Рефактор: вынести per-patient state из C2 в переиспользуемую форму (чтобы system-wide и per-instructor не разъехались в определении «активен»).
2. `GET /api/admin/command-center/instructors?period=` — срез по инструкторам.
3. `GET /api/admin/command-center/attention?limit=&severity=` — лента Слоя 0 (ops_alerts + phase_stuck, unified).
4. Канон «без ответа» (derived).
5. Тесты.

**НЕ входит:** динамика (3 оси) → C4; фронт → C5; RBAC instructor-scope → C6. Persist/triage `ops_alerts` (acknowledge state) — backlog post-pilot; C3 только читает unresolved.

---

## ⚠️ Переносится из C2 — дисциплина размерностей

То же ограничение: сессия = `COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)`, свежесть из `streaks`, никаких `COUNT(pl.id)`. Per-instructor агрегаты **обязаны** использовать ту же per-patient state, что system-wide — иначе два определения «активен» разъедутся.

---

## Канон «без ответа» (зафиксирован recon — использовать дословно)

`is_read` НЕ годится (ставится при открытии ленты, не при ответе). Только derived — последнее сообщение активной программы от пациента:

```sql
unanswered AS (
  SELECT last_msg.patient_id, last_msg.last_patient_msg_at
  FROM (
    SELECT DISTINCT ON (m.program_id)
           rp.patient_id,
           m.sender_type,
           m.created_at AS last_patient_msg_at
    FROM messages m
    JOIN rehab_programs rp ON rp.id = m.program_id
    WHERE rp.is_active = true AND rp.status = 'active'   -- канон активной программы
      AND m.message_kind <> 'system_alert'               -- авто-алерты не требуют ответа
    ORDER BY m.program_id, m.created_at DESC
  ) last_msg
  WHERE last_msg.sender_type = 'patient'
)
```
- Включаем `diary_report`/`session_report` (требуют реакции куратора), исключаем `system_alert`.
- `sender_id` полиморфный, FK нет → **JOIN на users/patients не нужен** для счёта (избегаем падения на stale sender_id).
- `last_patient_msg_at` отдаём для сортировки «кому ответить первым». (Точный «oldest unanswered» — refinement, не сейчас.)

---

## Step 1 — Shared per-patient state + endpoint инструкторов

**Verify-step (как C2 структурировал агрегат):**
```bash
grep -n "command-center\|patient_state\|active_program\|WITH " backend/routes/admin.js
```

**Рефактор:** per-patient CTE из C2 (`active_program` + `patient_state` с сегментом/адхеренсом) — вынести так, чтобы оба endpoint'а его потребляли (общий SQL-билдер/строка запроса в `admin.js`, либо helper). Расширить per-patient state тремя флагами, считая их в одной размерности:
- `is_unanswered` — patient_id ∈ `unanswered` (выше).
- `has_red_flag` — `EXISTS (SELECT 1 FROM ops_alerts oa WHERE oa.patient_id = ps.patient_id AND oa.resolved_at IS NULL)`.
- `is_stuck` — EXISTS-агрегат `phase_stuck_alerts` (форма из C2 bonus, `patients.js:29-35`):
  ```sql
  EXISTS (SELECT 1 FROM phase_stuck_alerts psa
          JOIN rehab_programs rp ON rp.id = psa.program_id
          WHERE rp.patient_id = ps.patient_id
            AND rp.is_active = true AND rp.status = 'active'
            AND psa.resolved_at IS NULL)
  ```

`GET /api/admin/command-center/instructors?period=30d` — GROUP BY `p.assigned_instructor_id`, JOIN `users u` для имени/роли. Инструкторы без привязанных пациентов в срез не попадают (GROUP BY по реальным владельцам); если нужны нулевые — отдельный LEFT JOIN-вариант, отметить как опцию, не делать сейчас.

Ответ (`{data}`, без `success`):
```json
{
  "data": {
    "period": "30d",
    "instructors": [
      {
        "instructor_id": 3, "instructor_name": "Татьяна", "role": "admin",
        "caseload": 16, "no_program": 1,
        "active": 12, "at_risk": 2, "dormant": 1, "churned": 0,
        "unanswered": 0, "red_flags": 1, "stuck": 0
      }
    ]
  }
}
```
- `caseload` = `COUNT(*) FILTER (WHERE p.is_active)` по этому инструктору.
- `no_program` = зарегистрирован, нет активной программы (та же логика, что `funnel_gaps` C2, но per-instructor).
- `active/at_risk/dormant/churned` = `COUNT FILTER` по сегменту из shared state.
- `unanswered/red_flags/stuck` = `COUNT FILTER` по флагам выше.

---

## Step 2 — Attention feed (Слой 0)

**Verify-step (форма phase_stuck_alerts — её полную схему я не видел, не угадывать):**
```bash
psql -d azarean_rehab -c "\d+ phase_stuck_alerts"   # точные колонки: фаза, detected/created_at, resolved_at
grep -n "severity" backend/routes/admin.js          # какие значения severity у ops_alerts (enum/строки)
```

`GET /api/admin/command-center/attention?limit=50&severity=` — объединённая лента **нерезолвленных** сигналов из двух источников, нормализованная в общую форму:

```json
{
  "data": {
    "items": [
      {
        "kind": "pain_red_flag",
        "patient_id": 14, "patient_name": "Сергей К.",
        "instructor_id": 5, "instructor_name": "Алёна",
        "severity": "high",
        "summary": "Резкая боль (VAS 8)",
        "created_at": "2026-05-26T09:12:00Z"
      },
      {
        "kind": "phase_stuck",
        "patient_id": 25, "patient_name": "...",
        "instructor_id": 3, "instructor_name": "Татьяна",
        "severity": "medium",
        "summary": "Застрял на фазе 2",
        "created_at": "2026-05-19T06:00:00Z"
      }
    ],
    "total": 2
  }
}
```

Источники:
- **pain_red_flag** — `ops_alerts WHERE resolved_at IS NULL` (форма из C2 bonus, `admin.js:1846`). `summary` собрать из `alert_type` + `pe.vas_score` (JOIN pain_entries как в существующем `GET /ops-alerts`). `severity` — из `ops_alerts.severity`.
- **phase_stuck** — `phase_stuck_alerts WHERE resolved_at IS NULL` (колонки уточнить verify-step'ом). `summary` = «Застрял на фазе N».

Для обоих — JOIN `patients p` → `users u ON u.id = p.assigned_instructor_id` для `instructor_name` (тут JOIN нужен и безопасен: assigned_instructor_id имеет FK из C1). `patient_name` = `p.full_name`.

Объединить (UNION ALL в нормализованную проекцию или собрать в JS из двух запросов — на твоё усмотрение, проверь что проще читается). Сортировка: `severity` desc (если порядок значений известен — иначе по `created_at`), затем `created_at` desc. `limit` default 50, max 200 (как у `/ops-alerts`). `severity` — опц. фильтр.

---

## Step 3 — Тесты

**Verify-step:** шаблон — `admin_command_center.routes.test.js` (C2). Фикстуры в тесте, не dev-БД.

Покрыть:
- **«Без ответа» канон:** программа, где последнее сообщение от пациента → `unanswered=true`; где последнее от инструктора → false; где последнее `system_alert` (от системы) → НЕ ломает (берётся предыдущее реальное). Dev-кейс: pat 14 (последнее — diary_report пациента) → true.
- **`is_read` не влияет:** инструктор «прочитал» (is_read=true) но не ответил → всё равно `unanswered=true`. (Регрессия-guard против наивного is_read.)
- **Инструкторский срез:** пациенты группируются по `assigned_instructor_id` (не `created_by`); сегментные счётчики per-instructor совпадают с фильтрацией shared state; пациент другого инструктора не течёт в чужую строку.
- **red_flags/stuck:** пациент с нерезолвленным `ops_alerts` → +1 в red_flags его инструктора; резолвленный → 0. Аналогично stuck.
- **Attention feed:** нерезолвленные ops_alerts + phase_stuck в ленте; резолвленные исключены; `limit`/`severity` работают; `instructor_name` подтянут через assigned_instructor_id.

---

## Verify-step (Rule #15) — для commit-отчёта

```bash
curl -s "localhost:5000/api/admin/command-center/instructors?period=30d" -H "Authorization: Bearer <admin>" | jq .data
curl -s "localhost:5000/api/admin/command-center/attention?limit=50"      -H "Authorization: Bearer <admin>" | jq '.data.total, .data.items[0]'
# Санити: sum(caseload по инструкторам) совпадает с числом активных пациентов с assigned_instructor_id
# Санити: pat 14 → unanswered=true в строке своего инструктора (реальный 3-мес кейс)
npx jest --silent 2>&1 | tail -15
```

---

## STOP — commit report

После C3 — стоп. Отчёт: tip SHA, сырой `jq .data` обоих endpoint'ов, дельта тестов, drift'ы (особенно: реальная схема `phase_stuck_alerts`, значения `ops_alerts.severity`, как лёг рефактор shared state, не разъехались ли C2-числа после рефактора — прогони C2-тесты тоже).

После отчёта — **C4 (динамика)**: тренды боли (`diary_entries.pain_level` vs `pain_entries.vas_score` — решим на C4), приверженности, движения по фазам, раздельно по 3 осям. Приложи к отчёту, если попадётся: есть ли историчность боли по дням за период (что querytable для тренда).

---

## NOT in scope (явно)

- Динамика/тренды — C4.
- Фронт (таблица, модалка инструктора, лента, селектор) — C5.
- RBAC: instructor видит только свою строку/группу — C6 (сейчас оба endpoint'а admin-only через glob).
- Acknowledge/resolve алертов из дашборда, persist-triage — backlog post-pilot. C3 только читает unresolved.
- «Oldest unanswered» точный, градация давности «без ответа» — refinement (C4/UI).
- Нулевые инструкторы (0 пациентов) в срезе — опция, не сейчас.
