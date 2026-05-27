# Azarean Rehab — Memory Rules (Extended)

**Last updated:** 2026-05-26 (Wave 3 command-center backend C1–C4 closed — definitions/canons added)
**Source of truth:** этот файл. Memory entries — derivative/dynamic.

> ⚠️ **Stale-doc warning:** `CLAUDE.md` header («20 таблиц, 16 миграций») УСТАРЕЛ. Реально ≈45 таблиц / 35+ миграций (Wave 2 closure 2026-05-22 + новые таблицы ops_alerts/phase_stuck_alerts/program_types/patient_invite_codes/streak_days/measurements). Источник истины по схеме = **живая dev-БД / recon**, НЕ CLAUDE.md inventory. Перед написанием агрегатного SQL — recon, не память (класс бага 175% жил именно в ненагрунтованной агрегации).

---

## Как обновлять

1. Architect генерирует updated версию как artifact
2. Vadim скачивает + uploads в project files (заменяет)
3. Следующий chat видит обновлённую версию
4. Memory tool НЕ используется для durable rules

---

## Содержание

1. [Process rules](#1-process-rules)
2. [Database & schema rules](#2-database--schema-rules)
3. [UI & CSS conventions](#3-ui--css-conventions)
4. [Backend reusables & patterns](#4-backend-reusables--patterns)
5. [Frontend conventions + reusable wrappers](#5-frontend-conventions)
6. [Block C (measurements) specifics](#6-block-c-measurements-specifics)
7. [Cross-cutting architectural commitments](#7-cross-cutting-architectural-commitments)
8. [Deployment architecture (verified)](#8-deployment-architecture)
9. [Wave 3 — Owner command center: definitions & canons](#9-wave-3-owner-command-center)

---

## 1. Process rules

### Rule #15 — Verify-step output в commit reports

Каждый commit report (schema): `psql \d <table>` + `pg_get_constraintdef` dump.

### Rule #21 — НЕ ПИЗДЕТЬ

Декларация = tool call в том же turn. Не делаешь — говори прямо.

### Rule #23 — Architect-executor workflow

Per-commit feedback loop. NO batching. Vadim → **Claude Code (VS Code extension, Windows)**, НЕ Cursor.

### Meta-rule — Copy existing repo patterns (drift #26)

`grep -rn` для analog ДО написания. "Improving" чужой pattern = drift.

### Meta-rule — TZ Convention Compliance (drift #28, расширено drift #33)

**Правило:** перед submission **любого generated document** (TZ, runbook, plan, RFC, ops checklist):

1. **Search project_knowledge / recon BEFORE writing**. НЕ из памяти.
   - TZ: grep repo patterns
   - Runbooks: **READ actual deploy scripts, nginx configs, CI/CD workflows, PM2 configs**
   - **Агрегаты/aggregation SQL: recon живой схемы + существующих запросов ДО написания** (Wave 3 lesson: 175% и sessions_last_week — оба от ненагрунтованной агрегации).
   - Drift #33 lesson: написал runbook v1 угадывая deploy method, nginx config, migration script — все три неправильно. Source-of-truth files в репо были, я их не открыл.

2. **Cite** rules в Verify-step section. Список = architect signature.

3. **Verify** proposal против rules ДО implementation секции.

4. Применимо ВСЕМ: directory layout (#25), API namespacing (#25), modals (section 5 catalog + #29), DB fields (#19), backend response shape (drift #31), Pattern B (section 7), deployment / nginx / CI / migrations (section 8), **дисциплина размерностей (#34), logAudit (#35), command-center каноны (section 9)**.

---

## 2. Database & schema rules

### Rule #16 — Array CHECK через COALESCE
`CHECK (COALESCE(array_length(arr, 1), 0) > 0)`

### Rule #19 — Pain schema
`pain_entries`: `notes` (NOT `free_text`), `vas_score` NOT NULL 0..10, `pain_character` TEXT[], `trigger_type` VARCHAR enum 8. UNIQUE `(patient_id, entry_date) WHERE is_event=false` → SELECT FOR UPDATE. + `red_flag_triggered` boolean (индекс `idx_pain_red_flag WHERE true`), `ops_alert_sent_at`.

### Rule #27 — Timezone
Backend: `SELECT date_col::text`. Frontend today: `getFullYear/Month/Date` local.

### Rule #30 — BIGINT для client-generated IDs
`INTEGER` int4 max 2.15B. Unix millis 13 digits → overflow. Используй `BIGINT` или `UUID`. (`progress_logs.session_id` = BIGINT client millis.)

### Rule #34 — Дисциплина размерностей (anti-175%) ⚠️ high-impact

- **Сессия = `COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)`.** НИКОГДА `COUNT(progress_logs.id)` (это строки-упражнения, не тренировки).
- **Никогда не смешивать размерности** в числителе/знаменателе: сессии/слоты-упражнений, дни/сессии. Числитель и знаменатель — в одной единице.
- Известные баги этого класса: `/dashboard/stats` «Выполнение 175%» (completed logs ÷ complex_exercise slots); `patients.js` `sessions_last_week` (`COUNT(pl.id)`).
- Любой новый агрегат, трогающий progress → DISTINCT session_id **+ обязательный regression-тест** «N сессий, а не M строк».
- Свежесть/активность — day-grained (`streaks`/`streak_days`). Адхеренс/объём — session-grained (`progress_logs`). Две метрики — две размерности, не пересекаются.

---

## 3. UI & CSS conventions

### Rule #20 — CSS Modules
Alias `s`. After migration — `grep -rEn 'className=["\047]\w+(-\w+)+["\047]' frontend/src/` для orphans. `pd-*` = legitimate global.

### Rule #28 — CSS specificity hover guard
`.chip:hover:not(:disabled):not(.--selected)` — без guard hover (0,2,0) перекрашивает .--selected (0,1,0).

### Rule #29 — Z-index
Toast 10000 / все modals 9000. Новые modals = 9000.

---

## 4. Backend reusables

### Rule #17
`utils/opsAlert.js` `sendOpsAlert()`. `services/telegramBot.js` `getBot()`. Env `OPS_BOT_TOKEN` + `OPS_CHAT_ID = 183943760`. Patient: `req.patient.id` из `middleware/patientAuth.js`. Admin: `requireAdmin` в `middleware/auth.js` (re-exported). Admin routes — `router.use(authenticateToken, requireAdmin)` glob (admin.js:10).

### Rule #35 — logAudit сигнатура ⚠️ drift-trap

Реальная сигнатура (`utils/audit.js:24`):
```js
logAudit(req, action, entityType, entityId, options = {})
// options деструктурится ТОЛЬКО как { patientId = null, details = {} }
```
- `action` — UPPERCASE, **без CHECK-enum** (новый verb допустим без миграции, напр. `PATIENT_REASSIGNED`).
- ⚠️ **Грабли:** flat-ключи в 5-м аргументе **молча теряются** (не попадают в `audit_logs.details`). ВСЕГДА заворачивать payload: `logAudit(req,'VERB','entity',id,{ details:{...}, patientId? })`.
- Баг этого вида был в `admin.js` RESOLVE (`{ resolution_notes }` плоско → терялось; fixed коммит `980a7f5` → `{ details:{ resolution_notes } }`). Pending hygiene: `grep -rn "logAudit" backend/` — проверить все вызовы на flat-keys / отсутствие `details:` обёртки.

---

## 5. Frontend conventions + known reusable wrappers

### Rule #25 — PatientDashboard conventions ⚠️ high-drift

- Reusable UI → `components/ui/`
- Screens → `components/` (NOT `screens/`)
- API: **flat exports** под `rehab` (`rehab.postRomMeasurement`)
- Context: `context/` (singular), `usePatientAuth` + `useToast`
- `ChipGroup` prop `selected` (NOT `value`)
- `useEffect` deps НЕ context functions → `useCallback`

### Known reusable wrappers ⭐ catalog

| Wrapper | Use case | Source |
|---|---|---|
| `PatientModal` | Все patient modals — wrap | #32 TZ 2.09 |
| `DiaryPhotoTile` blob fetch | Photo display — blob + revoke | #29 TZ 2.09 |
| `uploadDiaryPhoto` pattern | Caller builds FormData | #30 TZ 2.09 |
| `usePatientAuth`, `useToast` | Standard hooks | general |
| `ChipGroup`, `PainScale`, `Card` | UI building blocks | Rule #25 |

**Verify-step команды:**
```bash
grep -rEn "PatientModal|Modal\.js|Dialog\.js|Overlay" frontend/src/components/
grep -rn "FormData\|multipart\|uploadDiary\|uploadRom" frontend/src/
grep -rEn "^export (default )?function use[A-Z]" frontend/src/
grep -rEn "^(rehab|patientApi)\.[a-z]" frontend/src/services/
```

> Админ-фронт (роль admin/instructor) живёт отдельно от PatientDashboard. Главная admin/instructor = общий `Dashboard.js` (default-ветка), admin-пункты гейтятся `role==='admin'`. Командный центр (Wave 3 C5) строится здесь.

---

## 6. Block C (measurements) specifics

### Rule #22 — Photo storage

- Local disk: `/opt/azarean-rehab/backend/uploads/measurements/` (multer runtime mkdirSync — как avatars/, diary_photos/)
- ⚠️ **CRITICAL BUG `bug_avatar_lost_on_deploy.md`** — uploads/ переезжает при atomic swap, фотки теряются между deploys. **Fix**: symlink `backend/uploads` → `/opt/azarean-rehab/data/uploads` (persistent dir вне APP_DIR/backend/). Fixed в deploy.yml (Wave 2 closure Phase 3.3, коммит `a59be41`).
- 152-ФЗ RU, NetAngels, rsync backup
- sharp 1200px max, JPEG q=80
- JWT-only, separate AI consent UI

**Real mount paths:**
- `POST /api/patient-auth/photo-consent` + `requireSameOrigin` CSRF
- `POST /api/rehab/my/rom/:id/photo` multipart
- `GET /api/rehab/my/rom/:id/photo` JWT stream (blob)
- `GET /api/patient-auth/me` returns `photo_consent_at`

---

## 7. Cross-cutting architectural commitments

### Pattern B — Patient-driven data sharing

Locked 2026-05-19. Пациент = owner данных. Передача третьим лицам через пациента, не системой.

**НЕ:** surgeon аккаунты, авто отчёты хирургам, third-party data push, surgeon consent при onboarding.

**Да:** PDF export по запросу, опционально view-only URL короткого TTL, опционально QR-код. Red flag alerts → пациент + куратор (Vadim через opsAlert), эскалация manual через куратора.

Wave 3.1: ~~Surgeon bridge~~ → **Patient export & share tool**.

### Pilot vs public launch

**Pilot (текущий):** ~5-10 студийных клиентов + команда, доступ по приглашению, минимальный disclaimer.

**Public (отдельный track):** open registration, full ToS/PP/152-ФЗ pack, language norms strict, REGULATORY_GAP.md closed.

Принцип: проектные решения учитывают future public, но не блокируются compliance gates. Качество и функционал — в приоритете.

### Калибровочные пороги — под pilot-данные, не угадывать

Все числовые пороги командного центра (cadence-сегменты, 60% адхеренс, тренд-дельты) — **именованные константы**, калибруются на реальном поведении пилота, а не зашитая магия. Менять по data, не по предположению.

---

## 8. Deployment architecture (verified)

**Verified 2026-05-19 from 4 source files:** `.github/workflows/deploy.yml`, `deploy/migrate.sh`, `deploy/nginx-my-azarean.conf`, `deploy/ecosystem.config.js`. Wave 2 LIVE на `my.azarean.ru` с 2026-05-22 (тег `v0.1.0-pilot`).

### Domain layout

**Single subdomain `my.azarean.ru`** — frontend + `/api/*` proxy на одном origin (no CORS).

Все остальные subdomains — JARVIS-related:
- `jarvis.azarean.ru` (admin), `api.azarean.ru` (JARVIS proxy), `diag.azarean.ru` (PWA), `rehab.azarean.ru` (landing)

**НЕ создавать новые subdomains** для Azarean Rehab. Всё через my.azarean.ru.

### VDS paths

```
/opt/azarean-rehab/           ← APP_DIR
├── backend/                  ← Atomic swap target (заменяется при deploy)
│   ├── server.js             ← PM2 entry
│   ├── uploads/              ← symlink → /opt/azarean-rehab/data/uploads
│   └── .env                  ← Preserved across deploys (cp before swap)
├── frontend/                 ← Atomic swap target
│   └── build/                ← Static, nginx serves
├── deploy/                   ← Atomic swap target
│   ├── migrate.sh
│   ├── ecosystem.config.js
│   └── nginx-my-azarean.conf
├── releases/                 ← Tarball extracts, keep last 5
├── backend.old.<ts>/         ← Keep last 2
├── frontend.old.<ts>/        ← Keep last 2
└── data/                     ← Persistent (НЕ трогается deploy)
    └── uploads/              ← Symlinked from backend/uploads (FIX для bug_avatar_lost_on_deploy)
```

### PM2

- **Process name:** `azarean-rehab` (НЕ `azarean-rehab-backend`)
- **exec_mode:** fork (cluster ломает ESM + long-polling Telegram)
- **node_args:** `--dns-result-order=ipv4first` (IPv6 отключён на VDS)
- **PORT:** 3001 (env override в ecosystem.config.js)
- **max_memory_restart:** 512M
- **Logs:** `/var/log/pm2/azarean-rehab-{error,out}.log`

### Deploy method — GitHub Actions

`.github/workflows/deploy.yml`:
- Trigger: `push` to main OR `workflow_dispatch` (manual с skip_tests input для hotfix)
- Concurrency: `deploy-production` + `cancel-in-progress: false` (параллельные deploys ждут в очереди)
- Pipeline: test → build (frontend `REACT_APP_API_URL=''` single-origin) → pack tarball → SCP к VDS → atomic swap (preserves .env) → `npm ci --omit=dev` → `bash deploy/migrate.sh` → `pm2 reload azarean-rehab --update-env` → cleanup (5 releases / 2 .old.*) → smoke (`curl https://my.azarean.ru/` + `/api/rehab/phases?type=acl`)
- Secrets needed: `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`
- **`.env` ставится вручную на VDS** через SSH, НЕ через CI

### Migration script

`deploy/migrate.sh` — checksum tracking:
- Table `_migrations(filename PK, applied_at, checksum SHA-256)`
- Bootstrap: legacy migrations → NULL checksum на первом run, fixed на втором
- Auto-applies schema.sql если `users` table отсутствует
- Auto-applies `seeds/acl_phases.sql` если `rehab_phases WHERE program_type='acl'` count=0
- Each migration в `--single-transaction`
- **Checksum mismatch → exit 1.** Политика: миграции после apply immutable (нет редактирования, только новая миграция для fix)
- Reads только `DB_*` из `.env` (не путать с `DATABASE_URL`)
- Supports local test: `APP_DIR=/path/to/local bash deploy/migrate.sh`

### Nginx (single-origin)

`deploy/nginx-my-azarean.conf` → `/etc/nginx/sites-available/my.azarean.ru`:
- ОДИН server block обслуживает `/` (static frontend) + `/api/*` (proxy `127.0.0.1:3001`)
- `client_max_body_size 12M` (12, не 10 — sharp сожмёт обратно ~500KB-1MB)
- SPA fallback: `try_files $uri $uri/ /index.html` + `Cache-Control: no-cache` для HTML
- `/static/` → 1 год immutable
- Security headers: X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin
- `Permissions-Policy: camera=(self), microphone=(), geolocation=()` — **камера разрешена** для photo capture
- Proxy timeouts: connect 10s, send/read 120s (photo upload)
- WebSocket upgrade headers есть (future)
- `location ~ /\.(?!well-known).* { deny all; }` — блок dotfiles кроме acme-challenge

**Bootstrap:** :80 server block содержит всё. `certbot --nginx --redirect -d my.azarean.ru` добавляет :443 ssl http2 block + переписывает :80 на redirect.

### Known deployment bugs

1. **`bug_avatar_lost_on_deploy.md`** — uploads/ переезжает при swap → теряются avatars + diary_photos + measurements фотки. **Fixed:** symlink `backend/uploads` → `/opt/azarean-rehab/data/uploads` (Wave 2 closure Phase 3.3).

### Backup infrastructure (active since 2026-04-23)

- **Script:** `deploy/backup.sh` (в репо, deployed на VDS как часть `deploy/`)
- **Cron:** `/etc/cron.d/azarean-rehab-backup` — runs **22:15 UTC** (= 01:15 МСК) daily
- **Rotation:** 14 дней
- **Manual invocation:** `sudo bash /opt/azarean-rehab/deploy/backup.sh` для pre-deploy snapshot
- **НЕ дублировать install** в runbook'ах (cron уже стоит). Только verify в Pre-flight и manual snapshot перед critical deploys.

### When writing deploy-related document

Architect MUST read these 4 files BEFORE writing:
- `.github/workflows/deploy.yml`
- `deploy/migrate.sh`
- `deploy/nginx-my-azarean.conf` (или `/etc/nginx/sites-available/my.azarean.ru` на VDS)
- `deploy/ecosystem.config.js`

Без этого drift гарантирован (#33 lesson).

---

## 9. Wave 3 — Owner command center

Бэкенд закрыт 2026-05-26 (C1–C4, ветка `wave-3/owner-command-center`). Ниже — durable определения и каноны. Полный API-контракт endpoint'ов — отдельный документ (`WAVE_3_COMMAND_CENTER_API_CONTRACT.md`).

### Assigned instructor (C1)

- `patients.assigned_instructor_id` = **текущий ответственный** (≠ `created_by` = «кто завёл»).
- Backfill: `COALESCE(последний активный complexes.instructor_id, created_by)`.
- Автозаполнение: при создании комплекса (`routes/complexes.js` POST), только если `assigned_instructor_id IS NULL` (не перезаписывать).
- Передача: `PATCH /api/patients/:id/assign-instructor` (admin-only) → UPDATE + `logAudit('PATIENT_REASSIGNED','patient',id,{ details:{from_user_id,to_user_id,reason} })`. **Отдельной history-таблицы нет** (через audit_logs).

### Cadence (C1)

- На `complexes`: `target_min` / `target_max` SMALLINT + `target_unit` VARCHAR(`day`|`week`).
- CHECK `chk_complexes_cadence`: либо все три NULL, либо все три заданы (min≥1, max≥min, unit∈{day,week}).
- NULL = «частота не задана» → не штрафуем, выносим в `no_target_set`.
- «Частота по фазам» — через подмену `rehab_programs.complex_id` при переходе фазы (новый комплекс несёт свою cadence). Отдельной per-phase структуры НЕТ.

### «Активен» / сегменты (C2, refined)

Cadence-relative, freshness из `streaks.last_activity_date`. `days_since = CURRENT_DATE - last_activity_date`.
```
expected_gap_days = unit='day' → 1 | 'week' → CEIL(7/target_min) | нет target → 7
ceiling_at_risk   = MAX(2*expected_gap_days, expected_gap_days + 3)   # пол против razor-thin daily
active   : days_since <= expected_gap_days
at_risk  : expected_gap_days < days_since <= ceiling_at_risk
dormant  : ceiling_at_risk < days_since <= 30
churned  : days_since > 30   (backstop, независимо от cadence)
grace    : нет активности (streaks нет) И program_age <= 7 → active (новый); иначе dormant
```
Сегментируются ТОЛЬКО онбордингованные (есть активная программа).

### «Соблюдает» / адхеренс (C2)

Session-grained, в окне периода:
```
units_in_window = window_days / (unit='day' ? 1 : 7)
expected_min    = target_min * units_in_window
adhering        = COUNT(DISTINCT session_id, completed, в окне) >= 0.6 * expected_min
```
- Порог `0.6` от **нижней границы** диапазона (калибровочная ручка).
- `target_min IS NULL` → не adhering, идёт в `no_target_set` (не штраф).

### Динамика (C4) — 3 оси РАЗДЕЛЬНО, не схлопывать

- Метод: halving (первая половина окна vs вторая), границы closed-open, midpoint = `today - floor(window/2 - ?)`.
- **Боль:** `diary_entries.pain_level` (NOT `pain_entries` — то red flags/SOS). improving если падает на ≥ `PAIN_DELTA_THRESHOLD` (0.5).
- **Приверженность:** session-rate per половина. improving/worsening по `ADHERENCE_RATIO_HI/LO` (1.2 / 0.8).
- **Фазы:** current-state `on_track`/`stalled` (stalled = `phase_stuck_alerts` unresolved). **Истории переходов НЕТ** — `phase_transitions` table = upgrade-path post-pilot, если пилот покажет нужду.
- **Конфликт:** боль↑ И приверженность↑ → `overtraining_candidate` (additive, НЕ вычитается из осей). Это first-class сигнал, не взаимозачёт.
- `MIN_DIARY_POINTS` (2) в каждой половине, иначе `insufficient_data` (честная корзина, НЕ stable).
- Все пороги — именованные константы вверху файла, под pilot-калибровку.

### Каноны (использовать дословно)

- **Активная программа:** `rp.is_active = true AND rp.status = 'active'` (5 callsites в rehab.js). Несколько → `DISTINCT ON (patient_id) ... ORDER BY created_at DESC` (как app's LIMIT 1). `status` имеет DEFAULT 'active' (миграция `20260210`).
- **«Без ответа»:** derived. Последнее сообщение активной программы (`DISTINCT ON (program_id) ORDER BY created_at DESC`), `sender_type='patient'`, исключая `message_kind='system_alert'`. ⚠️ `is_read` ≠ «отвечено» (ставится при открытии ленты GET'ом, не при ответе). `sender_id` полиморфный (patient.id ИЛИ users.id), **FK нет** → JOIN не нужен для счёта.
- **Streaks:** `streak_days` = append-only журнал (source ∈ {progress, diary}; mini/manual зарезервированы, не вызываются), upsert через `updateStreak()` из 3 точек (progress.js:96, rehab.js:846, telegramBot.js:533). `streaks` = materialized cache. `getStreakSummary(patientId)` — **per-patient only**, set-based нет. streak_pick tie-breaker: `ORDER BY current_streak DESC NULLS LAST, updated_at DESC`.

### ops_alerts / phase_stuck_alerts (read для Слоя 0)

- **`ops_alerts`** — таблица существует. Генератор `triggerRedFlagAlert` (rehab.js, на pain red-flag). `GET /api/admin/ops-alerts` (filters: resolved/alert_type/severity/patient_id, limit default 50 / max 200) + `PUT /:id/resolve` существуют. `severity` ∈ {low, medium, high, critical}. JOIN `pain_entries` для vas_score/notes.
- **`phase_stuck_alerts`** — колонки: `id, program_id, phase_number, threshold_level, detected_at` (НЕ created_at), `resolved_at, notified_instructor, notified_at`. Генератор cron `services/stuckDetection.js` (пн 09:00 МСК). EXISTS-агрегат `is_stuck_on_phase` (patients.js:29-35, с каноном активной программы + `resolved_at IS NULL`).
- **`phase_transition_criteria` / `patient_criterion_answers`** — **НЕЗАВЕРШЕНО** (0 ответов, read-логики нет). «Готов к переходу фазы» как сигнал НЕДОСТУПЕН — не обещать.

### Endpoints (admin-only, glob `router.use(authenticateToken, requireAdmin)`)

- `GET /api/admin/command-center` — воронка + сегменты + адхеренс. `?period=&instructor_id=`
- `GET /api/admin/command-center/instructors` — срез по `assigned_instructor_id`
- `GET /api/admin/command-center/attention` — лента Слоя 0 (ops_alerts + phase_stuck unified)
- `GET /api/admin/command-center/dynamics` — 3 оси трендов
- `PATCH /api/patients/:id/assign-instructor` — передача (C1)

Период влияет ТОЛЬКО на адхеренс-окно и динамику; воронка-этапы 1–4 и сегменты — current-state. `all` → окно 30 дней (sane default).

---

## Changelog

| Date | Change |
|---|---|
| 2026-05-19 evening | Initial extraction: 13 rules + meta copy-existing |
| 2026-05-19 post-2.08 | Meta-rule TZ-COMPLIANCE (drift #28) |
| 2026-05-19 post-2.09 | Section 5 catalog (#29/#30/#32), backend-response sub-rule (#31) |
| 2026-05-19 closure plan | Section 7 (Pattern B + pilot posture), Rule #23 IDE fix |
| 2026-05-19 post-runbook v1 | Section 8 placeholder added (drift #33), TZ-COMPLIANCE extended to ops docs |
| 2026-05-19 post-source-files | Section 8 verified with real data from 4 source files |
| 2026-05-19 post-backup-confirmation | Section 8 "Backup infrastructure" subsection added |
| **2026-05-26 Wave 3 C1–C4 closed** | **Stale-doc warning (CLAUDE.md). Rule #34 (dimension discipline / anti-175%). Rule #35 (logAudit signature + flat-key trap). Section 9 (command-center definitions: assigned_instructor, cadence, активен/соблюдает/динамика + каноны активная-программа/без-ответа/streaks + ops_alerts/phase_stuck/criteria status). §7 калибровочные пороги. §2 #19 red_flag fields. §5 admin-front note.** |

---

*Generated by Claude Opus 4.7 — 2026-05-26. Source of truth для durable rules.*
