# Azarean Rehab — Полное описание проекта (апрель 2026)

> **Этот документ — актуальный брифинг для Claude Architect.** Содержит полное описание текущего состояния проекта, архитектуры, реализованных фич, бизнес-правил и планов. Последнее обновление: 17 апреля 2026.

---

## 1. Что это

**Azarean Rehab** — платформа реабилитации для физиотерапевтической студии **Azarean Network** (Екатеринбург). Веб-кабинет пациента + инструктора, на базе которого строятся персонализированные комплексы упражнений и протоколы реабилитации (ACL колено, плечо).

**Связь с JARVIS Director:** два соседних проекта одной студии. JARVIS — внутренняя админка (финансы, расписание, клиентские боты). Azarean Rehab — отдельное приложение для самих пациентов (упражнения, дневник, прогресс).

**Функции:**
- CRUD упражнений (~1000 видео на Kinescope)
- 4-step wizard создания комплекса + drag-and-drop порядка упражнений
- Личный кабинет пациента: HomeScreen, ExercisesScreen, DiaryScreen, RoadmapScreen, ProfileScreen, ContactScreen
- ExerciseRunner v4 (порт из iOS-эталона): timer, RPE zones, pain gradient slider, rest timer, комментарии
- Программы реабилитации (ACL) с 6 фазами, критериями перехода, red-flags
- Дневник самочувствия (боль, отёк, подвижность, настроение, сон)
- Streak-трекинг активности
- Чат пациент ↔ инструктор
- Telegram-бот: /start (привязка), /status, /diary (6-step wizard), /tip, cron-scheduler
- Импорт упражнений из Kinescope + CSV
- Админ-панель: users, audit-logs, phases, tips, videos, system info

**Production:** НЕ задеплоен. Планируется на VDS 185.93.109.234 (тот же, где JARVIS). Конфликт поддоменов `rehab.azarean.ru` и `api.azarean.ru` — заняты JARVIS, нужна переконфигурация nginx.

**Пользователи:**
- 1 админ (Вадим — email `vadim@azarean.com`)
- Инструкторы (создаются админом через админ-панель)
- Пациенты (регистрируются сами по email + паролю)
- Тестовый пациент id=14 (avi707@mail.ru) привязан к Telegram — получает напоминания при запущенном backend

**Dev-окружение сейчас:** 2 пациента в БД, 13 упражнений, 2 комплекса, 3 юзера.

---

## 2. Стек технологий

### Backend
- **Runtime:** Node.js >= 20, CommonJS modules (НЕ ESM, в отличие от JARVIS)
- **Framework:** Express 5.1
- **БД:** PostgreSQL 18 (dev), драйвер `pg` 8.16, raw SQL через `query()` wrapper (НЕ ORM)
- **Валидация:** express-validator 7.3 (правила в `middleware/validators.js` **НЕ подключены к роутам — dead code**)
- **Auth:** bcryptjs 3.0 + jsonwebtoken 9.0 + cookie-parser. 2 отдельных JWT-системы (инструктор и пациент — разные секреты)
- **Security:** helmet 8.1, express-rate-limit 8.2 (authLimiter 5/15min, generalLimiter в production), CSRF через Origin-check middleware
- **File upload:** multer 2.0 (до 10 MB) + sharp 0.34 (ресайз аватаров в 400×400 JPEG q80)
- **Тесты:** Jest 30.2 + Supertest 7.2, 152 теста в 9 файлах

### Frontend
- **Фреймворк:** React 19.2 + CRA (react-scripts 5.0)
- **Язык:** JavaScript (НЕТ TypeScript!) + PropTypes только в PatientDashboard
- **HTTP:** Axios 1.13 (два instance: `api` для инструктора с Bearer, `patientApi` для пациента с cookies)
- **Стили:** глобальные CSS (НЕ CSS Modules!) — 80+ дублей классов. PatientDashboard использует prefix `pd-` + `tokens.css` с design-tokens
- **Иконки:** lucide-react 0.555 (НЕ emoji в UI)
- **Drag-and-drop:** @dnd-kit (MouseSensor 5px, TouchSensor 150ms, KeyboardSensor)
- **Markdown-редактор:** @uiw/react-md-editor 4.0.9 (для diagnoses.description)
- **Роутинг:** react-router-dom 7.9.6
- **Тесты:** 156 тестов в 12 suites

### Интеграции
- **Telegram:** node-telegram-bot-api 0.67 (НЕ Telegraf, в отличие от JARVIS)
- **Видео:** Kinescope API (хостинг видео упражнений, thumbnail generation)
- **Cron:** node-cron 4.2

### Dev
- **nodemon 3.1** для backend auto-restart
- **CRA dev server** на :3001 (port 3000 обычно занят JARVIS Director)
- **setupProxy.js** (http-proxy-middleware) вместо `proxy` в package.json — страпит Origin header, CORS настроен отдельно
- **PostgreSQL auth** через `pgpass.conf` (PGPASSWORD env переменная не работает в Git Bash на Windows)

### Deploy
- **Статус:** НЕ задеплоено, готовится

---

## 3. Архитектура

```
┌──────────────────────────────────────────────────────────┐
│                   Dev / Local                             │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Backend (CRA не запущен в prod)  Frontend (dev only)    │
│  ┌─────────────────────┐          ┌────────────────────┐ │
│  │ Express :5000       │ ◄──────  │ CRA :3001          │ │
│  │ ├── 13 route files  │  /api    │ (setupProxy →      │ │
│  │ ├── 2 auth systems  │ proxy    │   backend :5000)   │ │
│  │ ├── Telegram bot    │          │                    │ │
│  │ └── 4 cron jobs     │          │ 6 PatientDashboard │ │
│  │   (scheduler.js)    │          │ screens + Runner v4│ │
│  └──────────┬──────────┘          └────────────────────┘ │
│             │                                             │
│       PostgreSQL 18                                       │
│       (28 таблиц, 16 миграций)                            │
│                                                           │
├──────────────────────────────────────────────────────────┤
│  Внешние сервисы:                                         │
│    - Kinescope API (~1000 видео упражнений)               │
│    - Telegram Bot API (long-polling)                      │
└──────────────────────────────────────────────────────────┘
```

### Один процесс
В отличие от JARVIS (2 PM2 процесса), здесь один backend, где Telegram-бот и cron запускаются в том же Node.js процессе через `services/telegramBot.js` и `services/scheduler.js`.

### Два независимых JWT-контура
1. **Инструктор:** access в localStorage (Bearer header), refresh в БД (SHA-256), `AuthContext`
2. **Пациент:** access + refresh в **httpOnly cookies** (SameSite=Lax), `PatientAuthContext`

Composite-middleware `authenticatePatientOrInstructor` на `/api/progress` принимает и тех, и других.

---

## 4. Реализованные фичи (полный список)

### 4.1 Инструктор (Dashboard)
- **Tab-навигация** (НЕ роуты): Patients, Diagnoses, CreateComplex, MyComplexes, Trash
- **CRUD пациентов** (soft-delete / hard-delete / restore из корзины)
- **Регистрация пациента** — инструктор создаёт запись, пациент сам регистрируется по email (new field `is_registered` computed из `password_hash IS NOT NULL`)
- **CRUD диагнозов** (с описанием, рекомендациями, предупреждениями) + Markdown-редактор
- **CRUD комплексов:** 4-step wizard (пациент → упражнения из библиотеки → параметры → подтверждение)
- **Drag-and-drop упражнений** в комплексе (@dnd-kit)
- **Шаблоны комплексов** — копирование готовых в новый комплекс
- **Просмотр прогресса:** `ViewProgress`, `PatientProgress` — графики выполнения, pain-level history
- **Админ-панель** (`/admin`): users CRUD, audit-logs, статистика, CRUD rehab-phases, tips, phase-videos, system info
- **Импорт упражнений:** Kinescope API (preview → execute) + CSV

### 4.2 Библиотека упражнений
- **CRUD упражнений** с фильтрами: body_region, difficulty, equipment, phases
- **6 вспомогательных компонентов:** ExerciseCard, ExerciseFilters, ExerciseModal (edit), ExerciseViewModal, ExerciseSelector, DeleteConfirmModal
- **Kinescope integration:** UNIQUE `kinescope_id`, thumbnail sync через `POST /exercises/fetch-all-thumbnails` (N+1 по 1 запросу с 100ms delay)
- **Bulk import:** limit 500 записей за раз (защита от DoS)
- **Нет пагинации** — весь список грузится, фильтрация на клиенте

### 4.3 Пациент (PatientDashboard) — 6 экранов
- **HomeScreen:** блок «Ваш комплекс» с кнопкой «Начать тренировку» сверху, streak, quick actions
- **ExercisesScreen:** список всех комплексов пациента (из `GET /api/patient-auth/my-complexes`)
- **DiaryScreen:** дневник — pain, swelling, mobility, mood, sleep, exercises_done, notes (UNIQUE per date). **ИЗВЕСТНЫЙ БАГ:** crash `Cannot convert undefined or null to object at entries` при клике на экран
- **RoadmapScreen:** 6 фаз реабилитации с иконками, колорами, критериями перехода, red_flags, FAQ
- **ProfileScreen:** avatar upload, смена пароля, настройки уведомлений, привязка Telegram
- **ContactScreen:** чат с инструктором (messages таблица), генерация кода привязки Telegram

### 4.4 ExerciseRunner v4 (LOCKED, не трогать без явного запроса!)
- **Design system foundation:** `tokens.css` с palette (Teal #0D9488 + Coral #F97316), Manrope + Nunito Sans шрифты, DVPRS 2.0 pain scale (11 цветов), 6 rehab-phase colors, 4px spacing grid
- **8 переиспользуемых UI-компонентов:** AnimatedCheckmark, Card, CelebrationOverlay, ChipGroup, DifficultyScale, PainScale, ProgressRing, RestTimer, TabBar
- **Flow:** HomeScreen «Начать тренировку» → ExerciseRunner напрямую (без промежуточного ComplexDetailView)
- **Feedback-блок accordion** с SVG chevron
- **RPE zones** (1-10 по зонам нагрузки)
- **Pain gradient slider** (цвет меняется от зелёного к красному)
- **Stopwatch + rest timer** с голубым фоном
- **Previous session hints** — показывает вчерашние значения
- **Slide-in анимации** `pdIn` / `pdBk`
- **`--az-*` iOS-палитра** в `.pd-runner` scope

### 4.5 Авторизация
- **Инструктор:**
  - JWT access (1h) в Bearer header / localStorage
  - Refresh (7d) в БД как SHA-256 hex
  - Account lockout: 5 failed → 15 min
  - `POST /api/auth/register` требует `authenticateToken + requireAdmin` (только админ создаёт)
  - Middleware проверяет `is_active` в БД на каждый запрос (деактивированный инструктор с валидным JWT → 403)
- **Пациент:**
  - Access (15 min) в httpOnly cookie `patient_access_token` (SameSite=Lax, path=/api)
  - Refresh (30d) в httpOnly cookie `patient_refresh_token` (SameSite=Lax, path=/api/patient-auth, SHA-256 в БД)
  - Отдельный `PATIENT_JWT_SECRET`
  - Account lockout: 5 failed → 15 min
  - Password reset через email stub (console.log в dev)
  - OAuth заготовка (Google) — таблица `patient_oauth_states`, логика не реализована
  - **ОДИН `PatientAuthProvider`** на все пациентские роуты через layout Route + Outlet в App.js
  - Auto-refresh: axios interceptor на 403 + «истек» строка → refresh → retry queue
- **CSRF:** `requireSameOrigin` middleware на state-changing endpoints. В `NODE_ENV=test` bypass. В dev запросы без Origin пропускаются (CRA proxy страпит Origin), с чужим Origin — блокируются

### 4.6 Telegram-бот
- **Команды:** /start (привязка по коду), /status (прогресс), /diary (6-step wizard), /tip (совет дня), /help
- **/diary wizard:** pain → swelling → mobility → mood → sleep → notes (in-memory state, 10 min timeout)
- **Привязка:** пациент генерирует код на сайте → вводит в бот → `telegram_chat_id` записывается в patients
- **Кириллические команды через regex:** `bot.onText(/^\/команда$/i, ...)` — Telegram API не поддерживает `/<кириллица>` как slash-команды

### 4.7 Cron-задачи (scheduler.js)
- **Exercise reminders:** каждую минуту (per-user timezone из notification_settings)
- **Diary reminders:** 21:00
- **Daily tips:** 12:00
- **Refresh token cleanup:** 03:00 МСК (удаляет expired tokens)

### 4.8 API response format (стандартизирован 2026-04-10)
- Все 13 роут-файлов возвращают `{ data, message?, total? }` для успеха
- Для ошибок: `{ error, message }`
- Axios interceptor на фронте разворачивает: `response.data = <payload>`, `response.meta = { message, total }`
- Компоненты используют `response.data` напрямую без дефенсивных цепочек `?.data?.patients`

### 4.9 Аватары
- Multer принимает до 10 MB в memory
- Sharp сжимает в JPEG 400×400 q80 (~50–80 KB на выходе)
- Хранение на диске, отдаются через `GET /api/patient-auth/avatar` (cookie auth, blob response)
- **НЕ через `/uploads` публично** (уязвимость закрыта в коммите 432e09b)

---

## 5. Схема БД (28 таблиц)

### Аккаунты и авторизация
| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `users` | Инструкторы/админы (3 в dev) | email, password_hash, role (admin/instructor), is_active, failed_login_attempts, locked_until |
| `patients` | Пациенты (2 в dev) | full_name, email (UNIQUE partial), phone, birth_date, diagnosis, password_hash, avatar_url, telegram_chat_id (UNIQUE), failed_login_attempts, locked_until |
| `refresh_tokens` | Инструкторские refresh | user_id, token_hash (SHA-256), expires_at |
| `patient_refresh_tokens` | Пациентские refresh | patient_id, token_hash, expires_at |
| `patient_password_resets` | Токены сброса пароля | patient_id, token_hash, expires_at |
| `patient_oauth_states` | OAuth state (Google — заготовка) | state, provider, created_at |
| `audit_logs` | Аудит действий админа | user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details (JSONB) |

### Контент (упражнения и комплексы)
| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `exercises` | Библиотека упражнений (13 в dev) | title, kinescope_id UNIQUE, body_region, difficulty_level, equipment (JSONB), rehab_phases (JSONB), duration_seconds, instructions, cues, tips, contraindications, red_flags |
| `complexes` | Комплексы упражнений (2 в dev) | patient_id NOT NULL, instructor_id, diagnosis_id, title, recommendations, warnings (access_token **дропнут** миграцией 20260409) |
| `complex_exercises` | Упражнения внутри комплекса | complex_id, exercise_id, order_number, sets, reps, duration_seconds, rest_seconds, notes. UNIQUE(complex_id, order_number) |
| `templates` | Шаблоны для быстрого создания комплексов | title, description, patient_type |
| `template_exercises` | Упражнения в шаблонах | template_id, exercise_id, order_number, sets, reps |
| `diagnoses` | Каталог диагнозов | name, category, description, recommendations, warnings, deleted_at (soft delete) |

### Теги и группы (вспомогательные, не активно используются в UI)
| Таблица | Назначение |
|---------|-----------|
| `exercise_tags` | Теги упражнений |
| `exercise_tag_links` | M2M связи exercises ↔ tags |
| `muscle_groups` | Группы мышц |
| `exercise_muscle_groups` | M2M связи exercises ↔ muscle_groups |
| `exercise_presets` | Пресеты параметров |

### Реабилитация и трекинг
| Таблица | Назначение | Ключевые поля |
|---------|-----------|---------------|
| `rehab_programs` | Программы реабилитации пациента | patient_id, complex_id, title, diagnosis, surgery_date, current_phase, phase_started_at, status (active/paused/completed) |
| `rehab_phases` | Фазы реабилитации (каталог по program_type) | program_type, phase_number, title, duration_weeks, goals, restrictions, criteria_next, icon, color, allowed, pain, daily, red_flags, faq. UNIQUE(program_type, phase_number) |
| `phase_videos` | Видео для фаз | phase_id (FK → rehab_phases) |
| `tips` | Советы для пациентов | title, content, phase_id, category |
| `progress_logs` | Логи выполнения упражнений | complex_id, exercise_id, session_id (BIGINT), session_comment, completed, pain_level (0-10), difficulty_rating (1-10), notes |
| `diary_entries` | Дневник пациента | patient_id, program_id, entry_date, pain_level, swelling, mobility, mood, sleep_quality, exercises_done, notes. UNIQUE(patient_id, entry_date) |
| `streaks` | Серии активности | patient_id, program_id, current_streak, longest_streak, total_days, last_activity_date. UNIQUE(patient_id, program_id) |

### Коммуникации
| Таблица | Назначение |
|---------|-----------|
| `messages` | Чат пациент↔инструктор (sender_id БЕЗ FK — технический долг) |
| `notification_settings` | Настройки уведомлений пациента (per-patient timezone). UNIQUE(patient_id) |
| `telegram_link_codes` | Одноразовые коды привязки Telegram |

### Индексы (ключевые после audit)
- `idx_complex_exercises_exercise_id` на `complex_exercises(exercise_id)` (миграция 20260406)
- UNIQUE partial index на `patients(email) WHERE email IS NOT NULL`
- NOT NULL на `complexes.patient_id` (миграция 20260406)

---

## 6. API (13 роут-файлов, ~6730 строк)

### Auth инструктора (`auth.js`, 380 строк)
- `POST /api/auth/register` — JWT + Admin (админ создаёт юзера, без возврата JWT)
- `POST /api/auth/login` — → access + refresh tokens
- `POST /api/auth/refresh` — обновить access по cookie
- `POST /api/auth/logout` — JWT, удаляет refresh
- `GET /api/auth/me` — текущий юзер

### Auth пациента (`patientAuth.js`, 1031 строк — самый большой!)
- `POST /register`, `POST /login` — ставят cookies
- `POST /refresh` (с ротацией), `POST /logout`
- `GET /me`, `PUT /me` — профиль
- `POST /upload-avatar`, `GET /avatar` (blob), `DELETE /avatar`
- `POST /change-password` — инвалидирует ВСЕ refresh tokens
- `POST /forgot-password`, `POST /reset-password`
- `GET /my-complexes`, `GET /my-complexes/:id` — комплексы пациента

### CRUD ресурсов
| Файл | Строк | Endpoints |
|------|-------|-----------|
| `patients.js` | 407 | CRUD + soft/hard delete + restore + is_registered computed |
| `exercises.js` | 885 | CRUD + Kinescope fetch-all-thumbnails + bulk import (limit 500) |
| `complexes.js` | 538 | CRUD + exercises ordering + ownership check (SELECT FOR UPDATE) |
| `diagnoses.js` | 303 | CRUD + soft delete (deleted_at) + restore |
| `templates.js` | 217 | CRUD шаблонов (⚠️ `templates.update` не отправляет body — баг #4) |

### Прогресс и реабилитация
| Файл | Строк | Endpoints |
|------|-------|-----------|
| `progress.js` | 311 | POST (сохранение сессии), GET /complex/:id, GET /patient/:id. Composite auth (patient JWT или instructor JWT) |
| `rehab.js` | 1208 | programs CRUD + my/diary + my/dashboard + my/exercises + my/streak + my/messages + my/notifications + phases/:type (public) + tips (public) |

### Админ и интеграции
| Файл | Строк | Endpoints |
|------|-------|-----------|
| `admin.js` | 946 | users CRUD + stats + audit-logs + phases CRUD + tips CRUD + videos CRUD + system info |
| `dashboard.js` | 61 | Статистика инструктора (⚠️ хардкод нулей — баг #3) |
| `import.js` | 357 | Kinescope preview + execute, CSV import + template download |
| `telegram.js` | 86 | link-code + status + unlink |

---

## 7. Cron-расписание (scheduler.js, 179 строк)

Все задачи в одном процессе (backend). Таймзоны per-user из `notification_settings`.

| Паттерн | Функция | Источник tz |
|---------|---------|-------------|
| `* * * * *` (каждую минуту) | Exercise reminders | `notification_settings.timezone` per patient |
| `0 21 * * *` | Diary reminders | per-user tz |
| `0 12 * * *` | Daily tips | per-user tz |
| `0 3 * * *` | Cleanup expired refresh tokens | fixed |

---

## 8. Ключевые паттерны (ОБЯЗАТЕЛЬНО знать при написании кода)

### Архитектура
- **CommonJS** (НЕ ESM): `const { query } = require('../database/db');`
- **Raw SQL** через `query(sql, params)` wrapper — ВСЕГДА параметризованные запросы (`$1, $2...`)
- **Транзакции через `getClient()`:** `const client = await getClient(); try { await client.query('BEGIN'); ... } finally { client.release(); }`
- **Soft delete:** `is_active = false` для пациентов/упражнений, `deleted_at` для диагнозов
- **Ownership check:** `WHERE created_by = $2` в запросах пациентов и комплексов
- **Express-validator правила ОПРЕДЕЛЕНЫ в validators.js, но НЕ ПОДКЛЮЧЕНЫ к роутам!** Dead code
- **Комментарии на русском**

### Безопасность
- **JWT algorithm explicit:** `{ algorithms: ['HS256'] }` в verify (предотвращает algorithm confusion)
- **Два отдельных JWT_SECRET:** `JWT_SECRET` (инструктор) и `PATIENT_JWT_SECRET` (пациент)
- **Token hashing:** SHA-256 hex(64) через `utils/tokens.js hashToken()` для refresh и reset tokens
- **Rate limiting:** `authLimiter` (15 в dev / 5 в prod / 15min), `generalLimiter` только в production (1000 в dev / 100 в prod)
- **Admin audit logging:** все admin actions → таблица `audit_logs`
- **Account lockout:** 5 failed attempts → 15 min для обоих типов юзеров
- **Auth middleware проверяет `is_active` в БД на каждый запрос** — деактивированный инструктор с валидным JWT получает 403
- **CSRF через `requireSameOrigin`** middleware на всех state-changing endpoints. В тестах bypass

### API response format
- **Унифицирован:** `{ data, message?, total? }` для успеха, `{ error, message }` для ошибок
- **В тестах:** моки обходят interceptor, поэтому мокать нужно `{ data: <payload> }` напрямую
- **Не добавлять `success: true/false`** — такого поля нет

### PostgreSQL quirks
- **DATE → JSON timezone:** если дата сдвигается на -1 день, использовать `s.date::text` в SQL или explicit timezone (аналогично JARVIS)
- **PGPASSWORD env var не работает в Git Bash на Windows** — использовать `pgpass.conf`
- **psql path:** `"C:\Program Files\PostgreSQL\18\bin\psql.exe"`

### Frontend
- **JavaScript, НЕ TypeScript** — не предлагать миграцию без запроса
- **Глобальные CSS, НЕ CSS Modules** — 80+ дублей классов (`btn-primary` в 5 файлах, `modal-overlay` в 7)
- **PatientDashboard использует prefix `pd-` + tokens.css + design-tokens** (teal + coral palette)
- **ExerciseRunner использует `--az-*` iOS-палитру** в scope `.pd-runner`
- **Два Axios instance:** `api` (инструктор, Bearer) и `patientApi` (пациент, httpOnly cookie)
- **Auto-refresh interceptor** на 403 + «истек» строка → refresh → retry queue
- **Dashboard — НЕ роуты, а tab-container** (`activeTab` state)
- **React.lazy** для всех страниц кроме Login и Dashboard
- **Нет пагинации** — Patients/Exercises грузят все записи, фильтрация на клиенте
- **@dnd-kit** для DND с sensors: MouseSensor(5px), TouchSensor(150ms), KeyboardSensor
- **`alert()` вместо Toast** в некоторых местах (Exercises.js) — технический долг
- **Touch-friendly:** min-height 44px для кнопок

### Telegram
- **node-telegram-bot-api 0.67** (НЕ Telegraf как в JARVIS!)
- **Кириллические команды не работают напрямую:** использовать `bot.onText(/^\/команда$/i, ...)`
- **Только `[a-z0-9_]`** в slash-командах Telegram API

### Арифметика
- **ТОЛЬКО через код!** Никогда не считать суммы/проценты в уме. `node -e`, SQL, python

### UI-дизайн
- **НЕ выдумывать UI элементы!** Не описывать кнопки/меню не видимые на скриншоте. Просить скриншот
- **Иконки: ТОЛЬКО `lucide-react`** — не emoji в UI компонентах
- **Проверять дату/время** в начале чата: `node -e "console.log(new Date().toLocaleString('ru-RU',{timeZone:'Asia/Yekaterinburg'}))"`

---

## 9. Что НЕ реализовано (Backlog)

### В работе (14 файлов незакоммичено ранее; частично закоммичено 2026-04-16)
- **PatientDashboard redesign v4** — закоммичено: design system foundation, design-tokens, 8 UI-компонентов, TabBar, refactor всех 5 экранов. ExerciseRunner v4 тоже вошёл
- **Redesign стиль:** meltano.com + Яндекс

### Запланировано
1. **Деплой на VDS 185.93.109.234** — конфликт субдоменов с JARVIS (`rehab.azarean.ru` и `api.azarean.ru` уже используются). Нужна переконфигурация nginx или другие субдомены
2. **CSS Modules вместо глобальных стилей** — решит 80+ дублей классов
3. **zod вместо express-validator** — или подключить существующие validators.js к роутам
4. **2FA через Telegram** (6-значный код, 5 мин) — аналогично JARVIS
5. **apiFetch() wrapper** с автоматическим refresh и единой error-handling
6. **design-tokens.css** — CSS переменные для цветов, light/dark тема (частично сделано в tokens.css PatientDashboard)

### Возможные доработки
- **Миграции нумерованные** (001_…, 002_…) вместо дат (проще порядок)
- **requireRole() middleware** с role-based доступом
- **API key fallback** для тестов и service accounts
- **Error sanitization** — логировать ошибку и возвращать `{ error: 'Internal server error' }` вместо raw `throw err`
- **buildPatch() pattern** для dynamic PATCH
- **Healthcheck endpoint** для мониторинга

### Что точно НЕ нужно
- **ORM** — проект на raw SQL принципиально
- **Публичный token-flow** (`/patient/:token`) — **удалён** в миграции 20260409, колонка `complexes.access_token` дропнута. Не возвращать!
- **Redux/Zustand** — state через useState/useContext
- **Tailwind/styled-components** — глобальные CSS + prefix `pd-`

---

## 10. Бизнес-контекст

### Студия
- **Azarean Network** — физиотерапевтическая студия, Екатеринбург
- Реабилитация: ACL колено, плечо, прочие протоколы
- Соседний проект (JARVIS Director) — внутренняя финансовая админка, там же клиентские боты

### Связь с JARVIS
- Azarean Rehab — **отдельное приложение для пациентов** (упражнения, дневник, прогресс)
- JARVIS — **внутренняя админка студии** (финансы, расписание, клиентские боты)
- На одном VDS планируется deploy, но субдомены разные

### Формат комплексов
- Каждый пациент может иметь несколько комплексов упражнений
- Комплекс = N упражнений с sets/reps/duration/rest_seconds + порядок
- Параметры упражнения задаются для каждого комплекса отдельно (не глобально на упражнение)
- Прогресс пишется per session (UUID в `session_id`) с pain_level и difficulty_rating для каждого упражнения

### Программы реабилитации (ACL)
- 6 фаз (Защита → Ранняя мобильность → Укрепление → Функциональная → Продвинутая → Поддержание)
- Каждая фаза: goals, restrictions, criteria_next, red_flags, FAQ
- Привязка `rehab_programs` → `complexes` (опциональная через `complex_id`)

### Роли
| Роль | Доступ |
|------|--------|
| admin | Всё + управление пользователями + audit logs |
| instructor | CRUD пациентов, упражнений, комплексов, диагнозов |
| patient | Личный кабинет: свои комплексы, дневник, прогресс, чат |

---

## 11. Структура проекта (файлы)

```
Azarean_rehab/
├── CLAUDE.md                                # Полная спецификация (48 KB)
├── AZAREAN_REHAB_ARCHITECT_BRIEF.md         # Этот файл
├── README.md, AGENTS.md, CLAUDE_INSTRUCTIONS.md
├── ФАЙЛОВАЯ_СТРУКТУРА.md, ПРОЕКТ_ПОЛНЫЙ_КОНТЕКСТ.md   # Устаревшие (Dec 2025)
├── docs/
│   ├── PATIENTVIEW_AUDIT.md
│   └── prototypes/
│       ├── patient-dashboard-v2.jsx          # Исходный прототип (Feb 2026)
│       └── README.md
│
├── backend/
│   ├── server.js                            # Express 5.1 (378 строк)
│   ├── config/
│   │   └── config.js                        # Env с fail-fast валидацией
│   ├── database/
│   │   ├── db.js                            # pg Pool, query(), getClient()
│   │   ├── schema.sql                       # CREATE TABLE (основная схема)
│   │   ├── seeds/                           # acl_phases.sql, test_patient_data.sql
│   │   └── migrations/                      # 16 SQL миграций (2024-09 → 2026-04)
│   ├── middleware/
│   │   ├── auth.js                          # authenticateToken (is_active check) + requireAdmin + authenticatePatientOrInstructor (117)
│   │   ├── patientAuth.js                   # authenticatePatient (cookie + Bearer fallback) (52)
│   │   ├── originCheck.js                   # requireSameOrigin — CSRF (62)
│   │   ├── upload.js                        # Multer + Sharp (82)
│   │   └── validators.js                    # express-validator (НЕ ПОДКЛЮЧЕНЫ!) (324)
│   ├── routes/                              # 13 файлов, ~6730 строк
│   │   ├── auth.js (380), patientAuth.js (1031)
│   │   ├── patients.js (407), exercises.js (885), complexes.js (538)
│   │   ├── diagnoses.js (303), progress.js (311), templates.js (217)
│   │   ├── rehab.js (1208), dashboard.js (61), admin.js (946)
│   │   ├── import.js (357), telegram.js (86)
│   ├── services/
│   │   ├── telegramBot.js                   # /start, /status, /diary, /tip (631)
│   │   ├── scheduler.js                     # Cron: reminders, tips, cleanup (179)
│   │   ├── kinescopeService.js              # Kinescope API client (152)
│   │   └── csvImportService.js              # CSV parser (56)
│   ├── utils/
│   │   ├── tokens.js                        # hashToken() SHA-256
│   │   └── email.js                         # Email stub
│   └── tests/__tests__/                     # 9 файлов, 152 теста
│       ├── admin.routes.test.js (488)
│       ├── patientAuth.middleware.test.js (195)
│       ├── patientProfile.test.js (377)
│       ├── progress.routes.test.js (176)
│       ├── originCheck.test.js (104)
│       ├── rehab.routes.test.js (656)
│       ├── scheduler.test.js (187)
│       ├── telegram.routes.test.js (164)
│       └── telegramBot.test.js (318)
│
└── frontend/
    ├── package.json                         # React 19.2, proxy → :5000
    └── src/
        ├── App.js                           # Routing (296): ProtectedRoute + PatientRoute + React.lazy
        ├── setupProxy.js                    # http-proxy-middleware (страпит Origin)
        ├── services/
        │   └── api.js                       # Axios instances + ~50 функций (513)
        ├── context/
        │   ├── AuthContext.js (59)
        │   ├── PatientAuthContext.js (71)
        │   └── ToastContext.js (87)
        ├── hooks/
        │   └── useConfirm.js (55)
        ├── utils/
        │   ├── dateUtils.js (120)
        │   └── exerciseConstants.js (283)
        ├── styles/
        │   └── common.css                   # Глобальные (80+ дублей!)
        ├── pages/
        │   ├── Dashboard.js                 # Tab-container
        │   ├── Login.js, Patients.js (834), Diagnoses.js
        │   ├── CreateComplex.js, EditComplex.js, MyComplexes.js, Trash.js
        │   ├── ViewProgress.js (452), PatientProgress.js (470)
        │   ├── ImportExercises.js, EditTemplate.js
        │   ├── Exercises/                   # Exercises.js (363), ExerciseDetail.js (424) + 6 components
        │   ├── PatientAuth/                 # Login (207), Register (253), ForgotPassword (122), ResetPassword (207)
        │   ├── PatientDashboard/            # 6 screens + ExerciseRunner + UI kit
        │   │   ├── PatientDashboard.js, PatientDashboard.css, tokens.css
        │   │   ├── components/
        │   │   │   ├── HomeScreen.js, ExercisesScreen.js, DiaryScreen.js
        │   │   │   ├── RoadmapScreen.js, ProfileScreen.js, ContactScreen.js
        │   │   │   ├── ExerciseRunner.js    # LOCKED v4 (~384 строк)
        │   │   │   ├── ComplexDetailView.js
        │   │   │   └── ui/                  # 9 design-system компонентов
        │   │   │       ├── AnimatedCheckmark, Card, CelebrationOverlay
        │   │   │       ├── ChipGroup, DifficultyScale, PainScale
        │   │   │       ├── ProgressRing, RestTimer, TabBar, index.js
        │   │   └── __mocks__/
        │   └── Admin/                       # AdminContent (477), AdminUsers (208)
        │                                    # AdminStats (100), AdminSystem (130)
        │                                    # AdminAuditLogs (149), AdminUserModal (124)
        └── components/
            ├── Toast.js, ConfirmModal.js, ErrorBoundary.js
            ├── LoadingSpinner.js, Skeleton.js
            ├── BackButton.js, Breadcrumbs.js
            ├── TemplateSelector.js, TemplateViewModal.js, DeleteTemplateModal.js
            └── skeletons/                   # 4 специализированных скелетона
```

---

## 12. Открытые баги и технический долг

| # | Severity | Описание |
|---|----------|----------|
| 1 | HIGH | Rate limiting выключен в dev (by design, если NODE_ENV ≠ production) |
| 2 | MEDIUM | `validators.js` — dead code, правила не подключены ни к одному роуту |
| 3 | MEDIUM | Dashboard stats — хардкод нулей, endpoint существует но не вызывается |
| 4 | MEDIUM | `templates.update` не отправляет body — `api.put('/templates/${id}')` без data |
| 5 | MEDIUM | `EditComplex.handleAddExercise` — `toast.success('Ссылка скопирована!')` при дубле (copy-paste) |
| 6 | MEDIUM | `DiaryScreen` — структурированные данные сериализуются в текст `notes` (хрупкий парсинг) |
| 7 | MEDIUM | 80+ дублей CSS-классов — глобальные стили конфликтуют |
| 8 | MEDIUM | Нет аудит-логов для чтения данных пациентов (GDPR) |
| 9 | LOW | ErrorBoundary не ловит async ошибки из useEffect |
| 10 | LOW | `messages.sender_id` — нет FK constraint |
| 11 | BUG | **DiaryScreen crash:** `TypeError: Cannot convert undefined or null to object at entries` при клике. Stack trace указывает на ContactScreen.js:552 — вероятно bundler source map issue |
| 12 | BUG | **F5 flicker:** при обновлении страницы на /patient-dashboard мелькает логин пока PatientAuthProvider делает getMe(). Нужен splash/loading screen на уровне роутера |

---

## 13. Завершённые работы (защита от регрессий)

### CRITICAL (все закрыты 2026-04-08)
1. `POST /api/auth/register` был открыт для всех → `authenticateToken + requireAdmin`, ответ без JWT
2. Refresh/reset токены в plaintext → миграция `20260408_hash_tokens.sql` (SHA-256)
3. Нет lockout для пациентов → миграция `20260408_patient_lockout.sql`
4. Сломанный маршрут `complexes.js:614` — `pool` не определён → удалён
5. IDOR на permanent delete комплексов → транзакция + ownership check
6. Cascade delete пациента оставляет сироты → полный cleanup + транзакция
7. Race condition при создании комплекса → SELECT FOR UPDATE
8. Bulk import DoS → limit 500

### HIGH (все закрыты)
- `/uploads` публично → авто через `/api/patient-auth/avatar` с cookie auth (коммит 432e09b)
- Patient JWT в localStorage → httpOnly cookie `patient_access_token` SameSite=Lax
- Access token пациента в URL → публичный flow **полностью удалён**, колонка `complexes.access_token` дропнута
- Inconsistent response formats → все 13 роут-файлов стандартизированы
- AuthContext не хранит refresh_token → использует `clearTokens()` из api.js
- Scheduler хардкодил Europe/Moscow → per-user tz из notification_settings
- Config не валидирует все env vars → warnings для SESSION_SECRET, TELEGRAM_BOT_TOKEN, KINESCOPE_API_KEY
- Публичные endpoints без rate limiting → generalLimiter на /phases, /tips
- Admin NaN в LIMIT → parseInt fallback
- Невалидированные числовые params → parseInt + isNaN guard

### MEDIUM (закрытые)
- `SELECT *` в patients утекает password_hash → явный allowlist + `is_registered` computed
- Patient email не UNIQUE → partial UNIQUE index
- Progress log IDOR → ownership check для JWT
- Деактивированный инструктор с валидным JWT → auth middleware проверяет is_active
- Нет индекса на `complex_exercises(exercise_id)` → миграция
- `complexes.patient_id` допускает NULL → NOT NULL в миграции
- Нет автоочистки истёкших refresh tokens → cron 03:00 МСК
- Отрицательные duration_seconds → `Math.max(0, ...)`
- Нет лимита длины сообщений → max 5000 chars
- Дубль email возвращает 400 → 409 Conflict
- RoadmapScreen падает при пустом phases array → guard
- ContactScreen дублирует polling intervals → cleanup перед generate

---

## 14. Ограничения и особенности

### Dev-окружение
- **Scheduler работает даже в dev** — Telegram-бот шлёт tips в 12:00 МСК (14:00 Екб) и diary-reminders в 21:00 МСК пациентам с привязанным `telegram_chat_id`. Чтобы выключить — остановить backend или убрать `TELEGRAM_BOT_TOKEN` из .env
- **`generalLimiter` = 1000 req/15min в dev** (100 в production)
- **`authLimiter` = 15 attempts в dev** (5 в production)
- **CRA proxy страпит Origin header** — `requireSameOrigin` пропускает запросы без Origin в dev. Это НЕ дыра: CORS блокирует cross-origin всё равно
- **Порт 3000 обычно занят JARVIS** — использовать 3001: `PORT=3001 BROWSER=none npm start`
- **CORS_ORIGINS в .env** включает 3000, 3001, 3002
- **nodemon НЕ watch'ит .env** — перезапускать backend руками после edit

### Данные
- Тестовый пациент: id=14, `avi707@mail.ru` / `Test1234` (привязан к реальному Telegram)
- Инструктор: `vadim@azarean.com` / `Test1234`
- Все legacy test-пациенты с `test@mail.ru` удалены 2026-04-08 (12 пациентов, 55 комплексов, 233 complex_exercises, 254 progress_logs)

---

## 15. Для генерации промптов: чего НЕ нужно делать

При генерации задач для Azarean Rehab учитывай:

1. **НЕ предлагать TypeScript миграцию** без явного запроса — проект на JavaScript
2. **НЕ предлагать CSS Modules/Tailwind/styled-components** — глобальные CSS + prefix `pd-` внутри PatientDashboard
3. **НЕ предлагать ORM** — raw SQL через `query()` wrapper
4. **НЕ возвращать публичный token-flow** (`/patient/:token`) — удалён навсегда, колонка дропнута
5. **НЕ менять ExerciseRunner** без явного запроса — LOCKED v4
6. **НЕ считать в уме** — только через код (SQL, node -e)
7. **НЕ забывать `is_active` фильтр** в запросах пациентов/упражнений
8. **НЕ забывать `deleted_at IS NULL`** в запросах диагнозов
9. **НЕ забывать ownership check** (`created_by = $N`) в мутациях пациентских данных
10. **НЕ хардкодить цвета** в PatientDashboard — использовать `--pd-*` переменные из tokens.css
11. **НЕ использовать emoji в UI** — только lucide-react иконки
12. **НЕ использовать `pool`** напрямую — только `query()` / `getClient()` из `database/db.js`
13. **НЕ добавлять `success: true`** в API ответы — унифицированный формат `{ data, message?, total? }`
14. **НЕ забывать про CSRF (`requireSameOrigin`)** на новых state-changing endpoints для пациента
15. **НЕ забывать parametrized queries** — `$1, $2` всегда, никогда не конкатенировать SQL
16. **НЕ предлагать Telegraf** — проект на node-telegram-bot-api
17. **НЕ использовать кириллицу в slash-командах** — только `[a-z0-9_]`, для русских алиасов regex
18. **НЕ подключать validators.js «для единообразия»** без запроса — это dead code, но не приоритет
19. **НЕ создавать абстракции заранее** — прямой код предпочтительнее
20. **НЕ предлагать pagination для Exercises/Patients** без запроса — сейчас всё на клиенте, возможно осознанный выбор

---

**Связанный документ:** `c:\Users\Вадим\Desktop\jarvis-director\JARVIS_ARCHITECT_BRIEF.md` — бриф для соседнего проекта той же студии.
