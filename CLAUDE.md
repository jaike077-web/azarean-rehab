# Azarean Rehab

Платформа реабилитации для физиотерапевтической студии **Azarean Network** (Екатеринбург).
Создание персонализированных комплексов упражнений, отслеживание прогресса пациентов, программы реабилитации (плечо, колено), Telegram-бот.

## Текущее состояние (апрель 2026)

### В production (задеплоено 2026-04-23)
- **URL:** https://my.azarean.ru (VDS 185.93.109.234, shared с JARVIS)
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`) — push на main → Test → Build → Deploy (SSH)
- **Backend:** PM2 fork mode на :3001, nginx proxy, Let's Encrypt SSL
- **Prod bot:** `@az_zari_bot` (отдельный от dev `@azarean_rehab_bot`)
- **Админ:** `vadim@azarean.com` / `Test1234` (bcrypt хэш применён к prod БД)
- **Runbook:** `deploy/README.md`, credentials locations — `memory/production_deployment.md`
- **Smoke test 7.1–7.3:** HTTPS, API, SPA — green. **7.4+ (instructor login)** — не верифицировано в чате из-за image limit.

### Завершено
- **Security audit:** все 3 CRITICAL + все HIGH закрыты (см. «Завершённые исправления» ниже)
- **API response format** стандартизирован: `{ data, message? }` во всех 13 роут-файлах
- **ExerciseRunner v3** — CSS 1:1 порт из iOS-эталона (**LOCKED**, см. секцию ниже)
- **Patient auth:** httpOnly cookie (SameSite=Lax), CSRF через Origin-check middleware
- **Public token flow** полностью удалён (complexes.access_token дропнут, /patient/:token — нет)
- **Telegram бот:** /start, /status, /diary (6-step wizard), /tip, cron-scheduler
- **PatientDashboard v12 redesign:** все 6 экранов (Home, Diary, Exercises, Roadmap, Profile, Contact) в стиле meltano+Яндекс. ExerciseRunner LOCKED
- **Session 2 tech debt (2026-04-22):** bugs #2, #3, #4, #5, #8 закрыты. validators частично подключены, GDPR audit logging на READ
- **Prod smoke-test session (2026-04-24):** schema drift recovery (20260424_prod_schema_recovery + 20260424b), Kinescope SAVEPOINT-импорт, exercises limit 50→1000, double-avatar/курator chip убраны, PWA auto-update при возврате ≥60 сек, **ToastContext useMemo** (без него toast.xxx() размонтировывал consumer'ов — ExerciseRunner кидало на hero-экран после submit)
- **Phase 1 invite-code flow (2026-04-27):** инструктор генерирует 8-символьный код через `POST /api/patients/:id/invite-code`, пациент вводит на `/patient-register` (поле `invite_code` обязательно). Закрывает архитектурный gap «self-registered пациент с created_by=NULL невидим инструктору». [InviteCodeModal](frontend/src/components/InviteCodeModal.js) с copy-to-clipboard и t.me/share. Миграция `20260427_patient_invite_codes.sql`.
- **Phase 2a phone normalizer (2026-04-27):** `backend/utils/phone.js` приводит к E.164 (+CCXXXX). routes/patients.js POST/PUT и patientAuth.js POST /register + PUT /me нормализуют перед записью. Миграция `20260427_normalize_patient_phones.sql` бэкфилла существующих записей. Фундамент для phone-match при OAuth.
- **Phase 2b/c Telegram OIDC через прокси (2026-04-28):** `BotFather → Login Widget → Switch to OpenID Connect Login` для @az_zari_bot. Backend через `openid-client@6` с `customFetch` (X-Proxy-Secret header) ходит на **финский reverse-proxy** `https://tg-proxy.azarean.ru` (поднят JARVIS-Director'ом на 78.17.1.70, IP-allowlist только 185.93.109.234). Прокси whitelist'ит /.well-known/* и POST /token, переписывает endpoints в discovery JSON. Match-flow в callback'е: `provider_id` → silent autolink по phone → `/patient-register` с pre-fill. Миграции `20260427_oauth_pkce_nonce.sql`. Подробности — [memory/telegram_oidc_proxy.md](.claude/projects/.../memory/telegram_oidc_proxy.md).
- **Phase 2d Yandex OAuth 2.0 (2026-04-29, в проде):** [backend/services/yandexOauth.js](backend/services/yandexOauth.js) — Authorization Code Flow + PKCE S256. **БЕЗ OIDC** (Yandex не публикует `/.well-known/openid-configuration` → 404), **БЕЗ прокси** (oauth.yandex.ru и login.yandex.ru доступны с rehab-VDS напрямую). Чистый fetch на `oauth.yandex.ru/token`, userinfo через `GET login.yandex.ru/info` с `Authorization: OAuth <token>`. Scopes из Yandex Cabinet: `login:info login:email login:avatar login:default_phone` (последний критичен для phone-autolink). Match-flow идентичен Telegram'у. Все 3 сценария (returning / phone-autolink / unknown→register) проверены в проде. Коммит `7b19e9d`. Подробности — [memory/yandex_oauth_v2.md](.claude/projects/.../memory/yandex_oauth_v2.md).
- **CSS Modules миграция (2026-05-04, в проде с commit `c8834b5`):** 71 `.css` → `.module.css` через 8 push'ей (Push 1-8). Удалён `frontend/src/styles/common.css` (308-строчный «Duplicate Class Report» отчёт + 80+ дублей классов). Каждая страница и компонент scoped — class-имена hashed, нет cross-file конфликтов. **LOCKED НЕ ТРОНУТЫ:** ExerciseRunner (`.pd-runner` + `--az-*` iOS-палитра), все `pd-*` стили PatientDashboard. **Грабли (важно для будущих миграций):** CRA по умолчанию **НЕ конвертирует** dash-case в camelCase. Class в module.css `.foo-bar` доступен через `s['foo-bar']`, но **НЕ через `s.fooBar`**. Тесты с CSS Modules моками через Proxy (`(_, prop) => String(prop)`) НЕ ловят undefined — Proxy возвращает любой ключ. В реальном браузере `s.fooBar === undefined` → `className={undefined}` → класс не применяется → страница без стилей. Юзер увидел broken prod, фикс через переименование class definitions в 44 module.css из dash-case в camelCase (commit `c8834b5`). **Урок:** smoke в реальном браузере обязателен после CSS-миграций — не доверять только тестам и build OK. См. [memory/feedback_smoke_real_browser.md](.claude/projects/.../memory/feedback_smoke_real_browser.md).
- **Wave 0 — все 6 PR смерджены в main (2026-05-11, пакетный squash-merge) + prod-smoke (2026-05-12):** PR #45-#50 закрыты в main как чистые squash-коммиты `b699271` → `f368c97` → `cd274c2` → `97b569f` → `200cdfc` → `12a90ad`. Backend 338/338 (+45 тестов от 293), frontend 236/236 (+27 от 209). 2 миграции (`20260508_streak_days`, `20260508_messages_extend`), обе идемпотентны. Закрыты Bug #11 (стрик) и Bug #12 частично (program_label в HomeScreen — RoadmapScreen и telegramBot остаются для Волны 1). **Prod-smoke 5/6 ✅:** hero label, дневник→отчёт, связь с превью, accordion, stuck banner — все проходят. «Стрик 0/7» и «hero просто Фаза 1» оказались не багами — by-design для нового пациента / unknown диагноза. **5 P3 багов вскрыты в prod-smoke 2026-05-12** (НЕ Wave 0): B1 avatar 404 spam — закрыт `55a3205`; B2 ExerciseModal не подгружал обогащённые поля — закрыт `b478977`; B3 dark-theme на CreateComplex/EditExerciseModal/EditComplex/EditTemplate inputs — закрыт `631017e`; B6 partial dark-theme на Exercises библиотеке + ExerciseModal inputs — закрыт `e8fcd0f`. **Бонус-фикс:** `455f731` — модальные стили в RehabProgramModal/InviteCodeModal восстановлены (последствие CSS Modules миграции 2026-05-04 — стили жили в удалённом common.css). **Открытые баги после prod-smoke в backlog:** #13 (Комплекс #N в селекторе), #14 (is_registered с OAuth), #15 (MDEditor + global input dark-theme — нужен дизайн-spec). Полная сводка — [memory/wave_0_complete.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_0_complete.md).
- **Design tokens + Dark theme (2026-05-04, частично — палитра в проде с `1979cee`, ThemeContext с `152314e`, дизайн-палитра архитектора локально, не запушено):** [frontend/src/styles/tokens.css](frontend/src/styles/tokens.css) с `--color-bg/surface/surface-2/surface-3/border/text/text-muted/text-subtle/primary/...`. Dark тема через `[data-theme='dark']` override + `@media (prefers-color-scheme: dark) :root:not([data-theme])` для system fallback. [ThemeContext](frontend/src/context/ThemeContext.js) с persist в localStorage `azarean_theme`. ThemeToggle — одна круглая кнопка Sun/Moon в headerRight Dashboard'а инструктора + sidebar bottom + ProfileScreen пациента. **Архитектор-ревью 2026-05-04:** первая версия dark theme (Push 9-11) была наивной инверсией → юзер видел white-on-white в hero/stat-cards. Применена правильная палитра slate-indigo (4 уровня глубины `#0a0e1a → #131a2c → #1c2540 → #283156`, текст `#e7eaf3`, primary `#818cf8` светлее indigo для контраста). Active nav item — full-fill `var(--color-primary)` + white text (XrayUI-паттерн). PatientProgress text contrast пофиксен.

### Планируется (не начато)
- **PATIENT UX ROADMAP v2 (canonical, 2026-05-08)** → [PATIENT_UX_ROADMAP_2026-05-08_v2.md](PATIENT_UX_ROADMAP_2026-05-08_v2.md) — **источник правды по всем UI/UX-работам на ближайшие 4-6 недель**. 4 волны + Star Tracker трек, 135-180 ч кода. Закрывает 12 пробелов в ЛК пациента (фазы только под ACL, шаблонов нет, стрик сломан, дневник скудный, multi-complex нет, ROM/отёк скудные). Следующий шаг — executable план Wave 0 (6 атомарных коммитов) от архитектора в формате 6 отдельных `TZ_WAVE_0_NN_*.md` + INDEX. До завершения волн отложен post-UI/UX backlog от архитектора (8 задач, см. [memory/project_post_ui_ux_backlog.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/project_post_ui_ux_backlog.md)).
- **Bot link-code login** как fallback к OAuth (когда oauth.telegram.org auto-redirect глючит — ~5-6 ч)
- Non-root deploy user на VDS + sudoers whitelist
- Healthcheck Telegram alerts
- `/api/health` endpoint
- ~~CSS Modules вместо глобальных стилей~~ — **ЗАВЕРШЕНО** 2026-05-04
- zod вместо express-validator
- 2FA через Telegram
- **Compliance legal position документ** (драфт под юриста, перед коммерческим маркетингом)
- **Revoke секретов опубликованных в чате** (OPS_BOT_TOKEN, YANDEX_SMTP_PASSWORD) перед запуском с живыми пациентами
- **Hardcoded «Татьяна» cleanup** — после того как `/api/rehab/my/dashboard` начнёт отдавать `instructor_name`

## Стек

- **Backend:** Express 5.1 + Node.js (CommonJS) + pg 8.16 (raw SQL, `query()` wrapper) + express-validator 7.3
- **Frontend:** React 19.2.0 + CRA (react-scripts 5.0) + JavaScript (нет TypeScript) + Axios 1.13 + @dnd-kit (drag-and-drop) + lucide-react 0.555 (иконки) + @uiw/react-md-editor 4.0.9 + react-router-dom 7.9.6
- **БД:** PostgreSQL 18 (dev)
- **Видео:** Kinescope API (хостинг ~1000 упражнений, thumbnail generation)
- **Интеграции:** node-telegram-bot-api 0.67, node-cron 4.2, multer 2.0 (аватары), sharp 0.34 (сжатие изображений)
- **Auth:** bcryptjs 3.0 (пароли), jsonwebtoken 9.0 (JWT), cookie-parser (httpOnly access+refresh cookies)
- **Security:** helmet 8.1 (headers), express-rate-limit 8.2 (5 req/15 min auth, general in production)
- **Тесты:** Jest 30.2 + Supertest 7.2 (269 backend + 209 frontend = 478 тестов)
- **Observability:** Telegram ops-bot (utils/opsAlert.js, /api/log-error endpoint) → @vadim_azarenkov. Sentry SDK подключён в noop без DSN (sentry.io ingest заблокирован для русских IP)
- **Runtime:** Node.js >= 20, nodemon 3.1 (dev)

## Запуск проекта

### 1. PostgreSQL

```bash
# Создать БД
psql -U postgres -c "CREATE DATABASE azarean_rehab;"

# Применить схему
psql -U postgres -d azarean_rehab -f backend/database/schema.sql

# Миграции (по порядку, всего 16)
psql -U postgres -d azarean_rehab -f backend/database/migrations/20240910_add_progress_session_columns.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20251224_add_rest_seconds.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20251225_add_kinescope_id.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260204_database_audit_fixes.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260204_security_updates.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260210_patient_auth.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260210_rehab_tables.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260211_add_complexes_title.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260211_extend_rehab_phases.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260212_telegram_bot.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260213_admin_panel.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260406_audit_schema_fixes.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260408_patient_lockout.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260408_hash_tokens.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260409_complexes_access_token_nullable.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260409_complexes_drop_access_token.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260421_patient_preferred_messenger.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260421_progress_difficulty_rpe10.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260421_diary_structured_fields.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260424_prod_schema_recovery.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260424b_exercises_description_nullable.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260427_patient_invite_codes.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260427_normalize_patient_phones.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260427_oauth_pkce_nonce.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260429_create_migrations_table.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260429_telegram_chat_id_numeric.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260508_streak_days.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260512_program_types.sql
psql -U postgres -d azarean_rehab -f backend/database/migrations/20260513_program_templates.sql
```

**20260424_prod_schema_recovery:** восстанавливает schema drift между dev и prod. Переименовывает `exercises.category`→`body_region` с миграцией данных, `exercises.difficulty`→`difficulty_level` (beginner=1, intermediate=3, advanced=5), дропает неиспользуемый `body_part`, добавляет `movement_pattern/chain_type/joint/is_unilateral` и `diagnoses.deleted_at/updated_at`. Полностью идемпотентна — на dev БД no-op.

**20260427_patient_invite_codes:** новая таблица `patient_invite_codes` (id, patient_id FK, code_hash SHA-256, expires_at, used_at, created_by). UNIQUE на code_hash, индекс на patient_id, partial индекс на expires_at WHERE used_at IS NULL.

**20260427_normalize_patient_phones:** бэкфилл существующих `patients.phone` в E.164. DO-блок применяет ту же логику что в `backend/utils/phone.js`. Идемпотентна (повторный прогон changed=0).

**20260427_oauth_pkce_nonce:** ALTER TABLE patient_oauth_states ADD COLUMN code_verifier VARCHAR(128), nonce VARCHAR(64). Нужны для PKCE S256 + OIDC nonce check в Telegram OAuth-flow.

**20260429_telegram_chat_id_numeric:** ALTER COLUMN `patients.telegram_chat_id` BIGINT → NUMERIC(20). Telegram OIDC sub'ы превысили BIGINT max (9.22e18) с 2024-2025 (видели `10399974012659476296`), UPDATE в phone-autolink ветке падал с code 22003. pg-node возвращает int8/numeric как строку (JS Number precision), поэтому миграция type-only — JS-код не меняется. Идемпотентна (DO-блок проверяет тип).

**20260508_streak_days:** новая таблица `streak_days` (id, patient_id FK, program_id FK, activity_date DATE, source CHECK IN ('progress','diary','mini','manual'), UNIQUE patient/date/program). Закрытие регресса v12: `current_streak` теперь = total активных дней, не consecutive. Бэкфилл из существующих `streaks.last_activity_date` за 90 дней. Идемпотентна (DO-блок проверяет наличие таблицы). Wave 0 commit 01.

**20260429_patient_deletion_queue:** новая таблица для очереди soft → hard delete (152-ФЗ ст.21 / GDPR Art.17). При запросе DELETE /me — `is_active=false` сразу + INSERT в очередь со `scheduled_for=NOW()+30d`. Cron в scheduler.js в 03:30 МСК берёт due-записи и делает hard DELETE patient (CASCADE через FK подчищает complexes/diary/progress). Partial UNIQUE индекс по `patient_id WHERE executed_at IS NULL AND cancelled_at IS NULL` — один активный запрос на пациента.

**20260512_program_types:** справочник `program_types` (code PK, label, joint, body_side_relevant, surgery_required, position) + поле `rehab_programs.program_type VARCHAR(50) NOT NULL DEFAULT 'acl'` с FK на program_types.code. Минимальный seed: `acl` / `knee_general` / `shoulder_general`. Backfill для существующих программ — regex по diagnosis на маркеры плеча (плеч/shoulder/манжет/надостн/cuff/frozen) → `shoulder_general`, остальное остаётся `acl` (90% knee по статистике). Wave 1 коммит 1.01 — фундамент multi-protocol. Использование `program_type` в backend/UI/telegramBot — в коммитах 1.02-1.04. Полностью идемпотентна.

**20260513_program_templates:** шаблоны программ + связи. Новые таблицы `program_templates` (id, code UNIQUE, program_type FK→program_types(code), title, description, surgery_required, default_phase_count, variant_of self-FK, is_active, position) и `program_template_phase_complexes` (id, program_template_id FK CASCADE, phase_number, complex_template_id FK→templates(id) ON DELETE SET NULL, is_recommended, notes, UNIQUE по program_template_id+phase_number). + ALTER `rehab_programs ADD program_template_id INTEGER REFERENCES program_templates(id) ON DELETE SET NULL` для tracking. + ALTER `templates ADD program_type VARCHAR(50) REFERENCES program_types(code)` для фильтрации комплексов. **Без seed** — Vadim наполняет через AdminContent (1.07). Wave 1 коммит 1.06 — фундамент блока B. Полностью идемпотентна.

### 2. Переменные окружения

**Backend (.env)**
```
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=azarean_rehab
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=random-secret-32-chars
JWT_EXPIRES_IN=1h
PATIENT_JWT_SECRET=different-random-secret-32-chars
SESSION_SECRET=another-random-secret
KINESCOPE_API_KEY=...
KINESCOPE_PROJECT_ID=...
CORS_ORIGIN=http://localhost:3000
TELEGRAM_BOT_TOKEN=...

# Telegram OIDC (Phase 2 — на проде)
# BotFather → @az_zari_bot → Login Widget → Switch to OpenID Connect Login
TELEGRAM_OIDC_CLIENT_ID=...
TELEGRAM_OIDC_CLIENT_SECRET=...
TELEGRAM_OIDC_REDIRECT_URI=https://my.azarean.ru/api/patient-auth/oauth/telegram/callback

# Финский reverse-proxy для oauth.telegram.org (rehab-VDS не достукается напрямую)
# Поднят JARVIS-Director'ом на 78.17.1.70, IP-allowlist 185.93.109.234
TG_PROXY_URL=https://tg-proxy.azarean.ru
TG_PROXY_SECRET=...

# Feature flag — Telegram-кнопка на /patient-login
TELEGRAM_LOGIN_ENABLED=true

# Yandex OAuth 2.0 (Phase 2d — в проде с 2026-04-29). Прокси НЕ нужен.
# Scopes увидены в кабинете oauth.yandex.ru при создании приложения,
# дефолт в config.js — login:info login:email login:avatar login:default_phone.
YANDEX_OAUTH_CLIENT_ID=...
YANDEX_OAUTH_CLIENT_SECRET=...
YANDEX_OAUTH_REDIRECT_URI=https://my.azarean.ru/api/patient-auth/oauth/yandex/callback
YANDEX_LOGIN_ENABLED=true

FRONTEND_URL=http://localhost:3000
```

### 3. Запуск

```bash
cd backend && npm install && npm run dev   # Express на :5000 (nodemon)
cd frontend && npm install && npm start    # CRA на :3000, proxy -> :5000
# Если :3000 занят (например, JARVIS Director на Fastify):
cd frontend && PORT=3001 BROWSER=none npm start   # CRA на :3001
# В этом случае добавить в backend/.env: CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Тестовые учётные данные (dev)

- **Инструктор (admin):** `vadim@azarean.com` / `Test1234` (пароль сброшен 2026-04-08 через bcrypt в БД)
- **Тестовый пациент:** id=14, `avi707@mail.ru` / `Test1234` (Вадим, привязан к реальному Telegram — scheduler шлёт ему советы/напоминания при запущенном backend)

## LOCKED — Не изменять без явного запроса

### ExerciseRunner (v3) — ЗАВЕРШЁН
- **Файл:** `frontend/src/pages/PatientDashboard/components/ExerciseRunner.js` (384 строк)
- **CSS:** 1:1 порт из `block-daria-gym.html` (iOS палитра `--az-*`, классы `.crd/.sec/.dot/.btn/.tmr/.fb-toggle/.rpe-b/.pv/.plbl/.cmt`)
- **Layout:** `.pg` wrapper `max-width: 720px`, 3 media queries (480/769/1801), slide-in анимации `pdIn`/`pdBk`
- **Feedback:** accordion с SVG chevron, RPE zones, pain gradient slider, таймер, комментарии
- **Flow:** HomeScreen «Начать тренировку» → ExerciseRunner напрямую (без ComplexDetailView)
- **Дизайн-эталоны:** Дарья (`.dg` prefix, `C:/Users/Вадим/Desktop/NEW EXERCISE/NEW EXERCISE/block-daria-gym.html`), Никита (`.ns` prefix, inline HTML из чата 2026-04-13)
- **НЕ ТРОГАТЬ:** flow, CSS, RPE zones, pain slider, timer, анимации

## Структура проекта

```
Azarean_rehab/
├── CLAUDE.md                    # Этот файл
├── docs/
│   └── prototypes/              # Архивные single-file прототипы дизайна (референс)
│       ├── README.md
│       └── patient-dashboard-v2.jsx  # Исходный прототип PatientDashboard (Feb 2026)
├── backend/
│   ├── server.js                # Express сервер v2.1.0, middleware, routing (378 строк)
│   ├── config/
│   │   └── config.js            # Env config с fail-fast валидацией (83 строки)
│   ├── database/
│   │   ├── db.js                # pg Pool, query(), getClient(), testConnection()
│   │   ├── schema.sql           # CREATE TABLE (основная схема)
│   │   ├── seeds/               # acl_phases.sql, test_patient_data.sql
│   │   └── migrations/          # 16 SQL миграций (2024-09 — 2026-04)
│   ├── middleware/
│   │   ├── auth.js              # authenticateToken (+ is_active DB check), requireAdmin, authenticatePatientOrInstructor (117 строк)
│   │   ├── patientAuth.js       # authenticatePatient (cookie-first + Bearer fallback) (52 строки)
│   │   ├── originCheck.js       # requireSameOrigin — CSRF для cookie auth (62 строки)
│   │   ├── upload.js            # Multer + Sharp: аватары (до 10MB → 400×400 JPEG q80) (82 строки)
│   │   └── validators.js        # express-validator правила (НЕ ПОДКЛЮЧЕНЫ к роутам!) (324 строки)
│   ├── routes/                  # 12 активных роут-файлов, 6730 строк суммарно
│   │   ├── auth.js              # POST /register, /login, /refresh, /logout, GET /me (380 строк)
│   │   ├── patientAuth.js       # Полный цикл: register, login, refresh, profile, avatar, password-reset, my-complexes (1031 строк)
│   │   ├── patients.js          # CRUD пациентов + soft/hard delete + is_registered flag (407 строк)
│   │   ├── exercises.js         # CRUD упражнений + Kinescope + bulk import (885 строк)
│   │   ├── complexes.js         # CRUD комплексов + exercises ordering (538 строк)
│   │   ├── diagnoses.js         # CRUD диагнозов (303 строки)
│   │   ├── progress.js          # Отслеживание прогресса тренировок (311 строк)
│   │   ├── templates.js         # Шаблоны упражнений (217 строк)
│   │   ├── rehab.js             # Программы реабилитации, дневник, streaks, сообщения, уведомления (1208 строк)
│   │   ├── dashboard.js         # Статистика для инструктора (61 строк)
│   │   ├── admin.js             # Админ-панель: users, stats, audit-logs, phases, tips, videos, system (946 строк)
│   │   ├── import.js            # CSV/Kinescope импорт (357 строк)
│   │   └── telegram.js          # Привязка Telegram к пациенту (86 строк)
│   ├── services/
│   │   ├── telegramBot.js       # Telegram бот: /start, /status, /diary (6-step wizard), /tip, /help (631 строк)
│   │   ├── telegramOidc.js      # OIDC service для Telegram Login: openid-client v6 + customFetch через финский прокси (X-Proxy-Secret)
│   │   ├── yandexOauth.js       # Plain OAuth 2.0 для Yandex Login: PKCE S256, без OIDC discovery, без прокси (oauth.yandex.ru доступен с rehab-VDS напрямую)
│   │   ├── scheduler.js         # Cron: exercise reminders (per-user tz), diary (21:00), tips (12:00), token cleanup (03:00) (179 строк)
│   │   ├── kinescopeService.js  # Kinescope API client (152 строки)
│   │   └── csvImportService.js  # CSV парсер (56 строк)
│   ├── utils/
│   │   ├── tokens.js            # hashToken() — SHA-256 для безопасного хранения токенов
│   │   ├── inviteCode.js        # 8-символьные коды приглашения (alphabet без 0/O/1/I/l), normalize, validate format
│   │   ├── phone.js             # normalizePhone(raw) → E.164, phonesEqual(a,b). 17 unit-тестов
│   │   ├── audit.js             # logAudit() для GDPR-аудита действий инструктора над данными пациентов
│   │   └── email.js             # Email stub (console.log в dev, готов к Nodemailer/SendGrid)
│   └── tests/                   # Jest + Supertest
│       └── __tests__/           # 9 тест-файлов (2908 строк суммарно)
│
└── frontend/
    ├── package.json             # React 19.2.0, proxy -> localhost:5000
    └── src/
        ├── App.js               # Routing (296 строк): ProtectedRoute + PatientRoute + React.lazy + PatientAuthProvider layout
        ├── services/
        │   └── api.js           # Axios instances (api + patientApi) + ~50 функций (513 строк)
        ├── context/
        │   ├── AuthContext.js         # Инструктор { user, loading, login, logout } (59 строк)
        │   ├── PatientAuthContext.js  # Пациент { patient, loading, login, logout } — через cookie (71 строк)
        │   └── ToastContext.js        # addToast(type, title?, message, duration?) (87 строк)
        ├── hooks/
        │   └── useConfirm.js    # ConfirmModal hook (55 строк)
        ├── utils/
        │   ├── dateUtils.js     # Утилиты дат, русская локаль (120 строк)
        │   └── exerciseConstants.js # Body regions, difficulty levels, equipment, phases (283 строки)
        ├── styles/
        │   └── tokens.css       # Design tokens (--color-*, --shadow-*, --radius-*) + dark theme override (с 2026-05-04)
        ├── pages/
        │   ├── Dashboard.js     # Tab-навигация: Patients, Diagnoses, CreateComplex, MyComplexes, Trash
        │   ├── Login.js         # Авторизация инструктора
        │   ├── Patients.js      # CRUD пациентов (834 строки)
        │   ├── Diagnoses.js     # CRUD диагнозов
        │   ├── CreateComplex.js # 4-step wizard + DND
        │   ├── EditComplex.js   # Редактирование комплекса
        │   ├── MyComplexes.js   # Список комплексов
        │   ├── Trash.js         # Корзина (soft delete)
        │   ├── ViewProgress.js  # Просмотр прогресса (452 строки)
        │   ├── PatientProgress.js # Прогресс-дашборд (470 строк)
        │   ├── ImportExercises.js # Импорт упражнений
        │   ├── Exercises/       # Библиотека: Exercises.js (363), ExerciseDetail.js (424) + components/ (6 компонентов: ExerciseCard, ExerciseFilters, ExerciseModal, ExerciseViewModal, ExerciseSelector, DeleteConfirmModal)
        │   ├── PatientAuth/     # Login (207), Register (253), ForgotPassword (122), ResetPassword (207)
        │   ├── PatientDashboard/ # Дашборд пациента (960px): Home, Diary, Exercises, Roadmap, Profile, Contact + ExerciseRunner (LOCKED) + ComplexDetailView + __mocks__/
        │   ├── Admin/           # AdminContent (477), AdminUsers (208), AdminStats (100), AdminSystem (130), AdminAuditLogs (149), AdminUserModal (124) + AdminPanel.test.js
        │   └── EditTemplate.js  # Редактирование шаблона
        └── components/
            ├── Toast.js         # Уведомления
            ├── ConfirmModal.js  # Подтверждение действий
            ├── ErrorBoundary.js # Обработка ошибок рендера
            ├── LoadingSpinner.js # Спиннер загрузки
            ├── Skeleton.js      # Скелетоны загрузки
            ├── BackButton.js    # Кнопка назад
            ├── Breadcrumbs.js   # Хлебные крошки
            ├── TemplateSelector.js # Модалка выбора шаблона
            ├── TemplateViewModal.js # Просмотр шаблона
            ├── DeleteTemplateModal.js # Удаление шаблона
            └── skeletons/       # 4 специализированных скелетона
```

## Схема БД (20 таблиц)

### users (инструкторы/админы)
```sql
id SERIAL PK, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL,
full_name VARCHAR(255) NOT NULL, role VARCHAR(50) CHECK('admin'|'instructor') DEFAULT 'instructor',
is_active BOOLEAN DEFAULT true, failed_login_attempts SMALLINT DEFAULT 0,
locked_until TIMESTAMP, created_at TIMESTAMP, updated_at TIMESTAMP
```

### patients
```sql
id SERIAL PK, full_name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE (partial index, WHERE email IS NOT NULL),
phone VARCHAR(50), birth_date DATE, diagnosis TEXT, notes TEXT,
created_by INT REFERENCES users(id) ON DELETE SET NULL,
is_active BOOLEAN DEFAULT true,
password_hash VARCHAR(255), email_verified BOOLEAN DEFAULT false,
auth_provider VARCHAR(20) DEFAULT 'local', provider_id VARCHAR(255),
avatar_url VARCHAR(500), last_login_at TIMESTAMP,
telegram_chat_id BIGINT UNIQUE,
preferred_messenger VARCHAR(20) NOT NULL DEFAULT 'telegram'
  CHECK (preferred_messenger IN ('telegram','whatsapp','max')),  -- миграция 20260421
failed_login_attempts SMALLINT DEFAULT 0, locked_until TIMESTAMP,
created_at TIMESTAMP, updated_at TIMESTAMP
```

### diagnoses
```sql
id SERIAL PK, name VARCHAR(255) NOT NULL, category VARCHAR(100),
description TEXT, recommendations TEXT, warnings TEXT,
is_active BOOLEAN DEFAULT true, created_at TIMESTAMP, updated_at TIMESTAMP, deleted_at TIMESTAMP
```

### exercises
```sql
id SERIAL PK, title VARCHAR(255) NOT NULL, short_title VARCHAR(100),
description TEXT, video_url VARCHAR(500), thumbnail_url VARCHAR(500),
kinescope_id VARCHAR(255) UNIQUE, body_region VARCHAR(100), difficulty_level INT,
exercise_type VARCHAR(50), equipment JSONB DEFAULT '[]',
position JSONB DEFAULT '[]', rehab_phases JSONB DEFAULT '[]',
duration_seconds INT, instructions TEXT, cues TEXT, tips TEXT,
contraindications TEXT, absolute_contraindications TEXT, red_flags TEXT,
safe_with_inflammation BOOLEAN DEFAULT false,
is_active BOOLEAN DEFAULT true, created_by INT REFERENCES users(id) ON DELETE SET NULL,
created_at TIMESTAMP, updated_at TIMESTAMP
```

### complexes (комплексы упражнений)
```sql
id SERIAL PK, patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
instructor_id INT REFERENCES users(id) ON DELETE SET NULL,
diagnosis_id INT REFERENCES diagnoses(id) ON DELETE SET NULL,
diagnosis_note VARCHAR(500), title VARCHAR(255),
recommendations TEXT, warnings TEXT,
is_active BOOLEAN DEFAULT true, created_at TIMESTAMP, updated_at TIMESTAMP
-- ПРИМЕЧАНИЕ: поле access_token удалено в миграции 20260409 вместе с публичным /patient/:token flow.
-- Теперь доступ пациента только через личный кабинет (PatientAuthContext + JWT cookie).
```

### complex_exercises
```sql
id SERIAL PK, complex_id INT REFERENCES complexes(id) ON DELETE CASCADE,
exercise_id INT REFERENCES exercises(id) ON DELETE CASCADE,
order_number INT NOT NULL, sets INT DEFAULT 3, reps INT DEFAULT 10,
duration_seconds INT, rest_seconds INT DEFAULT 30, notes TEXT,
created_at TIMESTAMP, UNIQUE(complex_id, order_number)
-- idx_complex_exercises_exercise_id на exercise_id (добавлен в миграции 20260406)
```

### progress_logs
```sql
id SERIAL PK, complex_id INT REFERENCES complexes(id) ON DELETE CASCADE,
exercise_id INT REFERENCES exercises(id) ON DELETE CASCADE,
session_id BIGINT, session_comment TEXT,
completed BOOLEAN DEFAULT false, pain_level SMALLINT CHECK(0-10),
difficulty_rating SMALLINT CHECK(1-10), notes TEXT,
completed_at TIMESTAMP, created_at TIMESTAMP
```

### refresh_tokens / patient_refresh_tokens
```sql
id SERIAL PK, user_id/patient_id INT REFERENCES ... ON DELETE CASCADE,
token_hash VARCHAR(128) NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP
-- Токены хранятся как SHA-256 hex (64 символа). Helper: backend/utils/tokens.js hashToken()
-- Миграция 20260408_hash_tokens.sql: token → token_hash, TRUNCATE для инвалидации старых сессий
```

### audit_logs
```sql
id SERIAL PK, user_id INT REFERENCES users(id),
action VARCHAR(50) NOT NULL, entity_type VARCHAR(50) NOT NULL, entity_id INT,
patient_id INT, ip_address INET, user_agent TEXT, details JSONB, created_at TIMESTAMP
```

### rehab_programs
```sql
id SERIAL PK, patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
complex_id INT REFERENCES complexes(id) ON DELETE SET NULL,
title VARCHAR(255), diagnosis VARCHAR(255), surgery_date DATE,
current_phase INT DEFAULT 1, phase_started_at DATE,
status VARCHAR(20) CHECK('active'|'paused'|'completed'),
notes TEXT, created_by INT REFERENCES users(id) ON DELETE SET NULL,
is_active BOOLEAN DEFAULT true, created_at TIMESTAMP, updated_at TIMESTAMP
```

### rehab_phases
```sql
id SERIAL PK, program_type VARCHAR(100) DEFAULT 'acl', phase_number INT NOT NULL,
title VARCHAR(255), subtitle VARCHAR(255), duration_weeks INT,
description TEXT, goals TEXT, restrictions TEXT, criteria_next TEXT,
icon VARCHAR(50), color VARCHAR(20), color_bg VARCHAR(20), teaser TEXT,
allowed TEXT, pain TEXT, daily TEXT, red_flags TEXT, faq TEXT,
is_active BOOLEAN DEFAULT true, created_at TIMESTAMP,
UNIQUE(program_type, phase_number)
```

### diary_entries
```sql
id SERIAL PK, patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
pain_level INT CHECK(0..10), swelling INT CHECK(0..3), mobility INT CHECK(0..10),
mood INT CHECK(1..5), sleep_quality INT CHECK(1..5),
exercises_done BOOLEAN DEFAULT false, notes TEXT,
-- Structured v12 поля (миграция 20260421_diary_structured_fields):
pgic_feel VARCHAR(10) CHECK('better'|'same'|'worse' OR NULL),
rom_degrees INT CHECK(0..180 OR NULL),
better_list JSONB NOT NULL DEFAULT '[]',  -- whitelist: ext,walk,sleep,mood,pain,custom
pain_when VARCHAR(20) CHECK('morning'|'day'|'evening'|'exercise'|'walking' OR NULL),
created_at TIMESTAMP, updated_at TIMESTAMP, UNIQUE(patient_id, entry_date)
```

### diary_photos (миграция 20260421_diary_structured_fields)
```sql
id SERIAL PK,
diary_entry_id INT NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
file_path VARCHAR(500) NOT NULL,  -- относительно backend/ (/uploads/diary_photos/...)
file_size_bytes INT, created_at TIMESTAMP DEFAULT NOW()
-- idx_diary_photos_entry на diary_entry_id
-- Лимит 3 фото на запись — application-layer в POST /my/diary/:id/photos
-- Sharp: fit:inside 1200×1200, JPEG q82
```

### streaks
```sql
id SERIAL PK, patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
program_id INT REFERENCES rehab_programs(id) ON DELETE SET NULL,
current_streak INT DEFAULT 0, longest_streak INT DEFAULT 0, total_days INT DEFAULT 0,
last_activity_date DATE, updated_at TIMESTAMP, UNIQUE(patient_id, program_id)
```

### Остальные таблицы
- **tips** — советы по фазам реабилитации
- **phase_videos** — видео для фаз (FK → rehab_phases)
- **messages** — чат пациент↔инструктор (sender_id без FK!). С миграции 20260421 добавлены `linked_diary_id INT REFERENCES diary_entries(id) ON DELETE SET NULL` (привязка ответа куратора к конкретной записи дневника) и `channel VARCHAR(20) CHECK ('telegram'|'whatsapp'|'max'|'in_app' OR NULL)`.
- **notification_settings** — настройки уведомлений пациента (UNIQUE patient_id)
- **telegram_link_codes** — одноразовые коды привязки Telegram
- **patient_password_resets** — токены сброса пароля (SHA-256 hash, миграция 20260408)
- **patient_oauth_states** — OAuth state + PKCE code_verifier + nonce (миграция `20260427_oauth_pkce_nonce.sql` добавила code_verifier/nonce). State used-once, expires_at 10 мин.
- **patient_invite_codes** — 8-символьные коды приглашения (миграция `20260427_patient_invite_codes.sql`). SHA-256 хэш как у refresh-токенов. TTL 24ч. Один активный код на пациента — при генерации нового старые помечаются used_at=NOW.

## Пользователи системы

1. **Администраторы** — управление пользователями, контентом, система аудита
2. **Инструкторы** — создание комплексов, отслеживание прогресса, управление пациентами
3. **Пациенты** — только через личный кабинет (регистрация по email + логин)

## Система авторизации

### Инструкторы (routes/auth.js)
- JWT access token (1h) в Bearer header в localStorage
- Refresh token (7d) хранится в БД (SHA-256 хэш)
- Account lockout: 5 failed attempts → 15 min
- POST /register защищён `authenticateToken + requireAdmin` (только админ создаёт)

### Пациенты (routes/patientAuth.js)
- Отдельный JWT_SECRET (PATIENT_JWT_SECRET)
- **Access token (15 min) в httpOnly cookie `patient_access_token`** (SameSite=Lax, path=/api)
- **Refresh token (30d) в httpOnly cookie `patient_refresh_token`** (SameSite=Lax, path=/api/patient-auth, SHA-256 в БД)
- `PatientAuthContext` на фронте определяет "залогинен ли" через GET /me на mount
- **Один `PatientAuthProvider`** на все пациентские роуты (login, register, forgot-password, reset-password, dashboard) через layout Route + Outlet в App.js
- Account lockout: 5 failed attempts → 15 min
- Password reset через email stub
- **Регистрация только по invite-code** — пациент создаётся инструктором (POST /api/patients), потом инструктор генерирует 8-символьный код (POST /api/patients/:id/invite-code), пациент вводит на /patient-register. Self-registration без кода невозможна → закрывает gap «пациент-невидимка с created_by=NULL».
- **OAuth Telegram (Phase 2):** OIDC через openid-client v6, Authorization Code Flow с PKCE/nonce. discovery + token-exchange ходит через **финский reverse-proxy** (https://tg-proxy.azarean.ru, X-Proxy-Secret header), потому что rehab-VDS не достукается до oauth.telegram.org напрямую. Match-flow в callback'е: provider_id → silent autolink по phone (нормализованный в E.164) → /patient-register с pre-fill. Подробности — [memory/telegram_oidc_proxy.md](.claude/projects/.../memory/).
- **OAuth Yandex (Phase 2d):** Plain OAuth 2.0 + PKCE S256 (Yandex не публикует OIDC discovery). Прокси не нужен — oauth.yandex.ru/login.yandex.ru доступны с rehab-VDS напрямую. UserInfo через `GET login.yandex.ru/info` с `Authorization: OAuth <token>`. Phone scope = `login:default_phone` (точное имя видно только в Yandex Cabinet). Match-flow идентичен Telegram'у. Подробности — [memory/yandex_oauth_v2.md](.claude/projects/.../memory/).
- OAuth Google/VK — TODO
- **CSRF:** `requireSameOrigin` middleware на всех state-changing эндпоинтах (/patient-auth, /rehab/my, /telegram, /progress)
- Bearer header fallback оставлен в middleware для тестов и API-клиентов

## API endpoints

### Auth (инструкторы)
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | /api/auth/register | JWT + Admin | Создание юзера (только админ) |
| POST | /api/auth/login | Нет | Логин → access + refresh tokens |
| POST | /api/auth/refresh | Cookie | Обновить access token |
| POST | /api/auth/logout | JWT | Удалить refresh token |
| GET | /api/auth/me | JWT | Текущий пользователь |

### Auth (пациенты)
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | /api/patient-auth/register | Нет | Регистрация по invite-code → access+refresh cookie. Поле `invite_code` обязательно |
| POST | /api/patient-auth/login | Нет | Логин → ставит access+refresh cookie |
| GET | /api/patient-auth/oauth/providers | Нет | Какие OAuth провайдеры enabled (telegram/yandex/google/vk) |
| GET | /api/patient-auth/oauth/telegram | Нет | Старт Telegram OIDC flow → 302 на oauth.telegram.org |
| GET | /api/patient-auth/oauth/telegram/callback | Нет | Callback Telegram → match-flow + cookies + 302 |
| GET | /api/patient-auth/oauth/yandex | Нет | Старт Yandex OAuth 2.0 + PKCE → 302 на oauth.yandex.ru/authorize |
| GET | /api/patient-auth/oauth/yandex/callback | Нет | Callback Yandex → token exchange + userinfo + match-flow + cookies + 302 |
| POST | /api/patient-auth/refresh | Cookie | Обновить access token (ротация) |
| POST | /api/patient-auth/logout | Cookie | Удалить cookies + refresh tokens |
| GET | /api/patient-auth/me | Cookie | Текущий пациент |
| PUT | /api/patient-auth/me | Cookie | Обновить профиль |
| POST | /api/patient-auth/upload-avatar | Cookie | Загрузить аватар |
| GET | /api/patient-auth/avatar | Cookie | Скачать аватар как blob |
| DELETE | /api/patient-auth/avatar | Cookie | Удалить аватар |
| POST | /api/patient-auth/change-password | Cookie | Сменить пароль (инвалид. всех сессий) |
| POST | /api/patient-auth/forgot-password | Нет | Запрос сброса (email stub) |
| POST | /api/patient-auth/reset-password | Нет | Сброс пароля по токену |
| GET | /api/patient-auth/my-complexes | Cookie | Все активные комплексы пациента |
| GET | /api/patient-auth/my-complexes/:id | Cookie | Конкретный комплекс с упражнениями |

### Пациенты
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/patients | JWT | Список (?search, ?is_active) |
| GET | /api/patients/:id | JWT | Карточка пациента |
| POST | /api/patients | JWT | Создать пациента |
| POST | /api/patients/:id/invite-code | JWT | Сгенерировать 8-символьный код приглашения (24ч TTL, used-once) |
| PUT | /api/patients/:id | JWT | Обновить пациента |
| DELETE | /api/patients/:id | JWT | Soft delete (is_active=false) |
| PATCH | /api/patients/:id/restore | JWT | Восстановить из корзины |
| DELETE | /api/patients/:id/permanent | JWT | Hard delete |

### Упражнения
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/exercises | JWT | Список с фильтрами и пагинацией |
| GET | /api/exercises/:id | JWT | Деталь упражнения |
| POST | /api/exercises | JWT | Создать упражнение |
| PUT | /api/exercises/:id | JWT | Обновить |
| DELETE | /api/exercises/:id | Admin | Soft delete |
| POST | /api/exercises/bulk | JWT | Массовый импорт |
| POST | /api/exercises/fetch-all-thumbnails | JWT | Загрузить thumbnails из Kinescope |

### Комплексы
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/complexes | JWT | Список комплексов инструктора |
| GET | /api/complexes/:id | JWT | Комплекс с упражнениями |
| POST | /api/complexes | JWT | Создать комплекс (+ exercises array) |
| PUT | /api/complexes/:id | JWT | Обновить |
| DELETE | /api/complexes/:id | JWT | Soft delete |
| PATCH | /api/complexes/:id/restore | JWT | Восстановить |
| DELETE | /api/complexes/:id/permanent | JWT | Hard delete |

### Прогресс
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | /api/progress | JWT или PatientJWT | Сохранить прогресс тренировки |
| GET | /api/progress/complex/:id | JWT или PatientJWT | Прогресс по комплексу |
| GET | /api/progress/patient/:id | JWT | Все комплексы пациента |

### Реабилитация
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | /api/rehab/programs | JWT | Создать программу |
| GET | /api/rehab/programs | JWT | Список программ |
| PUT | /api/rehab/programs/:id | JWT | Обновить программу |
| DELETE | /api/rehab/programs/:id | JWT | Удалить программу |
| GET | /api/rehab/programs/:id/diary | JWT | Дневник пациента (для инструктора) |
| GET | /api/rehab/programs/:id/messages | JWT | Сообщения пациента (для инструктора) |
| GET | /api/rehab/my/program | PatientJWT | Моя программа |
| GET | /api/rehab/my/dashboard | PatientJWT | Мой дашборд (program.program_type/program_label/joint/surgery_required через JOIN с program_types, Wave 1 #1.02) |
| GET | /api/rehab/my/exercises | PatientJWT | Мои упражнения |
| POST | /api/rehab/my/diary | PatientJWT | Сохранить дневник (+ pgic_feel, rom_degrees, better_list, pain_when) |
| GET | /api/rehab/my/diary | PatientJWT | Дневник (с историей и photos[]) |
| GET | /api/rehab/my/diary/:date | PatientJWT | Дневник за конкретную дату (+ photos[]) |
| GET | /api/rehab/my/diary/trend | PatientJWT | Sparkline pain за N дней (?days=14, max 90) |
| POST | /api/rehab/my/diary/:entry_id/photos | PatientJWT | Загрузить фото (multer+sharp, max 3, 10МБ) |
| GET | /api/rehab/my/diary/:entry_id/photos/:photo_id | PatientJWT | Отдать фото как blob |
| DELETE | /api/rehab/my/diary/:entry_id/photos/:photo_id | PatientJWT | Удалить фото |
| GET | /api/rehab/my/streak | PatientJWT | Мой streak |
| GET | /api/rehab/my/messages | PatientJWT | Мои сообщения |
| POST | /api/rehab/my/messages | PatientJWT | Отправить сообщение |
| GET | /api/rehab/my/notifications | PatientJWT | Настройки уведомлений |
| PUT | /api/rehab/my/notifications | PatientJWT | Обновить настройки уведомлений |
| GET | /api/rehab/phases/:type | **Нет** | Фазы реабилитации |
| GET | /api/rehab/phases/:id | **Нет** | Конкретная фаза |
| GET | /api/rehab/program-types | **Нет** | Справочник типов программ (Wave 1 #1.02) |
| GET | /api/rehab/program-templates | **Нет** | Шаблоны программ (Wave 1 #1.06). Опциональный `?program_type=` фильтр |
| GET | /api/rehab/program-templates/:id/phases | **Нет** | Фазы шаблона + рекомендованные complex templates (Wave 1 #1.06, для wizard'а в 1.08b) |
| GET | /api/rehab/tips | **Нет** | Советы |

### Диагнозы
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/diagnoses | JWT | Список диагнозов |
| GET | /api/diagnoses/:id | JWT | Конкретный диагноз |
| POST | /api/diagnoses | JWT | Создать |
| PUT | /api/diagnoses/:id | JWT | Обновить |
| DELETE | /api/diagnoses/:id | JWT | Soft delete (deleted_at) |
| POST | /api/diagnoses/:id/restore | JWT | Восстановить |

### Шаблоны
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/templates | JWT | Список шаблонов |
| GET | /api/templates/:id | JWT | Конкретный шаблон |
| POST | /api/templates | JWT | Создать |
| PUT | /api/templates/:id | JWT | Обновить |
| DELETE | /api/templates/:id | JWT | Удалить |

### Дашборд, импорт, Telegram
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/dashboard/stats | JWT | Статистика инструктора |
| GET | /api/import/kinescope/preview | Нет | Превью видео Kinescope |
| POST | /api/import/kinescope/execute | JWT | Импорт из Kinescope |
| POST | /api/import/csv | JWT | Импорт из CSV |
| GET | /api/import/csv/template | JWT | Шаблон CSV |
| POST | /api/telegram/link-code | PatientJWT | Генерация кода привязки |
| GET | /api/telegram/status | PatientJWT | Статус привязки |
| DELETE | /api/telegram/unlink | PatientJWT | Отвязка Telegram |

### Admin
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| GET | /api/admin/stats | JWT + Admin | Общая статистика |
| GET | /api/admin/users | JWT + Admin | Список пользователей |
| POST | /api/admin/users | JWT + Admin | Создать пользователя |
| PUT | /api/admin/users/:id | JWT + Admin | Обновить |
| DELETE | /api/admin/users/:id | JWT + Admin | Деактивировать |
| POST | /api/admin/users/:id/activate | JWT + Admin | Активировать |
| POST | /api/admin/users/:id/unlock | JWT + Admin | Разблокировать |
| GET | /api/admin/audit-logs | JWT + Admin | Лог аудита |
| GET/POST/PUT/DELETE | /api/admin/phases/* | JWT + Admin | CRUD фаз реабилитации (program_type валидируется по справочнику с Wave 1 #1.05) |
| GET/POST/PUT/DELETE | /api/admin/program-types/* | JWT + Admin | CRUD справочника типов программ (Wave 1 #1.05). DELETE = soft (is_active=false), блокируется 409 если есть активные программы. PUT не меняет code |
| GET/POST/PUT/DELETE | /api/admin/program-templates/* | JWT + Admin | CRUD шаблонов программ (Wave 1 #1.07). GET включает `active_programs_count`. DELETE = soft, блокируется 409 при активных программах. POST валидирует program_type в справочнике, 409 на дубль code |
| GET/PUT/DELETE | /api/admin/program-templates/:id/phase-complexes/[:phase] | JWT + Admin | Junction шаблон↔complex_template по фазам (Wave 1 #1.07). PUT — UPSERT через ON CONFLICT DO UPDATE |
| GET/POST/PUT/DELETE | /api/admin/tips/* | JWT + Admin | CRUD советов |
| GET/POST/PUT/DELETE | /api/admin/videos/* | JWT + Admin | CRUD видео фаз |
| GET | /api/admin/system | JWT + Admin | Информация о системе |

## Правила кода

### Общие правила (ВАЖНО — читать первым)
- **Арифметика — ТОЛЬКО через код!** Никогда не считать суммы, проценты в уме. Использовать `node -e`, SQL, python
- **НЕ выдумывать UI элементы!** Не описывать кнопки/меню не видимые на скриншоте. Просить скриншот
- **Проверять дату/время** в начале чата: `node -e "console.log(new Date().toLocaleString('ru-RU',{timeZone:'Asia/Yekaterinburg'}))"`
- **Комментарии на русском** в коде
- **Иконки: ТОЛЬКО `lucide-react`** — нет emoji в UI компонентах
- **CSS prefix `pd-` для PatientDashboard** компонентов, `--az-*` переменные только внутри `.pd-runner`
- **Roadmap секция ниже — справочная.** Реализовывать ТОЛЬКО по явному запросу пользователя
- Не добавлять фичи сверх запрошенного. Bug fix ≠ рефакторинг соседнего кода
- **СХЕМА БД МЕНЯЕТСЯ ТОЛЬКО МИГРАЦИЕЙ.** Никаких ручных ALTER/CREATE через psql на dev БД — это привело к schema drift 2026-04-23→24 (fresh install на prod сломал /api/exercises, /api/diagnoses, Kinescope-импорт). Все миграции должны быть **идемпотентны** (IF NOT EXISTS, DO-блоки с проверкой колонок) и прогоняться тест-циклом: `createdb test → schema.sql → все миграции дважды подряд → drop` ДО коммита. См. `production_deployment.md` → "Schema drift recovery".
- **CSS Modules — ИМЕНА КЛАССОВ В CAMELCASE**, не dash-case. CRA по умолчанию НЕ конвертирует автоматически. `.module.css` должен иметь `.fooBar { ... }`, JS обращается через `s.fooBar`. Если в CSS написано `.foo-bar`, в JS работает только `s['foo-bar']`, а `s.fooBar === undefined` → класс не применяется → страница без стилей. **Юнит-тесты НЕ ловят** эту проблему если CSS Modules мокается через `Proxy({}, { get: (_, prop) => String(prop) })` — Proxy возвращает любой ключ как строку. **Smoke в реальном браузере обязателен** после любой CSS Modules миграции. См. инцидент `c8834b5` 2026-05-04 + [memory/feedback_smoke_real_browser.md](.claude/projects/.../memory/feedback_smoke_real_browser.md).
- **UI-изменения НЕ push'ить прямо в main без локального smoke.** CI/CD автодеплой превращает push'и без проверки в потенциально broken prod. Для крупных UI-рефакторингов (>5 файлов CSS, изменение токенов / структуры) — `npm start` локально + обход 5+ ключевых экранов в браузере с DevTools открытым перед push. Не доверять только `tests pass + build OK`. На любую серию push'ей >3 в час — пауза для smoke. См. [memory/feedback_no_direct_main_push_for_ui.md](.claude/projects/.../memory/feedback_no_direct_main_push_for_ui.md).
- **НЕ миксовать миграцию + новую фичу в одной сессии.** Например, «CSS Modules + Dark theme в одну сессию» (2026-05-04) запутали баги двух задач. Сначала закрыть миграцию полностью (тесты + smoke + 24ч стабильности на проде или явное «всё ок» от юзера), потом стартовать фичу. См. [memory/feedback_one_change_per_session.md](.claude/projects/.../memory/feedback_one_change_per_session.md).
- **Не делать P3 спонтанной инициативой.** Перед стартом задачи помеченной как «когда станет нужно / nice-to-have / отложено» — спросить «А кто это просил? Это сейчас правда нужно?». Для pilot-проекта с 0 пользователей выгода от P3-фичи ≈ 0, риск любого регресса = блокер запуска. См. [memory/feedback_no_p3_initiative.md](.claude/projects/.../memory/feedback_no_p3_initiative.md).

### Backend
- **CommonJS модули:** `const { query } = require('../database/db');`
- **pg wrapper:** `query(sql, params)` — ВСЕГДА параметризованные запросы ($1, $2...) — SQL injection = 0
- **getClient()** для транзакций: `const client = await getClient(); try { await client.query('BEGIN'); ... } finally { client.release(); }`
- **Soft delete:** `is_active = false` для пациентов, `deleted_at` для диагнозов
- **Ownership check:** `WHERE created_by = $2` в запросах пациентов и комплексов
- **JWT algorithm:** explicit `{ algorithms: ['HS256'] }` в verify (предотвращает algorithm confusion)
- **Rate limiting:** authLimiter (5/15min), generalLimiter (production only!)
- **Audit logging:** admin actions → audit_logs таблица
- **API response format:** Все эндпоинты возвращают `{ data: <payload>, message? }` для успеха и `{ error: string, message: string }` для ошибок. Списки: `{ data: [...], total? }`. Пагинация: `{ data: [...], pagination: {...} }`. Без `success` поля.
- **Express-validator правила определены в validators.js но НЕ ПОДКЛЮЧЕНЫ к роутам!** (dead code)

### Frontend
- **JavaScript, нет TypeScript** — PropTypes только в PatientDashboard
- **CSS Modules** (с 2026-05-04) — все стили в `*.module.css`, классы scoped через hash. JS импортирует `import s from './X.module.css'`, использует `className={s.camelCase}`. **Имена классов в CSS обязательно camelCase** (`.fooBar`, не `.foo-bar`) — иначе `s.fooBar === undefined`. PatientDashboard использует `pd-` prefix + свой [tokens.css](frontend/src/pages/PatientDashboard/tokens.css). ExerciseRunner LOCKED (`.pd-runner` + `--az-*`).
- **Два Axios instance:** `api` (инструктор, Bearer), `patientApi` (пациент, httpOnly cookie)
- **Unwrap interceptor:** оба instance разворачивают `{ data: <payload>, message?, total? }` → `response.data = <payload>`, `response.meta = { message, total, ... }`
- **Auto-refresh:** interceptor на 403 + "истек" строка → refresh → retry queue
- **Dashboard = tab-container** (`activeTab` state), НЕ роуты
- **React.lazy** для всех страниц кроме Login и Dashboard
- **@dnd-kit** для drag-and-drop: MouseSensor (5px), TouchSensor (150ms), KeyboardSensor
- **Нет пагинации** — Patients/Exercises грузят ВСЕ записи, фильтрация на клиенте
- **`alert()` вместо Toast** в некоторых местах (Exercises.js)
- Fluid CSS: `clamp()` вместо media queries (рекомендуется)
- Touch-friendly: min-height 44px для кнопок

### Специфичные правила
- **Telegram Bot API не поддерживает кириллические команды!** Только `[a-z0-9_]`. Для кириллицы: `bot.onText(/^\/команда$/i, ...)`
- **bot.launch() / bot.startPolling():** обернуть в try/catch с retry (3-5 попыток, backoff). Telegram API может отвечать ECONNRESET
- **PM2 exec_mode: 'fork'** для ESM модулей (cluster не совместим)
- **IPv6 отключать** если провайдер не маршрутизирует: `--dns-result-order=ipv4first`
- **PostgreSQL DATE → JSON timezone:** если дата сдвигается на -1 день, использовать `s.date::text` в SQL или explicit timezone

## Открытые баги и технический долг

| # | Severity | Описание |
|---|----------|----------|
| 1 | HIGH | **Rate limiting выключен в dev** — если NODE_ENV ≠ production (by design) |
| ~~2~~ | ~~MEDIUM~~ | ~~validators.js dead code~~ → **ЗАКРЫТО** (2026-04-22, `4d49598`): подключено к auth, patient-auth, patients, diagnoses, progress. Exercise/complex валидаторы пропущены (video_url required и exercises min=1 ломают flows). |
| ~~3~~ | ~~MEDIUM~~ | ~~Dashboard stats хардкод нулей~~ → **ЗАКРЫТО** (2026-04-22, `8747c7c`): Dashboard.js теперь вызывает `/api/dashboard/stats` на mount. |
| ~~4~~ | ~~MEDIUM~~ | ~~templates.update не шлёт body~~ → **ЗАКРЫТО** (2026-04-22, `8747c7c`). |
| ~~5~~ | ~~MEDIUM~~ | ~~EditComplex copy-paste «Ссылка скопирована!»~~ → **ЗАКРЫТО** (2026-04-22, `8747c7c`). |
| ~~6~~ | ~~MEDIUM~~ | ~~**DiaryScreen** — структурированные данные сериализуются в текст `notes`~~ → **ЗАКРЫТО** (миграция 20260421_diary_structured_fields, v12 redesign) |
| ~~7~~ | ~~MEDIUM~~ | ~~**80+ дублей CSS-классов**~~ → **ЗАКРЫТО** 2026-05-04 (CSS Modules миграция, commit `c8834b5`): 71 `.css` → `.module.css`, common.css удалён. |
| ~~8~~ | ~~MEDIUM~~ | ~~GDPR аудит-логи на чтение данных пациентов~~ → **ЗАКРЫТО** (2026-04-22, `6b36bd2`): `backend/utils/audit.js` + logAudit на GET patients, GET patients/:id, GET progress/patient/:id, GET rehab/programs/:id/diary, GET rehab/programs/:id/messages. |
| 9 | LOW | **ErrorBoundary не ловит** async ошибки из useEffect |
| 10 | LOW | **messages.sender_id** — нет FK constraint (требует полиморфного split patient.id vs users.id) |
| ~~11~~ | ~~HIGH~~ | ~~Стрик не инкрементируется в v12~~ → **ЗАКРЫТО** 2026-05-08 (Wave 0 commit 01, ветка `wave-0/01-streak-no-reset`, SHA `3aca77d`, PR #45 ждёт пакетного merge'а с волной): новая модель `streak_days` без обнуления при пропуске, `updateStreak` вынесен в `backend/utils/streaks.js`, дёргается из progress + diary + telegram bot. UI показывает мягкое предупреждение «Ты пропустил вчера» при `missed_yesterday=true`. Backend +14 тестов (307/307), frontend +3 (212/212). См. [memory/wave_0_streak.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_0_streak.md). |
| ~~12~~ | ~~MEDIUM~~ | ~~Hardcoded «ПКС» по всему проекту~~ → **ЗАКРЫТ ПОЛНОСТЬЮ** Wave 1 коммитами 1.01-1.04. История: Wave 0 #02 (`8c9df80`) убрал литерал из HomeScreen через regex-маппинг; Wave 1 #1.01 ввёл справочник `program_types` + поле `rehab_programs.program_type`; #1.02 dashboard JOIN с program_types; #1.03 удалил regex-маппинг `utils/programLabels.js`; **#1.04: убран дефолт `'acl'` в `services/api.js` getPhases (теперь обязательный аргумент), RoadmapScreen читает program_type из dashboardData, telegramBot SQL фазы подтягивает через `ph.program_type = rp.program_type` JOIN'ом**. Multi-protocol foundation полностью готов. |
| 13 | MEDIUM | **RehabProgramModal: «Комплекс #N»** в селекторе — у комплексов нет `title`, фронт показывает fallback `Комплекс #${id}`. Инструктор не понимает что выбирает. Требуется или добавить понятную метку (например `Комплекс из X упр., создан DD.MM`), или сделать `title` обязательным. Обнаружено в prod-smoke 2026-05-12. |
| ~~14~~ | ~~LOW~~ | ~~`is_registered = false` для OAuth-пациентов~~ → **ЗАКРЫТО** 2026-05-12 (`52631a2`): условие во всех 5 SELECT'ах `routes/patients.js` расширено до `password_hash IS NOT NULL OR last_login_at IS NOT NULL`. Покрывает любой провайдер (local/telegram/yandex/google/vk + новые). Без миграции. |
| 15 | MEDIUM | **MDEditor (поле «Описание» в редакторе упражнения) — text color не подхватывает тему** — пакет `@uiw/react-md-editor` v4 автоимпортирует только `esm/index.css` с layout, а CSS-variables (`--color-fg-default`/`--color-canvas-default`) живут в `dist/mdeditor.css` которая не exposed через `package.json` `exports`. На светлой теме редактор пишет белым по белому, в тёмной непредсказуемо. Партнёрский баг к B6: глобальный `input/textarea/select` в `index.css` без background/color tokens — некоторые формы пациента/инструктора без локальных tokens могут показывать default browser white в тёмной теме. Тех-долг — заходить отдельным TZ от архитектора с дизайн-spec. Обнаружено и зафиксировано в prod-smoke 2026-05-12. |

## Завершённые исправления (защита от регрессий)

> Полный список с деталями: [audit_completed.md в memory](~/.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/audit_completed.md)

### CRITICAL (все закрыты 2026-04-08)
1. **POST /api/auth/register** — был открыт для всех → теперь `authenticateToken + requireAdmin`, ответ без JWT
2. **Refresh/reset токены в plaintext** → миграция `20260408_hash_tokens.sql`: `token` → `token_hash` (SHA-256 hex64), helper `backend/utils/tokens.js`
3. **Нет lockout для пациентов** → миграция `20260408_patient_lockout.sql` + логика в `patientAuth.js` (5 попыток → 15 мин)
4. **Сломанный маршрут complexes.js:614** — `pool` не определён → удалён
5. **IDOR на permanent delete комплексов** → транзакция + ownership check
6. **Cascade delete пациента оставляет сироты** → полный cleanup + транзакция
7. **Race condition при создании комплекса** → SELECT FOR UPDATE
8. **Bulk import DoS** → limit 500

### HIGH (все закрыты)
9. **`/uploads` публично** → аватары через `/api/patient-auth/avatar` с JWT (коммит 432e09b)
10. **Patient JWT в localStorage** → httpOnly cookie `patient_access_token` (SameSite=Lax, было Strict → Lax из-за проблем с navigate()). CSRF закрыт Origin-check middleware
11. **Access token пациента в URL** → публичный flow удалён ПОЛНОСТЬЮ. Нет `/patient/:token` роута, колонка `complexes.access_token` дропнута (миграция 20260409)
12. **Inconsistent response formats** → все 13 роут-файлов стандартизированы: `{ data, message? }` для успеха, `{ error, message }` для ошибок
13. **AuthContext не хранит refresh_token** → использует `clearTokens()` из api.js
14. **Scheduler хардкодит Europe/Moscow** → per-user tz из notification_settings
15. **Config не валидирует все env vars** → warnings для SESSION_SECRET, TELEGRAM_BOT_TOKEN, KINESCOPE_API_KEY
16. **change-password не инвалидирует refresh tokens** → false positive, уже удалял
17. **PatientDashboard бесконечный loading при 500** → false positive, уже был finally
18. **Публичные endpoints без rate limiting** → generalLimiter на /phases, /tips
19. **Admin NaN в LIMIT** → parseInt fallback
20. **Невалидированные числовые params** → parseInt + isNaN guard на /phases/:id

### MEDIUM (закрытые)
21. **`SELECT *` в patients утекает password_hash** → явный allowlist + `is_registered` computed (2026-04-09)
22. **Patient email не UNIQUE** → partial UNIQUE index в миграции
23. **Progress log IDOR** → ownership check для JWT
24. **Деактивированный инструктор с валидным JWT** → auth middleware проверяет is_active в БД
25. **Нет индекса на complex_exercises(exercise_id)** → миграция
26. **complexes.patient_id допускает NULL** → NOT NULL в миграции
27. **Нет автоочистки истёкших refresh tokens** → cron 03:00 МСК
28. **Отрицательные duration_seconds** → Math.max(0, ...)
29. **Нет лимита длины сообщений** → max 5000 chars
30. **Дубль email возвращает 400** → 409 Conflict
31. **RoadmapScreen падает при пустом phases array** → guard
32. **ContactScreen дублирует polling intervals** → cleanup перед generate

### BUG (закрытые v12 redesign — 2026-04-20)
33. **DiaryScreen crash `Cannot convert undefined or null to object`** → **не воспроизводится после v12 rewrite** (не «закрыт фиксом»). Оригинальный stack trace указывал на `ContactScreen.js:552` — файл был на 451 строку (артефакт старого бандла). После полного редизайна DiaryScreen и ContactScreen в Checkpoints 5–6 код 99% другой, старый сценарий неактуален. Grep по `Object.entries`/`keys`/`values` в новом коде — все под guard'ом. Ручная проверка в dev-браузере на тапе «Дневник» — console чистая. **Если баг повторится — retrace с новым stack trace, НЕ считать это пометки-resolve достаточной защитой.**
34. **F5 flicker — мелькает Login на /patient-dashboard** → новый `<PatientSplash/>` (full-screen logo+spinner) показывается пока `PatientAuthProvider.loading=true`. `PatientRoute` и `PatientLogin` оба проверяют `authLoading` перед рендером.

### BUG (закрытые prod smoke-test — 2026-04-24)
35. **ExerciseRunner кидает на «Начать тренировку» после «Выполнено»** → [ToastContext.js](frontend/src/context/ToastContext.js) объект `toast` пересоздавался каждый render ToastProvider, контекст value менял ссылку → `PatientDashboard.fetchDashboard = useCallback(..., [toast])` инвалидировался → `useEffect([fetchDashboard])` вызывал fetchDashboard без silent → `setLoading(true)` → `renderScreen()` возвращал skeleton → ExercisesScreen unmount → после `setLoading(false)` mount с initial state (view='list'). Fix: **useMemo для toast-объекта** с deps `[addToast, removeToast]`. **Общий урок:** любое object/array значение в Context.Provider value обязательно оборачивать в useMemo. Коммит `ec8ba2c`.
36. **Schema drift между dev и prod** (/api/exercises 500, /api/diagnoses 500) → recovery миграция `20260424_prod_schema_recovery.sql` переименовала category→body_region, difficulty→difficulty_level (beginner=1/intermediate=3/advanced=5), добавила movement_pattern/chain_type/joint/is_unilateral + diagnoses.deleted_at/updated_at. Полностью идемпотентна. **Новое правило в CLAUDE.md:** никаких ручных ALTER через psql на dev БД — только миграции.
37. **Миграции не идемпотентны на redeploy** → CREATE INDEX на дропнутый `token` падал при 2-м прогоне → DO-блоки с проверкой column_exists в 20260204_security_updates, 20260210_patient_auth, 20260408_hash_tokens, 20260421_patient_preferred_messenger.
38. **Kinescope import 229→0** из-за description NOT NULL + cascade failure в транзакции → миграция `20260424b_exercises_description_nullable.sql` + SAVEPOINT video_import в `routes/import.js` (per-iteration rollback).
39. **Exercises library показывает «50 из 50»** после импорта 239 видео → backend default limit 50→1000 в `routes/exercises.js`.
40. **ImportExercises показывает «импортировано 0»** при успехе → frontend читал `response.data.results.success` вместо `response.data.success` (после unwrap interceptor уровень не тот).
41. **Двойной аватар + хардкод «Татьяна · куратор»** на каждом экране PatientDashboard → убрали inline `<AvatarBtn>` из Home/Roadmap/Diary/Contact (остался только в pd-header). «Татьяна» chip удалён — нет реального куратора в dashboard data. Коммит `d57b116`.
42. **Self-registration пациента с `created_by=NULL`** невидим инструкторам (фильтр GET /api/patients по `created_by=$1`) → **ЗАКРЫТО** Phase 1 invite-code flow (коммит `e3970f6`, миграция `20260427_patient_invite_codes.sql`). Self-registration без кода невозможна — `created_by` ставится через invite-code, который генерирует инструктор.

### BUG (закрытые 2026-04-28, Phase 3 RehabProgramModal)
43. **Нет UI для создания RehabProgram** (gap из MEMORY.md backlog) → создан [frontend/src/components/RehabProgramModal.js](frontend/src/components/RehabProgramModal.js) + интеграция в [Patients.js](frontend/src/pages/Patients.js): кнопка «Программа» на карточке пациента, модалка create/edit/delete с выбором комплекса/диагноза/фазы. Backend без изменений (POST/PUT/DELETE /api/rehab/programs уже были готовы). 7 unit-тестов. Разблокирует Home-экран пациента (блок «Ваш комплекс на сегодня») — раньше требовался прямой INSERT SQL для создания rehab_programs записи.

### Compliance (2026-04-29)
44. **Disclaimer лгал про at-rest шифрование** → [PatientDashboard.js:197](frontend/src/pages/PatientDashboard/PatientDashboard.js#L197) текст «Ваши медицинские данные хранятся в зашифрованном виде» был неправдой (TLS in transit + bcrypt пароли + SHA-256 токены, но сами поля diagnosis/diary/notes лежат plaintext в БД). Заменено на «Данные передаются по защищённому каналу… Доступ ограничен вами и вашим куратором». Также убрано «GDPR» — европейский регламент не применяется к российскому сервису. Backlog: реальное at-rest шифрование чувствительных полей через pgcrypto.

### Migration tracking (2026-04-29, Phase B.2)
49. **Schema drift Bug #36 был возможен из-за отсутствия tracking** → новая таблица `_migrations(filename PK, applied_at, checksum)` через миграцию [20260429_create_migrations_table.sql](backend/database/migrations/20260429_create_migrations_table.sql). [deploy/migrate.sh](deploy/migrate.sh) переписан с **checksum-tracking + bootstrap логикой:** при первом прогоне (пустая `_migrations`) все существующие .sql файлы помечаются как legacy с NULL checksum → потом фиксируются их фактические SHA-256. Дальше: новые миграции применяются + INSERT, изменённые — exit 1 с алертом. **Политика:** миграции после apply immutable, исправления — только новой миграцией. Принимает `APP_DIR` env override для локального тестирования. Прогонял dev: bootstrap (27 миграций) → idempotent re-run → modified file → ERROR detection — всё работает.

### Runtime schema drift detection (2026-04-29)
53. **Bug #36 анти-регрессия — обнаружение ALTER TABLE мимо миграций** → daily cron в 04:00 МСК через [deploy/check-schema-drift.sh](deploy/check-schema-drift.sh). Сравнивает свежий `pg_dump --schema-only --no-owner --no-privileges --schema=public` с baseline'ом в `/var/lib/azarean-rehab/schema-baseline.sql`. Если diff:
- Если в `backend/database/migrations/*.sql` появились новые файлы с момента baseline → legitimate (миграция прошла), baseline обновляется автоматически
- Если новых миграций нет → DRIFT, алерт в ops-bot с тегом «СХЕМА БД» и первыми 30 строками diff'а

Полный diff лог в `/var/log/azarean-rehab-schema-drift.log`. Cron entry устанавливается в [setup.sh](deploy/setup.sh) (идемпотентно). Bootstrap при первом запуске — снимок текущей prod-схемы как baseline + last-migr-count.

### Audit log retention plan (2026-04-29, Phase B.1)
48. **audit_logs может расти бесконечно** → решение зафиксировано в [docs/audit_log_retention.md](docs/audit_log_retention.md). **Tiered подход:** Tier 0 (текущий, ≤100k записей) — ничего не делаем; Tier 1 (100k-1M) — cron DELETE > 2 лет; Tier 2 (1M+) — partitioning by month с DROP старых партиций. **Текущий объём dev:** 19 записей за 2 дня — Tier 0 актуален ещё ~333 дня после запуска пилота. ФЗ-152 не требует конкретного срока, 2 года покрывают типичный гражданский процесс. ФСТЭК-3 года применим только к государственным ИСПДн, не к нам. Заготовка скрипта Tier 1 в документе, активировать при триггере (50k записей).

### Health endpoint (2026-04-29, Phase A.3)
47. **healthcheck.sh бил в бизнес-эндпоинт + рестартовал PM2 на одиночный 5xx** → новый минимальный [backend/routes/health.js](backend/routes/health.js) (`GET /api/health`) возвращает `{ status, uptime_sec, db:{alive,ms} }`. Нет version/memory/environment — reconnaissance hygiene. DB probe через `Promise.race` с 2-секундным таймаутом (защита от зависшего pg pool). 4 unit-теста (success, db down, timeout, exception). [deploy/healthcheck.sh](deploy/healthcheck.sh) переписан с **backoff threshold 3 fail подряд** через счётчик в `/var/lib/azarean-rehab/health-fails` — transient ошибка БД не вызывает цикл рестартов. Старый `/health` оставлен deprecated, удалить когда все мониторы перейдут на `/api/health`.

### Email integration (2026-04-29, Phase A.2 + расширение)
46. **Email-stub блокировал password reset на проде** → [backend/utils/email.js](backend/utils/email.js) переписан как **two-tier dispatcher Y360 → Resend → console**. **Y360 активен в prod 2026-04-29 (коммит `aed3043`)** — серверы в РФ закрывают 152-ФЗ, лучшая deliverability в .ru-боксы. Через nodemailer SMTP (smtp.yandex.ru:465 SSL) с app-password из id.yandex.ru. DNS все на NetAngels: TXT yandex-verification + MX → mx.yandex.net + DKIM mail._domainkey.my (multi-string TXT) + SPF `my` объединённый `include:_spf.yandex.net include:_spf.resend.com`. Resend остаётся как fallback (REST API, free 3000/мес, серверы в США → трансграничная передача требует РКН-уведомления при коммерческом запуске). 7 unit-тестов на all branches (Y360 success, Y360 fail → Resend fallback, both fail, only Resend, stub, lazy-init). Smoke OK — письмо в Gmail мгновенно через `provider: y360`. Подробности и грабли — [memory/email_y360_setup.md](.claude/.../memory/email_y360_setup.md).

### Observability (2026-04-29, Phase A.1 Sentry)
45. **Prod-баги невидимы пока пациент не пожалуется** → подключён Sentry на backend и frontend. [backend/instrument.js](backend/instrument.js) подключается первой строкой в [server.js](backend/server.js) (Sentry v10 на OpenTelemetry требует init до express require). `Sentry.setupExpressErrorHandler(app)` перед custom error handler. Frontend: init в [frontend/src/index.js](frontend/src/index.js), `<Sentry.ErrorBoundary>` оборачивает `<App />` (fallback с кнопкой «Попробовать снова»). Без `SENTRY_DSN` / `REACT_APP_SENTRY_DSN` — SDK работает в noop-режиме, dev/тесты не нагружаются. **PII scrubbing:** ручной `beforeSend` чистит `password/token/code/code_hash/code_verifier/invite_code/nonce` из request data, headers `cookie`+`authorization` удаляются. `tracesSampleRate: 0.1` в проде, 0 в dev. **Sentry.io ingest заблокирован для русских IP** — DSN не задан, SDK в noop. Параллельно работает Telegram ops-bot (см. #50).

### Telegram ops-bot для error alerts (2026-04-29, активен в prod)
50. **Sentry.io не работает с русских IP — нужна альтернатива observability** → собственный Telegram-бот `@vadim_azarenkov` (chat_id=183943760) принимает алерты. [backend/utils/opsAlert.js](backend/utils/opsAlert.js) — sender через нативный fetch на api.telegram.org/sendMessage, дедуп hash(title+первая строка body) TTL 10 мин, hourly cap 30. Wired в `process.on('uncaughtException')` (с 1сек flush перед exit), `unhandledRejection`, global error middleware (только 5xx) + catch-блоки Telegram/Yandex OAuth callback'ов (там 302 redirect, не 5xx — global middleware пропускает). [backend/routes/log-error.js](backend/routes/log-error.js) — POST endpoint для frontend (rate-limit 30/мин IP, sanitize фиксированными max-length). [frontend/src/components/ErrorBoundary.js](frontend/src/components/ErrorBoundary.js) componentDidCatch + window.error + unhandledrejection в [frontend/src/index.js](frontend/src/index.js) шлют через keepalive fetch. **Категоризация ошибок** [opsAlert.js](backend/utils/opsAlert.js): Frontend → ТЕСТ/СТАРЫЙ БАНДЛ/СВЯЗЬ/БАГ В UI; Backend → БД (PG codes 22xxx/23xxx/42xxx)/СЕРВИС НЕДОСТУПЕН/ТАЙМАУТ/AUTH. Алерт включает «что/где/что делать», `describePage(url)` переводит роуты в «личный кабинет пациента», `describeUA` парсит UA в «Chrome 144 / Windows». Если `OPS_BOT_TOKEN`/`OPS_CHAT_ID` пусты — noop через console.log.

### iPhone OAuth BIGINT баг (2026-04-29, найден в проде через ops-bot pipeline)
51. **Phone-autolink падал при логине с современных Telegram-аккаунтов** → Telegram OIDC начал возвращать `sub > 9.22e18` (BIGINT max) с 2024-2025 (видели `10399974012659476296`). UPDATE patients SET telegram_chat_id = $2 в phone-autolink ветке падал с pg `code: 22003 — out of range for type bigint`, catch-all возвращал юзера на /patient-login с oauth_error «Ошибка обработки входа». Десктоп (id=6, sub=7358444850707888434, помещался) работал — баг проявлялся только на новых OAuth-сессиях. **Закрыто миграцией [20260429_telegram_chat_id_numeric.sql](backend/database/migrations/20260429_telegram_chat_id_numeric.sql)** — ALTER COLUMN BIGINT → NUMERIC(20). pg-node возвращает int8/numeric одинаково (как строку из-за JS Number precision до 2^53), поэтому миграция type-only — JS-код не меняется. Идемпотентна (DO-блок проверяет current_type перед ALTER). **Урок:** не использовать BIGINT для Telegram-связанных IDs (chat_id, user_id, sub) в новых колонках — только NUMERIC(20) или TEXT.

### OAuth boundary tests (2026-04-29, приоритет архитектора #1)
52. **OAuth match-flow не покрывался unit-тестами** → 18 тестов в [backend/tests/__tests__/oauthCallback.routes.test.js](backend/tests/__tests__/oauthCallback.routes.test.js): Telegram callback (8 boundary scenarios — returning/phone-autolink-single/no-match/multi-match anti-misroute/claimed-account/state-expired/deactivated/phone-format-norm + 3 edge cases) + Yandex callback (6 — returning/autolink/no-match-with-email-prefill/no-code-fail/extractClaims-default-phone-parse/no-default-phone) + meta /oauth/providers. **Multi-match anti-misroute** (родитель↔ребёнок с одним телефоном) покрыт явно — главная зона риска по ФЗ-152. Mock-инфраструктура: services/telegramOidc + services/yandexOauth полностью замоканы (handleCallback возвращает claims), `extractClaims` Yandex остаётся реальным через jest.requireActual для покрытия парсинг-логики `default_phone: { id, number }`.

### Wave 0 commit 01 — стрик без обнуления (2026-05-08, в feature-ветке, ждёт пакетного merge'а)
54. **Стрик не инкрементировался в v12 (Bug #11 закрыт)** → ветка `wave-0/01-streak-no-reset`, SHA `3aca77d`, PR #45. Старая `updateStreak` обнуляла counter при пропуске + дёргалась только из мёртвого `if (exercises_done)` ветки в diary (флаг убран из UI v12) + не вызывалась из `POST /api/progress`. Новая модель: миграция [20260508_streak_days.sql](backend/database/migrations/20260508_streak_days.sql) + [backend/utils/streaks.js](backend/utils/streaks.js) с defensive `updateStreak` (UPSERT через streak_days, ROLLBACK при ошибке, не пробрасывает). `current_streak` = total уникальных дней активности (не consecutive), `longest_streak` хранит max consecutive run для retrospective и Star Tracker. Триггерится из `POST /api/progress` (source='progress') + `POST /my/diary` безусловно (source='diary') + telegram bot diary wizard (удалён дубль -49 строк). `/my/dashboard` и `/my/streak` возвращают `missed_yesterday` + `days_since_last_activity`. HomeScreen показывает жёлтую плашку «Ты пропустил вчера…» под карточкой прогресса при `missed_yesterday=true`. **Тесты:** backend +14 (`streaks.test.js`), frontend +3 (HomeScreen warning branch). Smoke 4/4 в браузере: warning при пропуске виден, активность не обнуляет (5→6), diary+progress оба триггерят. **Архитектурное решение** — стрик НЕ daily consecutive, а total active days, сохранено в [memory/wave_0_streak.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_0_streak.md).

## Структура тестов

```
backend/tests/__tests__/ (16 файлов, 269 тестов)
├── admin.routes.test.js            # Admin API (488 строк)
├── patientAuth.middleware.test.js  # Patient JWT middleware (195 строк)
├── patientProfile.test.js          # Профиль пациента + my-complexes + avatar (377 строк)
├── progress.routes.test.js         # Progress с patient JWT + instructor JWT (176 строк)
├── originCheck.test.js             # CSRF Origin-check (104 строки)
├── rehab.routes.test.js            # Rehab API (656 строк)
├── scheduler.test.js               # Scheduler (187 строк)
├── telegram.routes.test.js         # Telegram API (164 строки)
└── telegramBot.test.js             # Telegram бот (318 строк)

frontend/src/ (12 suites, 156 тестов)
├── services/api.test.js            # Тесты API-сервиса
├── context/AuthContext.test.js
├── pages/Admin/AdminPanel.test.js  # Admin panel (307 строк)
├── pages/PatientDashboard/PatientDashboard.test.js
│   components/ (HomeScreen.test.js, ExercisesScreen.test.js, DiaryScreen.test.js, ProfileScreen.test.js, RoadmapScreen.test.js)
└── utils/exerciseConstants.test.js
```

## Telegram бот

- **Библиотека:** `node-telegram-bot-api` 0.67 (НЕ Telegraf)
- **Команды:** /start (привязка по коду), /status (прогресс), /diary (6-шаговый wizard), /tip (совет дня), /help
- **Diary wizard:** pain → swelling → mobility → mood → sleep → notes (in-memory state, 10 min timeout)
- **Cron:** exercise reminders (каждую минуту), diary reminders (21:00), daily tips (12:00) — Europe/Moscow
- **Привязка:** пациент генерирует код на сайте → вводит в бот → telegram_chat_id записывается в patients

## Kinescope интеграция

- ~1000 видео упражнений
- API: list videos (пагинация 50/page), get thumbnail, project management, folder filtering
- Thumbnail sync: `POST /exercises/fetch-all-thumbnails` (N+1 — по 1 запросу на видео с 100ms delay)
- Embed: video_url → `https://kinescope.io/embed/` + ID

## Дизайн-эталоны (ExerciseRunner)

- **Дарья:** `C:/Users/Вадим/Desktop/NEW EXERCISE/NEW EXERCISE/block-daria-gym.html` (prefix `.dg`, 12 упражнений, 1 день)
- **Никита:** inline HTML предоставлен в чате 2026-04-13 (prefix `.ns`, 16 упражнений, 2 дня с tabs)
- CSS обоих эталонов идентичен: iOS палитра `--az-*`, single `.crd` card с `.sec` border-top секциями, system font, 3 breakpoints (480/769/1801), slide-in анимация. RPE 1-10 по зонам, pain slider gradient, секундомер, таймер с голубым фоном.

## Roadmap / планы развития (реализовывать ТОЛЬКО по запросу)

> **ВНИМАНИЕ:** Эта секция — справочный wishlist. НЕ реализовывать ничего из этого списка без явного запроса пользователя.

### Паттерны кода
- **CSS Modules** вместо глобальных стилей (решит 80+ дублей)
- **design-tokens.css** — CSS переменные для цветов, light/dark тема
- **zod** вместо express-validator (или подключить существующие validators.js)
- **apiFetch() wrapper** с автоматическим refresh и error handling
- **Toast через context** (уже есть, но не используется везде)
- **Soft delete + archive pattern** (is_archived, restore, counts)

### Архитектура
- **CLAUDE.md как единый источник правды** (этот файл)
- **Memory система** для Claude Code (уроки, фидбэк, ссылки)
- **Миграции нумерованные** (001_..., 002_...) вместо дат (проще порядок)
- **buildPatch() pattern** для dynamic PATCH
- **Error sanitization** — `request.log.error(err) + reply.code(500).send({ error: 'Internal server error' })` вместо `throw err`

### Безопасность
- **2FA через Telegram** (6-значный код, 5 мин)
- **requireRole() middleware** с role-based доступом
- **API key fallback** для тестов и service accounts
- **Валидация zod** на каждом endpoint

### Деплой (когда придёт время)
- PM2 + Nginx + Let's Encrypt SSL
- trustProxy: true для cookies за nginx
- UFW firewall
- Ежедневные pg_dump бэкапы
- Healthcheck endpoint

## Production deploy (задеплоено 2026-04-23)

- **URL:** https://my.azarean.ru (single subdomain — frontend + API через nginx proxy)
- **VDS:** 185.93.109.234 (shared с JARVIS Director — Fastify на :3000 НЕ ТРОГАТЬ)
- **Путь:** `/opt/azarean-rehab/` (backend/, frontend/build/, releases/TS, current → symlink)
- **Backend:** PM2 fork mode на :3001, systemd startup
- **Nginx:** `/etc/nginx/sites-available/my.azarean.ru` (HTTP→HTTPS, SPA + /api proxy)
- **SSL:** Let's Encrypt, certbot --nginx --redirect (auto-renew)
- **CI/CD:** `.github/workflows/deploy.yml` — push на main → Test → Build → Deploy (SSH)
- **Runbook:** `deploy/README.md` (6-step smoke test, rollback, troubleshooting)
- **Prod bot:** `@az_zari_bot` (token в `/opt/azarean-rehab/backend/.env` на VDS)
- **Prod admin:** `vadim@azarean.com` / `Test1234`
- **Credentials locations:** `memory/production_deployment.md`

## Git

- **Repo:** https://github.com/jaike077-web/azarean-rehab.git
- **100+ коммитов**, активная разработка через codex PRs
- **Последние коммиты на main (CSS Modules + Dark theme — 2026-05-04):**
  - `c8834b5` fix(css): переименовать dash-case → camelCase в 44 module.css (КРИТИЧНО — без этого `s.foo` undefined)
  - `0584861` fix(sw): bump CACHE_NAME v2 → v3 (инвалидация кеша после CSS Modules миграции)
  - `1979cee` refactor(theme): хардкод цветов → токены design tokens (43 module.css)
  - `152314e` feat(theme): ThemeContext + переключатель в Profile/Dashboard
  - `329a1ba` feat(theme): расширить tokens.css dark-палитрой + auto prefers-color-scheme
  - `7705759` refactor(css): components + остатки + удаление common.css
  - `670ef06` refactor(css): Exercises страница + 6 компонентов → CSS Modules
  - `def1a1e` refactor(css): CreateComplex + EditComplex + EditTemplate (DnD-критично)
  - `b619d94` refactor(css): Patients (834 строки) → CSS Modules
  - `2b50615` refactor(css): MyComplexes + переезд .exercise-description
  - `d7e4a95` refactor(css): Diagnoses + Trash → CSS Modules
  - `2fdae91` refactor(css): Login + PatientAuth + Admin → CSS Modules
  - `4e06a72` chore(css): удалить мёртвый ExercisesTemp.css
  - `232cdc4` feat(css): добавить базовые design tokens (foundation)
- **Предыдущие коммиты (Phase 1+2 — invite-code + Telegram + Yandex OAuth + RehabProgram UI):**
  - `e1fbaae` feat(rehab-programs): UI для создания RehabProgram из карточки пациента
  - `7b19e9d` feat(oauth): Yandex OAuth 2.0 — Phase 2d, в проде
  - `7cb4742` feat(oauth): Telegram OIDC через прокси-VDS в Финляндии
  - `e3970f6` feat(patient-auth): invite-code flow для регистрации пациентов
  - `ec8ba2c` fix(toast): стабилизировать ссылку toast через useMemo
  - `d57b116` fix(patient-dashboard): убрать дубль аватара + хардкод «Татьяна · куратор»
- **Незакоммичено (на 2026-05-04 вечер):** ~30 файлов с применённой спекой архитектора (slate-indigo палитра, simplified ThemeToggle, active nav primary-fill, PatientProgress contrast). Ждёт визуального smoke юзера в браузере перед push'ем — см. [SESSION_HANDOFF_2026-05-04.md](SESSION_HANDOFF_2026-05-04.md).
