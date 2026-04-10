# Azarean Rehab

Платформа реабилитации для физиотерапевтической студии **Azarean Network** (Екатеринбург).
Создание персонализированных комплексов упражнений, отслеживание прогресса пациентов, программы реабилитации (плечо, колено), Telegram-бот.

## Стек

- **Backend:** Express 5.1 + Node.js (CommonJS) + pg 8.16 (raw SQL, `query()` wrapper) + express-validator 7.3
- **Frontend:** React 19 + CRA (react-scripts 5.0) + JavaScript (нет TypeScript) + Axios + @dnd-kit (drag-and-drop)
- **БД:** PostgreSQL 18 (dev)
- **Видео:** Kinescope API (хостинг ~1000 упражнений, thumbnail generation)
- **Интеграции:** node-telegram-bot-api 0.67, node-cron 4.2, multer 2.0 (аватары), sharp 0.34 (сжатие изображений)
- **Auth:** bcryptjs 3.0 (пароли), jsonwebtoken 9.0 (JWT), cookie-parser (httpOnly access+refresh cookies)
- **Security:** helmet 8.1 (headers), express-rate-limit 8.2 (5 req/15 min auth, general in production)
- **Тесты:** Jest 30.2 + Supertest 7.2 (152 backend + 157 frontend = 309 тестов)
- **Runtime:** Node.js >= 20, nodemon 3.1 (dev)

## Запуск проекта

### 1. PostgreSQL

```bash
# Создать БД
psql -U postgres -c "CREATE DATABASE azarean_rehab;"

# Применить схему
psql -U postgres -d azarean_rehab -f backend/database/schema.sql

# Миграции (по порядку)
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
- **Тестовый пациент:** id=14, `avi707@mail.ru` (Вадим, привязан к реальному Telegram — scheduler шлёт ему советы/напоминания при запущенном backend)

## Структура проекта

```
Azarean_rehab/
├── CLAUDE.md                    # Этот файл
├── docs/
│   └── prototypes/              # Архивные single-file прототипы дизайна (референс)
│       ├── README.md
│       └── patient-dashboard-v2.jsx  # Исходный прототип PatientDashboard (Feb 2026)
├── backend/
│   ├── server.js                # Express сервер, middleware, routing (381 строк)
│   ├── config/
│   │   └── config.js            # Env config с fail-fast валидацией
│   ├── database/
│   │   ├── db.js                # pg Pool, query(), getClient(), testConnection()
│   │   ├── schema.sql           # CREATE TABLE (основная схема)
│   │   └── migrations/          # 12 SQL миграций (2024-09 — 2026-04)
│   ├── middleware/
│   │   ├── auth.js              # authenticateToken (+ is_active DB check), requireAdmin, authenticatePatientOrInstructor
│   │   ├── patientAuth.js       # authenticatePatient (cookie-first + Bearer fallback)
│   │   ├── originCheck.js       # requireSameOrigin — CSRF для cookie auth
│   │   ├── upload.js            # Multer + Sharp: аватары (до 10MB → 400×400 JPEG q80)
│   │   └── validators.js        # express-validator правила (НЕ ПОДКЛЮЧЕНЫ к роутам!)
│   ├── routes/
│   │   ├── auth.js              # POST /register, /login, /refresh, /logout, GET /me
│   │   ├── patientAuth.js       # Полный цикл: register, login, refresh, profile, avatar, password-reset, my-complexes
│   │   ├── patients.js          # CRUD пациентов + soft/hard delete + is_registered flag
│   │   ├── exercises.js         # CRUD упражнений + Kinescope + bulk import
│   │   ├── complexes.js         # CRUD комплексов + exercises ordering (публичный /token/ УДАЛЁН)
│   │   ├── diagnoses.js         # CRUD диагнозов
│   │   ├── progress.js          # Отслеживание прогресса тренировок
│   │   ├── templates.js         # Шаблоны упражнений
│   │   ├── rehab.js             # Программы реабилитации, дневник, streaks, сообщения
│   │   ├── dashboard.js         # Статистика для инструктора
│   │   ├── admin.js             # Админ-панель + audit_logs
│   │   ├── import.js            # CSV/Kinescope импорт
│   │   └── telegram.js          # Привязка Telegram к пациенту
│   ├── services/
│   │   ├── telegramBot.js       # Telegram бот: /start, /status, /diary (6-step wizard), /tip
│   │   ├── scheduler.js         # Cron: exercise reminders (per-user tz), diary (21:00), tips (12:00), token cleanup (03:00)
│   │   ├── kinescopeService.js  # Kinescope API client
│   │   └── csvImportService.js  # CSV парсер
│   ├── utils/
│   │   └── email.js             # Email stub (console.log в dev)
│   └── tests/                   # Jest + Supertest
│       └── __tests__/           # 7 тест-файлов
│
└── frontend/
    ├── package.json             # React 19, proxy -> localhost:5000
    └── src/
        ├── App.js               # Routing: ProtectedRoute + PatientRoute + React.lazy
        ├── services/
        │   └── api.js           # Axios instances (api + patientApi) + ~50 функций
        ├── context/
        │   ├── AuthContext.js         # Инструктор { user, loading, login, logout }
        │   ├── PatientAuthContext.js  # Пациент { patient, loading, login, logout } — через cookie
        │   └── ToastContext.js        # addToast(type, title?, message, duration?)
        ├── hooks/
        │   └── useConfirm.js    # ConfirmModal hook
        ├── utils/
        │   ├── dateUtils.js     # Утилиты дат
        │   └── exerciseConstants.js # Body regions, difficulty levels, equipment
        ├── styles/
        │   └── common.css       # Глобальные стили (80+ дублей классов!)
        ├── pages/
        │   ├── Dashboard.js     # Tab-навигация: Patients, Diagnoses, CreateComplex, MyComplexes, Trash
        │   ├── Login.js         # Авторизация инструктора
        │   ├── Patients.js      # CRUD пациентов
        │   ├── Diagnoses.js     # CRUD диагнозов
        │   ├── CreateComplex.js # 4-step wizard + DND (851 строк)
        │   ├── EditComplex.js   # Редактирование комплекса
        │   ├── MyComplexes.js   # Список комплексов
        │   ├── Trash.js         # Корзина (soft delete)
        │   ├── ViewProgress.js  # Просмотр прогресса
        │   ├── PatientProgress.js # Прогресс-дашборд
        │   ├── ImportExercises.js # Импорт упражнений
        │   ├── Exercises/       # Библиотека: Exercises.js, ExerciseDetail.js + components/
        │   ├── PatientAuth/     # Login, Register, ForgotPassword, ResetPassword
        │   ├── PatientDashboard/ # Мобильный дашборд: Home, Diary, Exercises (v2 с ComplexDetailView/ExerciseRunner), Roadmap, Profile, Contact
        │   ├── Admin/           # AdminStats, AdminUsers, AdminAuditLogs, AdminContent, AdminSystem
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
id SERIAL PK, full_name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(50),
birth_date DATE, diagnosis TEXT, notes TEXT,
created_by INT REFERENCES users(id) ON DELETE SET NULL,
is_active BOOLEAN DEFAULT true,
password_hash VARCHAR(255), email_verified BOOLEAN DEFAULT false,
auth_provider VARCHAR(20) DEFAULT 'local', provider_id VARCHAR(255),
avatar_url VARCHAR(500), last_login_at TIMESTAMP,
telegram_chat_id BIGINT UNIQUE,
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
token VARCHAR(255) NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP
-- ВНИМАНИЕ: токены хранятся в plaintext (не хешированы) — УЯЗВИМОСТЬ
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
pain_level INT, swelling INT, mobility INT, mood INT, sleep_quality INT,
exercises_done BOOLEAN DEFAULT false, notes TEXT,
created_at TIMESTAMP, updated_at TIMESTAMP, UNIQUE(patient_id, entry_date)
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
- **messages** — чат пациент↔инструктор (sender_id без FK!)
- **notification_settings** — настройки уведомлений пациента (UNIQUE patient_id)
- **telegram_link_codes** — одноразовые коды привязки Telegram
- **patient_password_resets** — токены сброса пароля (plaintext!)
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
- **Access token (15 min) в httpOnly cookie `patient_access_token`** (SameSite=Strict, path=/api)
- **Refresh token (30d) в httpOnly cookie `patient_refresh_token`** (SameSite=Lax, path=/api/patient-auth, SHA-256 в БД)
- `PatientAuthContext` на фронте определяет "залогинен ли" через GET /me на mount
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
| DELETE | /api/patients/:id/permanent | JWT | Hard delete (нет проверки admin!) |

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
| POST | /api/progress | JWT/Token | Сохранить прогресс тренировки |
| GET | /api/progress/complex/:id | JWT/Token | Прогресс по комплексу |
| GET | /api/progress/patient/:id | JWT | Все комплексы пациента |

### Реабилитация
| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | /api/rehab/programs | JWT | Создать программу |
| GET | /api/rehab/programs | JWT | Список программ |
| GET | /api/rehab/my/program | PatientJWT | Моя программа |
| GET | /api/rehab/my/dashboard | PatientJWT | Мой дашборд |
| GET | /api/rehab/my/exercises | PatientJWT | Мои упражнения |
| POST | /api/rehab/my/diary | PatientJWT | Сохранить дневник |
| GET | /api/rehab/my/diary | PatientJWT | Дневник (с историей) |
| GET | /api/rehab/my/streak | PatientJWT | Мой streak |
| POST | /api/rehab/my/streak/update | PatientJWT | Обновить streak |
| GET | /api/rehab/my/messages | PatientJWT | Мои сообщения |
| POST | /api/rehab/my/messages | PatientJWT | Отправить сообщение |
| GET | /api/rehab/phases/:type | **Нет** | Фазы реабилитации |
| GET | /api/rehab/tips | **Нет** | Советы |

### Диагнозы, шаблоны, дашборд, импорт, Telegram, Admin
- **Diagnoses:** CRUD с soft delete (`deleted_at`)
- **Templates:** CRUD шаблонов упражнений. **БАГ:** `templates.update` не отправляет body!
- **Dashboard:** GET /api/dashboard/stats (статистика инструктора)
- **Import:** POST /api/import/kinescope, POST /api/import/csv
- **Telegram:** POST /api/telegram/link, POST /api/telegram/unlink, GET /api/telegram/status
- **Admin:** GET /api/admin/stats, /users, /content, /audit-logs, /system + CRUD users

## Правила кода

### Backend
- **CommonJS модули:** `const { query } = require('../database/db');`
- **pg wrapper:** `query(sql, params)` — ВСЕГДА параметризованные запросы ($1, $2...) — SQL injection = 0
- **getClient()** для транзакций: `const client = await getClient(); try { await client.query('BEGIN'); ... } finally { client.release(); }`
- **Soft delete:** `is_active = false` для пациентов, `deleted_at` для диагнозов
- **Ownership check:** `WHERE created_by = $2` в запросах пациентов и комплексов
- **JWT algorithm:** explicit `{ algorithms: ['HS256'] }` в verify (предотвращает algorithm confusion)
- **Rate limiting:** authLimiter (5/15min), tokenLimiter, generalLimiter (production only!)
- **Audit logging:** admin actions → audit_logs таблица
- **API response format:** Все эндпоинты возвращают `{ data: <payload>, message? }` для успеха и `{ error: string, message: string }` для ошибок. Списки: `{ data: [...], total? }`. Пагинация: `{ data: [...], pagination: {...} }`. Без `success` поля.
- **Express-validator правила определены в validators.js но НЕ ПОДКЛЮЧЕНЫ к роутам!** (dead code)
- Статические файлы `/uploads` доступны без авторизации (уязвимость)

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
- **Иконки:** только `lucide-react`
- Fluid CSS: `clamp()` вместо media queries (рекомендуется)
- Touch-friendly: min-height 44px для кнопок

### Общие правила (из опыта JARVIS Director)
- **Арифметика — ТОЛЬКО через код!** Никогда не считать суммы, проценты в уме. Использовать `node -e`, SQL, python
- **НЕ выдумывать UI элементы!** Не описывать кнопки/меню не видимые на скриншоте. Просить скриншот
- **Проверять дату/время** в начале чата: `node -e "console.log(new Date().toLocaleString('ru-RU',{timeZone:'Asia/Yekaterinburg'}))"`
- **Комментарии на русском** в коде
- **Telegram Bot API не поддерживает кириллические команды!** Только `[a-z0-9_]`. Для кириллицы: `bot.onText(/^\/команда$/i, ...)`
- **bot.launch() / bot.startPolling():** обернуть в try/catch с retry (3-5 попыток, backoff). Telegram API может отвечать ECONNRESET
- **PM2 exec_mode: 'fork'** для ESM модулей (cluster не совместим)
- **IPv6 отключать** если провайдер не маршрутизирует: `--dns-result-order=ipv4first`
- **PostgreSQL DATE → JSON timezone:** если дата сдвигается на -1 день, использовать `s.date::text` в SQL или explicit timezone
- Не добавлять фичи сверх запрошенного. Bug fix ≠ рефакторинг соседнего кода

## Известные баги и уязвимости

> **Статус аудита (2026-04-09):** Все CRITICAL и 3 из 5 HIGH закрыты.
> В миграции 20260409 удалён публичный /patient/:token flow целиком,
> Patient JWT перенесён из localStorage в httpOnly cookie (SameSite=Strict + Origin check).
> Полный список см. [audit_completed.md в memory](~/.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/audit_completed.md).

### КРИТИЧЕСКИЕ (все 3 исправлены 2026-04-08)
1. ✅ ~~**POST /api/auth/register открыт**~~ — теперь `authenticateToken + requireAdmin`, ответ без JWT (админ создаёт для другого юзера)
2. ✅ ~~**Refresh/reset токены в plaintext**~~ — миграция `20260408_hash_tokens.sql`: `token` → `token_hash` (SHA-256 hex64), helper `backend/utils/tokens.js`
3. ✅ ~~**Нет lockout для пациентов**~~ — миграция `20260408_patient_lockout.sql` + логика в `patientAuth.js` login (5 попыток → 15 мин)
4. ✅ ~~**Сломанный маршрут:** `complexes.js:614` — `pool` не определён~~ (удалён)
5. ✅ ~~**IDOR на permanent delete комплексов**~~ (добавлена транзакция + ownership check)
6. ✅ ~~**Cascade delete пациента оставляет сироты**~~ (полный cleanup + транзакция)
7. ✅ ~~**Race condition при создании комплекса**~~ (SELECT FOR UPDATE)
8. ✅ ~~**Bulk import DoS**~~ (limit 500)

### ВЫСОКИЕ
9. ✅ ~~**`/uploads` публично**~~ — аватары теперь через `/api/patient-auth/avatar` с JWT (коммит 432e09b)
10. ❌ **Rate limiting выключен в dev** — если NODE_ENV ≠ production (by design)
11. ✅ ~~**Patient JWT в localStorage**~~ — перенесено в httpOnly cookie `patient_access_token` (SameSite=Strict). CSRF закрыт Origin-check middleware. PatientAuthContext определяет "залогинен ли" через GET /me. Миграция 2026-04-09.
12. ✅ ~~**Access token пациента в URL**~~ — публичный flow удалён ПОЛНОСТЬЮ. Нет `/patient/:token` роута, нет `GET /api/complexes/token/:token` эндпоинта, нет `authenticateProgressAccess` middleware. Колонка `complexes.access_token` дропнута. Миграция 2026-04-09.
13. ✅ ~~**Inconsistent response formats**~~ — все 13 роут-файлов стандартизированы: `{ data: <payload>, message? }` для успеха, `{ error, message }` для ошибок. Frontend unwrap interceptor в api.js автоматически разворачивает `response.data.data` → `response.data`
14. ✅ ~~**AuthContext не хранит refresh_token**~~ (использует `clearTokens()` из api.js)
15. ✅ ~~**Scheduler хардкодит Europe/Moscow**~~ (per-user tz из notification_settings)
16. ✅ ~~**Config не валидирует все env vars**~~ (warnings для SESSION_SECRET, TELEGRAM_BOT_TOKEN, KINESCOPE_API_KEY)
17. ✅ ~~**change-password не инвалидирует refresh tokens**~~ (false positive — уже удалял)
18. ✅ ~~**PatientDashboard бесконечный loading при 500**~~ (false positive — уже был finally)
19. ✅ ~~**Публичные endpoints без rate limiting**~~ (generalLimiter на /phases, /tips)
20. ✅ ~~**Admin NaN в LIMIT**~~ (parseInt fallback || 1 / || 20)
21. ✅ ~~**Невалидированные числовые params**~~ (bonus fix на /phases/:id после smoke-теста)

### СРЕДНИЕ (исправлены во время аудита)
22. ❌ **validators.js — dead code** — все правила определены, но ни один роут их не использует
23. ✅ ~~**`SELECT *`** в patients — утекает password_hash~~ — заменено на явный allowlist + `is_registered` computed (2026-04-09)
24. ❌ **Dashboard stats = хардкод нулей** — endpoint существует, не вызывается
25. ❌ **templates.update не отправляет body** — `api.put('/templates/${id}')` без `data`
26. ❌ **EditComplex.handleAddExercise** — `toast.success('Ссылка скопирована!')` при дубле (copy-paste)
27. ❌ **DiaryScreen** — структурированные данные сериализуются в текст `notes` (хрупкий парсинг)
28. ❌ **80+ дублей CSS-классов** — глобальные стили конфликтуют
29. ❌ **Нет аудит-логов для чтения** данных пациентов (GDPR compliance)
30. ❌ **ErrorBoundary не ловит** async ошибки из useEffect
31. ✅ ~~**Patient email не UNIQUE**~~ (partial UNIQUE index в миграции)
32. ✅ ~~**Progress log IDOR**~~ (ownership check для JWT)
33. ✅ ~~**Деактивированный инструктор** с валидным JWT~~ (auth middleware проверяет is_active в БД)
34. ✅ ~~**Нет индекса** на `complex_exercises(exercise_id)`~~ (миграция)
35. ✅ ~~**complexes.patient_id допускает NULL**~~ (NOT NULL в миграции)
36. ✅ ~~**Нет автоочистки истёкших refresh tokens**~~ (cron 03:00 МСК)
37. ✅ ~~**Отрицательные duration_seconds**~~ (Math.max(0, ...))
38. ✅ ~~**Нет лимита длины сообщений**~~ (max 5000 chars)
39. ✅ ~~**Дубль email возвращает 400**~~ (409 Conflict)
40. ✅ ~~**RoadmapScreen падает** при пустом phases array~~
41. ✅ ~~**ContactScreen дублирует polling intervals**~~ (cleanup перед generate)

## Структура тестов

```
backend/tests/__tests__/
├── admin.routes.test.js            # Admin API
├── patientAuth.middleware.test.js  # Patient JWT middleware
├── patientProfile.test.js          # Профиль пациента + my-complexes + avatar
├── progress.routes.test.js         # Progress с patient JWT + instructor JWT
├── originCheck.test.js             # CSRF Origin-check
├── rehab.routes.test.js            # Rehab API
├── scheduler.test.js               # Scheduler
├── telegram.routes.test.js         # Telegram API
└── telegramBot.test.js             # Telegram бот

frontend/src/ (test files)
├── services/api.test.js       # Тесты API-сервиса
├── context/AuthContext.test.js
├── pages/Admin/AdminPanel.test.js
├── pages/PatientDashboard/PatientDashboard.test.js
│                  components/ (HomeScreen.test.js, DiaryScreen.test.js, ProfileScreen.test.js, RoadmapScreen.test.js)
└── utils/exerciseConstants.test.js
```

## Что можно перенести из JARVIS Director

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
- **Хеширование токенов** (SHA-256) перед хранением в БД
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

## Telegram бот

- **Библиотека:** `node-telegram-bot-api` 0.67 (НЕ Telegraf)
- **Команды:** /start (привязка по коду), /status (прогресс), /diary (6-шаговый wizard), /tip (совет дня), /help
- **Diary wizard:** pain → swelling → mobility → mood → sleep → notes (in-memory state, 10 min timeout)
- **Cron:** exercise reminders (каждую минуту), diary reminders (21:00), daily tips (12:00) — Europe/Moscow
- **Привязка:** пациент генерирует код на сайте → вводит в бот → telegram_chat_id записывается в patients

## Планируемый деплой

**Статус:** НЕ задеплоен. Планируется на тот же VDS что JARVIS (185.93.109.234).

**Подготовленные credentials:**
```
База: azarean_db
Пользователь: azarean_user
Пароль: Azarean2026$Db!
```

**Планируемые субдомены:** app/rehab/api.azarean.ru → 185.93.109.234
**КОНФЛИКТ:** `rehab.azarean.ru` и `api.azarean.ru` уже используются JARVIS. Нужна переконфигурация nginx или другие субдомены.

См. `memory/deployment_plan.md` для полного чеклиста.

## Git

- **Repo:** https://github.com/jaike077-web/azarean-rehab.git
- **100+ коммитов**, активная разработка через codex PRs
- **Последний:** `99e374a` Sprint 4: Admin panel (12.02.2026)
- **14 незакоммиченных файлов** Admin/ + Dashboard.js — только локально

## Kinescope интеграция

- ~1000 видео упражнений
- API: list videos, get thumbnail, project management
- Thumbnail sync: `POST /exercises/fetch-all-thumbnails` (N+1 — по 1 запросу на видео с 100ms delay)
- Embed: video_url → `https://kinescope.io/embed/` + ID
