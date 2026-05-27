# ARCHITECT REPORT — Wave 2 Closure Complete (2026-05-22)

**От:** Claude Code (Opus 4.7)
**Кому:** Architect
**Дата:** 2026-05-22
**Тема:** Wave 2 закрыт в проде, runbook v3 выполнен с 1 hot-fix discovery + 1 minor cosmetic bug

---

## TL;DR

Все 11 phases runbook v3 (WAVE_2_CLOSURE_RUNBOOK (1).md) выполнены успешно. **Wave 2 LIVE на https://my.azarean.ru с 2026-05-22 ~05:00 МСК.** Финальный stack 17 PR + dark theme PR #67 merged via batch `git merge --no-ff` без единого conflict'а. CI/CD pipeline отработал чисто (3m 3s первый deploy + 1m 23s second через workflow_dispatch для uploads persist verify).

## Что закрыто vs runbook v3

| Phase | Result | Time | Drift от runbook |
|---|---|---|---|
| Pre-flight backup verify | ✅ cron 22:15 UTC active | 30s | path `/opt/azarean-rehab/backups/` (не `/opt/backups/`) — runbook drift fixed в редакции |
| 1 Local smoke | ✅ 9/9 cards | ~45 min | **HF#12 discovered** — drift TZ 2.07 backend SELECT |
| 2 Test suite | ✅ 30+25 suites, 930 tests | 22 sec | — |
| 3.0 HF#12 commit | ✅ `218c815` | 5 min | новый commit поверх 2.09 (stack 17 PR) |
| 3.1 Pilot disclaimer | ✅ skip — already in code | 0 | runbook drift: PatientDashboard.js:177-208 уже имел disclaimer + localStorage flag (был добавлен ранее) |
| 3.2 Language baseline | ✅ `e537bf5` 8 замен | 10 min | scope: только UI strings (HomeScreen / RoadmapScreen / DiaryScreen / ConsentDialog / PatientDashboard disclaimer); НЕ тронули `program_types.label` в БД — backlog |
| 3.3 Uploads-persistence | ✅ `a59be41` | 5 min | в edit deploy.yml убрал `chown` (CI runs as root, PM2 runs as root — chown не нужен пока non-root user не появится) |
| 4 VDS one-time data migration | ✅ uploads пустые на проде | 1 min | реальных файлов нет (Internal pilot ещё не начат), Phase 4 фактически no-op для данных |
| 5 PR #67 dark theme merge | ✅ `954c55d` | 30 sec | правильный SHA `16ed04c` (не `16cd04c` как было в одном из handoff'ов) |
| 6 Batch merge 17 PR | ✅ ZERO conflicts | 1 min | auto-merge `AdminContent.module.css` между PR #67 и Wave 2 #2.02/#2.03 сработал чисто |
| 6.5 Tag `v0.1.0-pilot` | ✅ | 5 sec | local + pushed in Phase 7 |
| 7 Push deploy | ✅ CI 3m 3s | ~5 min | full CI/CD: Test 1m 1s → Build 1m 10s → Deploy 43s |
| 8 Prod browser smoke | ✅ 10/10 PASSED | ~30 min | 1 cosmetic 🟡 + workaround SQL UPDATE для status=NULL bug (pre-existing) |
| 9 Uploads persist verify | ✅ photo жив после re-deploy | ~5 min | `workflow_dispatch` 2nd deploy 1m 23s (skip_tests=true) |
| 10 Memory + announce | 🚧 в процессе | — | этот файл + CLAUDE.md update + SESSION_HANDOFF_2026-05-22.md + memory updates |

**Total wall clock:** ~3 часа (включая ~1 час Phase 8 user smoke + waiting time на CI/network/паузы).

---

## Drifts найденные в этой сессии (35-39 итого за Wave 2)

### Новые drift'ы 2026-05-22

**Drift #33 — Backup directory path** (зафиксирован в runbook v3 review)
- Runbook v1 указывал `/opt/backups/` в трёх местах
- Реальный path по `deploy/backup.sh:12`: `/opt/azarean-rehab/backups/`
- Fixed в runbook v3 редакции

**Drift #34 — Cron log location** (зафиксирован в runbook v3 review)
- Runbook v1 предлагал `grep /var/log/syslog`
- Реальный лог по `setup.sh:254`: `/var/log/azarean-rehab-backup.log`
- Fixed в runbook v3

**Drift #35 — Migration count math** (зафиксирован в runbook v3 review)
- Runbook v1 говорил «17 = 16 + 17 новых» (nonsense)
- Реальность: 29 → 35 (6 новых Wave 2 миграций)
- Fixed в runbook v3

**Drift #36 — HF#12 (live smoke discovery)** — **PROCESS-RELEVANT**
- Контекст: Phase 1 Smoke 2.09-3 (returning user bypass photo upload)
- Симптом: после успешного `POST /api/rehab/my/rom/:id/photo` 201 + БД UPDATE photo_url успешно, в Истории все ROM entries по-прежнему показывали кнопку «Добавить фото», thumbnail не рендерился
- Root cause: `backend/routes/rehab.js:2724-2729` (Wave 2.06 commit) SELECT в `GET /my/measurements` НЕ включал `photo_url` поле, хотя комментарий на строке 2670 утверждал «будет в 2.07+». Wave 2.07 расширила только POST endpoint, SELECT не тронула
- Fix: одна строка — добавил `photo_url` в SELECT allowlist
- **Lesson:** unit tests были mock-based, не делали round-trip POST→DB→GET с реальной storage → не поймали. Live smoke в browser — обязателен для schema-touching round-trip flows

**Drift #37 — Pilot disclaimer уже существовал**
- Runbook предлагал создать Welcome modal с pilot disclaimer
- Реальность: `PatientDashboard.js:177-208` уже имел disclaimer от ранее (Wave 0 или раньше) с localStorage flag `patient_disclaimer_accepted`
- Текст even **сильнее** чем минимум runbook'а — есть медицинский disclaimer + ФЗ-152 acknowledgement
- Phase 3.1 skipped (no commit needed)

**Drift #38 — `program_types.label` в БД содержит «реабилитация»**
- Найдено в Phase 8 prod smoke на скрине dashboard
- Hero card title: «ПКС реабилитация — Фаза 1» (приходит из `program_types.label` через JOIN)
- Language baseline Phase 3.2 покрыл только UI hardcoded strings, не БД content
- Backlog: миграция `UPDATE program_types SET label = REPLACE(label, 'реабилитация', 'восстановление')`

**Drift #39 — «pain event» EN термин в RU UI**
- HomeScreen footer link: «Резкая боль и нужна срочная связь с куратором? Записать **pain event** →»
- Wave 2.05 frontend код, EN термин в RU UI
- Backlog: заменить на «Записать резкую боль» или похожее

### Pre-existing bug найденный в Phase 8 (НЕ Wave 2 регрессия)

**Backend POST /programs не ставит `status='active'` по умолчанию**
- `backend/routes/rehab.js:1457` INSERT без `status` field
- Schema `rehab_programs.status` не имеет DEFAULT
- Результат: программа создаётся с `status=NULL`
- `GET /my/dashboard` фильтрует `WHERE status='active'` → программа не находится → empty state
- Workaround в Phase 8: SQL `UPDATE rehab_programs SET status='active' WHERE status IS NULL` через SSH
- Backlog item для Wave 3 hotfix или RehabProgramModal refactor

---

## Lessons learned для будущих волн

1. **Live browser smoke обязателен** после schema-touching commits — unit tests не ловят round-trip drift'ы (HF#12 case).

2. **Backend SELECT allowlist для отдачи** должен быть expanded когда новый POST endpoint мутирует поле — это парный pattern, не «потом докинем».

3. **Pre-existing bugs всплывают в новой volna deploy** — POST /programs status bug никогда не активировался потому что test patient flow не делался на проде. Wave 2 closure его выявил.

4. **Documentation drift между PR'ами** — каждый Wave 2 PR обновлял CLAUDE.md changelog но не перезаписывал «Текущее состояние» header. Главная секция после batch merge оказалась stale. Pattern для будущего: finalize commit должен перезаписать header.

5. **Auto mode classifier правильно блокирует prod actions** — SSH read prod DB, push origin main, SQL UPDATE patients — все требуют explicit per-target authorization. Это **правильное** поведение, не workaround.

6. **PowerShell vs Git Bash на Windows** — для SSH с длинными командами + escape rules PowerShell не имеет проблемы bracketed paste, которая ломает Git Bash one-liners.

---

## Метрики накопительно (Wave 2 за всё время)

| Suite | Pre-Wave-2 baseline | Closure 2026-05-22 | Delta |
|---|---|---|---|
| Backend tests | 437 | **592** | +155 |
| Frontend tests | 252 | **338** | +86 |
| Backend suites | 25 | **30** | +5 |
| Frontend suites | 16 | **25** | +9 |
| Migrations | 29 | **35** | +6 |
| Total tests | 689 | **930** | +241 |

---

## Wave 3 readiness

Pilot выполняется на https://my.azarean.ru. Vadim откроет access Татьяне + Алёне + 5-10 первым клиентам в ближайшие дни (через invite-code flow). Через 1-2 недели pilot use вернётся с фидбеком + решением приоритетов Wave 3.

**Архитектору ожидаемо подготовить:**
- TZ 3.01 — Patient PDF export (Pattern B phase 1)
- TZ 3.02 — Engagement & Retention early warning
- TZ 3.03 (опционально) — Markup canvas (бывший TZ 2.10) если pilot покажет нужным

**Также для Wave 2.5 хотфиксов** (если architecture полезен):
- `program_types.label` migration (одно-line UPDATE)
- POST /programs status='active' fix (одно-line backend change)
- HF#13 PhotoViewer close X (CSS positioning fix)

Не критично — Vadim может делать сам без TZ.

---

**Конец отчёта.** Wave 2 closure complete. Готов к Wave 3 kickoff когда придёт время.
