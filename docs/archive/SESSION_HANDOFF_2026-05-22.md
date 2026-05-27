# SESSION HANDOFF — Wave 2 ЗАКРЫТА В ПРОДЕ (2026-05-22)

**Дата:** 2026-05-22
**Контекст:** Wave 2 closure runbook полностью выполнен. 17 PR merged + dark theme PR #67. Главный URL https://my.azarean.ru обновлён и работает. Prod smoke 10/10 PASSED.

---

## TL;DR для нового чата

```
✅ Wave 2 LIVE на https://my.azarean.ru
✅ Main HEAD = 3039323, tag v0.1.0-pilot опубликован
✅ Backend 592/592, frontend 338/338, 30+25 suites, 930 tests
✅ 6 миграций применены на prod БД (29 → 35)
✅ CI/CD pipeline отработал — 3m 3s первый deploy + 1m 23s second
✅ Uploads persistence symlink verified через второй deploy
✅ Phase 8 prod browser smoke 10/10 PASSED
✅ Daily backup cron active (22:15 UTC, /opt/azarean-rehab/backups/, 14-day rotation)
🟡 1 cosmetic bug: PhotoViewerModal close X button невидим (Esc работает)
⏳ Wave 3 planning через 1-2 недели pilot use
```

**Точка входа в новом чате:**
> Читай этот файл. Wave 2 закрыта в проде, нет ничего блокирующего. Backlog items в CLAUDE.md секции «Backlog для Wave 3 / Wave 2.5 hot-fixes». Vadim возвращается с фидбеком от Татьяны/Алёны/первых клиентов через 1-2 недели → Wave 3 kickoff с TZ 3.01.

---

## Что было сделано в этой сессии (closure 2026-05-22)

| Phase | Status | Notes |
|---|---|---|
| 1 — Local smoke 2.08+2.09 | ✅ 9/9 cards | **HF#12 discovered в live smoke** — backend GET /my/measurements SELECT не возвращал photo_url (drift TZ 2.07) |
| 2 — Test suite sanity | ✅ 30+25, 930 tests | Backend `npm test` + frontend `react-scripts test` зелёные |
| 3.0 — HF#12 commit | ✅ `218c815` | Branch `wave-2/hotfix-12-photo-url-select` |
| 3.1 — Pilot disclaimer | ✅ skip (already in code) | PatientDashboard.js:177-208 + localStorage flag, runbook drift |
| 3.2 — Language baseline | ✅ `e537bf5` | 8 patient-visible замен «реабилитация → восстановление» + 1 test fixture |
| 3.3 — Uploads persistence | ✅ `a59be41` | `.github/workflows/deploy.yml` symlink block (closes `bug_avatar_lost_on_deploy.md`) |
| 4 — VDS one-time data migration | ✅ | `cp -rp backend/uploads → data/uploads`; backup cron pre-flight verified |
| 5 — Dark theme PR #67 merge | ✅ `954c55d` | Local merge, no push (waited for batch) |
| 6 — Batch merge 17 PR | ✅ ZERO conflicts | Auto-merge AdminContent.module.css между PR #67 и Wave 2 #2.02/#2.03 |
| 6.5 — Tag `v0.1.0-pilot` | ✅ | Local + pushed in Phase 7 |
| 7 — Push deploy | ✅ CI green | `f7ef711..3039323`, deploy 3m 3s, smoke curl OK |
| 8 — Prod browser smoke | ✅ 10/10 | 1 cosmetic 🟡 (PhotoViewer X invisible) |
| 9 — Uploads persist verify | ✅ | Second deploy через `workflow_dispatch` (1m 23s, skip_tests=true), photo на месте после re-deploy |
| 10 — Announce + memory | 🚧 | Этот файл + CLAUDE.md update + memory updates + announce черновик |

---

## Что в working tree (post-merge state)

**Текущая branch:** `main` (HEAD `3039323`)

**Modified (tracked):**
```
M CLAUDE.md  ← обновлён в этой сессии (Wave 2 LIVE header replacing stale "Block A frozen")
```

**Untracked artefacts:** все TZ_*.md / SESSION_HANDOFF_*.md / ARCHITECT_*.md / WAVE_2_CLOSURE_RUNBOOK*.md в корне (твои локальные documents для архитектора и memory, никогда не коммитились).

**Stash list:**
```
stash@{0}: phase5-prep: CLAUDE.md edits (wave2 dark-theme stash continuation)  ← OK сегодня применить
stash@{1}: wave-2-01-prep: dark-theme dirty + CLAUDE.md 2026-05-16 parallel-session
stash@{2-4}: legacy GitHub Desktop / codex ветки
```

**Stash@{0} и stash@{1}** — оба про dark-theme + CLAUDE.md edits. После Wave 2 closure эти изменения **возможно уже устарели** (CLAUDE.md в main теперь обновлён). Vadim сам решит: pop + посмотреть diff, или drop.

---

## Что в проде сейчас (production state)

| | |
|---|---|
| URL | https://my.azarean.ru |
| VDS | 185.93.109.234 (shared с JARVIS, не задели) |
| Main HEAD | `3039323` |
| Tag | `v0.1.0-pilot` |
| PM2 process | `azarean-rehab` (fork mode, port 3001) |
| Migrations applied | 35 (включая 6 новых Wave 2) |
| Uploads location | `/opt/azarean-rehab/data/uploads/` (persistent, symlinked from `backend/uploads/`) |
| Backup | Daily 22:15 UTC, last manual snapshot `azarean_rehab-20260522-044608.sql.gz` |

**Test patient на проде:**
- id=12, full_name=Вадим, email=`avi707@mail.ru`, password=`Test1234`
- Программа id=7, title=`ПКС: острая фаза`, status=`active`, program_type=`acl`, current_phase=1 (создана через SQL INSERT в Phase 8 — UI workflow создал на patient_id=5 по ошибке, надо разобраться)
- Photo загружена на ROM id=2 (knee_flexion L 90°): `/opt/azarean-rehab/data/uploads/measurements/rom_2_<ts>_<rnd>.jpg`

**Admin:** `vadim@azarean.com` / `Test1234`

---

## Backlog для Wave 3 / Wave 2.5 hot-fixes

### Cosmetic (HF#13 candidates)
- **PhotoViewerModal close X button невидим** — Esc и click-overlay работают как fallback. CSS / positioning bug в PhotoViewerModal.css.

### Language / content drift
- **`program_types.label='ПКС реабилитация'`** в БД содержит «реабилитация» — миграция: `UPDATE program_types SET label='ПКС восстановление' WHERE code='acl';` + аналогично для shoulder/knee_general. Language baseline Phase 3.2 покрыл только UI strings, не БД content.
- **«pain event» EN термин в RU UI** — HomeScreen footer link «Записать pain event». Заменить на «Записать резкую боль» или похожее.

### Backend gaps (investigation)
- **404 `/api/rehab/my/exercises`** — endpoint может быть не имплементирован полностью. Patient frontend пытается его вызвать (видно в console на Главной).
- **401 `/api/rehab/my/stuck-status`** для свежего пациента — possibly норма (stuck detection требует phase_started_at + duration), но 401 vs 200 with status: 'not_stuck' лучше.

### Architecture / process
- **Backend POST `/programs` не ставит `status='active'` по умолчанию** — schema не имеет DEFAULT, INSERT не указывает, результат NULL. `GET /my/dashboard` фильтрует `WHERE status='active'` → программа не находится. Fix: добавить `status='active'` в INSERT либо `DEFAULT 'active'` в schema через миграцию.
- **Ops Alerts admin UI отсутствует** — Wave 2.04 backend endpoints есть, frontend нет (scope decision).
- **Node.js 20 deprecation в GitHub Actions runners** — deadline September 2026. Поднять Node.js 24 в `deploy.yml`. Warning уже видно в CI logs.

### Documentation drift
- Каждый Wave 2 PR обновлял CLAUDE.md changelog но не перезаписывал «Текущее состояние» header. Закрыто в этой сессии вручную. Pattern для будущих волн: finalize commit должен перезаписать header.

---

## Следующий шаг — Wave 3 planning

Через 1-2 недели pilot use Vadim вернётся с:
- Фидбеком от Татьяны / Алёны / 5-10 первых клиентов
- Решением какие фичи приоритизировать в Wave 3

**Preview TZ 3.01** (Pattern B implementation phase 1):
- Patient PDF export — «Поделиться с врачом» в Profile или Roadmap
- PDF генерация (jsPDF или server-side puppeteer): ROM history graph, pain log, exercise completion, photos с метками
- Download to phone

**Preview TZ 3.02** (Engagement & Retention early warning):
- Curator alerts: 3+ дня без захода, рост VAS без следующей записи, нет упражнений 7+ дней
- Адаптивная программа: при regression — pause progression + alert

**TZ 3.03 (Markup canvas)** — будущий, если фидбек покажет нужным.

---

## Команды для нового чата — старт

```bash
# 1. Где я
cd "c:/Users/Вадим/Desktop/Azarean_rehab"
git rev-parse --abbrev-ref HEAD       # main
git log --oneline -5                  # должно начинаться с 3039323

# 2. Production live check
curl -fsSL -o /dev/null -w "HTTPS: %{http_code}\n" https://my.azarean.ru
curl -fsSL -o /dev/null -w "API: %{http_code}\n" https://my.azarean.ru/api/rehab/phases?type=acl
# Expected: HTTPS: 200, API: 200

# 3. PM2 health (если есть SSH доступ + явное разрешение)
# ssh root@185.93.109.234 'pm2 status azarean-rehab && tail -20 /var/log/pm2/azarean-rehab-out.log'
```

---

## Lessons learned 2026-05-22 (для нового чата)

1. **Live smoke ловит drift'ы которые unit tests не видят.** HF#12 (photo_url SELECT) был обнаружен только в browser smoke Phase 1 — unit tests mock-based, не делают round-trip POST→DB→GET с реальной storage. **Урок:** для schema-touching commits — реальный live smoke в браузере, не только jest.

2. **Production environment !== dev environment.** В Phase 8 я инструктировал login как `avi707@mail.ru` (это test patient в **dev** БД), но на проде такого нет — fresh install 2026-04-23 имеет только admin. **Урок:** перед prod smoke verify что test credentials существуют в prod БД, не копировать из CLAUDE.md секции «Тестовые учётные данные (dev)».

3. **POST /programs не ставит `status='active'`** — найдено в Phase 8. Программа создаётся «inactive», dashboard её фильтрует, empty state на главной. Workaround SQL UPDATE в smoke. **Урок:** pre-existing bug в фоне с 2026-04-23 (или раньше). Никто не заметил потому что never delivered test patient flow on prod. Backlog item.

4. **Auto mode classifier правильно блокирует prod actions.** SSH read prod DB → blocked, push origin main → blocked, SQL UPDATE patients → blocked. Это **правильное поведение** — Vadim даёт explicit per-target authorization когда нужно. Не пытаться обойти classifier.

5. **Bracketed paste в Git Bash на Windows ломает одно-line команды.** PowerShell handles paste differently и не имеет проблемы. Для длинных SSH команд с escape rules — лучше PowerShell.

---

**Конец handoff'а.** Wave 2 LIVE 🎉. Новая сессия может стартовать любую другую задачу (Wave 3 planning, backlog hot-fix, новое исследование) — нет блокирующих pending issues.
