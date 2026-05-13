# Wave 1 — Прогресс

## Hot-fix перед волной

- Bug #14 (is_registered OAuth): ✅ закрыт `52631a2` 2026-05-12 (до старта волны)

## Блок A — Фундамент multi-protocol

| # | Статус | Commit SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 1.01 | ⏸ заморожен | `a3dfff7` | 2026-05-12 | ⏳ ждёт юзера | — | Миграция program_types + поле rehab_programs.program_type. Backend 350/350 (+12). Idempotency cycle ✓ |
| 1.02 | ⏸ заморожен | `b0170f1` | 2026-05-13 | ⏳ ждёт юзера | — | `/program-types` endpoint + JOIN program_types в `/my/dashboard`. Backend 359/359 (+9). Smoke ✓ |
| 1.03 | ⏸ заморожен | `fa177b4` | 2026-05-13 | ⏳ ждёт юзера | — | Удалён regex-маппинг `deriveProgramLabel` (backend). HomeScreen уже корректен. Backend 343/343 (−16 удалённых), frontend 238/238 (+2 multi-protocol) |
| 1.04 | 🔵 в работе | — | 2026-05-13 | — | — | Убрать дефолт 'acl' в api.js getPhases, RoadmapScreen читает program_type из dashboardData, telegramBot SQL JOIN по rp.program_type |
| 1.05 | ⏳ ждёт | — | — | — | — | — |

## Блок B — Шаблоны программ + stuck

| # | Статус | Commit SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 1.06 | ⏳ ждёт | — | — | — | — | — |
| 1.07 | ⏳ ждёт | — | — | — | — | — |
| 1.08 | ⏳ ждёт | — | — | — | — | — |
| 1.09 | ⏳ ждёт | — | — | — | — | — |

---

**Статусы:** ⏳ ждёт · 🔵 в работе · 🟡 готов к smoke · ⏸ заморожен (PR висит, ждёт batch merge) · 🟢 в main · 🔴 откат

**Batch merge policy:** все PR висят открытыми, мержим в порядке #01 → #09 одним пакетом в конце волны (правило `wave_0_batch_merge_policy.md`).
