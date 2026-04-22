# Azarean Rehab

Платформа реабилитации для физиотерапевтической студии **Azarean Network** (Екатеринбург).
Создание персонализированных комплексов упражнений, отслеживание прогресса пациентов, программы реабилитации (плечо, колено), Telegram-бот.

## Текущее состояние (апрель 2026)

### Завершено
- **Security audit:** все 3 CRITICAL + все HIGH закрыты (см. «Завершённые исправления» ниже)
- **API response format** стандартизирован: `{ data, message? }` во всех 13 роут-файлах
- **ExerciseRunner v3** — CSS 1:1 порт из iOS-эталона (**LOCKED**, см. секцию ниже)
- **Patient auth:** httpOnly cookie (SameSite=Lax), CSRF через Origin-check middleware
- **Public token flow** полностью удалён (complexes.access_token дропнут, /patient/:token — нет)
- **Telegram бот:** /start, /status, /diary (6-step wizard), /tip, cron-scheduler

### В работе (незакоммичено, 14 файлов)
- **PatientDashboard redesign:** стиль meltano.com + Яндекс
- 6 экранов: Home, Diary, Exercises, Roadmap, Profile, Contact
- **ExerciseRunner НЕ входит в редизайн** (LOCKED)
- CSS переменные `--pd-*` обновляются под новый стиль

### Планируется (не начато)
- Деплой на VDS 185.93.109.234 (конфликт субдоменов с JARVIS)
- CSS Modules вместо глобальных стилей
- zod вместо express-validator
- 2FA через Telegram

## Стек

- **Backend:** Express 5.1 + Node.js (CommonJS) + pg 8.16 (raw SQL, `query()` wrapper) + express-validator 7.3
- **Frontend:** React 19.2.0 + CRA (react-scripts 5.0) + JavaScript (нет TypeScript) + Axios 1.13 + @dnd-kit (drag-and-drop) + lucide-react 0.555 (иконки) + @uiw/react-md-editor 4.0.9 + react-router-dom 7.9.6
- **БД:** PostgreSQL 18 (dev)
- **Видео:** Kinescope API (хостинг ~1000 упражнений, thumbnail generation)
- **Интеграции:** node-telegram-bot-api 0.67, node-cron 4.2, multer 2.0 (аватары), sharp 0.34 (сжатие изображений)
- **Auth:** bcryptjs 3.0 (пароли), jsonwebtoken 9.0 (JWT), cookie-parser (httpOnly access+refresh cookies)
- **Security:** helmet 8.1 (headers), express-rate-limit 8.2 (5 req/15 min auth, general in production)
- **Тесты:** Jest 30.2 + Supertest 7.2 (152 backend + 156 frontend = 308 тестов)
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
```

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
│   │   ├── scheduler.js         # Cron: exercise reminders (per-user tz), diary (21:00), tips (12:00), token cleanup (03:00) (179 строк)
│   │   ├── kinescopeService.js  # Kinescope API client (152 строки)
│   │   └── csvImportService.js  # CSV парсер (56 строк)
│   ├── utils/
│   │   ├── tokens.js            # hashToken() — SHA-256 для безопасного хранения токенов
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
        │   └── common.css       # Глобальные стили (80+ дублей классов!)
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
- **patient_oauth_states** — OAuth state для SSO

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
- OAuth заготовка (Google)
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
| POST | /api/patient-auth/register | Нет | Регистрация → ставит access+refresh cookie |
| POST | /api/patient-auth/login | Нет | Логин → ставит access+refresh cookie |
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
| GET | /api/rehab/my/dashboard | PatientJWT | Мой дашборд |
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
| GET/POST/PUT/DELETE | /api/admin/phases/* | JWT + Admin | CRUD фаз реабилитации |
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
- **Глобальные CSS** — НЕ CSS Modules. 80+ дублей классов (`btn-primary` в 5 файлах, `modal-overlay` в 7). PatientDashboard использует `pd-` prefix convention
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
| 7 | MEDIUM | **80+ дублей CSS-классов** — глобальные стили конфликтуют |
| ~~8~~ | ~~MEDIUM~~ | ~~GDPR аудит-логи на чтение данных пациентов~~ → **ЗАКРЫТО** (2026-04-22, `6b36bd2`): `backend/utils/audit.js` + logAudit на GET patients, GET patients/:id, GET progress/patient/:id, GET rehab/programs/:id/diary, GET rehab/programs/:id/messages. |
| 9 | LOW | **ErrorBoundary не ловит** async ошибки из useEffect |
| 10 | LOW | **messages.sender_id** — нет FK constraint (требует полиморфного split patient.id vs users.id) |

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
33. **DiaryScreen crash `Cannot convert undefined or null to object`** → stale запись. Поиск по PatientDashboard tree не нашёл ни одного `Object.entries`/`Object.keys`/`Object.values` без guard'а; stack-trace указывал на `ContactScreen.js:552` вне границ файла (всего 451 строка) — артефакт старого бандла. Ручная проверка в dev-браузере на тапе «Дневник» — console чистая.
34. **F5 flicker — мелькает Login на /patient-dashboard** → новый `<PatientSplash/>` (full-screen logo+spinner) показывается пока `PatientAuthProvider.loading=true`. `PatientRoute` и `PatientLogin` оба проверяют `authLoading` перед рендером.

## Структура тестов

```
backend/tests/__tests__/ (9 файлов, 152 теста)
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

## Планируемый деплой

**Статус:** НЕ задеплоен. Планируется на тот же VDS что JARVIS (185.93.109.234).

**Подготовленные credentials:** см. memory/deployment_plan.md или спросить у мейнтейнера.

**Планируемые субдомены:** app/rehab/api.azarean.ru → 185.93.109.234
**КОНФЛИКТ:** `rehab.azarean.ru` и `api.azarean.ru` уже используются JARVIS. Нужна переконфигурация nginx или другие субдомены.

## Git

- **Repo:** https://github.com/jaike077-web/azarean-rehab.git
- **100+ коммитов**, активная разработка через codex PRs
- **Незапушенные коммиты (с 907e1ea):**
  - `b827bc4` docs: update CLAUDE.md — ExerciseRunner v2, SameSite=Lax, single PatientAuthProvider
  - `907e1ea` feat: ExerciseRunner v2 — RPE zones, rest timer, pain gradient, prev session hints
- **Незакоммиченные изменения:** PatientDashboard redesign (14 файлов)
- **Последний запушенный:** `4a32f35` refactor: unify API response format (#13) (2026-04-10)
