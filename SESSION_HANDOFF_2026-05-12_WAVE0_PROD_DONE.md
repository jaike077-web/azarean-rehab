# Session Handoff — Wave 0 в проде + 5 P3 фиксов · 2026-05-12

**Что сделано в этой сессии:** prod-smoke Wave 0 на https://my.azarean.ru пройден, найдено 5 P3 багов, все закрыты в проде. Подготовлен бриф для архитектора на Wave 1.

**Где стопанулись:** ждём executable план Wave 1 от архитектора. Пока ждём — есть пара мелких задач которые можно подобрать (favicon из AN-logo.jpg, открытые баги #13 и #15).

---

## Старт нового чата — что прочитать первым

1. **Этот файл** (он в корне проекта)
2. **`CLAUDE.md`** — там обновлены статусы (Wave 0 ✅, новые баги #13/#15 в backlog, #14 закрыт)
3. **`memory/wave_0_complete.md`** — итоговая сводка Wave 0 + список 5 prod-smoke багов
4. **`WAVE_1_ARCHITECT_BRIEF.md`** — бриф который ждёт архитектора (если ты с ним общался — узнай, готов ли TZ)
5. **`PATIENT_UX_ROADMAP_2026-05-08_v2.md`** — корневой roadmap для контекста Wave 1

---

## Что в проде на 2026-05-12 (последние 7 коммитов)

```
52631a2 fix(patients): is_registered учитывает OAuth-пациентов через last_login_at  (Bug #14)
e8fcd0f fix(theme): библиотека упражнений + ExerciseModal inputs — tokenize          (B6 partial)
631017e fix(theme): инструкторские формы — dark theme tokenization                   (B3 — CreateComplex/EditComplex/EditTemplate/ExerciseModal)
b478977 fix(exercises): подгружать instructions/cues/tips/contraindications в list   (B2 — ExerciseModal data loading)
55a3205 fix(avatar): не слать 404 в ops-bot — это ожидаемый сценарий                 (B1 — avatar spam)
455f731 fix(modals): восстановить стили overlay/buttons в RehabProgramModal+InviteCodeModal  (последствие CSS Modules миграции)
12a90ad feat(roadmap): простой stuck banner + переход на Связь с pre-filled (#50)    (Wave 0 завершающий)
```

Все запушены в main, прошли GitHub Actions deploy в прод.

---

## Что НЕ ТРОГАТЬ в новом чате (uncommitted)

5 файлов с dark-theme правками от 2026-05-04 (другая сессия) до сих пор в working tree:

```
M frontend/src/pages/PatientDashboard/PatientDashboard.js
M frontend/src/pages/PatientDashboard/components/DiaryScreen.css
M frontend/src/pages/PatientDashboard/tokens.css
M frontend/src/styles/tokens.css
```

(`CLAUDE.md` тоже модифицирован, но это уже мои правки этой сессии — закоммичу в финальном handoff-коммите.)

**Vadim сам решит когда заливать dark-theme.** Эти 4 CSS/JS файла — не миксовать с новой работой. Если новая задача требует трогать те же файлы — спросить у Vadim'а.

---

## Wave 0 prod-smoke результат (5/6 ✅)

| # | Что | Результат |
|---|---|---|
| 1 | Hero label («ПКС — Фаза 1») | ⚠ показал «просто Фаза 1» — **не баг**, ввёл «Тестооовый диагноз», programLabels не нашёл совпадений |
| 2 | Стрик N/7 | ⚠ показал 0/7 — **не баг**, новый пациент без истории |
| 3 | Дневник → отчёт через messages | ✅ |
| 4 | Связь — карточка отчёта с превью | ✅ |
| 5 | ExerciseRunner accordion 4 секции | ✅ |
| 6 | Stuck banner | ✅ (после моего psql update phase_started_at) |

**Итог:** Wave 0 фактически в проде, regression не найдено.

---

## 5 P3 багов вскрытых в prod-smoke

Все НЕ Wave 0 (existing baggage), закрыты по очереди в этой сессии:

| Bug | Severity | Коммит | Что было |
|---|---|---|---|
| (модалки) | HIGH | `455f731` | RehabProgramModal/InviteCodeModal невидимы — после CSS Modules миграции 2026-05-04 базовые модальные стили потерялись из удалённого common.css |
| B1 avatar 404 | MEDIUM | `55a3205` | usePatientAvatarBlob слал ВСЕ ошибки в ops-bot, включая 404 (когда файла нет на диске) — Telegram спам |
| B2 ExerciseModal не подгружал поля | HIGH | `b478977` | GET /api/exercises возвращал только safe_with_inflammation из обогащённых полей — редактор упражнений не показывал cues/tips/contraindications инструктору при повторном открытии |
| B3 dark theme на формах | HIGH | `631017e` | CreateComplex/EditComplex/EditExerciseModal/EditTemplate — input/textarea/select без стилей → браузерный default white в темной теме |
| B6 partial Exercises lib | MEDIUM | `e8fcd0f` | Exercises.module.css + ExerciseFilters.module.css имели hardcoded `#6366f1` primary — заменены на `var(--color-primary)` |
| B14 OAuth is_registered | LOW | `52631a2` | `password_hash IS NOT NULL` фильтр игнорировал OAuth пациентов → инструктор видел «не зарегистрирован» для Yandex/Telegram юзеров |

---

## Что в backlog после сессии

В CLAUDE.md → «Открытые баги»:

| # | Severity | Описание |
|---|---|---|
| #13 | MEDIUM | RehabProgramModal: «Комплекс #N» в селекторе — у комплексов нет `title`. **Wave 1 поглотит** (там переписывается модалка в wizard). |
| #15 | MEDIUM | MDEditor (поле «Описание») + global input dark theme — тех-долг, нужен дизайн-spec. См. [memory/bug_dark_theme_mdeditor_global_inputs.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_dark_theme_mdeditor_global_inputs.md). |
| #1 | HIGH (by design) | Rate limiting выключен в dev |
| #9 | LOW | ErrorBoundary не ловит async из useEffect |
| #10 | LOW | messages.sender_id без FK constraint |

---

## Что делать дальше — варианты

### Вариант A — передать бриф архитектору и ждать TZ Wave 1 (основной путь)

1. Передать `WAVE_1_ARCHITECT_BRIEF.md` Claude Architect (или как у тебя обычно)
2. Когда придёт `TZ_WAVE_1_INDEX.md` + N атомарных `TZ_WAVE_1_NN_*.md` — старт Wave 1 как делали Wave 0
3. Между коммитами smoke + push по «ок» (правила из `feedback_no_direct_main_push_for_ui.md`, `feedback_smoke_real_browser.md`)

### Вариант B — параллельные мелкие задачи пока нет TZ

Не блокируют Wave 1, можно подобрать в очередном чате:
- **Favicon из AN-logo.jpg** — Vadim просил в этой сессии. ~30 мин: генерация 5 размеров через sharp + cache-bump в index.html. См. диалог в этой сессии где обсуждали.
- **Bug #15 partial** — если архитектор готов dark-spec для MDEditor, можно прикрутить
- **`memory/project_post_ui_ux_backlog.md`** — 8 отложенных задач от архитектора, особенно P0 «revoke секретов опубликованных в чате» (OPS_BOT_TOKEN, YANDEX_SMTP_PASSWORD)

### Вариант C — Star Tracker трек (если Vadim собрал референс)

Параллельный волнам трек. Зависит от Wave 0 (стрик уже закрыт). Vadim сказал «соберёт референс к gamification».

---

## Окружение

### Тестовые учётные данные

- **Инструктор (admin):** `vadim@azarean.com` / `Test1234`
- **Тестовый пациент (dev):** id=14, `avi707@mail.ru` / `Test1234`

### Сервера (dev)

- Backend: `localhost:5000` (`cd backend && npm run dev`)
- Frontend: `localhost:3001` (`cd frontend && PORT=3001 BROWSER=none npm start`)
- JARVIS Director на `:3000` — НЕ ТРОГАТЬ

### dev-БД

- PostgreSQL 18, БД `azarean_rehab`, пароль `Azarean444`
- psql: `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d azarean_rehab`
- В clean baseline после prod-smoke. Пациент id=14 без активности → стрик 0/7. Если нужно для smoke стрика — `INSERT INTO streak_days (patient_id, activity_date, source) VALUES (14, CURRENT_DATE, 'manual') ON CONFLICT DO NOTHING;`

### Команды тестов

```bash
cd backend && npx jest                                      # 338/338
cd frontend && npx react-scripts test --watchAll=false      # 236/236
```

### gh CLI

Авторизован под `jaike077-web`. Можно сразу делать `gh pr create` / `gh pr merge` без переавторизации.

---

## Связанные документы

1. **`memory/wave_0_complete.md`** — итог Wave 0 (главная точка входа в волну)
2. **`memory/wave_0_batch_merge_policy.md`** — политика merge'а волны (chain PR + force-push после rebase)
3. **`memory/bug_dark_theme_mdeditor_global_inputs.md`** — root cause MDEditor + что пробовали + варианты решения
4. **`PATIENT_UX_ROADMAP_2026-05-08_v2.md`** — roadmap (источник правды)
5. **`WAVE_1_ARCHITECT_BRIEF.md`** — бриф к архитектору на TZ Wave 1
6. **`CLAUDE.md`** — стек, правила, структура (всегда подгружается)
7. **`SESSION_HANDOFF_2026-05-04.md`** — состояние uncommitted dark-theme от 04 мая (НЕ ТРОГАТЬ в новой сессии)
8. **`SESSION_HANDOFF_2026-05-08_WAVE0_DONE.md`** — handoff для финального merge'а Wave 0 (исторический, уже исполнен)

---

## Контекст бесшовного перехода

- Wave 0 в проде, prod-smoke ✅
- 5 P3 багов закрыты, 2 в backlog (один поглощается Wave 1, второй тех-долг)
- 4 файла uncommitted dark-theme от 2026-05-04 — не моя зона, оставить как есть
- Бриф `WAVE_1_ARCHITECT_BRIEF.md` готов
- Тесты зелёные (backend 338, frontend 236)
- gh CLI авторизован
- dev-серверы могут быть всё ещё подняты (был backend :5000 + frontend :3001 в этой сессии, проверить через `netstat -ano | grep -E ":3001|:5000"`)
