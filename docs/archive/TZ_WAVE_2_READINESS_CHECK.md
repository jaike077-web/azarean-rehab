# TZ — Wave 2 Readiness Check + Верификация 2.01

**Дата:** 2026-05-16
**Тип:** pre-flight check (не реализационный TZ)
**Цель:** Подтвердить что 2.01 в норме (schema + commit + tests) и подготовить локальный environment к работе над 2.02-2.14. Зафиксировать baseline метрик для последующих коммитов.
**Объём:** 30-60 минут
**Риск:** нулевой — операции read-only + одна idempotent миграция при необходимости.

---

## ⚠️ ГРАНИЦЫ ЗОНЫ ОТВЕТСТВЕННОСТИ

**Что Claude Code ДЕЛАЕТ:**
- Выполняет проверки read-only (`psql SELECT`, `git log`, `grep`, `ls`, `wc`)
- Запускает существующий test suite для baseline (без правок кода)
- Применяет миграцию `20260516_wave2_schema.sql` к локальной dev БД **ТОЛЬКО ЕСЛИ** одновременно: commit существует + файл миграции на диске + таблицы Wave 2 в БД отсутствуют (т.е. миграция не накачена локально)
- Создаёт файл `memory/wave_2_progress.md` если его нет (из template из INDEX)

**Что Claude Code НЕ ДЕЛАЕТ:**
- Не создаёт новых коммитов
- Не пушит в remote
- Не создаёт feature-ветки
- Не модифицирует существующий код (backend/frontend)
- Не применяет миграции которых нет на диске (не из TZ 2.02+)
- Не "доделывает" 2.01 если коммит отсутствует — стопится и спрашивает

**Если что-то не так — НЕ ИСПРАВЛЯЕТ, А ДОКЛАДЫВАЕТ архитектору.** Этот TZ — диагностика, не работа.

---

## Блок 1 — Верификация коммита 2.01

### 1.1 Файл миграции на диске

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

ls -la backend/database/migrations/20260516_wave2_schema.sql
wc -l backend/database/migrations/20260516_wave2_schema.sql
```

**Ожидание:** файл существует, ~150-200 строк.

### 1.2 Файл тестов на диске

```bash
ls -la backend/tests/__tests__/wave2_schema.test.js
wc -l backend/tests/__tests__/wave2_schema.test.js
```

**Ожидание:** файл существует, ~60-80 строк (13 sanity тестов).

### 1.3 Коммит в git history

```bash
git log --all --oneline | grep -iE "wave 2|2\.01|wave2_schema|schema migrations" | head -5
git log --all --pretty=format:'%h %s' | head -20
```

**Ожидание:** виден коммит с сообщением `feat(db): Wave 2 schema — measurements, pain, criteria` или похожим. Запиши SHA.

### 1.4 Какая ветка / есть ли feature-branch

```bash
git branch -a | grep -E "wave-2|wave2"
git status
git rev-parse --abbrev-ref HEAD
```

**Ожидание:** либо `wave-2/01-schema-migrations` существует и текущая, либо коммит уже на `main` (если ранее смерджен). `git status` должен быть clean.

### 1.5 Миграция применена к локальной БД

```bash
psql -U postgres -d azarean_rehab -c "\dt rom_measurements girth_measurements pain_locations pain_entries pain_entry_locations phase_transition_criteria patient_criterion_answers"
```

**Ожидание:** 7 таблиц перечислены.

```bash
psql -U postgres -d azarean_rehab -c "\d patients" | grep -E "(measurement_reference|photo_consent)"
```

**Ожидание:** 3 строки — `measurement_reference_photo_url`, `photo_consent_at`, `photo_consent_version`.

### 1.6 Sanity SQL тесты зелёные

```bash
cd backend
npm test -- wave2_schema.test.js 2>&1 | tail -20
```

**Ожидание:** все 13 тестов проходят, нет красного.

### 1.7 Idempotency check

```bash
# Запустить миграцию ещё раз — должна пройти без ошибок
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260516_wave2_schema.sql 2>&1 | tail -10
```

**Ожидание:** без ошибок (все CREATE TABLE IF NOT EXISTS, ALTER в DO-блоках с проверкой колонки).

### 1.8 CHECK constraints работают (sample test)

```bash
# Должно упасть — vas_score=15 не в диапазоне 0-10
psql -U postgres -d azarean_rehab -c "INSERT INTO pain_entries (patient_id, vas_score) VALUES (14, 15);" 2>&1 | head -3

# Должно упасть — нет ни одного value_*
psql -U postgres -d azarean_rehab -c "INSERT INTO rom_measurements (patient_id, measurement_type, side, measured_by) VALUES (14, 'knee_flexion_degrees', 'L', 'patient_self');" 2>&1 | head -3
```

**Ожидание:** обе команды возвращают ошибку CHECK constraint.

### 1.9 Решение по 2.01

| Что показали 1.1-1.8 | Действие |
|---|---|
| Всё ок: файл + коммит + 7 таблиц + 3 ALTER + 13 тестов зелёные + idempotency | ✅ 2.01 готов. Переходим к Блоку 2. |
| Файл и коммит есть, таблиц в БД нет | 🟡 Применить миграцию: `psql -U postgres -d azarean_rehab -f backend/database/migrations/20260516_wave2_schema.sql`. Затем повторить 1.5-1.8. |
| Файла миграции нет ИЛИ нет коммита | 🔴 СТОП. Доложить архитектору. Не пытаться "доделать" 2.01 из TZ. |
| Файл есть, тесты красные | 🔴 СТОП. Перечислить упавшие тесты в отчёте. Не править. |
| Idempotency check падает с ошибкой | 🔴 СТОП. Записать точный текст ошибки. Это серьёзно — миграция не идемпотентна. |

---

## Блок 2 — Wave 1 hot-fixes статус

Из SESSION_HANDOFF_WAVE_2_START.md (раздел «открытый backlog Wave 1») — 5 mini-PR'ов должны быть смерджены до или параллельно с 2.02.

```bash
git log --all --oneline | grep -iE "bug_patient_stuck|hotfix_oauth|complex.*title|AdminContent.*CSS|invite-code.*share" | head -10
```

**Доложить:** какие из 5 hot-fixes смерджены, какие в работе/открыты, какие не начаты.

| # | Hot-fix | Признак merge'нутости |
|---|---|---|
| #3 | bug_patient_stuck_status_hardcoded_acl | grep `'acl'` в `routes/rehab.js` строка ~318 — должен быть `program_type` из БД |
| #5 | OAuth post-registration | grep `AND password_hash IS NULL` в `routes/patientAuth.js` — должен быть удалён в строках ~1695, 1902 |
| #2 | complex.title field | grep `<input.*title` в `frontend/src/pages/CreateComplex.js` |
| #1 | AdminContent CSS Modules | `ls frontend/src/pages/Admin/*.module.css` и `grep -c "className={styles\." frontend/src/pages/Admin/AdminContent.js` |
| #4 | invite-code share link | grep `?code=` в `frontend/src/pages/PatientAuth/Register.js` |

**Не блокер для readiness check** — просто фиксируем в отчёте. 2.02 может стартовать даже если hot-fixes ещё не закрыты (они в других файлах).

---

## Блок 3 — Premise drift проверки для 2.02

Самое важное для следующего коммита (TZ 2.02 ссылается на эти данные).

### 3.1 Фактические коды program_types

```bash
psql -U postgres -d azarean_rehab -c "SELECT code, name, is_active FROM program_types ORDER BY code;"
```

**КРИТИЧНО:** записать в отчёт **все коды дословно**. TZ 2.02 предполагает `acl` и `shoulder_general`. Если фактически:
- `knee_acl` вместо `acl` → seed в 2.02 надо адаптировать
- `shoulder` вместо `shoulder_general` → то же самое
- Чего-то нет → создавать перед 2.02 (через ProgramTypesTab или отдельной миграцией)

### 3.2 Структура AdminContent.js

```bash
wc -l frontend/src/pages/Admin/AdminContent.js
grep -n "ProgramTypesTab\|ProgramTemplatesTab\|PhasesTab\|TipsTab\|VideosTab" frontend/src/pages/Admin/AdminContent.js | head -20
grep -n "useState\|const \[" frontend/src/pages/Admin/AdminContent.js | head -15
grep -n "activeTab\|tabs\s*=\|tabs\[" frontend/src/pages/Admin/AdminContent.js | head -10
```

**Доложить:**
- Общее число строк в AdminContent.js
- Сколько inline tab'ов сейчас (Phases, Tips, Videos, ProgramTypes, ProgramTemplates ожидаемо = 5)
- Как переключаются табы (state-машина / роуты / другое)
- Как именуются компоненты табов

### 3.3 CSS Modules статус для Admin

```bash
ls -la frontend/src/pages/Admin/*.module.css 2>/dev/null
grep -c "className={styles\." frontend/src/pages/Admin/AdminContent.js 2>/dev/null
grep -c "className=\"" frontend/src/pages/Admin/AdminContent.js 2>/dev/null
```

**Доложить:** какое соотношение `styles.X` vs `"глобальный класс"`. Это определит как 2.02 стилизуется.

### 3.4 Существующие admin endpoints — паттерн

```bash
grep -nE "^router\.(get|post|put|delete)\(" backend/routes/admin.js | head -20
grep -n "audit_logs\|INSERT INTO audit_logs" backend/routes/admin.js | head -5
wc -l backend/routes/admin.js
```

**Доложить:** общее число endpoints, паттерн audit logging (используется ли helper или inline INSERT).

### 3.5 services/api.js — admin namespacing

```bash
grep -nE "(phasesAdmin|tipsAdmin|videosAdmin|programTypesAdmin)" frontend/src/services/api.js
wc -l frontend/src/services/api.js
```

**Доложить:** существует ли паттерн `xxxAdmin = { list, get, create, update, delete }` для admin helpers. От этого зависит naming для `painLocationsAdmin` в 2.02.

---

## Блок 4 — Test suite baseline

Зафиксировать число тестов **до** старта 2.02, чтобы потом в DoD 2.02 знать на сколько вырасло.

### 4.1 Backend

```bash
cd backend
npm test 2>&1 | tail -10
```

**Записать:** N тестов прошло из M (формат `Tests:       X passed, X total`).

### 4.2 Frontend

```bash
cd frontend
CI=true npm test 2>&1 | tail -10
```

**Записать:** аналогично.

**Ожидание (из handoff):** backend ≥ 430 (с учётом +13 sanity от 2.01), frontend ≥ 255. Если меньше — что-то деградировало или 2.01 не до конца применён.

---

## Блок 5 — Подготовка к Wave 2

### 5.1 Создать wave_2_progress.md если не существует

```bash
ls memory/wave_2_progress.md 2>/dev/null || echo "MISSING"
```

Если MISSING — создать файл по template из `TZ_WAVE_2_INDEX.md` (раздел «wave_2_progress.md — журнал прогресса (формат)»). Заполнить статус 2.01:
- ✅ если все checks 1.1-1.8 зелёные
- В колонку SHA — записать из шага 1.3
- В Smoke — записать `psql ok` если 1.5-1.8 прошли
- PR / Дата / Заметки — что есть

### 5.2 Подтвердить что dev environment работает

```bash
# Backend на :5000
curl -s http://localhost:5000/api/auth/me -H "Authorization: Bearer dummy" -w "\nHTTP %{http_code}\n" 2>&1 | tail -2

# Frontend на :3000 или :3001
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/ 2>&1
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001/ 2>&1
```

**Ожидание:** backend отвечает 401/403 (не 500/connection refused), frontend 200 на одном из портов.

**Если оба не работают — это не блокер для readiness check**, но Vadim должен знать что перед 2.02 надо поднять оба.

### 5.3 NOT TOUCH зоны — целостность

Проверить что заблокированные файлы не повреждены:

```bash
# ExerciseRunner v3 LOCKED
wc -l frontend/src/pages/PatientDashboard/components/ExerciseRunner.js
# Ожидание: ~384 строк

# 4 dirty dark-theme файлов — список из handoff (если есть конкретные имена в memory/)
git status --short | grep -E "dark|theme" | head -5
```

**Доложить если** что-то выглядит изменённым.

---

## Формат отчёта обратно архитектору

После выполнения всех блоков создать markdown-отчёт в текущем чате (не файл) по этому шаблону:

```markdown
# Wave 2 Readiness Report — YYYY-MM-DD HH:MM

## Блок 1 — Коммит 2.01
- [ ] Файл миграции: <путь, число строк, или MISSING>
- [ ] Файл тестов: <путь, число строк, или MISSING>
- [ ] Коммит: <SHA + message, или NOT FOUND>
- [ ] Ветка: <branch name + clean/dirty>
- [ ] 7 таблиц в БД: <YES / NO — список отсутствующих>
- [ ] ALTER patients: <3/3 / NO — список отсутствующих>
- [ ] 13 sanity тестов: <X passed / X failed — упавшие>
- [ ] Idempotency re-run: <OK / FAILED — текст ошибки>
- [ ] CHECK constraints: <OK / FAILED>

**Вердикт по 2.01:** ✅ GREEN / 🟡 YELLOW (нужны действия) / 🔴 RED (стоп)

## Блок 2 — Wave 1 hot-fixes
| # | Hot-fix | Статус |
|---|---|---|
| #1 | AdminContent CSS Modules | <merged / open / not started> |
| #2 | complex.title | ... |
| #3 | patient_stuck hardcoded acl | ... |
| #4 | invite-code share link | ... |
| #5 | OAuth post-registration | ... |

## Блок 3 — Premise drift для 2.02
- **program_types коды:** <дословный список из psql>
  - Knee ACL код: <фактический>
  - Shoulder код: <фактический>
  - **Расхождение с TZ 2.02 (предполагал acl + shoulder_general):** <YES — нужна адаптация / NO — TZ работает as-is>
- **AdminContent.js:** <строк всего>, <число inline tabs>, <пример именования>
- **CSS Modules статус:** <X% styles. / Y% глобальные>
- **admin endpoints паттерн:** <число endpoints>, <audit pattern: helper / inline>
- **api.js admin namespacing:** <xxxAdmin pattern exists: YES/NO>

## Блок 4 — Test baseline
- Backend: <X passed / X total>
- Frontend: <X passed / X total>
- **Соответствие ожиданию (backend ≥ 430, frontend ≥ 255):** YES / NO + причина

## Блок 5 — Environment
- wave_2_progress.md: <created / already exists>
- Backend :5000: <up / down>
- Frontend: <up порт XXXX / down>
- NOT TOUCH зоны: <intact / WARNING: ...>

## GO / NO-GO для 2.02

🟢 **GO** — все блоки зелёные, 2.01 в проде на dev-БД, premise drift адаптирован (или совпадает)
🟡 **CONDITIONAL GO** — есть несрочные пробелы (например hot-fixes не закрыты), но 2.02 не блокируется
🔴 **NO-GO** — <перечислить конкретные блокеры>

## Открытые вопросы архитектору

<если есть — список>
```

---

## NOT TOUCH в этом TZ

- Не модифицировать существующий код (backend/frontend)
- Не создавать новые коммиты, не пушить
- Не создавать feature-ветки
- Не применять миграции из TZ 2.02+ (они ещё не утверждены / Vadim ещё их не получил для запуска)
- Не "доделывать" 2.01 если коммит отсутствует — это работа архитектора, а не Claude Code
- Не запускать TZ 2.02 после этого readiness check без явного follow-up от Vadim'а

---

## Definition of Done

- [ ] Выполнены все 5 блоков проверок
- [ ] Создан отчёт в формате выше (в чате, не в файл)
- [ ] Если применялась миграция в 1.9 (idempotent применение к локальной БД) — отмечено в отчёте
- [ ] Если создавался `memory/wave_2_progress.md` — он отражает реальный статус 2.01
- [ ] Явный вердикт GO / CONDITIONAL GO / NO-GO
- [ ] Перечислены премис-дрейфы между TZ 2.02 (program_types = `acl`/`shoulder_general`) и реальностью БД
- [ ] Никаких новых коммитов, никаких пушей, никакого изменения существующих файлов кода

---

## После отчёта

Vadim читает отчёт → передаёт архитектору в чат → архитектор:
- При GO → отдаёт TZ 2.02 в работу (или Vadim сам запускает Claude Code с TZ 2.02 если уже на руках)
- При CONDITIONAL GO → решает закрывать ли hot-fixes сейчас или параллельно
- При NO-GO → переписывает 2.01 (если что-то фундаментально сломалось) или фиксит выявленную проблему через мини-TZ

**После 2.02 closed** — этот readiness check **не повторяется** для 2.03+. Verify-step внутри каждого TZ 2.XX уже включает свои локальные проверки.
