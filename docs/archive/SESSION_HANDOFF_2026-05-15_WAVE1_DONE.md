# SESSION HANDOFF — Wave 1 закрыта в проде

**Дата:** 2026-05-15
**Точка:** Wave 1 полностью смерджена в main и задеплоена. Prod-smoke 4/5 ✅. Ждём ответы архитектора для старта Wave 2.

---

## TL;DR для нового чата

```
✅ Wave 1 в проде. 10 коммитов смерджены в main (f71038e → c74c468).
✅ Bug #12, #13 закрыты. Backend 423/423, frontend 252/252.
⚠️  Prod-smoke сценарий 5 (red push) — покрыт unit-тестами, plan-cron Mon 09:00 МСК.
📋 8 backlog finding'ов из smoke в memory. 4 hot-fix mini-PR + 1 архитектор-fix + 2 архитектор-вопроса.
⏳ Wave 2 ждёт ответы архитектора на 4 OPEN questions.
```

**Точка входа в новый чат:**
> Читай `SESSION_HANDOFF_2026-05-15_WAVE1_DONE.md` в корне + memory `wave_1_complete.md`. Wave 1 в проде, начинаем либо hot-fix'ы (см. backlog ниже), либо ждём Wave 2 TZ от архитектора.

---

## Что в проде

### Wave 1 — все 10 коммитов на main

| # | SHA | PR | Что |
|---|---|---|---|
| 1.01 | `f71038e` | [#51](https://github.com/jaike077-web/azarean-rehab/pull/51) | Миграция `program_types` справочник + поле `rehab_programs.program_type` + FK |
| 1.02 | `9ba85a4` | [#52](https://github.com/jaike077-web/azarean-rehab/pull/52) | `GET /api/rehab/program-types` + JOIN в `/my/dashboard` |
| 1.03 | `a995ef1` | [#53](https://github.com/jaike077-web/azarean-rehab/pull/53) | Удалён regex-маппинг `deriveProgramLabel` |
| 1.04 | `d9fab17` | [#54](https://github.com/jaike077-web/azarean-rehab/pull/54) | Динамический program_type — **Bug #12 закрыт** |
| 1.05 | `b34ad63` | [#55](https://github.com/jaike077-web/azarean-rehab/pull/55) | AdminContent CRUD program_types — Блок A end |
| 1.06 | `f6f9617` | [#56](https://github.com/jaike077-web/azarean-rehab/pull/56) | Миграция `program_templates` + endpoints |
| 1.07 | `16b300a` | [#57](https://github.com/jaike077-web/azarean-rehab/pull/57) | AdminContent ProgramTemplatesTab + 7 endpoints |
| 1.08a | `81c4305` | [#58](https://github.com/jaike077-web/azarean-rehab/pull/58) | `derived_title` computed field |
| 1.08b | `e7b4944` | [#59](https://github.com/jaike077-web/azarean-rehab/pull/59) | RehabProgramModal director — **Bug #13 закрыт** |
| 1.09 | `c74c468` | [#60](https://github.com/jaike077-web/azarean-rehab/pull/60) | Stuck detection инструктор (yellow badge + opsAlert + weekly cron) |

### Метрики
- Backend: 338 → **423** (+85 тестов)
- Frontend: 236 → **252** (+16 тестов)
- 3 миграции БД (program_types, program_templates, phase_stuck_alerts), все идемпотентны

### Архитектурные достижения
1. **Multi-protocol foundation:** справочник `program_types` (acl/knee_general/shoulder_general), поле `rehab_programs.program_type` с FK, dashboard/Roadmap/telegramBot динамические
2. **Шаблоны программ:** `program_templates` + junction `phase_complexes`, AdminContent UI с PhaseComplexEditor
3. **3-step wizard:** RehabProgramModal → директория (CreateWizard / EditForm / ComplexSelector)
4. **Stuck detection инструктора:** weekly cron Mon 09:00 МСК, yellow 1.3× badge в Patients.js, red 1.7× push в ops-bot

### Prod-smoke (2026-05-15)
- ✅ Сценарий 1: ACL пациент (HomeScreen + Roadmap)
- ✅ Сценарий 2: CreateWizard для нового пациента
- ✅ Сценарий 3: Shoulder пациент с label «Реабилитация плеча» — **Bug #12 E2E verified для не-ACL**
- ✅ Сценарий 4: program_template через AdminContent — backend полностью работает, CSS broken (pre-existing)
- ⚠️ Сценарий 5: red push — E2E не прошёл (SSH classifier-block), **покрыт 8 mock-based unit-тестами**; плановый cron Mon 09:00 МСК подтвердит

---

## Backlog из prod-smoke (8 finding'ов)

### Hot-fix mini-PR'ы (4 шт., MEDIUM priority, ~30 мин каждый)

| # | Файл memory | Объём | Why |
|---|---|---|---|
| 1 | [bug_admin_content_css_modules_unfinished](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_css_modules_unfinished.md) | ~1-2ч | 30+ class имён в AdminContent.js не определены в module.css (pre-existing с 2026-05-04). Страница «Контент» без стилей. Fix: скопировать классы из AdminUsers.module.css |
| 2 | [bug_complex_title_field_missing_in_ui](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_complex_title_field_missing_in_ui.md) | ~30 мин | Поле `title` в CreateComplex.js отсутствует, все complexes с `title=NULL`. **Root cause Bug #13** — derived_title только косметика. Fix: добавить input |
| 3 | [bug_patient_stuck_status_hardcoded_acl](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_patient_stuck_status_hardcoded_acl.md) | ~30 мин | `/my/stuck-status` хардкодит `program_type='acl'`. Shoulder/knee_general пациенты не видят stuck banner. **TZ готов в корне: [TZ_HOTFIX_PATIENT_STUCK_STATUS_PROGRAM_TYPE.md](TZ_HOTFIX_PATIENT_STUCK_STATUS_PROGRAM_TYPE.md)** |
| 4 | [bug_invite_code_share_link](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_invite_code_share_link.md) | ~15 мин | Telegram-share UX: trailing colon в тексте, код не tap-to-copy, нет `?code=` pre-fill. Fix: query param + Register.js пре-заполнение |

### Архитектор-fixes (требуют дизайна, security-sensitive)

| # | Файл memory | Priority | Why |
|---|---|---|---|
| 5 | [bug_oauth_blocked_after_local_registration](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_oauth_blocked_after_local_registration.md) | **HIGH — БЛОКЕР коммерческого запуска** | `password_hash IS NULL` filter в Telegram + Yandex callback'ах блокирует OAuth-link после self-registration. Каждый новый пациент попадает в ловушку при попытке OAuth. Security-sensitive change |
| 6 | [feature_per_instructor_telegram_linking](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feature_per_instructor_telegram_linking.md) | LOW (триггер: 2-й куратор) | Миграция `users.telegram_chat_id` + UI linking. До тех пор opsAlert работает |

### Архитектор-вопросы (backlog)

| # | Файл memory | Why |
|---|---|---|
| 7 | [backlog_seed_phases_for_non_acl_program_types](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_seed_phases_for_non_acl_program_types.md) | rehab_phases сидированы только для `acl`. Shoulder/knee_general пациенты видят пустой Roadmap. Архитектор проектирует структуру + seed-файлы |
| 8 | [feature_multiple_programs_per_patient](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feature_multiple_programs_per_patient.md) | БД допускает N программ, UI работает с одной (LIMIT 1). 3 варианта (UNIQUE / N+UI / is_primary) для архитектора |

---

## Feedback правила (новые)

- [feedback_precise_ui_paths.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_precise_ui_paths.md) — точные UI-пути в smoke-чеклистах (грепать исходник, не хеджировать)
- [feedback_dont_assume_pilot_size.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_dont_assume_pilot_size.md) — не обесценивать архитектурные баги через «1 пациент сейчас не критично»

---

## Что дальше — 3 пути

### Путь A — Hot-fix mini-PRs сначала (порядок приоритета)

Начать с **#3 (patient stuck-status acl)** — TZ уже готов в корне. Затем #2 (complex title) — закрывает root cause Bug #13. Затем #4 (invite UX) — улучшит онбординг новых пациентов. Затем #1 (AdminContent CSS) — косметика для админа.

Каждый mini-PR от main:
```bash
git checkout main && git pull
git checkout -b hotfix/<name>
# ... fix + tests ...
git push origin hotfix/<name>
gh pr create --base main --title "..." --body "..."
# Merge через gh pr merge --squash после approval
```

### Путь B — Архитектор-fix #5 (OAuth)

**Блокер коммерческого запуска.** Требует архитектора для security-sensitive change. После того как Vadim передаст архитектору отчёт, тот спроектирует fix.

Возможный подход (из memory):
- Убрать `AND password_hash IS NULL` из byPhone-query в обоих OAuth callback'ах
- Сохранить multi-match anti-misroute
- Возможно добавить email-match как fallback
- Тесты обновить в `oauthCallback.routes.test.js`

### Путь C — Wave 2 (клинический дневник)

Архитектор хочет ответы от Vadim на:
- **4 OPEN questions** по measurement details (плечо/голеностоп/позвоночник/ТБС)
- **Решение по simplified pain events vs полная модель**

После получения ответов архитектор пишет Wave 2 TZ файлы (`TZ_WAVE_2_NN_*.md`).

---

## Известные ограничения (для нового чата)

### SSH classifier
SSH на prod через мой Bash tool блокируется auto-classifier'ом для:
- `StrictHostKeyChecking=no` / `UserKnownHostsFile=/dev/null` (auth weakening)
- Чтения PII пациентов

Юзер дал permission `Bash(ssh:*)` в `.claude/settings.json`. Идентичная команда падает потому что `~/.ssh/config` у юзера содержит `UserKnownHostsFile /dev/null` (intentional) + IdentityFile `~/.ssh/id_ed25519` с кириллицей в пути → ssh не expand'ит правильно в non-interactive Bash env. **Workaround:** юзер делает SSH сам через свой терминал.

### Dirty файлы dark-theme (от 2026-05-04)
4 файла uncommitted в working tree:
- `frontend/src/pages/PatientDashboard/PatientDashboard.js`
- `frontend/src/pages/PatientDashboard/components/DiaryScreen.css`
- `frontend/src/pages/PatientDashboard/tokens.css`
- `frontend/src/styles/tokens.css`

Все 10 Wave 1 коммитов прошли мимо них (через `git stash` перед rebase). Продолжать изоляцию.

### CSS broken на странице «Контент»
Pre-existing с 2026-05-04 (CSS Modules миграция `c8834b5` не доперенесла классы). Wave 1 #1.05 + 1.07 добавили новые табы по тому же inline-pattern → CSS broken для них тоже. Hot-fix #1 закрывает.

---

## Команды для напоминания

```bash
# Где я
cd c:/Users/Вадим/Desktop/Azarean_rehab
git log --oneline -12   # последние 12 коммитов (Wave 1 + Wave 0)
git branch --show-current  # должно быть main
git status --short      # должно быть 4 dirty dark-theme файла

# Test baseline после Wave 1
cd backend && npm test       # 423/423
cd frontend && CI=true npx react-scripts test --watchAll=false  # 252/252

# Dev серверы
netstat -ano | grep ":5000\|:3001"   # backend :5000, frontend :3001

# DB credentials
"C:/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -U postgres -d azarean_rehab
# password в pgpass.conf
```

---

## Аккуратно перед стартом

- **Memory обновлён:** `wave_1_complete.md` — итоговая сводка
- **CLAUDE.md обновлён:** секция «Wave 1 в работе» → «Wave 1 ЗАКРЫТА в проде»
- **8 backlog entries в memory** — подробности по каждой задаче
- **Архитектор-отчёт для передачи:** [ARCHITECT_FULL_REPORT_WAVE_1_SHIPPED_2026-05-15.md](ARCHITECT_FULL_REPORT_WAVE_1_SHIPPED_2026-05-15.md) (см. этот файл рядом)

**Если что-то непонятно** — читай memory или спрашивай юзера. Wave 1 — большой шаг, но всё задокументировано в memory.
