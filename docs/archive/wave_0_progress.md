# Волна 0 — Прогресс

| # | Статус | Commit SHA | Дата | Smoke | Push в main | Заметки |
|---|---|---|---|---|---|---|
| 1 | 🟢 в main | `b699271` (PR #45) | 2026-05-11 | ✅ ок | ✅ pakage merge 2026-05-11 | Ветка `wave-0/01-streak-no-reset` запушена, **PR #45 смерджен 11 мая (squash) первым в пакете**. Backend 307/307 (+14), frontend 212/212 (+3). Миграция `20260508_streak_days` idempotent ✓. Smoke 4/4 пройдены на dev. CLAUDE.md обновлён, Bug #11 → закрыт. |
| 2 | 🟢 в main | `f368c97` (PR #46) | 2026-05-11 | ✅ ок | ✅ pakage merge 2026-05-11 | Ветка `wave-0/02-home-dynamic-label` запушена в origin, **PR #46 смерджен 11 мая** (после rebase на актуальный main). Backend 323/323 (+16 programLabels), frontend 215/215 (+3 Hero title). HomeScreen title из `program_label` вместо сырого diagnosis. Smoke 3/3 в браузере: ACL→«ПКС — Фаза 1», плечо→«Плечо — Фаза 1», неизвестный→«Фаза 1» (без префикса). **Замечания юзера записаны в memory:** [feature_complex_duration_calc.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feature_complex_duration_calc.md) — «~15 мин» хардкод, считать на бэке; [project_program_label_taxonomy.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/project_program_label_taxonomy.md) — словарь labels непоследовательный, унифицировать в Волне 1. |
| 3 | 🟢 в main | `cd274c2` (PR #47) | 2026-05-11 | ✅ ок | ✅ pakage merge 2026-05-11 | Ветка `wave-0/03-diary-report-via-messages` запушена в origin, **PR #47 смерджен 11 мая**. Миграция `20260508_messages_extend.sql` добавила `message_kind` (whitelist text/diary_report/session_report/system_alert), идемпотентна. Backend 331/331 (+8), frontend 219/219 (+5). DiaryScreen: primary кнопка POST → 3 состояния → после успеха secondary MessengerCTA «Продублировать». ContactScreen: мини-карточка отчёта с превью + кнопка «Открыть запись» (goTo(2)). Smoke 4/4 в браузере (5-й сценарий пропущен как нерелевантный). |
| 4 | 🟢 в main | `97b569f` (PR #48) | 2026-05-11 | ✅ ок | ✅ pakage merge 2026-05-11 | Ветка `wave-0/04-home-replay` запушена в origin, **PR #48 смерджен 11 мая**. Frontend 223/223 (+4). Дисциплина: 2 файла (HomeScreen.js + test), inline-стили (HomeScreen.css не трогали — миксовать с dark-theme uncommitted нельзя). |
| 5 | 🟢 в main | `200cdfc` (PR #49) | 2026-05-11 | ✅ ок (1-5, кроме dark — отложено) | ✅ pakage merge 2026-05-11 | Ветка `wave-0/05-runner-accordion-extended` запушена в origin, **PR #49 смерджен 11 мая**. 2 коммита: основной (accordion + 1 backend SELECT) и followup-fix (расширение ещё 2 backend SELECT'ов — `/my-complexes/:id` и `/exercises` list, обнаружено в smoke). LOCKED-зона timer/RPE/PainScale не тронута. Backend 331/331, frontend 232/232 (+9 ExerciseRunner accordion). dev-БД: упражнение id=12 «Приводящие с мячом в статике» обогащено всеми новыми полями для smoke. Memory: feedback_dont_assume_user_needs (не делать домыслов про потребности юзера) + wave_0_runner_accordion_followups (TODO для будущих волн). |
| 6 | 🟢 в main | `12a90ad` (PR #50) | 2026-05-11 | ✅ ок | ✅ pakage merge 2026-05-11 | Ветка `wave-0/06-roadmap-stuck-banner` запушена в origin, **PR #50 смерджен 11 мая (последним)**. Финальный коммит волны. Backend 338/338 (+7), frontend 236/236 (+4). **Discoveries в smoke** (зафиксированы в memory): duration_weeks хранится как VARCHAR-диапазон → парсер; toast'ы рендерятся внизу → inline-flash на кнопке для мобильных; MessengerCTA добавлен внутрь pre-filled карточки. |

---

## Финал волны — pakage merge 2026-05-11

Pre-merge smoke на dev: пройден юзером 11 мая (13 ✅ из 17, 2 ❌ — A было by-design без пропуска, E было моей ошибкой синтаксиса psql в PowerShell, после исправления — ✅).

Merge выполнен пакетом #45→#50 как squash-commits:
- #45 → `b699271` без проблем
- #46-#50: возникли merge-conflicts из-за того что origin/main с момента последнего push'а уехал вперёд (dark-theme коммиты `8c51240`/`368a882` юзер залил сам). Решил `git rebase origin/main` в каждой ветке (git авто-пропустил уже включённые коммиты предыдущих PR'ов через cherry-pick detection) + `--force-with-lease` push + `gh pr merge --squash --delete-branch`.
- Все 6 ветка автоматически удалены, PR'ы закрыты.

GitHub Actions deploy: запустился на каждый push в main, concurrency cancellation отменил промежуточные runs, финальный (#50) задеплоит весь пакет одним прогоном.

**Следующий шаг:** prod-smoke на https://my.azarean.ru.

Статусы: ⏳ ждёт · 🔵 в работе · 🟡 готов к smoke · 🟢 в main · 🔴 откат · ⏸ заморожен
