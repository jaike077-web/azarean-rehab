# TZ Wave 3 — C4: Dynamics (3-axis trends)

**Architect:** Claude Opus 4.7 · **Date:** 2026-05-26 · **Executor:** Claude Code (VS Code, Windows)
**Branch:** `wave-3/owner-command-center` (от C3 tip `a51b4f2`) · **Checkpoint:** C4 of C1–C6
**Grounding:** RECON r1/r2 + C2 + messages + **C3 bonus (источники динамики)**. Read-only, без миграций.

---

## 0. Scope

C4 — последний бэкенд-слой: **динамика** пациентов по трём осям отдельно. Read-only, без записи, без миграций, без бэкапа.

**В C4 входит:**
1. `GET /api/admin/command-center/dynamics?period=&instructor_id=` — `requireAdmin` (glob).
2. Тренд боли (`diary_entries.pain_level`), тренд приверженности (сессии/окно), ось фаз (current-state).
3. Детекция конфликта (боль↑ + приверженность↑ = кандидат на перетрен).
4. Тесты.

**НЕ входит:** фронт → C5; RBAC instructor-scope → C6; `phase_transitions` history (отложено, см. решение архитектора). Списки пациентов в каждой корзине — drill-down, опц. в C5.

---

## ⚠️ Принцип C4 — НЕ схлопывать оси в один балл

Три оси считаются и отдаются **раздельно**. Запрещено сводить в единый «health score»: конфликт сигналов клинически важнее среднего. Пациент с приверженностью↑ и болью↑ — это НЕ «нейтрально», это **кандидат на перетрен** (отдельная корзина), а не взаимозачёт.

Дисциплина размерностей (из C2/C3): сессии = `COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)`. Боль — daily-grained из `diary_entries`. Не миксовать.

---

## Канон источников (зафиксировано — дословно)

- **Боль:** `diary_entries.pain_level` (SMALLINT 0..10, 1/день, `UNIQUE(patient_id, entry_date)`, индекс `idx_diary_patient_date`). Форму запроса взять у существующего `GET /api/rehab/my/diary/trend` (verify-step). НЕ `pain_entries` (то — red flags/SOS).
- **Приверженность:** сессии за окно по `complex_id` активной программы, `COUNT(DISTINCT session_id)`.
- **Фазы:** `rehab_programs.current_phase` + `phase_started_at` + stuck-сигнал (`phase_stuck_alerts` unresolved, форма из C3). Истории переходов нет → ось фаз = current-state (on_track / stalled), НЕ 3-way тренд.
- **Когорта:** только пациенты с активной программой (`is_active AND status='active'`). Период — окно тренда (7/30; `all` → 30, как C2).

---

## Метод тренда (halving + min-data guard)

Окно делим пополам, сравниваем половины. Простой и объяснимый метод (регрессию не тащим — overkill для пилота). Пороги — **именованные константы, калибровочные ручки под pilot-данные**, вынеси в начало файла:

```js
const PAIN_DELTA_THRESHOLD = 0.5;   // VAS пунктов между половинами окна
const ADHERENCE_RATIO_HI   = 1.2;   // вторая половина >= 1.2x первой → улучшение
const ADHERENCE_RATIO_LO   = 0.8;   // <= 0.8x → ухудшение
const MIN_DIARY_POINTS     = 2;     // мин. записей в КАЖДОЙ половине для классификации боли
```

**Ось боли** (per patient, по `diary_entries.pain_level` в окне):
```
avg_first  = AVG(pain_level) за первую половину окна
avg_second = AVG(pain_level) за вторую половину
если записей < MIN_DIARY_POINTS в любой половине → insufficient_data
иначе delta = avg_second - avg_first:
  improving : delta <= -PAIN_DELTA_THRESHOLD   (боль падает = хорошо)
  worsening : delta >=  PAIN_DELTA_THRESHOLD
  stable    : иначе
```

**Ось приверженности** (сессии, нормированные на длину половины):
```
rate_first  = sessions_first_half  / days_first_half
rate_second = sessions_second_half / days_second_half
если sessions_total = 0 за окно → insufficient_data
иначе:
  improving : rate_second >= rate_first * ADHERENCE_RATIO_HI
  worsening : rate_second <= rate_first * ADHERENCE_RATIO_LO
  stable    : иначе
(rate_first = 0 и rate_second > 0 → improving; оба 0 уже отсечены sessions_total=0)
```

**Ось фаз** (current-state, без истории):
```
stalled  : is_stuck (phase_stuck_alerts unresolved, канон активной программы)
on_track : иначе
```

**Конфликт (перетрен-кандидат):**
```
pain.worsening AND adherence.improving → overtraining_candidate
```
Это отдельная корзина, НЕ отменяет принадлежность к pain.worsening / adherence.improving (пациент считается во всех применимых счётчиках своих осей + дополнительно в конфликте).

---

## Step 1 — Endpoint

**Verify-step:**
```bash
grep -n "diary/trend" backend/routes/rehab.js          # форма запроса тренда боли (переиспользовать)
grep -n "command-center" backend/routes/admin.js       # где смонтировать рядом, auth glob
```

`GET /api/admin/command-center/dynamics?period=30d&instructor_id=` — admin-only (glob). Ответ (`{data}`):
```json
{
  "data": {
    "period": "30d", "window_days": 30,
    "cohort": 28,
    "pain":      { "improving": 12, "stable": 9, "worsening": 4, "insufficient_data": 3 },
    "adherence": { "improving": 14, "stable": 8, "worsening": 6, "insufficient_data": 0 },
    "phase":     { "on_track": 25, "stalled": 3 },
    "conflicts": { "overtraining_candidates": 2 }
  }
}
```
- `cohort` = число пациентов с активной программой (+ опц. фильтр инструктора). Сумма корзин каждой оси == cohort.
- `instructor_id` (опц.) — `patients.assigned_instructor_id` фильтр (как C2/C3).

Логика: построить per-patient (active_program CTE) с тремя классификациями в одном проходе (CTE с половинными агрегатами боли и сессий + EXISTS stuck), затем агрегировать счётчики. Можно собрать в JS из per-patient строк (как C3 instructors) — что читаемее.

Половины окна: `window_days` дней; first_half = `[start, start + floor(window/2))`, second_half = остаток. Точные границы дат — в SQL через `CURRENT_DATE - interval`, проверь off-by-one (включительно/исключительно) тестом.

---

## Step 2 — Тесты

**Verify-step:** шаблон — `admin_command_center_c3.routes.test.js`. Фикстуры в тесте.

Покрыть (мок diary_entries + progress_logs с датами в обеих половинах):
- **Боль improving/worsening/stable:** записи с падающим/растущим/плоским pain_level через границу половины → корректная корзина. Граница порога `PAIN_DELTA_THRESHOLD` (delta ровно 0.5 vs 0.4).
- **Боль insufficient_data:** <2 записей в одной из половин → insufficient, НЕ stable.
- **Приверженность:** сессии во второй половине гуще → improving; реже → worsening; `sessions_total=0` → insufficient. **Размерность:** пациент с 3 сессиями (9 строк progress_logs) считается по 3 session_id (anti-175% guard ещё раз).
- **Фазы:** stuck → stalled; не stuck → on_track.
- **Конфликт:** pain.worsening + adherence.improving → +1 overtraining_candidate, и при этом пациент остаётся в pain.worsening И adherence.improving (не вычитается).
- **Сумма корзин == cohort** по каждой оси (insufficient_data входит в сумму).
- **instructor_id фильтр** + 403 non-admin.

---

## Verify-step (Rule #15) — для commit-отчёта

```bash
curl -s "localhost:5000/api/admin/command-center/dynamics?period=30d" -H "Authorization: Bearer <admin>" | jq .data
# Санити: pain.improving+stable+worsening+insufficient_data == cohort (и так для adherence)
# Санити: phase.on_track + phase.stalled == cohort
# Санити: pat 14 (рост боли? проверь его diary тренд за 30д) — куда попал, сходится ли с данными
npx jest --silent 2>&1 | tail -15
```
В отчёт — сырой `jq .data` + подтверждение сумм корзин == cohort по всем осям.

---

## STOP — commit report

После C4 — стоп. Отчёт: tip SHA, сырой `jq .data`, дельта тестов, drift'ы (особенно: реальная форма `diary/trend`-запроса, как легли границы половин, хватило ли dev-данных чтобы оси не были все insufficient).

**После C4 backend командного центра завершён** (C1 schema + C2 funnel/segments/adherence + C3 instructors/attention + C4 dynamics). Перед C5 (фронт) я:
1. перевыпущу `MEMORY_RULES.md` артефактом (накопилось: logAudit-сигнатура + flat-key грабли, anti-175% дисциплина, определения «активен»/«соблюдает»/динамики с порогами, решения C1, каноны «активная программа»/«без ответа»/источники) — ты перезальёшь один раз;
2. сведём контракт всех 4 endpoint'ов в один документ для C5 (фронт будет строить ровно по нему).

---

## NOT in scope (явно)

- `phase_transitions` history-таблица + аналитика прогрессии 1→2→3 — отложено (решение архитектора C4); upgrade-path post-pilot, если пилот покажет нужду.
- Фронт, графики, sparkline, селектор — C5.
- RBAC instructor-scope — C6.
- Списки пациентов в корзинах (drill-down) — опц. в C5.
- Линейная регрессия/сложные тренд-методы — не для пилота; halving достаточно, пороги калибруются на реальных данных.
