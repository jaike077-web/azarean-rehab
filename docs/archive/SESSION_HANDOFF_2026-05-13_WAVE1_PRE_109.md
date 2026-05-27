# SESSION HANDOFF — Wave 1 перед коммитом 1.09

**Дата:** 2026-05-13
**Где остановились:** 9 коммитов Wave 1 готовы на feature-ветках, не запушены. Остался один — **1.09 stuck detection** инструкторская сторона. После него — batch merge всей волны.

---

## TL;DR для нового чата

```
Wave 1 в работе. Все 9 коммитов готовы на feature-ветках, не запушены.
Текущая HEAD ветка: wave-1/08b-wizard-ui (sha 28623f8)
Осталось: коммит 1.09 (stuck detection для инструктора)
После 1.09: batch merge всей волны (10 PR в порядке #45..#54)
```

**Точка входа в новый чат:**
> Читай SESSION_HANDOFF_2026-05-13_WAVE1_PRE_109.md в корне + TZ_WAVE_1_09_stuck_detection_instructor.md. Делай verify-step grep'ом перед стартом (зоны риска ниже). Ветка wave-1/09-stuck-detection-instructor от wave-1/08b. Mock-based тесты, не трогай PatientDashboard.js (dirty).

---

## Состояние веток (важно!)

```
main
└── wave-1/01-program-types-migration            a3dfff7  [Block A]
    └── wave-1/02-program-type-dashboard         b0170f1
        └── wave-1/03-home-label-full-replacement fa177b4
            └── wave-1/04-roadmap-telegram-dynamic ceb32aa
                └── wave-1/05-admin-phases-program-type 8c420b2  ← Block A done
                    └── wave-1/06-program-templates-migration   8223b60  [Block B]
                        └── wave-1/07-admin-program-templates   77f2e7e
                            └── wave-1/08a-wizard-backend-prep  6d68a87
                                └── wave-1/08b-wizard-ui        28623f8  ← HEAD
                                                                          ↑
                                                          новая ветка от ЭТОЙ
```

**НИЧЕГО не запушено.** Push блокирован до явного «ок» от юзера — это правило волны.

**Dirty файлы (НЕ трогать):** 4 файла dark-theme от 2026-05-04 — `PatientDashboard.js`, `DiaryScreen.css`, `tokens.css` × 2. Все 9 коммитов прошли мимо — продолжаем эту изоляцию.

---

## Что осталось — коммит 1.09

**TZ:** `TZ_WAVE_1_09_stuck_detection_instructor.md`  
**Цель:** инструкторская сторона stuck detection — yellow/red бейджи на карточке пациента + weekly Telegram push куратору при «застрял».  
**Объём:** 4-5 ч  
**Тип:** Backend (новый endpoint + cron) + Frontend (бейдж в Patients.js) + Telegram bot push

**Verify-step ОБЯЗАТЕЛЕН перед стартом** (правило 2026-05-13). Зоны риска (архитектор подсветил):
- `Patients.js` 834 строки — карточки или таблица? Где размещать бейдж?
- `services/scheduler.js` — есть ли уже weekly cron, как структура?
- `getStuckStatus` для пациента уже есть (Wave 0 #06). Для инструктора это НОВЫЙ endpoint или расширение?
- Telegram push на проде — `TELEGRAM_BOT_TOKEN` обычно пустой в dev, smoke production-only

**Команды verify-step:**
```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab
grep -nE "карточк|пациент.*card|patient.*card|patientCard" frontend/src/pages/Patients.js | head -10
grep -nE "stuck|getStuckStatus" backend/routes/rehab.js frontend/src/services/api.js | head
grep -nE "cron|schedule" backend/services/scheduler.js | head -10
grep -nE "is_stuck|stuck_on_phase" backend/services/scheduler.js backend/routes/*.js | head
```

Если в TZ premise есть «строка N в Patients.js» / «endpoint X уже есть» — проверь грэпом, как делал в 1.04-1.08b. Если расхождение — стоп, спроси, фиксируй в `architect_premise_drift_2026-05-13.md`.

---

## Старт работы в новом чате — пошагово

1. **Перечитать этот файл** + `TZ_WAVE_1_09_stuck_detection_instructor.md` + `wave_1_progress.md`.
2. **Verify-step** командами выше. Если drift — стоп.
3. **Создать ветку:** `git checkout -b wave-1/09-stuck-detection-instructor` (с wave-1/08b).
4. Делать работу по TZ (mock-based тесты, derived backend поля, frontend бейдж).
5. **Commit + freeze progress** (статус 1.09 → ⏸).
6. **Stop**, ждать «ок» от юзера.

---

## После 1.09 — финальный отчёт архитектору

После принятия 1.09 юзер скажет «готовь финальный отчёт». Сводка по всем 10 коммитам Wave 1, premise drift'ы, состояние, готовность к batch merge. Архитектор тогда подтвердит → юзер мержит #45→#54 пакетом → 24ч стабильности → стартуем Wave 2.

---

## Файлы Wave 1 (для контекста)

**TZ-файлы:** `TZ_WAVE_1_INDEX.md` + `TZ_WAVE_1_01..09_*.md` (10 штук — split TZ 1.08 = a + b).

**Progress journal:** `wave_1_progress.md` (10 строк, все ⏸ кроме 1.09 ⏳).

**Memory:**
- `wave_1_architect_iter1.md` — первая итерация архитектора
- `wave_1_block_a_done.md` — итог блока A (5 коммитов)
- `wave_1_block_b_progress.md` — статус блока B (этот hand-off)
- `architect_premise_drift_2026-05-13.md` — 6 drift'ов с адаптациями

---

## Правила Wave 1 (повтор для нового чата)

1. **Verify-step grep'ом** перед стартом каждого ТЗ — обязателен.
2. **Mock-based тесты** для backend (`jest.mock('../../database/db')`). Никаких `await query(...)` в тестах.
3. **CSS Module camelCase** для новых классов (правило `c8834b5`).
4. **PatientDashboard.js НЕ ТРОГАТЬ** — dirty от 2026-05-04.
5. **Push в remote — только по явному «ок»** от юзера. Все ветки висят локально.
6. **Premise drift** — фиксируй в `architect_premise_drift_2026-05-13.md`, адаптируй scope, не выдумывай.
7. **Batch merge policy** — все 10 PR в конце волны одним пакетом #45→#54 в порядке создания.

---

## Команды для напоминания

```bash
# Где я нахожусь
cd c:/Users/Вадим/Desktop/Azarean_rehab
git log --oneline -10
git branch --show-current   # должно быть wave-1/08b-wizard-ui

# Прогон тестов перед стартом 1.09 (baseline для сравнения после)
cd backend && npm test      # ожидается: 405/405
cd frontend && CI=true npx react-scripts test --watchAll=false  # 249/249

# Dev сервер обычно уже запущен юзером
netstat -ano | grep ":5000\|:3001"   # backend :5000, frontend :3001

# DB credentials (память: password Azarean444, capital A)
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d azarean_rehab
```

---

## Аккуратно перед стартом

- Юзер просил **бесшовный переход в новый чат** из-за лимита контекста.
- Этот файл — точка входа. memory обновлён (block_b_progress + drift файл).
- Если что-то непонятно — читать memory или спрашивать.
