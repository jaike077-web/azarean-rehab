# Session Handoff — 2026-05-08 → новый чат

**Что делаем:** Волна 0 фиксов в ЛК пациента (`PATIENT_UX_ROADMAP_2026-05-08_v2.md`, 6 атомарных коммитов).
**Где стопанулись:** Commit 01 готов и проверен. PR #45 висит. Юзер хочет начать **Commit 02** в новом чате.

---

## Старт нового чата — что сделать **первым делом**

1. Прочитать **этот файл** (он в корне проекта)
2. Прочитать **`TZ_WAVE_0_INDEX.md`** (карта волны, принципы STOP, DoD)
3. Прочитать **`TZ_WAVE_0_02_home_dynamic_label.md`** (план Commit 02)
4. Проверить ветку: `git branch --show-current` — должна быть `wave-0/01-streak-no-reset` (или main если перешли). Создать **новую ветку от 01** для Commit 02:
   ```bash
   git switch wave-0/01-streak-no-reset
   git switch -c wave-0/02-home-dynamic-label
   ```
   (важно: основываемся на Commit 01, потому что #2 трогает `HomeScreen.js` тот же файл что #4 — линейная цепочка избегает merge-конфликтов)
5. Обновить `wave_0_progress.md` строку 2 → 🔵 в работе
6. Дальше по ТЗ Commit 02

---

## Где сейчас всё лежит

### Wave 0 / Commit 01 — ✅ DONE
- **Ветка:** `wave-0/01-streak-no-reset` (запушена в origin)
- **SHA:** `3aca77d`
- **PR:** https://github.com/jaike077-web/azarean-rehab/pull/45 (открыт, **не мержить** до завершения всех 6 коммитов)
- **Что сделано:** новая модель стрика без обнуления при пропуске, `streak_days` таблица, `utils/streaks.js`, warning в HomeScreen
- **Тесты:** backend 307/307 (+14), frontend 212/212 (+3), smoke 4/4 в браузере
- **CLAUDE.md** обновлён: Bug #11 → закрыт, в «Завершённые исправления» #54, миграция `20260508_streak_days` в списке
- **MEMORY.md** обновлён: ссылка на `memory/wave_0_streak.md` (архитектурное решение по стрику)

### Wave 0 / Commit 02 — ⏳ СЛЕДУЮЩИЙ
- **ТЗ:** `TZ_WAVE_0_02_home_dynamic_label.md`
- **Кратко:** убрать литерал «ПКС» в HomeScreen hero, вытаскивать имя диагноза из dashboard данных динамически. **Минимальный фикс** — без миграции и без правок RoadmapScreen (это в Волне 1).
- **Объём:** 1–2 часа
- **Файлы которые трогаем:** `frontend/src/pages/PatientDashboard/components/HomeScreen.js` (+ возможно бэк `/my/dashboard` для прокидывания имени)

---

## ⚠️ НЕ ТРОГАТЬ в новом чате

### Uncommitted dark-theme правки (5 файлов, ждут отдельного смока)
- `CLAUDE.md` — был модифицирован архитектором (PATIENT_UX_ROADMAP запись + Bug #11 #12). **Я уже добавил свои правки про Wave 0 commit 01 точечно — не дублировать.**
- `frontend/src/pages/PatientDashboard/PatientDashboard.js`
- `frontend/src/pages/PatientDashboard/components/DiaryScreen.css`
- `frontend/src/pages/PatientDashboard/tokens.css`
- `frontend/src/styles/tokens.css`

Эти правки от 2026-05-04 ждут отдельного smoke юзером в браузере перед push (`SESSION_HANDOFF_2026-05-04.md`). Wave 0 идёт **поверх них** в локальной рабочей копии, но в каждом коммите Wave 0 стейджим **только нужные файлы** через `git add path/to/file` (никогда `git add -A`).

### Ветка main
- НЕ мержить ничего в main до завершения всех 6 коммитов Волны 0
- Авто-CI/CD `.github/workflows/deploy.yml` пускает прод-деплой на любой push в main — каждый merge = деплой на my.azarean.ru

---

## Договорённости от 2026-05-08

1. **Stop после каждого commit** (по правилу TZ_WAVE_0_INDEX). После `git commit` обновить `wave_0_progress.md`, запросить smoke у юзера, дождаться «ок», только потом следующий ТЗ-файл.
2. **Push в feature-ветки делаем сразу** (push не триггерит деплой)
3. **Merge в main делаем пакетом в конце волны**, не после каждого коммита (политика «не катить по одному в прод», #45 ждёт остальных)
4. **Smoke в реальном браузере обязателен** для коммитов 02, 04, 05, 06 (правило `feedback_smoke_real_browser.md`)
5. **Юзер не программист** — давать пошаговые инструкции на русском, не профессиональный жаргон. Команды в терминале только если юзер их явно может скопировать. Сложные операции (создание PR, merge, прод-деплой) — делать самому через `gh` CLI (авторизован 2026-05-08).
6. **gh CLI авторизован** под `jaike077-web` через keyring, scopes `gist, read:org, repo, workflow`. Можно сразу делать `gh pr create`, `gh pr merge`, `gh pr checks` без переавторизации.

---

## Окружение

### Сервера сейчас запущены
- Backend: `localhost:5000` (PID был 25488 на момент handoff, может быть перезапущен)
- Frontend: `localhost:3001` (PID был 16776)
- В новом чате проверить через `netstat -ano | grep -E ":3001|:5000"` — если запущены, использовать; если нет, поднять заново (`cd backend && npm run dev` + `cd frontend && PORT=3001 BROWSER=none npm start`)
- **JARVIS Director на :3000 — НЕ ТРОГАТЬ** (другой проект)

### dev-БД
- PostgreSQL 18, БД `azarean_rehab`, пароль `Azarean444`
- psql: `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d azarean_rehab`
- Streak пациента id=14 откачен в clean baseline (`current_streak=0, last_activity_date=NULL`)

### Тестовые учётные данные
- **Инструктор:** `vadim@azarean.com` / `Test1234`
- **Пациент:** id=14, `avi707@mail.ru` / `Test1234`, full_name=Вадим

### Тест-команды
```bash
# Backend
cd backend && npx jest

# Frontend
cd frontend && npx react-scripts test --watchAll=false

# Frontend (запуск из cwd ≠ frontend/) — нужно cd сначала, иначе react-scripts ищет package.json в неправильной папке
```

---

## Контекст бесшовного перехода

- **Текущая git-ветка:** `wave-0/01-streak-no-reset` (на 2026-05-08 22:00 МСК)
- **PR открытых:** один (#45)
- **Незакоммичено:** dark-theme файлы (см. «НЕ ТРОГАТЬ»). Ничего из Wave 0 commit 01 не торчит — всё в коммите.
- **Memory обновлена:** да (`memory/wave_0_streak.md` + ссылка в MEMORY.md)
- **CLAUDE.md обновлён:** да (Bug #11 → закрыт, миграция 20260508 в списке, запись #54 в «Завершённых»)
- **wave_0_progress.md:** строка 1 → ⏸ заморожен (ждёт пакетного merge), остальные 5 → ⏳ ждут

---

## Связанные документы (для нового чата прочитать в порядке приоритета)

1. **`TZ_WAVE_0_INDEX.md`** — карта волны (обязательно)
2. **`TZ_WAVE_0_02_home_dynamic_label.md`** — план следующего коммита (обязательно)
3. `wave_0_progress.md` — где находится прогресс волны (обязательно)
4. `PATIENT_UX_ROADMAP_2026-05-08_v2.md` — корневой roadmap (для контекста)
5. `CLAUDE.md` — стек, схема БД, правила кода (всегда подгружается)
6. `memory/wave_0_streak.md` — архитектурное решение по стрику (контекст почему стрик так работает)
7. `memory/feedback_smoke_real_browser.md` — правило smoke в браузере
8. `memory/feedback_no_direct_main_push_for_ui.md` — правило не пушить большие UI прямо в main
9. `SESSION_HANDOFF_2026-05-04.md` — состояние dark-theme (что в локалке непушено)
