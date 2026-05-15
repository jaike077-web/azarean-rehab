# Wave 1 — Прогресс

## Hot-fix перед волной

- Bug #14 (is_registered OAuth): ✅ закрыт `52631a2` 2026-05-12 (до старта волны)

## Блок A — Фундамент multi-protocol

| # | Статус | Commit SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 1.01 | ⏸ заморожен | `a3dfff7` | 2026-05-12 | ⏳ ждёт юзера | — | Миграция program_types + поле rehab_programs.program_type. Backend 350/350 (+12). Idempotency cycle ✓ |
| 1.02 | ⏸ заморожен | `b0170f1` | 2026-05-13 | ⏳ ждёт юзера | — | `/program-types` endpoint + JOIN program_types в `/my/dashboard`. Backend 359/359 (+9). Smoke ✓ |
| 1.03 | ⏸ заморожен | `fa177b4` | 2026-05-13 | ⏳ ждёт юзера | — | Удалён regex-маппинг `deriveProgramLabel` (backend). HomeScreen уже корректен. Backend 343/343 (−16 удалённых), frontend 238/238 (+2 multi-protocol) |
| 1.04 | ⏸ заморожен | `ceb32aa` | 2026-05-13 | ⏳ ждёт юзера | — | Дефолт 'acl' убран из api.js, RoadmapScreen reads program_type из dashboardData, telegramBot SQL по rp.program_type. Backend 344/344 (+1), frontend 243/243 (+5). **Bug #12 закрыт полностью** |
| 1.05 | ⏸ заморожен | `8c420b2` | 2026-05-13 | ⏳ ждёт юзера | — | AdminContent CRUD program_types + select PhaseForm + filter PhasesTab. Backend 358/358 (+14). **Блок A завершён** |

## Блок B — Шаблоны программ + stuck

| # | Статус | Commit SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 1.06 | ⏸ заморожен | `8223b60` | 2026-05-13 | ⏳ ждёт юзера | — | Миграция program_templates + 2 endpoints + POST /programs принимает program_template_id. Backend 378/378 (+20). Idempotency cycle ✓ |
| 1.07 | ⏸ заморожен | `77f2e7e` | 2026-05-13 | ⏳ ждёт юзера | — | AdminContent ProgramTemplatesTab + 7 endpoints + PhaseComplexEditor (inline). Backend 397/397 (+19), frontend 243/243 |
| 1.08a | 🔵 в работе | — | 2026-05-13 | — | — | derived_title computed field в 4 endpoints `routes/complexes.js` (Bug #13 fallback) |
| 1.08b | ⏳ ждёт | — | — | — | — | RehabProgramModal wizard (директория + Step-компоненты) — после split TZ |
| 1.09 | ⏳ ждёт | — | — | — | — | — |

---

**Статусы:** ⏳ ждёт · 🔵 в работе · 🟡 готов к smoke · ⏸ заморожен (PR висит, ждёт batch merge) · 🟢 в main · 🔴 откат

**Batch merge policy:** все PR висят открытыми, мержим в порядке #01 → #09 (теперь 10 PR из-за split 1.08 → 1.08a + 1.08b — финальный порядок `#45..#54`) одним пакетом в конце волны (правило `wave_0_batch_merge_policy.md`).
