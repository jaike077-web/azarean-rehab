# Azarean Rehab — Project Status Report

**Дата среза:** 2026-04-22
**Для кого:** архитектор проекта
**Автор:** Claude Code (Opus 4.7 1M)
**Ветка / коммит:** `main` / `b3337ed` (всё запушено на `origin/main`)

---

## 1. Executive summary

Платформа реабилитации для физиотерапевтической студии **Azarean Network** (Екатеринбург): React-frontend + Node.js/Express-backend + PostgreSQL 18 + Telegram-bot. Две роли: инструктор (админка) и пациент (личный кабинет). Ядро — персонализированные комплексы упражнений (~1000 видео на Kinescope), программы реабилитации ПКС/плечо, дневник боли/отёка/ROM, чат с куратором.

**Текущее состояние — готов к прод-деплою по функциональности.** Не задеплоен из-за конфликта субдоменов с JARVIS-проектом на общем VDS. Две сессии плана v12-миграции закрыты:

- **Сессия 1** (8 чекпоинтов) — полный UI-редизайн пациентского дашборда под v12-эталон
- **Сессия 2** (частично) — закрытие 5 MEDIUM-багов технического долга; пункт «деплой» отложен до решения по DNS

**Метрики:**
- **Тесты:** backend 197 pass / 10 suites · frontend 208 pass / 13 suites · всего 405
- **Коммитов в репо:** 177 · последний на remote `b3337ed`
- **DB-миграций:** 20 применённых к локальной dev БД
- **Строк в продовом коде (bytes):** backend ~70 КБ в routes/, frontend ~50+ файлов в PatientDashboard alone

---

## 2. Архитектура — снимок

### 2.1 Стек

| Слой | Технологии |
|---|---|
| Frontend | React 19.2 + CRA (react-scripts 5) + JS (не TS) + Axios 1.13 + @dnd-kit + lucide-react + react-router-dom 7 |
| Backend | Express 5.1 + Node.js (CommonJS) + pg 8.16 (raw SQL через `query()` wrapper) + express-validator 7.3 |
| БД | PostgreSQL 18 (dev) · 20 нумерованных миграций |
| Auth | bcryptjs + jsonwebtoken (HS256 explicit) + httpOnly cookies для пациентов · Bearer header для инструкторов |
| Security | helmet 8.1 + express-rate-limit + requireSameOrigin CSRF middleware + SHA-256 хэширование refresh/reset токенов |
| Видео | Kinescope API (thumbnail generation + embed) |
| Интеграции | node-telegram-bot-api 0.67 + node-cron 4.2 + multer 2.0 + sharp 0.34 |
| Тесты | Jest 30.2 + Supertest 7.2 + @testing-library/react |

**Ключевые осознанные решения:**
- **Нет TypeScript** — только PropTypes в PatientDashboard. Проект небольшой, переход TS — отложен
- **Нет CSS Modules** — глобальные CSS, prefix-конвенция `pd-*` для пациентского дашборда. Dead code 80+ дублей классов — в плане рефакторинга
- **ExerciseRunner v3 LOCKED** — 384-строчный CSS 1:1 порт iOS-эталона с `--az-*` переменными (не `--pd-*`)
- **Raw SQL вместо ORM** — явный контроль запросов, параметризация через `$1, $2`

### 2.2 Две параллельные системы auth

| Аспект | Инструктор | Пациент |
|---|---|---|
| JWT_SECRET | `JWT_SECRET` | `PATIENT_JWT_SECRET` |
| Access-token | 1h, localStorage, Bearer | 15min, httpOnly cookie `patient_access_token` (SameSite=Lax, path=/api) |
| Refresh-token | 7d, БД SHA-256 | 30d, httpOnly cookie `patient_refresh_token` (SameSite=Lax, path=/api/patient-auth) |
| Account lockout | 5 попыток → 15 мин | 5 попыток → 15 мин |
| CSRF | Bearer-only, N/A | requireSameOrigin на всех state-changing |
| Состав routes | `/api/auth/*`, `/api/admin/*` | `/api/patient-auth/*`, `/api/rehab/my/*` |

Композитный middleware `authenticatePatientOrInstructor` для `/api/progress` принимает оба типа токенов.

### 2.3 Схема БД — 20 таблиц

**Основные:**
- `users` (инструкторы/админы), `patients`, `diagnoses`, `exercises`, `complexes`, `complex_exercises`, `progress_logs`
- `rehab_programs` + `rehab_phases` (6 фаз ACL), `diary_entries` + `diary_photos`, `streaks`, `messages`, `tips`, `phase_videos`
- `notification_settings`, `telegram_link_codes`, `patient_oauth_states`, `patient_password_resets`, `refresh_tokens`, `patient_refresh_tokens`, `audit_logs`

**Характерные решения:**
- Soft delete через `is_active` / `deleted_at` вместо удаления
- Partial UNIQUE index на `patients(email) WHERE email IS NOT NULL` — email опциональный
- `diary_entries.better_list` — JSONB whitelist из `['ext','walk','sleep','mood','pain','custom']`
- `messages.sender_id` — полиморфный INT (patient.id ИЛИ users.id, sender_type различает). **Без FK** — известный tech debt (#10 в CLAUDE.md), требует split в 2 nullable FK для полного фикса
- `audit_logs.patient_id` — денормализация для быстрых GDPR-выборок

### 2.4 Структура кода

```
backend/
├── server.js                     378 строк
├── config/config.js              fail-fast валидация env
├── database/
│   ├── db.js                     pg Pool + query() + getClient()
│   ├── schema.sql
│   ├── seeds/                    acl_phases.sql + test_patient_data.sql
│   └── migrations/               20 SQL миграций
├── middleware/
│   ├── auth.js                   authenticateToken, requireAdmin, authenticatePatientOrInstructor
│   ├── patientAuth.js            authenticatePatient (cookie-first + Bearer fallback)
│   ├── originCheck.js            requireSameOrigin — CSRF
│   ├── upload.js                 Multer + Sharp для аватаров и diary-фото
│   └── validators.js             express-validator (ПОДКЛЮЧЕН к 7 роутам с Session 2)
├── routes/                       13 файлов, ~6700+ строк
├── services/
│   ├── telegramBot.js            631 строка
│   ├── scheduler.js              cron per-user timezone
│   ├── kinescopeService.js
│   └── csvImportService.js
├── utils/
│   ├── tokens.js                 hashToken() SHA-256
│   ├── email.js                  stub (console.log в dev)
│   └── audit.js                  logAudit() — GDPR shared helper (Session 2, new)
└── tests/__tests__/              10 файлов, 197 тестов

frontend/
├── src/App.js                    routing + React.lazy + Outlet-based PatientAuthProvider layout
├── services/api.js               Axios instances (api + patientApi) + unwrap interceptor + auto-refresh
├── context/                      AuthContext, PatientAuthContext, ToastContext
├── hooks/useConfirm.js
├── utils/
│   ├── dateUtils.js
│   └── exerciseConstants.js
├── styles/common.css             глобальные стили
└── pages/
    ├── Dashboard.js              tab-container для инструктора
    ├── Patients.js + CreateComplex + MyComplexes + Trash + Diagnoses + Exercises/ + ViewProgress + PatientProgress + ImportExercises + EditComplex + EditTemplate
    ├── PatientAuth/              Login, Register, ForgotPassword, ResetPassword
    ├── PatientDashboard/         полностью переписан под v12
    │   ├── PatientDashboard.js
    │   ├── tokens.css            --pd-* design tokens
    │   ├── PatientDashboard.css  глобальные стили пациентского scope'а
    │   ├── hooks/
    │   │   └── usePatientAvatarBlob.js
    │   └── components/
    │       ├── HomeScreen.{js,css,test.js}
    │       ├── RoadmapScreen.{js,css,test.js}
    │       ├── DiaryScreen.{js,css,test.js}
    │       ├── ContactScreen.{js,css,test.js}
    │       ├── ProfileScreen.{js,css,test.js}    overlay-режим
    │       ├── ExercisesScreen.{js,test.js}
    │       ├── ExerciseRunner.js                 LOCKED v3
    │       ├── ComplexDetailView.js
    │       └── ui/                               v12 primitives
    │           ├── AvatarBtn · MessengerCTA · MessengerIcons · IllKnee
    │           ├── Pill · Section · ScreenHeader · SettingsRow · Switch
    │           ├── ProgressRing · PainScale · DifficultyScale · RestTimer
    │           ├── Card · ChipGroup · TabBar
    │           ├── AnimatedCheckmark · CelebrationOverlay
    │           └── index.js                       barrel export
    └── Admin/                     AdminContent, AdminUsers, AdminStats, AdminSystem, AdminAuditLogs, AdminUserModal
```

---

## 3. Проделанная работа — Сессии 1 и 2

### 3.1 Сессия 1 — v12 UI redesign (8 чекпоинтов)

Основа: `AZAREAN_V12_IMPLEMENTATION.md` + дизайн-референс `azarean-v12-final.jsx` (2120 строк прототип).

| # | Работа | Результат |
|---|---|---|
| 0 | Prep: tokens.css v12, 9 UI primitives, F5 splash-fix, bug #11 диагностика | Коммиты `bb6b462` → `c2792e6`. Заложен ground для редизайнов. |
| 1 | Profile overlay (вместо таба) + allowlist в PUT /me + тесты | `8644347` + polish. Таб-бар сократился с 6 до 5. |
| 2 | Backend: миграция `patients.preferred_messenger` + `messages.linked_diary_id/channel` | Multi-channel messenger схема готова. |
| 3 | Frontend: multi-channel picker + MessengerCTA + deep links TG/WA/MAX | Пациент выбирает любимый мессенджер, CTA ведут по правильному URL. |
| 4 | HomeScreen redesign | Hero-card с градиентом, PGIC «Как вы сейчас?», phase ring, 3 stats, daily tip. |
| 5 | ContactScreen redesign + linked_diary_date JOIN + Zari-виджет | Specialist feedback card с chip «К записи N апреля», emergency block, studio map-link, quick-actions (visual). |
| 6 | DiaryScreen redesign + structured fields + photo upload + PGIC persist | 4 новые колонки в `diary_entries` + таблица `diary_photos`. Sparkline 14 дней, фото 3-grid, better_list pills, pain_when. Bug #6 закрыт. |
| 7 | RoadmapScreen redesign | Timeline 6 фаз с pulse-dot на current, 4 pill-таба (Цели/Нельзя/Можно/Боль), exit-criteria Вариант A. Future-фазы раскрываются в полный план (не teaser — по запросу пациента). v12-палитра поверх seed-цветов. |

**Закрытые баги за Сессию 1:**
- `#6` Diary структурированные данные сериализовались в notes → теперь отдельные колонки
- `#11` DiaryScreen crash — **не воспроизводится после v12 rewrite** (не равно «починено фиксом»). DiaryScreen и ContactScreen переписаны с нуля в Checkpoints 5–6 → исходный stack trace `ContactScreen.js:552` неактуален. Grep по `Object.entries/keys/values` в новом коде — все под guard. Статус «resolved if не повторится», при регрессии — retrace с новым stack.
- `#12` F5 flicker — фикс через `PatientSplash` + отключённый dev-SW + bumped CACHE_NAME

**Баг, появившийся В ПРОЦЕССЕ Session 1 (не из брифа):**
- **bug_diary_photo_refresh** — визуальное мерцание при upload фото в DiaryScreen. Появился в Checkpoint 6 при имплементации photo upload. Применённые фиксы (stable key, optimistic preview через localUrl, React.memo с custom comparator, min-height grid) **не помогли**. Root cause теория архитектора про blob:// → /api URL swap **не подходит** — в коде `DiaryPhotoTileImpl` preservируется `localUrl` после upload (`{ ...res.data, _stableKey: tempId, localUrl }`), `img.src` не меняется. Реальная причина скорее всего в `setPhotos` → full re-render родителя DiaryScreen → DOM reflow через всю секцию. Нужна диагностика через DevTools Performance Profiler с записью upload-сценария, low priority.

**Новые API за Сессию 1:**
- `GET /api/rehab/my/diary/trend?days=N` — sparkline боли
- `POST/GET/DELETE /api/rehab/my/diary/:entry_id/photos/:photo_id` — фото дневника
- Расширения: `/me` (preferred_messenger, diagnosis, telegram_chat_id), `/my/messages` (linked_diary_date JOIN, channel), `/my/diary` (pgic_feel, rom_degrees, better_list, pain_when)

**Новые DB-миграции за Сессию 1** (три — все датой применения 2026-04-21, независимые таблицы, порядок не важен):
- `20260421_patient_preferred_messenger.sql` — `patients.preferred_messenger` + `messages.linked_diary_id` + `messages.channel` (Checkpoint 2 по плану)
- `20260421_diary_structured_fields.sql` — 4 колонки в `diary_entries` (pgic_feel/rom_degrees/better_list/pain_when) + таблица `diary_photos` (Checkpoint 6 по плану)
- `20260421_progress_difficulty_rpe10.sql` — **bonus-fix, НЕ из плана**. Старый CHECK на `progress_logs.difficulty_rating` был `1..5` (Phase 1 Sprint), ронял 500 на difficulty ≥6. ExerciseRunner v3 (2026-04-13) использует Borg CR-10 RPE scale. Миграция релаксирует до `1..10` + `NULL` OK.

### 3.2 Сессия 2 — техдолг (5 MEDIUM-багов)

| Bug | Коммит | Суть |
|---|---|---|
| `#3` Dashboard stats хардкод нулей | `8747c7c` | Dashboard.js теперь вызывает `/api/dashboard/stats` на mount, рендерит `patients_count`, `complexes_count`, `completion_percent`, `exercises_count`. Fallback `—` до загрузки/на ошибку. |
| `#4` `templates.update` без body | `8747c7c` | `api.put('/templates/${id}', data)` — одна строка, шаблоны перестали молча не сохраняться. |
| `#5` EditComplex toast copy-paste | `8747c7c` | При дубле упражнения `toast.success('Ссылка скопирована!')` → `toast.warning('Это упражнение уже добавлено')`. Остаток от старого публичного-ссылочного flow. |
| `#2` validators.js dead code | `4d49598` | 324 строки правил express-validator не были подключены. Подключено к: `POST /auth/register`, `POST /auth/login`, `POST /patient-auth/register`, `POST /patient-auth/login`, `POST/PUT /patients`, `POST/PUT /diagnoses`, `POST /progress`. Exercise/complex валидаторы **не подключены** — конфликтуют с реальными flows (`video_url` required + `exercises` min=1). Параллельно поправил `session_id: isUUID(4) → isInt({ min: 1 })` (схема `progress_logs.session_id` — BIGINT; `isInt` без `max` держит до Number.MAX_SAFE_INTEGER 2^53, что покрывает `Date.now()` session_ids на сотни лет вперёд; gap до реального BIGINT max 2^63 latent и пока не актуален). Расширил `body_region` enum под `exerciseConstants`. |
| `#8` GDPR audit-logs на чтения ПДн | `6b36bd2` | Новый `backend/utils/audit.js` — shared `logAudit(req, action, entityType, entityId, {patientId, details})` helper. Fire-and-forget. Подключено к 5 READ-эндпоинтам: `GET /patients`, `GET /patients/:id`, `GET /progress/patient/:patientId`, `GET /rehab/programs/:id/diary`, `GET /rehab/programs/:id/messages`. +4 unit-теста. |

---

## 4. Безопасность — текущее состояние

### 4.1 CRITICAL — все закрыты

1. `POST /api/auth/register` был открыт — теперь `authenticateToken + requireAdmin`, ответ без JWT
2. Refresh/reset токены в plaintext — SHA-256 в миграции `20260408_hash_tokens.sql`
3. Не было lockout пациентов — добавлен (5 попыток → 15 мин)
4. Сломанный маршрут `complexes.js:614` `pool` undefined — удалён
5. IDOR на permanent delete комплексов — транзакция + ownership check
6. Cascade delete пациента оставлял сироты — full cleanup в транзакции
7. Race condition при создании комплекса — SELECT FOR UPDATE
8. Bulk import DoS — лимит 500

### 4.2 HIGH — все закрыты

- `/uploads` был публичный — аватары через `/api/patient-auth/avatar` с JWT
- Patient JWT в localStorage → httpOnly cookie (SameSite=Lax после проблем со Strict при navigate())
- Access token в URL (Схема 1 публичного доступа) — **flow полностью удалён**, колонка `complexes.access_token` дропнута
- Inconsistent API response — все 13 роут-файлов стандартизированы на `{ data, message? }`
- AuthContext не чистил refresh_token, Scheduler хардкодил Moscow, Config не валидировал env vars — всё поправлено
- Публичные endpoints без rate limiting — generalLimiter на `/phases`, `/tips`
- `SELECT *` в patients утекал password_hash — явный allowlist + computed `is_registered`

### 4.3 MEDIUM — что осталось

| # | Severity | Что | Как решать |
|---|---|---|---|
| 1 | HIGH-by-design | Rate limiting off в dev | Оставить как есть. В prod включится от NODE_ENV. |
| 7 | MEDIUM | 80+ дублей CSS-классов | Migration на CSS Modules — отдельная сессия. Большой рефакторинг. |
| 9 | LOW | ErrorBoundary не ловит async errors | Рассмотреть `react-error-boundary` либо добавить global `window.onerror`. Low impact. |
| 10 | LOW | `messages.sender_id` без FK | Полиморфный split: `sender_patient_id INT REFERENCES patients`, `sender_instructor_id INT REFERENCES users`, CHECK на exactly-one-of. Backfill + код-миграция. Инвазивно, не критично. |

### 4.4 GDPR / 152-ФЗ audit-логирование

До Сессии 2 писались только UPDATE/DELETE из админки. Теперь покрыты чтения ПДн:
- Список пациентов (entity_type='patients_list')
- Карточка пациента (entity_type='patient', patient_id set)
- Статистика прогресса (entity_type='progress')
- Дневник пациента инструктором (entity_type='diary')
- Переписка с пациентом (entity_type='messages')

Формат `audit_logs`: `user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details JSONB, created_at`.

**Что не покрыто:** инструкторские READ упражнений/комплексов (технически не ПДн), админские действия из admin.js уже логируются собственным helper'ом (дубль — unified в будущем).

---

## 5. Тесты — раскладка

### Backend (197 тестов / 10 suites)

| Файл | Тестов | Что покрывает |
|---|---|---|
| `admin.routes.test.js` | ~40 | Admin API: users CRUD, stats, audit-logs |
| `patientAuth.middleware.test.js` | ~15 | Patient JWT middleware cookie/Bearer |
| `patientProfile.test.js` | ~20 | Профиль пациента + my-complexes + avatar |
| `progress.routes.test.js` | ~12 | Progress с patient+instructor JWT |
| `originCheck.test.js` | 7 | CSRF Origin middleware |
| `rehab.routes.test.js` | ~55 | Rehab API включая diary-photos upload |
| `scheduler.test.js` | ~10 | Cron scheduler |
| `telegram.routes.test.js` | ~10 | Telegram link routes |
| `telegramBot.test.js` | ~25 | Telegram bot /start /diary /tip |
| `audit.test.js` | 4 | GDPR audit-log helper (Session 2, new) |

### Frontend (208 тестов / 13 suites)

| Файл | Что |
|---|---|
| `services/api.test.js` | Axios interceptors, unwrap, auto-refresh |
| `context/AuthContext.test.js` | Instructor auth state |
| `pages/Admin/AdminPanel.test.js` | Admin screens |
| `pages/PatientDashboard/PatientDashboard.test.js` | Root container |
| `components/HomeScreen.test.js` | Hero, PGIC, phase ring, stats |
| `components/DiaryScreen.test.js` | Pain slider, pills, photo upload, sparkline |
| `components/ContactScreen.test.js` | Specialist feedback, MessengerCTA, Zari |
| `components/RoadmapScreen.test.js` | Timeline, 4 tabs, exit-criteria, future expand (Session 1 Checkpoint 7, 25 тестов) |
| `components/ProfileScreen.test.js` | Overlay, edit-sheet, messenger picker |
| `components/ExercisesScreen.test.js` | Список комплексов |
| `utils/exerciseConstants.test.js` | Константы |

---

## 6. Что остаётся незакрытым

### 6.1 Технический долг (из CLAUDE.md)

1. **#1 Rate limiting off в dev** — by design
2. **#7 80+ CSS-класс дубликатов** — `btn-primary` в 5 файлах, `modal-overlay` в 7. Миграция на CSS Modules / design-tokens.css — **отдельная сессия**, нужен dedicated план
3. **#9 ErrorBoundary не ловит async useEffect errors** — LOW
4. **#10 messages.sender_id no FK** — LOW, полиморфный split
5. **bug_diary_photo_refresh** — визуальное мерцание при upload фото, в долге, несколько фиксов уже применено (stable key, optimistic preview, React.memo, min-height grid), не помогло. Нужен Performance Profiler в DevTools

### 6.2 Отложенные фичи (будущие сессии)

| Запрос | Статус |
|---|---|
| **ROM CV measurement** — замер угла сустава по фото через MediaPipe Pose | Feature в роадмапе, **обязательная будущая** (см. `memory/feature_rom_cv_measurement.md`) |
| **Exit-criteria Вариант B** — реальная проверка метрик (ROM, pain level, pgic_feel, sessions count) вместо статичного списка из `criteria_next` | Session 3 из MIGRATION_PLAN |
| **2FA через Telegram** — 6-значный код, 5 мин TTL | В roadmap |
| **React 19 PWA layer** — View Transitions API, Service Worker production, iOS PWA quirks, Web Push, manifest.json, Lighthouse | Session 3 из MIGRATION_PLAN |
| **CSS Modules migration** | Долгий рефакторинг |
| **zod вместо express-validator** | Roadmap |
| **Pagination** (сейчас Patients/Exercises грузят всё) | Roadmap |
| **Dark theme** | Не начато, но tokens.css готовы к теме |
| **@uiw/react-md-editor** используется в Diagnoses для ПКС-описаний | Держим пакет на случай случайного drop в bundle optimization |

### 6.3 Замечания архитектора по этому отчёту (review 2026-04-23)

Архитектор сделал код-ревью v1 этого отчёта. Проверенные технические точки:

| Точка | Статус по факту |
|---|---|
| `messages.sender_type` существует? | ✅ **Да.** Колонка с миграции `20260210_rehab_tables.sql`. Live DB: `sender_type VARCHAR(20) NOT NULL CHECK IN ('patient','instructor')`. Полиморфизм через `sender_type`+`sender_id` — не галлюцинация. |
| `session_id` INT vs BIGINT | ⚠️ **Нюанс, не баг.** Валидатор `isInt({ min: 1 })` без max; safe boundary = Number.MAX_SAFE_INTEGER = 2^53 ≈ 9e15; схема BIGINT = 2^63. Real-world значения (Date.now = ~1.8e12) далеко ниже обеих границ. Latent risk есть только если перейдём на UUID-hash или hot-path BIGINT counter. |
| Bug #11 формулировка | ⚠️ **Слабая.** «Stale, не нашёл Object.entries» ≠ «починено». Правильно: «не воспроизводится после v12 rewrite, retrace при регрессии» (обновлено в CLAUDE.md). |
| photo_refresh root cause blob-swap theory | ❌ **Не подходит** — `DiaryPhotoTileImpl` preservирует `localUrl` после upload, `img.src` не меняется с blob на /api. Реальная причина — вероятно `setPhotos` → re-render родителя DiaryScreen → DOM reflow. Нужен DevTools Performance Profiler. |

Также зафиксированы 2 scope-момента:
- **Future-фазы в полный план (не teaser)** — явный запрос пользователя 2026-04-22 («я бы на месте пациента хотел знать весь план»), не scope creep
- **Roadmap 25 тестов** — часть рендер-тестов можно свернуть в `test.each`, маленькое over-coverage. Рефакторинг low priority

### 6.4 Деплой — точки блокировки

**Статус:** НЕ задеплоен. Планировался на VDS `185.93.109.234` (тот же, что JARVIS).

**Подготовленные credentials:** в `memory/deployment_plan.md` или у мейнтейнера.

**Планируемые субдомены:** `app/rehab/api.azarean.ru` → `185.93.109.234`
**Конфликт:** `rehab.azarean.ru` и `api.azarean.ru` **уже используются JARVIS**. Нужно решение архитектора:

- Вариант A: другие субдомены (`patient.azarean.ru` / `azarean-api.ru` и т.д.)
- Вариант B: переконфигурация nginx на VDS чтобы разделить по path-префиксу
- Вариант C: отдельный VDS

До выбора варианта деплой не стартует.

**Что нужно после выбора:** PM2 + Nginx + Let's Encrypt + trustProxy:true для cookies за nginx + UFW + ежедневный `pg_dump` + healthcheck endpoint.

---

## 7. Решения для архитектора — открытые вопросы

1. **Деплойный блокер:** какой из 3 вариантов выше по субдоменам?
2. **#10 messages.sender_id FK** — делаем ли полиморфный split сейчас или ждём, пока реально прилетит orphan-баг?
3. **Exit-criteria Вариант B** — приоритет в Session 3 или позже? Реальная проверка требует data из diary + progress аггрегаций
4. **CSS Modules migration (#7)** — отдельная sprint-сессия или постепенный перевод по мере правок?
5. **ROM CV measurement** — когда в roadmap? Требует Kinescope-like бэкенда для хранения фото и MediaPipe Pose inference (клиент или сервер?)
6. **Dark theme** — в планах? tokens.css готов, но компоненты используют hard-coded colors в нескольких местах
7. **Pagination** для Patients/Exercises — когда базы разрастутся, full-load начнёт тормозить

---

## 8. Риски и точки хрупкости

| Риск | Митигация |
|---|---|
| Telegram API flaky (ECONNRESET) | Ретраи не реализованы в scheduler — в проде добавить backoff 3-5 раз |
| Kinescope API N+1 на thumbnail sync | Делается batch'ами по 100 с delay 100ms — терпимо для ~1000 видео |
| ExerciseRunner v3 LOCKED — любое косметическое изменение может сломать iOS-палитру | CSS в `.pd-runner` scope изолирован. Комментарий в CLAUDE.md «НЕ ТРОГАТЬ» |
| **Scheduler шлёт сообщения в проде Telegram даже в dev** | Пока бот токен в .env — bot активен. Чтобы отключить — убрать `TELEGRAM_BOT_TOKEN` из backend/.env |
| `generalLimiter` = 1000 req/15min в dev — ошибочное ощущение безопасности | В prod автоматически 100 req/15min. В тестах rate-limit иногда всплывает |
| CRA dev-proxy (`setupProxy.js`) strip'ает Origin — requireSameOrigin пропускает | В prod через nginx Origin будет set'ен. CORS всё равно блокирует cross-origin |
| PostgreSQL DATE → JSON timezone sliding | Использовать `column::text` когда критично (применено в `/my/messages` для `linked_diary_date`) |
| В dev SW кешировал старые JS-chunks | Отключён в `index.js` если `NODE_ENV !== 'production'`, CACHE_NAME bumped v1→v2 |
| Полиморфный `messages.sender_id` без FK | Orphans возможны при hard delete пациента/инструктора, но сейчас нет операций, которые бы их создали массово. В проде мониторить. |

---

## 9. Справочники

### 9.1 Команды

```bash
# Запуск dev
cd backend && npm run dev          # :5000 nodemon
cd frontend && PORT=3001 BROWSER=none npm start   # :3001 CRA

# Тесты
cd backend && npm test                               # 197
cd frontend && npx react-scripts test --watchAll=false  # 208

# Backend lint / валидация env
cd backend && node -e "require('./config/config')"  # fail-fast если envs неполные

# БД миграции (ещё раз свежую установку)
psql -h localhost -U postgres -d azarean_rehab -f backend/database/schema.sql
for f in backend/database/migrations/*.sql; do psql -h localhost -U postgres -d azarean_rehab -f "$f"; done
```

### 9.2 Тестовые credentials

- **Инструктор (admin):** `vadim@azarean.com` / `Test1234` (пароль сброшен 2026-04-08 bcrypt в БД)
- **Тестовый пациент:** id=14, `avi707@mail.ru` / `Test1234` (Вадим, привязан к реальному Telegram)

### 9.3 Ключевые файлы

| Что | Путь |
|---|---|
| Спецификация проекта | `CLAUDE.md` (корень) |
| Брифинг для архитектора | `AZAREAN_REHAB_ARCHITECT_BRIEF.md` |
| План миграции v12 (3 сессии) | `AZAREAN_V12_MIGRATION_PLAN.md` |
| План Сессии 1 (8 чекпоинтов, выполнен) | `AZAREAN_V12_IMPLEMENTATION.md` |
| Дизайн-референс v12 | `azarean-v12-final.jsx` (single-file прототип 2120 строк) |
| Архивный прототип v2 (Feb 2026) | `docs/prototypes/patient-dashboard-v2.jsx` |
| LOCKED компонент | `frontend/src/pages/PatientDashboard/components/ExerciseRunner.js` |

### 9.4 Git

- **Repo:** https://github.com/jaike077-web/azarean-rehab
- **Branch:** `main` (PRs идут сюда же, CI ещё не настроен)
- **Последние 5 коммитов на remote:**
  - `b3337ed` docs(claude-md): отметить закрытые bugs Session 2
  - `6b36bd2` security(backend): GDPR audit-logs on patient data reads
  - `4d49598` security(backend): подключить express-validator к ключевым роутам
  - `8747c7c` fix(dashboard,templates,edit-complex): close 3 MEDIUM bugs
  - `56e5dfe` feat(patient): Roadmap — полный контент future-фаз + v12 палитра
- **Всего коммитов:** 177
- **Unpushed:** 0

---

## 10. Рекомендация следующих шагов

**Приоритет 1 — разблокировка деплоя:**
- Решить конфликт субдоменов с JARVIS (архитектор)
- Подготовить nginx config + PM2 ecosystem.config.js + deploy script
- Docker-compose как альтернатива?

**Приоритет 2 — Session 3 из MIGRATION_PLAN:**
- React 19 PWA layer (View Transitions, Service Worker prod, Web Push, Lighthouse score)
- Exit-criteria Вариант B с реальной проверкой метрик

**Приоритет 3 — техдолг:**
- #10 messages.sender_id FK split (инвазивно но чистит схему)
- #7 CSS Modules migration (долгий рефакторинг, но разблокирует dark theme)

**Приоритет 4 — фичи:**
- ROM CV measurement (MediaPipe Pose)
- 2FA через Telegram

---

**Конец отчёта.** Для уточнений — `CLAUDE.md` содержит исчерпывающий справочник по схеме БД, API, командам и правилам кода.
