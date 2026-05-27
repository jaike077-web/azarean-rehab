# Wave 2 — Прогресс

**Старт:** 2026-05-16 (после Wave 1 retrospective close + Wave 2 Readiness Check)
**Цель:** клинический дневник — measurements (ROM Tier 1/2/3 + girths), structured pain tracking, phase transition criteria
**Объём:** 14 коммитов в 6 блоках, 76-95ч работы Claude Code, 3-4 недели

---

## Блок A — Foundation (schema + content layer)

| # | Статус | SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 2.01 | ⏳ | — | — | — | — | Schema migrations (7 таблиц + ALTER patients × 3). TZ готов в корне репо |
| 2.02 | ⏳ | — | — | — | — | Pain locations seed + AdminContent PainLocationsTab. TZ v2 — обновлён после readiness check (CSS alias `s`, logAudit helper, api.js verify-driven) |
| 2.03 | ⏳ | — | — | — | — | ACL criteria seed + PhasesTab расширение с criteria sub-CRUD. TZ в работе |

## Блок B — Pain tracking

| # | Статус | SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 2.04 | ⏳ | — | — | — | — | Backend pain endpoints (daily + event) + red flag automation + ops-alert |
| 2.05 | ⏳ | — | — | — | — | Frontend DiaryScreen расширенный + HomeScreen Pain Event SOS |

## Блок C — Measurements Tier 1+2

| # | Статус | SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 2.06 | ⏳ | — | — | — | — | Backend measurements endpoints + photo upload infrastructure |
| 2.07 | ⏳ | — | — | — | — | Frontend Tier 1 numeric input + reference photos + bilateral flow |
| 2.08 | ⏳ | — | — | — | — | Tier 2 canvas markup UI + markup queue + personal reference upload |

## Блок D — AI Tier 3 (MediaPipe Pose)

| # | Статус | SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 2.09 | ⏳ | — | — | — | — | MediaPipe integration (code-splitting, lazy load, Pose Landmarker) |
| 2.10 | ⏳ | — | — | — | — | AI confidence handling + auto-fallback + validation tracking + consent UI |

## Блок E — Criteria evaluation

| # | Статус | SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 2.11 | ⏳ | — | — | — | — | Backend phase-criteria endpoints + auto-check evaluator |
| 2.12 | ⏳ | — | — | — | — | Self_report + instructor_check flows + staleness check |
| 2.13 | ⏳ | — | — | — | — | Frontend Roadmap UI с criteria checkboxes + Stuck banner v2 |

## Блок F — Polish

| # | Статус | SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 2.14 | ⏳ | — | — | — | — | Patients.js badges + tests cleanup + final retrospective grep |

---

## Легенда статусов

- ⏳ ждёт TZ от архитектора
- 🔵 в работе у Claude Code
- 🟡 готов к smoke-тесту
- ⏸ заморожен (smoke ok, PR висит, ждёт batch merge)
- 🟢 в main
- 🔴 откат (что-то пошло не так)

---

## Wave 2 Readiness Check — 2026-05-16

**Verdict:** 🔴 NO-GO для 2.02 (2.01 не реализован)

**Зелёное:**
- ✅ Все 5 Wave 1 hot-fixes в проде (#61-#65)
- ✅ Backend 437/437 tests, Frontend 252/252
- ✅ Premise drift нулевой: `program_types` коды (`acl` + `shoulder_general`) совпадают с TZ 2.02

**Найденные премис-дрейфы для TZ 2.02 (обновлены в v2):**
- CSS Modules alias `s` (не `styles`) — был учтён в v2
- logAudit helper существует в `admin.js:17` — был учтён в v2
- В `api.js` нет `xxxAdmin = {...}` namespace — был учтён в v2

**Backlog hot-fix #6 (открыт):**
- Добавить `logAudit` calls в Wave 1 endpoints `program-types` и `program-templates` — они были смерджены без audit logging. Отдельным мини-TZ когда удобно.

---

## Batch merge план (после закрытия всех 14 коммитов)

Все PR'ы висят открытыми на feature-ветках `wave-2/01-...` ... `wave-2/14-...`. В конце Wave 2:

1. Merge в строгом порядке #2.01 → #2.02 → ... → #2.14
2. Каждая ветка от предыдущей (rebase chain)
3. Prod deploy через CI/CD после всех merge'ей
4. Финальный prod-smoke на 2 пациентах (ACL + shoulder)
5. 24ч стабильности → переход к Wave 3

---

## DoD всей Wave 2 (когда закроется)

- [ ] Все 14 коммитов в main
- [ ] Backend ≥ 500 тестов (старт 437)
- [ ] Frontend ≥ 290 тестов (старт 252)
- [ ] Миграция Wave 2 прошла idempotency cycle
- [ ] Prod-smoke на 2 пациентах
- [ ] MediaPipe lazy-load работает на mobile + dark theme
- [ ] Privacy consent UI показывается при первом фото upload'е
- [ ] Red flag automation triggered (тест через искусственный pain entry с calf_posterior)
- [ ] AdminContent: PainLocationsTab + PhasesTab criteria sub-CRUD работают
- [ ] CLAUDE.md обновлён по каждому коммиту
- [ ] `memory/wave_2_complete.md` создан
- [ ] `ARCHITECT_STATUS_2026-XX-XX.md` снапшот
- [ ] **Full grep retrospective пройден** (правило с 2026-05-15)
- [ ] 24ч стабильности на проде до старта Wave 3
