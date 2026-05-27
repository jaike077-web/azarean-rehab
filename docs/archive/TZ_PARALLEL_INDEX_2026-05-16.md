# TZ INDEX — параллельные задачи пока ждём Wave 2 от архитектора

**Дата:** 2026-05-16
**Контекст:** после Wave 1 + hot-fix batch (6 PR'ов в проде 2026-05-15) Wave 2 заблокирована ответами Vadim'а архитектору на 5 OPEN questions (плечо/голеностоп/позвоночник/ТБС measurements + pain events). Параллельно есть 3 backlog-задачи разной природы.

## Принципы ТЗ

- **Не делать допущений** — каждое утверждение в ТЗ имеет ссылку на file:line или verified grep result.
- **Опираться на твёрдую информацию** — все срезы (CSS tokens, AdminContent inputs, audit grep) проверены в working tree HEAD'а main.
- **Ничего не сломать** — изолируем от dark-theme dirty файлов от 2026-05-04 (см. handoff section «Известные ограничения»).
- **Минимально-инвазивно** — fix только там где доказано необходимо, без cleanup соседнего кода.

## Список задач

| # | Файл ТЗ | Что | Природа | Можно ли выполнить без Vadim'а / архитектора |
|---|---|---|---|---|
| 01 | [TZ_PARALLEL_01_ADMIN_CONTENT_DARK_INPUTS.md](TZ_PARALLEL_01_ADMIN_CONTENT_DARK_INPUTS.md) | Hot-fix dark-theme input/select/textarea backgrounds в модалках AdminContent | UX/CSS hot-fix | **Да, полностью.** Точечный fix в одном файле без зависимостей. |
| 02 | [TZ_PARALLEL_02_SEED_PHASES_NON_ACL.md](TZ_PARALLEL_02_SEED_PHASES_NON_ACL.md) | Seed-структура `rehab_phases` для `shoulder_general` / `knee_general` | Data infrastructure | **Нет.** Нужен clinical content от Vadim'а / архитектора. ТЗ описывает структуру + варианты доставки, ждём content. |
| 03 | [TZ_PARALLEL_03_WAVE_1_RETROSPECTIVE_AUDIT.md](TZ_PARALLEL_03_WAVE_1_RETROSPECTIVE_AUDIT.md) | Audit оставшихся endpoint'ов Wave 1 #1.04 (`api.js`, `RoadmapScreen`, `telegramBot`) на хардкоды `'acl'` | Anti-regression check | **Да, уже выполнено в этой сессии.** Результат: **clean** — никаких новых хардкодов. ТЗ-документ = audit report + memory entry. |

## Порядок исполнения (рекомендуемый)

1. **#03 первым** (5 минут) — audit-документ закрывает backlog item, фиксирует «full-grep done» в memory. Не блокирующая работа.
2. **#01 вторым** (~30 минут) — единственный реально кодовый fix. Узкий scope. Один файл, без миграций.
3. **#02 третьим** — **только после получения clinical content от Vadim'а / архитектора.** Структура и SQL-template готовы, заполнение — отдельная итерация.

## Что НЕ трогаем (изоляция)

| Файл | Статус | Причина |
|---|---|---|
| `CLAUDE.md` | M | Hot-fix batch tail-записи 2026-05-15 + dark-theme заметки 2026-05-04. Stash перед merge'ем. |
| `frontend/src/pages/PatientDashboard/PatientDashboard.js` | M | dirty dark-theme 2026-05-04 |
| `frontend/src/pages/PatientDashboard/components/DiaryScreen.css` | M | dirty dark-theme 2026-05-04 |
| `frontend/src/pages/PatientDashboard/tokens.css` | M | dirty dark-theme 2026-05-04 |
| `frontend/src/styles/tokens.css` | M | dirty dark-theme 2026-05-04 — `[data-theme='dark']` → `:root[data-theme='dark']` specificity fix (см. `memory/feedback_css_specificity_root_dark.md`) |

**Все 6 hot-fix коммитов 2026-05-15 прошли мимо этих файлов через `git stash` перед merge'ем + restore после.** Продолжаем эту изоляцию для всех 3 параллельных задач.

## Метрики baseline (для регрессионной проверки)

- Backend: **437/437** (после PR #66 `f7ef711`)
- Frontend: **252/252**
- 0 dirty файлов после restore stash'а перед каждым commit'ом

## Что после выполнения

- **#01:** PR в main → prod-smoke в браузере (light + dark) → SW bump НЕ нужен (CSS изменения подхватываются с TTL, JS bundle тот же).
- **#02:** PR с SQL seed-файлами + опциональная миграция-обёртка. Или альтернативно — Vadim вводит через AdminContent UI без code-changes.
- **#03:** Memory entry + опционально комментарий в CLAUDE.md о пройденном audit'е. Code-changes нет.

## Связано

- [SESSION_HANDOFF_2026-05-15_HOTFIXES_DONE.md](SESSION_HANDOFF_2026-05-15_HOTFIXES_DONE.md) — handoff в новый чат
- [memory/wave_1_hotfix_batch_complete.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_hotfix_batch_complete.md) — итог 6 PR'ов
- [memory/backlog_seed_phases_for_non_acl_program_types.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_seed_phases_for_non_acl_program_types.md) — backlog для задачи #02
- [memory/bug_admin_content_modal_dark_theme_text.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_modal_dark_theme_text.md) — backlog для задачи #01
- [memory/bug_dark_theme_mdeditor_global_inputs.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_dark_theme_mdeditor_global_inputs.md) — родительский Bug #15, **НЕ трогаем глобал** в этом ТЗ
