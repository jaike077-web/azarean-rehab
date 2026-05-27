# Azarean Rehab — Полный отчёт для архитектора

**Дата:** 2026-05-07
**Адресат:** архитектор (внешний)
**Цель:** дать целостное представление о проекте — структура, состояние, потоки, зависимости, риски — без копания в коде самостоятельно.

> Все файлы кликабельны через `path:line` ссылки. Цифры — реальные на 2026-05-07 (проверено).

---

## 1. Резюме одним абзацем

Платформа реабилитации **my.azarean.ru** для физиотерапевтической студии **Azarean Network** (Екатеринбург). Веб-приложение с двумя пользовательскими сторонами: **инструкторы** (создают комплексы упражнений, отслеживают пациентов, редактируют контент) и **пациенты** (личный кабинет с дневником, упражнениями, программой реабилитации, OAuth-логин через Telegram/Yandex). Plus **Telegram-бот** для напоминаний и записи дневника. **В проде с 2026-04-23**, активная разработка через GitHub Actions CI/CD на push в `main`. Стек: React 19 + Express 5 + PostgreSQL 18.

---

## 2. Стек и инфраструктура

### Backend (Node.js, CommonJS)
- Express 5.1, pg 8.16 (raw SQL через `query(sql, params)` wrapper, без ORM)
- bcryptjs 3.0, jsonwebtoken 9.0, cookie-parser
- helmet 8.1, express-rate-limit 8.2, express-validator 7.3
- node-telegram-bot-api 0.67, node-cron 4.2
- multer 2.0 + sharp 0.34 (загрузка/сжатие аватаров и фото дневника)
- `openid-client` v6 (Telegram OIDC)
- nodemailer 7 (Y360 SMTP)
- Jest 30 + Supertest 7

### Frontend (React 19, JS без TypeScript)
- CRA (react-scripts 5), `setupProxy.js` для dev-проксирования `/api` → :5000
- React Router 7
- Axios 1.13 (два инстанса: `api` для инструктора, `patientApi` для пациента)
- @dnd-kit (drag-and-drop в CreateComplex)
- lucide-react 0.555 (единственная иконочная библиотека, **никаких emoji**)
- @uiw/react-md-editor (markdown редактор для контента)
- Sentry SDK (в noop без DSN — sentry.io ingest заблокирован для русских IP)

### БД
- PostgreSQL 18 (на dev и prod)
- 20 таблиц, 29 миграций (см. §6)
- `_migrations(filename PK, applied_at, checksum)` — checksum-tracking на проде

### Хостинг и сеть
- VDS 185.93.109.234 (Россия), shared с другим проектом **JARVIS Director** (Fastify на :3000 — НЕ ТРОГАТЬ)
- Backend через PM2 fork mode на :3001, systemd
- nginx как HTTP→HTTPS reverse proxy + SPA + `/api` proxy
- Let's Encrypt SSL, certbot auto-renew
- Финский reverse-proxy `tg-proxy.azarean.ru` (78.17.1.70) для Telegram OIDC — **не наш**, поднят командой JARVIS, IP-allowlist на 185.93.109.234

### Бот и интеграции
- Prod bot: `@az_zari_bot`
- Dev bot: `@azarean_rehab_bot`
- Ops-bot для алертов: `@vadim_azarenkov` (chat_id=183943760)
- Kinescope — хостинг ~1000 видео упражнений
- Y360 SMTP (`smtp.yandex.ru:465`, `noreply@my.azarean.ru`) — рассылка email
- Resend — fallback (free 3000/мес, серверы в США)

---

## 3. Архитектура высокого уровня

```
                    ┌─────────────────────────────────────────────────┐
                    │         my.azarean.ru (nginx + Let's Encrypt)   │
                    └────────┬────────────────────┬───────────────────┘
                             │                    │
                  ┌──────────▼─────────┐  ┌───────▼────────┐
                  │  React SPA (CRA)   │  │   /api  → :3001 │
                  │  (frontend/build/) │  │  Express PM2    │
                  └─────────┬──────────┘  └────────┬────────┘
                            │                      │
                  ┌─────────┴────────┐    ┌────────┴──────────┐
                  │ Two axios:        │    │ Two JWT systems:  │
                  │ - api (Bearer,    │    │ - users (Bearer)  │
                  │   instructor)     │    │ - patients        │
                  │ - patientApi      │    │   (httpOnly cookie│
                  │   (cookie auth)   │    │   + CSRF Origin)  │
                  └───────────────────┘    └────────┬──────────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────┐
                          │                         │                     │
                  ┌───────▼────────┐    ┌───────────▼───────┐  ┌──────────▼────────┐
                  │  PostgreSQL 18 │    │  Telegram Bot     │  │  External OAuth    │
                  │  20 таблиц     │    │  - polling        │  │  - Telegram OIDC   │
                  │  29 миграций   │    │  - cron scheduler │  │    через TG-proxy  │
                  └────────────────┘    │  - /diary wizard  │  │  - Yandex OAuth 2.0│
                                        └───────────────────┘  │    напрямую        │
                                                               └────────────────────┘
                          ┌──────────────────────────────────────────┐
                          │  Сторонние интеграции:                   │
                          │  - Kinescope API (~1000 видео упражнений)│
                          │  - Y360 SMTP / Resend (email)            │
                          │  - Ops-bot (Telegram алерты от 5xx/UNCAUGHT)│
                          │  - Sentry (noop без DSN)                 │
                          └──────────────────────────────────────────┘
```

Ключевые архитектурные решения и **почему так**:

| Решение | Причина |
|---|---|
| Два отдельных JWT-системы (instructor / patient), разные секреты | Историческая разница — сначала был только инструктор, патиент добавился отдельной фичей. Сейчас разделение закрепилось как разделение доменов: инструктор работает через Bearer + localStorage, пациент через httpOnly cookie с CSRF. |
| Patient JWT в **httpOnly cookie + Origin-check** вместо localStorage | XSS-устойчивость для медицинских данных пациента. Bearer оставлен только как fallback для тестов. |
| Финский reverse-proxy для Telegram OIDC | rehab-VDS (185.93.109.234) не достукается до oauth.telegram.org напрямую (subnet block). Yandex доступен напрямую. |
| Plain OAuth 2.0 (без OIDC) для Yandex | Yandex не публикует `/.well-known/openid-configuration` — 404. Userinfo берётся напрямую с `login.yandex.ru/info`. |
| Раздельные экраны пациента (HomeScreen/DiaryScreen/etc) внутри одного `<PatientDashboard/>` через локальный `screen` state | UX: tab-bar навигация без полных перезагрузок, smooth transitions, общий header/profile overlay. Не SPA-роуты — `screen` число. |
| API response unification: `{ data, message? }` | Стандартизация после хаоса 2026-04-09. Frontend interceptor `unwrapResponse` разворачивает в `response.data = payload`, `response.meta = { message, total, ... }`. |
| CSS Modules с camelCase-обязательным | После миграции 2026-05-04. Подробности §9. |
| `_migrations` checksum-tracking | Bug #36 (schema drift dev↔prod) → теперь миграции после apply immutable, исправления только новой миграцией. |

---

## 4. Backend

### 4.1 Точка входа и middleware-цепочка

**[backend/server.js:1-443](backend/server.js)** — 443 строки

Цепочка middleware в порядке регистрации:
1. `Sentry.instrument` ([backend/instrument.js](backend/instrument.js)) — должен быть первой строкой ДО любых require, чтобы OpenTelemetry успел инструментировать `express`/`http`/`pg`.
2. `helmet` с CSP whitelist для kinescope.io (видео-iframe и MP4)
3. `cors` со списком из `config.corsOrigins`
4. **Rate limiters**:
   - `generalLimiter` — 100/15min на `/api/*` **только в production** (1000 в dev)
   - `authLimiter` — 5/15min на `/api/auth/login|register` и `/api/patient-auth/login|register` (15 в dev), `skipSuccessfulRequests: true`
   - `oauthCallbackLimiter` — 20/15min на `/api/patient-auth/oauth/{telegram,yandex}` (включая callback)
5. `express.json({ limit: '10mb' })` + `cookieParser`
6. **Каталог `/uploads` НЕ раздаётся как статика** — аватары через авторизованный `/api/patient-auth/avatar`, фото дневника через `/api/rehab/my/diary/:id/photos/:pid`.
7. Логирование запроса с маскировкой UUID
8. `/api/health` ([backend/routes/health.js](backend/routes/health.js)) — регистрируется ДО других чтобы быть exempt от authLimiter
9. `/api/log-error` (для frontend error reporting в ops-bot)
10. `requireSameOrigin` ([backend/middleware/originCheck.js](backend/middleware/originCheck.js)) на пациентских и progress endpoints — CSRF для cookie-auth
11. Все API роуты
12. 404 handler с whitelist endpoint'ов
13. `Sentry.setupExpressErrorHandler` (noop без DSN)
14. Global error handler — 5xx сериализует в ops-bot через `sendOpsAlert`

Graceful shutdown на SIGTERM/SIGINT останавливает Telegram bot polling и scheduler.
`uncaughtException` и `unhandledRejection` тоже шлют в ops-bot (с 1сек flush перед exit).

### 4.2 Роуты (15 файлов, ~7800 строк)

| Файл | Строк | Назначение |
|---|---|---|
| [backend/routes/auth.js](backend/routes/auth.js) | 380 | Инструктор: register (admin only), login, refresh, logout, /me |
| [backend/routes/patientAuth.js](backend/routes/patientAuth.js) | **2012** | Пациент: полный цикл (register/login/refresh/me), avatar, password reset, my-complexes, **OAuth Telegram + Yandex**, GDPR data-export, self-delete |
| [backend/routes/patients.js](backend/routes/patients.js) | 553 | CRUD пациентов, soft/hard delete, **invite-code generation** |
| [backend/routes/exercises.js](backend/routes/exercises.js) | 885 | CRUD упражнений, Kinescope import, bulk import, thumbnails |
| [backend/routes/complexes.js](backend/routes/complexes.js) | 538 | CRUD комплексов, exercises ordering, ownership check |
| [backend/routes/diagnoses.js](backend/routes/diagnoses.js) | 304 | CRUD диагнозов |
| [backend/routes/progress.js](backend/routes/progress.js) | 320 | Прогресс тренировок (доступ инструктору + пациенту) |
| [backend/routes/templates.js](backend/routes/templates.js) | 217 | Шаблоны упражнений (для инструктора) |
| [backend/routes/rehab.js](backend/routes/rehab.js) | **1552** | Программы реабилитации, дневник + фото, streaks, сообщения, уведомления, фазы, советы |
| [backend/routes/dashboard.js](backend/routes/dashboard.js) | 61 | Статистика для инструктора |
| [backend/routes/admin.js](backend/routes/admin.js) | ~946 | Админка: users, stats, audit-logs, phases, tips, videos, system info |
| [backend/routes/import.js](backend/routes/import.js) | 367 | CSV/Kinescope импорт упражнений с SAVEPOINT per iteration |
| [backend/routes/telegram.js](backend/routes/telegram.js) | 86 | Привязка Telegram chat_id к пациенту через одноразовый код |
| [backend/routes/health.js](backend/routes/health.js) | 53 | `GET /api/health` — uptime + DB probe с 2-сек таймаутом |
| [backend/routes/log-error.js](backend/routes/log-error.js) | 53 | Приём frontend ошибок → ops-bot (rate-limit 30/мин IP) |

### 4.3 Сервисы

| Файл | Строк | Назначение |
|---|---|---|
| [backend/services/telegramBot.js](backend/services/telegramBot.js) | 631 | Telegram-бот: `/start` (привязка), `/status`, `/diary` (6-step wizard), `/tip`, `/help`. **Кириллические команды через `bot.onText(/^\/команда$/i, ...)`** — Telegram API не поддерживает их в `BotFather setcommands`. |
| [backend/services/telegramOidc.js](backend/services/telegramOidc.js) | 146 | Telegram OIDC через `openid-client@6` + `customFetch` с `X-Proxy-Secret` header → финский reverse-proxy. PKCE S256 + nonce. **ESM в CJS — лениво require внутри функций.** |
| [backend/services/yandexOauth.js](backend/services/yandexOauth.js) | 178 | Yandex OAuth 2.0 + PKCE S256 (без OIDC discovery). UserInfo через `GET login.yandex.ru/info` с `Authorization: OAuth <token>`. Phone scope = `login:default_phone`. |
| [backend/services/scheduler.js](backend/services/scheduler.js) | 241 | Cron: exercise reminders (каждую минуту, per-user tz), diary 21:00 МСК, daily tip 12:00 МСК, refresh-token cleanup 03:00, patient-deletion-queue 03:30. |
| [backend/services/kinescopeService.js](backend/services/kinescopeService.js) | 152 | Kinescope API client (list, thumbnails) |
| [backend/services/csvImportService.js](backend/services/csvImportService.js) | 56 | CSV парсер |

### 4.4 Middleware и утилиты

- [backend/middleware/auth.js](backend/middleware/auth.js) — `authenticateToken` (с DB-check `is_active`), `requireAdmin`, `authenticatePatientOrInstructor`. JWT verify с **explicit `algorithms: ['HS256']`** (защита от algorithm confusion).
- [backend/middleware/patientAuth.js](backend/middleware/patientAuth.js) — cookie-first + Bearer fallback.
- [backend/middleware/originCheck.js](backend/middleware/originCheck.js) — CSRF Origin-check, bypass в `NODE_ENV=test`, в dev пропускает запросы без Origin (CRA proxy strip'ает Origin).
- [backend/middleware/upload.js](backend/middleware/upload.js) — multer (memory) + sharp для аватаров и фото дневника.
- [backend/middleware/validators.js](backend/middleware/validators.js) — express-validator правила. **Подключены к auth, patient-auth, patients, diagnoses, progress.** Exercise/complex валидаторы пропущены сознательно (`video_url required` и `exercises min=1` ломают real-world flows).
- [backend/utils/audit.js](backend/utils/audit.js) — `logAudit()` для GDPR-аудита (пишет в `audit_logs`).
- [backend/utils/tokens.js](backend/utils/tokens.js) — `hashToken(token)` SHA-256 hex64 для refresh/reset токенов.
- [backend/utils/inviteCode.js](backend/utils/inviteCode.js) — 8-символьные коды без 0/O/1/I/l, normalize, validate format.
- [backend/utils/phone.js](backend/utils/phone.js) — `normalizePhone(raw)` → E.164, `phonesEqual(a,b)`. **17 unit-тестов.**
- [backend/utils/email.js](backend/utils/email.js) — Y360 → Resend → console fallback. 7 unit-тестов.
- [backend/utils/opsAlert.js](backend/utils/opsAlert.js) — `sendOpsAlert(title, body)` с дедупом (TTL 10 мин) и hourly cap 30. Категоризация ошибок: `БД (PG codes 22xxx/23xxx/42xxx) / СЕРВИС НЕДОСТУПЕН / ТАЙМАУТ / AUTH`.

---

## 5. Frontend

### 5.1 Точка входа и роутинг

**[frontend/src/App.js](frontend/src/App.js)** — 316 строк

Иерархия провайдеров:
```
ErrorBoundary
  └─ ThemeProvider          ← localStorage 'azarean_theme' + data-theme на <html>
      └─ AuthProvider       ← инструктор (localStorage 'token' + 'refresh_token')
          └─ ToastProvider  ← глобальный addToast() с useMemo (!) для value
              └─ Router
                  └─ <main id="main-content">
                      └─ <Suspense fallback={LoadingSpinner}>
                          └─ Routes (см. ниже)
```

**Роуты инструктора** (защищены `<ProtectedRoute>`, через `useAuth()`):
- `/login` (eager) — Login
- `/dashboard` — Dashboard (tab-container, не вложенные роуты!)
- `/patients` — Patients (834 строки)
- `/my-complexes`, `/create-complex`, `/create-complex/:patientId`, `/complex/edit/:id`
- `/templates/:id/edit`
- `/progress/:complexId`, `/patient-progress/:patientId`
- `/exercises`, `/exercises/:id`
- `/trash`

**Роуты пациента** (вложены в `<PatientAuthProvider>` через layout Route + Outlet — **один провайдер на все**):
- `/patient-login`, `/patient-register`, `/patient-forgot-password`, `/patient-reset-password/:token` — Suspense fallback `<PatientSplash/>` (полноэкранный logo+spinner)
- `/patient-dashboard` — обёрнут в `<PatientRoute>`, fallback `<PatientDashboardSkeleton/>` (каркас реального дашборда — закрывает баг F5 flicker)

**Lazy-load:** все страницы кроме `Login` и `Dashboard`. PatientDashboard тоже lazy.

### 5.2 API client

**[frontend/src/services/api.js](frontend/src/services/api.js)** — 513 строк, **два axios instance**:

| | `api` | `patientApi` |
|---|---|---|
| Auth | Bearer header (localStorage) | httpOnly cookie (`withCredentials: true`) |
| Refresh trigger | 403 + "истек" | 401 OR (403 + "истек") |
| Refresh URL | `/auth/refresh` | `/patient-auth/refresh` (cookie path-scoped) |
| Auto-refresh queue | Да (failedQueue) | Да (patientFailedQueue) |
| Expired-event broadcast | Нет | `window.dispatchEvent('patient-auth-expired')` |
| Используется | Все инструкторские эндпоинты | Все пациентские + `progress` (через `progressPatient`) |

**Response interceptor `unwrapResponse`:** разворачивает `{ data, message?, total? }` → `response.data = payload`, `response.meta = { message, total }`. **В тестах моки должны эмулировать развёрнутый формат напрямую.**

**Экспортируемые API-объекты** (~50 функций суммарно):
- `auth`, `patientAuth`, `patients`, `exercises`, `complexes`, `progress`, `progressPatient`, `diagnoses`, `templates`, `rehabPrograms`, `rehab`, `admin`, `dashboard`, `imports`

### 5.3 Страницы инструктора (`frontend/src/pages/`)

| Файл | Строк | Описание |
|---|---|---|
| [Login.js](frontend/src/pages/Login.js) | — | Логин инструктора |
| [Dashboard.js](frontend/src/pages/Dashboard.js) | — | **Tab-container**: Patients / Diagnoses / CreateComplex / MyComplexes / Trash. `activeTab` state, не роуты. |
| [Patients.js](frontend/src/pages/Patients.js) | 834 | CRUD пациентов, генерация invite-code через `<InviteCodeModal/>`, кнопка «Программа» открывает `<RehabProgramModal/>` |
| [Diagnoses.js](frontend/src/pages/Diagnoses.js) | — | CRUD диагнозов |
| [CreateComplex.js](frontend/src/pages/CreateComplex.js) | — | 4-step wizard + DnD (`@dnd-kit`) |
| [EditComplex.js](frontend/src/pages/EditComplex.js) | — | Редактирование комплекса |
| [MyComplexes.js](frontend/src/pages/MyComplexes.js) | — | Список комплексов |
| [Trash.js](frontend/src/pages/Trash.js) | — | Soft-deleted комплексы / пациенты |
| [PatientProgress.js](frontend/src/pages/PatientProgress.js) | 470 | Прогресс-дашборд по пациенту (для инструктора) |
| [ViewProgress.js](frontend/src/pages/ViewProgress.js) | 452 | Просмотр прогресса по конкретному комплексу |
| [Exercises/Exercises.js](frontend/src/pages/Exercises/Exercises.js) | 363 | Библиотека упражнений |
| [Exercises/ExerciseDetail.js](frontend/src/pages/Exercises/ExerciseDetail.js) | 424 | Деталь упражнения |
| [Exercises/components/](frontend/src/pages/Exercises/components/) | — | ExerciseCard, ExerciseFilters, ExerciseModal, ExerciseViewModal, ExerciseSelector, DeleteConfirmModal |
| [ImportExercises.js](frontend/src/pages/ImportExercises.js) | — | Импорт CSV/Kinescope |
| [Admin/](frontend/src/pages/Admin/) | — | AdminContent (477) + AdminUsers (208) + AdminStats (100) + AdminSystem (130) + AdminAuditLogs (149) + AdminUserModal (124) |
| [EditTemplate.js](frontend/src/pages/EditTemplate.js) | — | Редактирование шаблона |

### 5.4 Личный кабинет пациента (центральный экран)

**[frontend/src/pages/PatientDashboard/PatientDashboard.js](frontend/src/pages/PatientDashboard/PatientDashboard.js)** — 273 строки

**Архитектура:** не SPA-роуты, а локальный `screen: number` state с 5 табами + Profile как **full-screen overlay**.

```
┌─────────────────────────────────────────────────────┐
│ pd-header  [LOGO]   [streak] [theme] [avatar→Prof] │
├─────────────────────────────────────────────────────┤
│ pd-content (scrollRef, key={screen} fade-in анимация)│
│                                                     │
│   switch(screen):                                   │
│     0 → HomeScreen                                  │
│     1 → RoadmapScreen                               │
│     2 → DiaryScreen                                 │
│     3 → ContactScreen                               │
│     4 → ExercisesScreen → ComplexDetailView →       │
│                            ExerciseRunner (LOCKED)  │
├─────────────────────────────────────────────────────┤
│ TabBar [Главная] [Путь] [Упражнения*] [Дневник] [Связь] │
└─────────────────────────────────────────────────────┘

   Profile overlay (поверх всего, screen=ProfileScreen)
   - открывается через AvatarBtn (header)
   - закрывается через onClose / тап по табу
```

| Экран | Файл | Строк | Что делает |
|---|---|---|---|
| Home | [HomeScreen.js](frontend/src/pages/PatientDashboard/components/HomeScreen.js) | 374 | Hero «Ваш комплекс на сегодня» с CTA, PGIC trio (better/same/worse), quick actions, streak |
| Roadmap | [RoadmapScreen.js](frontend/src/pages/PatientDashboard/components/RoadmapScreen.js) | 460 | Фазы реабилитации (плечо/колено), accordion с phase details |
| Diary | [DiaryScreen.js](frontend/src/pages/PatientDashboard/components/DiaryScreen.js) | 830 | Pain slider + RoM + better-list checkboxes + pain-when chips + photos (до 3, 1200×1200 JPEG) + sparkline тренда |
| Contact | [ContactScreen.js](frontend/src/pages/PatientDashboard/components/ContactScreen.js) | 326 | Чат с куратором, **MessengerCTA** для Telegram/WhatsApp/Max |
| Exercises | [ExercisesScreen.js](frontend/src/pages/PatientDashboard/components/ExercisesScreen.js) | 239 | Список комплексов, выбор → ComplexDetailView |
| ↳ Detail | [ComplexDetailView.js](frontend/src/pages/PatientDashboard/components/ComplexDetailView.js) | 207 | Список упражнений в комплексе |
| ↳ Runner | **[ExerciseRunner.js](frontend/src/pages/PatientDashboard/components/ExerciseRunner.js)** | **316** | **🔒 LOCKED** (см. §13) — выполнение тренировки |
| Profile | [ProfileScreen.js](frontend/src/pages/PatientDashboard/components/ProfileScreen.js) | 993 | Аватар, имя, email, OAuth-привязки, ThemeToggle, Telegram link-code, **GDPR data export**, **self-delete** |

**UI-кит:** [components/ui/](frontend/src/pages/PatientDashboard/components/ui/) — 17 переиспользуемых компонентов (TabBar, AvatarBtn, ProgressRing, RestTimer, PainScale, DifficultyScale, ChipGroup, ScreenHeader, Section, Card, Pill, SettingsRow, Switch, MessengerCTA, MessengerIcons, AnimatedCheckmark, CelebrationOverlay, IllKnee).

**Hooks:** [usePatientAvatarBlob.js](frontend/src/pages/PatientDashboard/hooks/usePatientAvatarBlob.js) — кеширует blob-аватар с invalidation по `avatar_url` (cache-buster в query string).

### 5.5 Контексты

| Файл | Описание |
|---|---|
| [AuthContext.js](frontend/src/context/AuthContext.js) (59) | Инструктор: `{ user, loading, login, logout }`, через localStorage |
| [PatientAuthContext.js](frontend/src/context/PatientAuthContext.js) (71) | Пациент: `{ patient, loading, login, logout }`, через `GET /me` на mount, слушает `patient-auth-expired` event |
| [ToastContext.js](frontend/src/context/ToastContext.js) (87) | `addToast(type, title?, message, duration?)` — **value обёрнут в useMemo** (фикс `ec8ba2c`, см. §13) |
| [ThemeContext.js](frontend/src/context/ThemeContext.js) | `{ theme, toggleTheme }` — persist в localStorage `azarean_theme`, ставит `data-theme` на `<html>` |

### 5.6 Общие компоненты

[frontend/src/components/](frontend/src/components/) — 16 файлов:

- **Layout/UX:** ErrorBoundary, LoadingSpinner, Skeleton + skeletons/ (4 специализированных), Toast, ConfirmModal, BackButton, Breadcrumbs, PatientSplash
- **Бизнес:** InviteCodeModal (генерация кода + copy + t.me/share), RehabProgramModal (создание/редактирование программы реабилитации с диагнозом и фазой), TemplateSelector, TemplateViewModal, DeleteTemplateModal
- **Тема:** ThemeToggle (Sun/Moon кнопка)

---

## 6. БД и миграции

### 6.1 Таблицы (20)

**Пользователи:**
- `users` (инструкторы/админы) — bcrypt password, role, lockout
- `patients` — bcrypt password OR OAuth provider+provider_id, telegram_chat_id NUMERIC(20), preferred_messenger, lockout

**Контент:**
- `exercises` — ~1000 видео из Kinescope, body_region/difficulty_level/movement_pattern/chain_type/joint
- `complexes` — комплексы упражнений на пациента (instructor_id, diagnosis_id, recommendations, warnings)
- `complex_exercises` — связка комплекс↔упражнение с order_number, sets, reps, rest_seconds
- `diagnoses` — справочник
- `templates` (+`template_exercises`) — шаблоны для инструктора
- `rehab_programs` — программа реабилитации (current_phase, surgery_date, status)
- `rehab_phases` — справочник фаз (allowed/pain/daily/red_flags/faq)
- `tips` — советы по фазам
- `phase_videos` — видео для фаз
- `progress_logs` — записи о выполненных тренировках (session_id, pain, rpe-difficulty 1-10, comment)

**Дневник + общение:**
- `diary_entries` — UNIQUE(patient_id, entry_date), structured fields (pgic_feel/rom_degrees/better_list/pain_when)
- `diary_photos` — до 3 на запись, sharp 1200×1200 JPEG
- `messages` — чат пациент↔инструктор, linked_diary_id, channel
- `streaks` — UNIQUE(patient_id, program_id)
- `notification_settings` — UNIQUE(patient_id), per-user tz

**Auth и инфраструктура:**
- `refresh_tokens` (instructor) — SHA-256 хэш
- `patient_refresh_tokens` — SHA-256 хэш
- `patient_password_resets` — SHA-256 хэш
- `patient_oauth_states` — state + PKCE code_verifier + nonce, used-once, 10 мин TTL
- `patient_invite_codes` — 8-симв SHA-256, 24ч TTL, used-once
- `telegram_link_codes` — одноразовые коды привязки бота
- `patient_deletion_queue` — soft-delete очередь, scheduled_for=NOW+30d
- `audit_logs` — GDPR-аудит чтения чувствительных данных
- `_migrations` — checksum-tracking (filename PK, applied_at, checksum)

### 6.2 Миграции (29 в порядке применения)

```
20240910 add_progress_session_columns
20240930 add_complexes_access_token (потом удалена)
20251223 create_templates_tables
20251224 add_rest_seconds
20251225 add_kinescope_id
20260204 security_updates             ← bcrypt cost, helmet config
20260205 database_audit_fixes
20260210 patient_auth                 ← цикл регистрации пациента
20260210 rehab_tables                 ← rehab_programs, phases
20260211 add_complexes_title
20260211 extend_rehab_phases          ← allowed/pain/daily/red_flags/faq
20260212 telegram_bot
20260213 admin_panel
20260406 audit_schema_fixes           ← UNIQUE email partial, idx_complex_exercises
20260408 patient_lockout
20260408 hash_tokens                  ← plaintext → SHA-256
20260409 complexes_access_token_nullable + drop_access_token  ← удаление публичного flow
20260421 patient_preferred_messenger
20260421 progress_difficulty_rpe10
20260421 diary_structured_fields
20260424 prod_schema_recovery         ← Bug #36 (см. §13)
20260424b exercises_description_nullable
20260427 patient_invite_codes
20260427 normalize_patient_phones     ← бэкфилл E.164
20260427 oauth_pkce_nonce
20260429 create_migrations_table      ← checksum tracking
20260429 telegram_chat_id_numeric     ← BIGINT → NUMERIC(20) (Bug iPhone OAuth)
20260429 patient_deletion_queue       ← GDPR self-delete
```

**Все миграции идемпотентны** (DO-блоки с проверками column_exists, IF NOT EXISTS на индексах). Это требование закреплено как правило.

**Apply на проде:** [deploy/migrate.sh](deploy/migrate.sh) с checksum-tracking. При первом прогоне (пустая `_migrations`) все существующие .sql помечаются как legacy. Дальше: новые применяются + INSERT, изменённые → exit 1 с алертом.

**Schema drift detection:** daily cron 04:00 МСК [deploy/check-schema-drift.sh](deploy/check-schema-drift.sh) сравнивает `pg_dump --schema-only` с baseline. Diff без новых миграций → DRIFT → ops-bot alert.

---

## 7. Auth-потоки

### 7.1 Инструктор

```
[Login.js] POST /api/auth/login → bcrypt verify → JWT(15min) + refresh(7d, SHA-256 в БД)
   → AuthContext.login(user) → localStorage 'token' + 'refresh_token'
   → Bearer header в каждом запросе
   
   На 403 + "истек":
   → POST /api/auth/refresh с refresh_token → новый JWT
   → retry оригинального запроса через failedQueue
```

Account lockout: 5 fails → 15 min. POST /api/auth/register **только админ** (защищено `authenticateToken + requireAdmin`, ответ без JWT).

### 7.2 Пациент (email + invite-code)

```
[Инструктор] POST /api/patients (создаёт запись) → 
[Инструктор] POST /api/patients/:id/invite-code → 8-симв код + share-ссылка
[Пациент] /patient-register с invite_code в форме → POST /api/patient-auth/register
   → bcrypt + httpOnly cookie patient_access_token (15min, SameSite=Lax, path=/api)
   + patient_refresh_token (30d, SameSite=Lax, path=/api/patient-auth, SHA-256)
   
[Login] POST /api/patient-auth/login → cookies
[On mount] PatientAuthContext делает GET /api/patient-auth/me для определения "залогинен ли"
   
   Auto-refresh: на 401 → POST /api/patient-auth/refresh (cookie path-scoped)
   На fail → window.dispatchEvent('patient-auth-expired') → PatientAuthContext logout
```

**CSRF:** `requireSameOrigin` middleware проверяет `Origin` header на всех state-changing методах `/api/patient-auth/*`, `/api/rehab/my/*`, `/api/telegram/*`, `/api/progress/*`.

### 7.3 OAuth Telegram (Phase 2 — в проде)

```
GET /api/patient-auth/oauth/telegram (start)
  → openid-client.authorizationUrl(state, code_challenge, nonce)
  → state записывается в patient_oauth_states (used-once, 10 мин TTL)
  → 302 на oauth.telegram.org с consent screen

[Юзер на телефоне нажимает Confirm в Telegram app]
  → callback на /api/patient-auth/oauth/telegram/callback?code=...&state=...
  → openid-client через customFetch → tg-proxy.azarean.ru (X-Proxy-Secret) → oauth.telegram.org/token
  → claims: sub (numeric > BIGINT max!), phone_number, first_name, photo_url

  Match-flow:
  1. SELECT * FROM patients WHERE auth_provider='telegram' AND provider_id=$sub
     → есть → cookies + 302 /patient-dashboard (returning)
  2. SELECT * FROM patients WHERE phone=$normalized AND created_by IS NOT NULL
     → ровно один → silent autolink (UPDATE provider_id=$sub) → cookies + 302
     → больше одного → 302 /patient-login?oauth_error=multi_match
  3. Иначе → 302 /patient-register?prefill={phone, first_name, telegram_sub}
```

**Грабли (см. [memory/telegram_oidc_proxy.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/telegram_oidc_proxy.md)):**
- Login Widget legacy после Switch to OIDC мёртв (`deprecated`)
- `telegram:bot_access` scope нельзя обязательным (toggle off → silent fail)
- Один `$1` на VARCHAR+BIGINT колонки → pg `inconsistent types deduced` — нужны разные параметры
- iPhone OAuth: sub > 9.22e18 → раньше падало UPDATE с code 22003. Закрыто миграцией `20260429_telegram_chat_id_numeric.sql` (BIGINT → NUMERIC(20))

### 7.4 OAuth Yandex (Phase 2d — в проде)

Plain OAuth 2.0 + PKCE S256 (без OIDC discovery). UserInfo через `GET login.yandex.ru/info` с `Authorization: OAuth <token>`. Прокси не нужен. Phone scope = `login:default_phone`. Match-flow идентичен Telegram'у.

---

## 8. Интеграции

### 8.1 Telegram bot

- **Библиотека:** `node-telegram-bot-api` 0.67 (НЕ Telegraf)
- **Команды:** `/start <code>`, `/status`, `/diary` (6-step wizard with in-memory state, 10 min timeout), `/tip`, `/help`. Кириллические команды через regex `bot.onText(/^\/команда$/i, ...)`.
- **Cron в [scheduler.js](backend/services/scheduler.js):**
  - exercise reminders — каждую минуту (per-user tz из `notification_settings`)
  - diary reminders — 21:00 МСК
  - daily tips — 12:00 МСК
  - refresh-token cleanup — 03:00 МСК
  - patient-deletion-queue (hard delete) — 03:30 МСК
- **Polling, не webhook.** `bot.launch()` обёрнут в try/catch с 3-5 попытками retry + backoff (Telegram API может ECONNRESET).

### 8.2 Kinescope

- ~1000 видео упражнений
- API: list (пагинация 50/page), get thumbnail, project management, folder filtering
- Embed: `video_url` → `https://kinescope.io/embed/<id>`
- Thumbnail sync: `POST /exercises/fetch-all-thumbnails` (N+1 — 1 запрос на видео + 100ms delay)
- **Default limit поднят 50→1000** в `routes/exercises.js` после прод-импорта 239 видео где UI показал «50 из 50»
- **SAVEPOINT video_import** в `routes/import.js` — per-iteration rollback чтобы одна ошибка не роняла транзакцию импорта

### 8.3 Email (Y360 → Resend → console)

[backend/utils/email.js](backend/utils/email.js):
1. **Y360 active в prod** — nodemailer SMTP `smtp.yandex.ru:465 SSL`, ящик `noreply@my.azarean.ru`, app-password из `id.yandex.ru`
2. **Resend fallback** — REST API, free 3000/мес, US-серверы (требует РКН-уведомление при коммерческом запуске)
3. **Console stub** — dev режим

DNS на NetAngels: `TXT yandex-verification` + `MX my → mx.yandex.net` + `DKIM mail._domainkey.my` (multi-string TXT) + `SPF my` объединённый `include:_spf.yandex.net include:_spf.resend.com`.

### 8.4 Ops-bot для алертов

[backend/utils/opsAlert.js](backend/utils/opsAlert.js): `sendOpsAlert(title, body)` через нативный fetch на api.telegram.org. Ходит в `@vadim_azarenkov` (chat_id=183943760).

**Триггеры:**
- Backend `uncaughtException` / `unhandledRejection` (с 1сек flush)
- Global error middleware (только 5xx, 4xx — не алерт)
- Catch-блоки Telegram/Yandex OAuth callback'ов (там 302, не 5xx)
- Frontend `ErrorBoundary` + `window.error` + `unhandledrejection` → POST /api/log-error → telegram

**Дедуп** hash(title + первая строка body) TTL 10 мин, hourly cap 30. **Категоризация:** Frontend → ТЕСТ/СТАРЫЙ БАНДЛ/СВЯЗЬ/БАГ В UI; Backend → БД/СЕРВИС НЕДОСТУПЕН/ТАЙМАУТ/AUTH. Алерт включает «что/где/что делать», `describePage(url)` переводит роуты в человеческое, `describeUA` парсит UA.

**Если `OPS_BOT_TOKEN`/`OPS_CHAT_ID` пусты — noop через console.log.**

### 8.5 Sentry

[backend/instrument.js](backend/instrument.js) + [frontend/src/index.js](frontend/src/index.js). **Без `SENTRY_DSN` / `REACT_APP_SENTRY_DSN` — SDK в noop.** Sentry.io ingest **заблокирован для русских IP** — DSN не задан, реально работает только параллельный ops-bot.

PII scrubbing в `beforeSend`: чистит `password/token/code/code_hash/code_verifier/invite_code/nonce` из request data, headers `cookie`+`authorization` удаляются. `tracesSampleRate: 0.1` в проде, 0 в dev.

---

## 9. Дизайн-система и темы

### 9.1 CSS Modules миграция (2026-05-04, в проде)

71 `.css` → `.module.css` через 8 push'ей. Удалён `frontend/src/styles/common.css` (308 строк отчёта о дублях, 80+ дублей классов исчезли).

**🚨 КРИТИЧЕСКАЯ ГРАБЛЯ:** CRA по умолчанию **НЕ конвертирует** dash-case в camelCase. Class в `.module.css` `.foo-bar` доступен через `s['foo-bar']`, но **НЕ через `s.fooBar`**. Тесты с моками через Proxy (`(_, prop) => String(prop)`) **НЕ ловят** undefined. **Smoke в реальном браузере обязателен.** См. инцидент `c8834b5` 2026-05-04 + [memory/feedback_smoke_real_browser.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_smoke_real_browser.md).

### 9.2 Design tokens

**[frontend/src/styles/tokens.css](frontend/src/styles/tokens.css)** — глобальные токены инструкторской стороны:
- `--color-bg/surface/surface-2/surface-3/border/text/text-muted/text-subtle/primary/...`
- `--shadow-*`, `--radius-*`

**[frontend/src/pages/PatientDashboard/tokens.css](frontend/src/pages/PatientDashboard/tokens.css)** — pd-токены пациентского кабинета (`--pd-bg`, `--pd-card`, `--pd-text`, `--pd-primary`, `--pd-success`, `--pd-warning`, `--pd-danger`).

**Internal palette LOCKED:** `.pd-runner` использует iOS-палитру `--az-*` — не трогать (см. §13).

### 9.3 Dark theme (slate-indigo архитектора, в проде)

`[data-theme='dark']` override в обоих tokens.css. Палитра slate-indigo с 4 уровнями глубины:
- `#0a0e1a` (bg) → `#131a2c` (surface) → `#1c2540` (surface-2) → `#283156` (surface-3)
- Текст `#e7eaf3`, primary `#818cf8` (светлее indigo для контраста на тёмном)
- Active nav item — full-fill `var(--color-primary)` + white text (XrayUI-паттерн)

**Auto system fallback:** `@media (prefers-color-scheme: dark) :root:not([data-theme])` — если юзер не выбрал тему, применяется системная.

[frontend/src/context/ThemeContext.js](frontend/src/context/ThemeContext.js) — persist в `localStorage.azarean_theme`.

### 9.4 ExerciseRunner CSS (LOCKED)

[ExerciseRunner.js](frontend/src/pages/PatientDashboard/components/ExerciseRunner.js) — **CSS 1:1 порт из iOS-эталона** `block-daria-gym.html` (`.dg` prefix → `.pd-runner` prefix). iOS палитра `--az-*`, классы `.crd/.sec/.dot/.btn/.tmr/.fb-toggle/.rpe-b/.pv/.plbl/.cmt`. Layout `.pg` wrapper `max-width: 720px`, 3 media queries (480/769/1801), slide-in анимации `pdIn`/`pdBk`. **Не трогать без явного запроса.**

---

## 10. CI/CD и production

### 10.1 GitHub Actions

[.github/workflows/deploy.yml](.github/workflows/deploy.yml):
1. Checkout
2. **Test** (backend Jest + frontend Jest)
3. **Build** frontend (CRA `npm run build`)
4. **Deploy** через SSH:
   - rsync на `/opt/azarean-rehab/releases/<TS>/`
   - cd backend && npm ci --production
   - psql миграции через `deploy/migrate.sh` (checksum-tracking)
   - symlink `/opt/azarean-rehab/current → releases/<TS>/`
   - PM2 reload (zero-downtime)

**Триггер:** push на `main`. **Любой push с broken build/test НЕ деплоится.**

### 10.2 Production layout

```
VDS 185.93.109.234 (shared с JARVIS)
├── /opt/azarean-rehab/
│   ├── current → releases/2026MMDDHHMMSS/
│   ├── releases/<N>/                    # rolling history
│   ├── backend/.env                     # секреты
│   └── frontend/build/                  # SPA static
├── /var/lib/azarean-rehab/
│   ├── schema-baseline.sql              # baseline для drift detection
│   └── health-fails                     # счётчик для healthcheck.sh
├── /etc/nginx/sites-available/my.azarean.ru
└── PM2 fork mode :3001 (systemd startup)
```

**Cron-задачи:**
- backup pg_dump — daily
- healthcheck (`deploy/healthcheck.sh`) — каждые N минут с **backoff threshold 3 fail подряд**
- tg-proxy connectivity check
- schema-drift detection — 04:00 МСК

**Runbook:** [deploy/README.md](deploy/README.md) — 6-step smoke test, rollback, troubleshooting.

### 10.3 Окружения

| | dev | prod |
|---|---|---|
| URL | localhost:3001 (CRA) + :5000 (Express) | https://my.azarean.ru |
| DB | postgres @ localhost (azarean_rehab) | postgres @ 127.0.0.1 (azarean_rehab) |
| Bot | @azarean_rehab_bot | @az_zari_bot |
| Rate limits | 1000/15min general, 15 auth, 1000 oauth | 100/15min, 5, 20 |
| Sentry | noop (no DSN) | noop (no DSN, RU IP блок) |
| Email | console stub | Y360 SMTP |
| Origin check | bypass без Origin (CRA proxy) | строгий |

### 10.4 ENV-vars (backend/.env)

См. CLAUDE.md §"Переменные окружения" — полный список. Ключевые секреты:
- `JWT_SECRET`, `PATIENT_JWT_SECRET` (разные, ≥32 chars)
- `SESSION_SECRET`
- `KINESCOPE_API_KEY`, `KINESCOPE_PROJECT_ID`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OIDC_CLIENT_ID/SECRET/REDIRECT_URI`
- `TG_PROXY_URL`, `TG_PROXY_SECRET`
- `YANDEX_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`
- Y360: `SMTP_HOST=smtp.yandex.ru SMTP_PORT=465 SMTP_USER=noreply@my.azarean.ru SMTP_PASSWORD=<app-password>`
- `OPS_BOT_TOKEN`, `OPS_CHAT_ID=183943760`
- Feature flags: `TELEGRAM_LOGIN_ENABLED=true`, `YANDEX_LOGIN_ENABLED=true`

**TODO compliance (перед коммерческим запуском):** revoke секретов опубликованных в чате — `OPS_BOT_TOKEN`, `YANDEX_SMTP_PASSWORD`.

---

## 11. Тесты

### 11.1 Backend Jest + Supertest — 293 теста, 19 suites (проверено сегодня)

[backend/tests/__tests__/](backend/tests/__tests__/):
- admin.routes.test.js — 488 строк
- auth.routes.test.js
- patientAuth.middleware.test.js — 195 строк
- patientAuth.routes.test.js
- patientProfile.test.js — 377 строк (avatar + my-complexes)
- patients.routes.test.js
- exercises.routes.test.js
- complexes.routes.test.js
- diagnoses.routes.test.js
- progress.routes.test.js — 176 строк
- rehab.routes.test.js — 656 строк
- telegram.routes.test.js
- telegramBot.test.js — 318 строк
- scheduler.test.js — 187 строк
- originCheck.test.js — 104 строки
- audit.test.js
- email.test.js — 7 тестов на Y360/Resend fallback
- phone.test.js — 17 тестов
- **oauthCallback.routes.test.js — 18 тестов** (Telegram + Yandex match-flow boundary cases, multi-match anti-misroute)

### 11.2 Frontend Jest — 209 тестов, 14 suites

[frontend/src/](frontend/src/):
- services/api.test.js
- context/AuthContext.test.js
- pages/Admin/AdminPanel.test.js — 307 строк
- pages/PatientDashboard/PatientDashboard.test.js
- pages/PatientDashboard/components/{HomeScreen,ExercisesScreen,DiaryScreen,ProfileScreen,RoadmapScreen,ContactScreen}.test.js
- components/RehabProgramModal.test.js — 7 тестов
- components/LoadingSpinner.test.js
- utils/exerciseConstants.test.js

**Что НЕ покрыто тестами:** ExerciseRunner full-flow (UI-тяжёлый, тестируется вручную через смоук); CSS Modules class-resolution (Proxy-моки скрывают `s.foo === undefined`).

---

## 12. Тестовые учётные данные (dev)

- **Инструктор (admin):** `vadim@azarean.com` / `Test1234`
- **Тестовый пациент:** id=14, `avi707@mail.ru` / `Test1234` (Вадим, привязан к реальному Telegram)
- **Production admin:** `vadim@azarean.com` / `Test1234`

---

## 13. LOCKED-разделы (не трогать без явного запроса)

### 13.1 ExerciseRunner v3
- **Файл:** [frontend/src/pages/PatientDashboard/components/ExerciseRunner.js](frontend/src/pages/PatientDashboard/components/ExerciseRunner.js) (316 строк)
- **CSS:** 1:1 порт из `block-daria-gym.html`. iOS палитра `--az-*`, классы `.crd/.sec/.dot/.btn/.tmr/.fb-toggle/.rpe-b/.pv/.plbl/.cmt`
- **Layout:** `.pg` wrapper `max-width: 720px`, 3 media queries (480/769/1801), slide-in анимации
- **Feedback:** accordion с SVG chevron, RPE zones, pain gradient slider, таймер, комментарии
- **Flow:** HomeScreen «Начать тренировку» → ExerciseRunner напрямую (без ComplexDetailView)
- **Эталоны:** Дарья (`block-daria-gym.html`, prefix `.dg`, 12 упражнений), Никита (inline HTML 2026-04-13, prefix `.ns`, 16 упражнений с tabs)
- **НЕ ТРОГАТЬ:** flow, CSS, RPE zones, pain slider, timer, анимации

### 13.2 PatientDashboard `pd-*` стили
Глобальные стили в [PatientDashboard.css](frontend/src/pages/PatientDashboard/PatientDashboard.css) и `pd-*` классы LOCKED во время CSS Modules миграции 2026-05-04 — оставлены глобальными сознательно.

---

## 14. Открытые баги и tech debt

| # | Severity | Описание |
|---|---|---|
| 1 | HIGH | Rate limiting **выключен в dev** by design (NODE_ENV ≠ production) |
| 9 | LOW | `<ErrorBoundary/>` не ловит async ошибки из useEffect (стандартное ограничение React) |
| 10 | LOW | `messages.sender_id` без FK constraint (требует полиморфного split patient.id vs users.id) |
| — | LOW | `validators.js`: exercise/complex валидаторы пропущены (`video_url required` и `exercises min=1` ломают real-world flows). Не «dead code» — сознательно отключены. |
| — | LOW | Hardcoded «Татьяна» уже убран, но `instructor_name` в `/api/rehab/my/dashboard` не возвращается. UI «куратора» не показывает. |
| — | LOW | Diary photo upload screen-refresh — визуальное мерцание при добавлении фото; не воспроизводится в тестах. В долге. |
| — | TODO | Реальное at-rest шифрование чувствительных полей через pgcrypto (диагноз, дневник). Сейчас только TLS-in-transit + bcrypt пароли + SHA-256 токены, остальное plaintext в БД. |
| — | TODO | Bot link-code login как fallback к OAuth (~5-6 ч) — когда `oauth.telegram.org` auto-redirect глючит |
| — | TODO | Non-root deploy user на VDS + sudoers whitelist |
| — | TODO | Healthcheck Telegram alerts |
| — | TODO | zod вместо express-validator |
| — | TODO | 2FA через Telegram |
| — | TODO | Compliance legal position документ (драфт под юриста, перед коммерческим маркетингом) |
| — | TODO | **Revoke секретов опубликованных в чате** (`OPS_BOT_TOKEN`, `YANDEX_SMTP_PASSWORD`) перед запуском с живыми пациентами |

### Завершённые исправления (защита от регрессий)

См. CLAUDE.md §"Завершённые исправления" — 53 инцидента с деталями. Ключевые:

- **Bug #36** (schema drift) → recovery миграция + правило «никаких ручных ALTER через psql на dev БД»
- **Bug #51** (iPhone OAuth BIGINT) → миграция `20260429_telegram_chat_id_numeric.sql`. **Урок:** не использовать BIGINT для Telegram-связанных IDs
- **Bug #35** (ExerciseRunner кидало после submit) → **ToastContext useMemo** — закреплено правило «любое object/array в Context.Provider value обёртывается в useMemo»
- **CSS Modules dash-case** → правило «классы в module.css обязательно camelCase, smoke в реальном браузере обязателен»
- **«Не push'ить большие UI-изменения прямо в main»** — после серии 11 push'ей за день с авто-CI/CD
- **«Не миксовать миграцию + новую фичу в одной сессии»**
- **OAuth boundary tests** — multi-match anti-misroute защита (родитель↔ребёнок с одним телефоном) покрыта явно

---

## 15. Текущие незакомиченные изменения (на 2026-05-07)

```
M frontend/src/pages/PatientDashboard/PatientDashboard.js   (+2 -0)
M frontend/src/pages/PatientDashboard/components/DiaryScreen.css   (+4 -4)
M frontend/src/pages/PatientDashboard/tokens.css   (+50 -2)
M frontend/src/styles/tokens.css   (+2 -2)
```

Итого ~60 строк изменений. Это **тонкие правки specificity селекторов** в темах (`:root[data-theme='dark']` вместо `[data-theme='dark']` — поднимает приоритет, чтобы перебить дефолтные `:root`-токены) + мелкие правки DiaryScreen.

**Не запушено**, ждёт smoke в реальном браузере (правило `feedback_smoke_real_browser.md` после инцидента `c8834b5`).

> **Поправка:** ранее было сказано «~30 файлов uncommitted с архитектурной палитрой». Это неточность — slate-indigo палитра уже в проде с коммита `8c51240` («feat(theme): применить дизайн архитектора + фиксы smoke регрессий»). Текущие 4 файла — финальные доводки.

---

## 16. Корневая раскладка проекта

```
Azarean_rehab/
├── CLAUDE.md                            # 1100+ строк project instructions
├── ARCHITECT_FULL_REPORT_2026-05-07.md  # этот файл
├── ARCHITECT_BRIEF_DARK_THEME_2026-05-01.md
├── ARCHITECT_STATUS_2026-04-24.md
├── AZAREAN_REHAB_ARCHITECT_BRIEF.md     # полное описание для Claude Architect
├── AZAREAN_V12_IMPLEMENTATION.md
├── AZAREAN_V12_MIGRATION_PLAN.md
├── BACKLOG_PLAN_2026-04-29.md
├── REHAB_PROGRAM_MODAL_TZ.md
├── SESSION_HANDOFF_2026-{04-24,04-28,05-04}.md
├── TZ_CSS_MODULES_DARK_THEME.md
├── docs/
│   ├── audit_log_retention.md
│   └── prototypes/                      # архивные single-file прототипы дизайна
├── deploy/
│   ├── README.md                        # runbook
│   ├── migrate.sh                       # checksum-tracking миграции
│   ├── healthcheck.sh                   # backoff 3 fails
│   ├── check-schema-drift.sh            # daily 04:00 МСК
│   └── setup.sh                         # provisioning
├── .github/workflows/deploy.yml         # CI/CD
├── backend/
│   ├── server.js                        # 443 lines, точка входа
│   ├── instrument.js                    # Sentry init (первая строка)
│   ├── config/config.js                 # 83 lines, fail-fast валидация env
│   ├── database/
│   │   ├── db.js                        # pg Pool, query(), getClient()
│   │   ├── schema.sql                   # CREATE TABLE
│   │   ├── seeds/                       # acl_phases.sql, test_patient_data.sql
│   │   └── migrations/                  # 29 SQL миграций (+_migrations meta)
│   ├── middleware/                      # auth, patientAuth, originCheck, upload, validators
│   ├── routes/                          # 15 файлов, ~7800 строк
│   ├── services/                        # telegramBot, telegramOidc, yandexOauth, scheduler, kinescope, csv
│   ├── utils/                           # tokens, inviteCode, phone, audit, email, opsAlert
│   └── tests/__tests__/                 # 19 suites, 293 tests
└── frontend/
    ├── package.json                     # React 19, react-scripts 5
    ├── public/                          # index.html, sw.js, manifest, icons
    └── src/
        ├── App.js                       # 316 lines, роутинг
        ├── index.js                     # SW registration, Sentry, ErrorBoundary
        ├── setupProxy.js                # CRA dev proxy /api → :5000 (strip Origin)
        ├── services/api.js              # 513 lines, ~50 функций, два axios
        ├── context/                     # AuthContext, PatientAuthContext, ToastContext, ThemeContext
        ├── hooks/                       # useConfirm
        ├── utils/                       # dateUtils, exerciseConstants
        ├── styles/tokens.css            # global design tokens + dark
        ├── components/                  # 16 общих компонентов
        └── pages/
            ├── Login.js, Dashboard.js   # eager
            ├── Patients.js (834)
            ├── Diagnoses.js, Trash.js
            ├── CreateComplex.js, EditComplex.js, EditTemplate.js, MyComplexes.js
            ├── ImportExercises.js, PatientProgress.js (470), ViewProgress.js (452)
            ├── Exercises/               # Exercises.js + ExerciseDetail.js + 6 components
            ├── Admin/                   # 6 файлов
            ├── PatientAuth/             # PatientLogin, Register, ForgotPassword, ResetPassword
            └── PatientDashboard/        # ★ центральный экран пациента
                ├── PatientDashboard.js          (273)
                ├── PatientDashboard.css         (LOCKED .pd-* + .pd-runner)
                ├── tokens.css                   (pd- + dark)
                ├── PatientDashboardSkeleton.js
                ├── hooks/usePatientAvatarBlob.js
                ├── components/
                │   ├── HomeScreen.js            (374)
                │   ├── RoadmapScreen.js         (460)
                │   ├── DiaryScreen.js           (830)
                │   ├── ContactScreen.js        (326)
                │   ├── ExercisesScreen.js      (239)
                │   ├── ComplexDetailView.js    (207)
                │   ├── ExerciseRunner.js       (316, ★LOCKED)
                │   ├── ProfileScreen.js        (993)
                │   ├── *.test.js
                │   └── ui/                     # 17 переиспользуемых
                └── __mocks__/                  # для unit-тестов
```

---

## 17. Что обычно спрашивает архитектор и где быстро найти ответ

| Вопрос | Где смотреть |
|---|---|
| Как пациент логинится? | §7.2, [routes/patientAuth.js](backend/routes/patientAuth.js), [PatientAuthContext.js](frontend/src/context/PatientAuthContext.js) |
| Как работает OAuth Telegram? | §7.3, [services/telegramOidc.js](backend/services/telegramOidc.js), [memory/telegram_oidc_proxy.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/telegram_oidc_proxy.md) |
| Где список упражнений? | [routes/exercises.js](backend/routes/exercises.js) (885), таблица `exercises`, Kinescope в [services/kinescopeService.js](backend/services/kinescopeService.js) |
| Как устроен ExerciseRunner? | §13.1, [ExerciseRunner.js](frontend/src/pages/PatientDashboard/components/ExerciseRunner.js) — **LOCKED** |
| Где код дневника пациента? | [DiaryScreen.js](frontend/src/pages/PatientDashboard/components/DiaryScreen.js) (830), бэк в [routes/rehab.js](backend/routes/rehab.js) `/my/diary*`, миграция `20260421_diary_structured_fields.sql` |
| Как формат API-ответов? | §3 «API response unification», `unwrapResponse` в [api.js:78-85](frontend/src/services/api.js#L78) |
| Где темы / dark mode? | §9, [styles/tokens.css](frontend/src/styles/tokens.css), [PatientDashboard/tokens.css](frontend/src/pages/PatientDashboard/tokens.css), [ThemeContext.js](frontend/src/context/ThemeContext.js) |
| Как делать миграции? | §6.2, [deploy/migrate.sh](deploy/migrate.sh), правило «миграции после apply immutable» |
| Что нельзя трогать? | §13 LOCKED — ExerciseRunner, `pd-*` стили, `--az-*` палитра |
| Как запустить локально? | CLAUDE.md §3, нужен PostgreSQL + .env + 29 миграций |
| Где ops-bot и почему он? | §8.4, Sentry заблокирован для русских IP — ops-bot единственный канал реальных алертов |
| Что в долге сейчас? | §14, плюс §15 для незакомиченных |

---

## 18. Контактная карта проекта

- **Repo:** https://github.com/jaike077-web/azarean-rehab.git, branch `main`, push'и автодеплой
- **Prod URL:** https://my.azarean.ru
- **VDS:** 185.93.109.234 (shared с JARVIS Director)
- **Ops alerts:** `@vadim_azarenkov` (chat_id=183943760)
- **Финский tg-proxy:** `tg-proxy.azarean.ru` (78.17.1.70, JARVIS-Director)
- **Заказчик:** Azarean Network (Екатеринбург, физиотерапевтическая студия)
- **Целевая аудитория:** пациенты с травмами плеча/колена и хирургиями (ACL etc), ~10-50 пациентов на пилоте

---

## 19. Что не написано в этом отчёте

- Конкретное ТЗ архитектора по dark theme — см. отдельный файл [ARCHITECT_BRIEF_DARK_THEME_2026-05-01.md](ARCHITECT_BRIEF_DARK_THEME_2026-05-01.md)
- Детали v12 redesign плана — см. [AZAREAN_V12_IMPLEMENTATION.md](AZAREAN_V12_IMPLEMENTATION.md) и [AZAREAN_V12_MIGRATION_PLAN.md](AZAREAN_V12_MIGRATION_PLAN.md)
- Backlog приоритезированный — [BACKLOG_PLAN_2026-04-29.md](BACKLOG_PLAN_2026-04-29.md)
- Последние session handoffs — [SESSION_HANDOFF_2026-05-04.md](SESSION_HANDOFF_2026-05-04.md), [SESSION_HANDOFF_2026-04-28.md](SESSION_HANDOFF_2026-04-28.md), [SESSION_HANDOFF_2026-04-24.md](SESSION_HANDOFF_2026-04-24.md)
- ТЗ для CSS Modules + Dark theme — [TZ_CSS_MODULES_DARK_THEME.md](TZ_CSS_MODULES_DARK_THEME.md)
- ТЗ RehabProgramModal — [REHAB_PROGRAM_MODAL_TZ.md](REHAB_PROGRAM_MODAL_TZ.md)

Все эти файлы **не закомиты** в git (`?? ` в `git status`) — лежат локально для архитектора и handoff'ов.

---

## 20. Подпись

Отчёт собран автоматически с прямой проверкой кода и git-состояния на 2026-05-07. Конкретные числа строк, тестов, миграций — фактические. Все ссылки кликабельны через VSCode-расширение.

При обновлении отчёта — пересобрать с актуальной датой в имени файла, не редактировать этот.
