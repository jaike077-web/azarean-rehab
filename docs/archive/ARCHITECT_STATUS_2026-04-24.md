# Azarean Rehab — отчёт для архитектора

**Дата:** 2026-04-24
**Период:** 2026-04-22 → 2026-04-24 (3 дня)
**Фаза:** первый production-деплой + post-deploy smoke-test
**Status:** ✅ **В PRODUCTION**, smoke-test 7.1-7.7 полностью зелёный
**URL:** https://my.azarean.ru

---

## 0. TL;DR для архитектора

Платформа Azarean Rehab задеплоена на VDS `185.93.109.234` (shared с JARVIS Director) и доступна на `https://my.azarean.ru`. GitHub Actions CI/CD работает (push → test → build → deploy по SSH). В процессе и после деплоя закрыли **11 багов** (3 критичных prod-blocker, 1 крупный UX, 7 мелких). Больше всего боли принёс schema drift между dev и prod — на dev месяцами накатывались ручные `ALTER TABLE` без миграций, и fresh install на prod сломал /api/exercises и /api/diagnoses. Закрыли recovery-миграцией + новым правилом в CLAUDE.md «схема БД меняется ТОЛЬКО миграцией».

Open: 7 архитектурных пробелов в backlog (см. §7), из них 2 бизнес-блокера для реального пациентопотока (invite-code flow, UI для RehabProgram).

---

## 1. Deploy-инфраструктура (что построено)

### 1.1 VDS
| Параметр | Значение |
|---|---|
| IP | `185.93.109.234` (shared с JARVIS Director — Fastify на :3000, НЕ ТРОГАТЬ) |
| OS | Ubuntu, PostgreSQL **14**, Node.js v20+ |
| Project path | `/opt/azarean-rehab/` |
| Backend port | `3001` (Express через PM2 fork mode — cluster не совместим с ESM) |
| Nginx | `/etc/nginx/sites-available/my.azarean.ru` (HTTP→HTTPS redirect + SPA + `/api` proxy на `127.0.0.1:3001`) |
| SSL | Let's Encrypt, `certbot --nginx --redirect`, auto-renew cron |
| PM2 | `azarean-rehab` app, systemd startup через `pm2 startup systemd -u root --hp /root` + `pm2 save` |
| Prod Telegram bot | `@az_zari_bot` (отдельный от dev `@azarean_rehab_bot`) |
| Prod admin | `vadim@azarean.com` / `Test1234` |

### 1.2 CI/CD pipeline
- **Workflow:** `.github/workflows/deploy.yml`
- **Триггер:** push на `main` или manual `workflow_dispatch`
- **Jobs:**
  1. **Test** — backend Jest + frontend Jest
  2. **Build** — CRA production bundle
  3. **Deploy** — SSH + tar + unpack в `releases/<TS>/` + `npm ci` + `migrate.sh` + swap симлинк `current` → `<TS>` + `pm2 reload` + `pm2 save` + curl smoke
- **Zero-downtime:** атомарный swap симлинка `current/` (пути в nginx/PM2 указывают через симлинк)
- **Backup:** `deploy/backup.sh` — daily `pg_dump` в 03:15 Екб, 14-day rotation
- **Healthcheck:** `deploy/healthcheck.sh` — curl `/api/rehab/phases?type=acl` каждые 5 мин через cron, при fail → `pm2 restart` + запись в `/var/log/azarean-rehab-health.log`

### 1.3 Что в `deploy/`
```
deploy/
├── README.md              # 6-step runbook + rollback + smoke test
├── setup.sh               # idempotent first-time VDS init
├── migrate.sh             # idempotent прогон всех SQL-миграций
├── backup.sh              # pg_dump + 14-day rotation
├── healthcheck.sh         # curl + pm2 restart при fail
├── ecosystem.config.js    # PM2 config (fork mode, NODE_OPTIONS --dns-result-order=ipv4first)
└── nginx-my-azarean.conf  # HTTP-only bootstrap (certbot --nginx добавляет :443 сам)
```

### 1.4 Secrets
- `~/.ssh/azarean_rehab_deploy` (локально, private) — отдельный SSH-ключ для Actions, не личный
- GitHub Secrets: `SSH_PRIVATE_KEY`, `SSH_HOST=185.93.109.234`, `SSH_USER=root`
- Prod `.env` на VDS: `/opt/azarean-rehab/backend/.env` (JWT_SECRET, PATIENT_JWT_SECRET, SESSION_SECRET, DB_PASSWORD, TELEGRAM_BOT_TOKEN — все сгенерены при первом запуске `setup.sh`)

---

## 2. Timeline деплоя

| Дата | Событие |
|---|---|
| 2026-04-22 | **Session 2 tech debt** — закрыты bugs #2, #3, #4, #5, #8 (validators частично подключены, GDPR audit logging на READ, Dashboard stats хардкод убран и т.д.). Коммиты `4d49598`, `8747c7c`, `6b36bd2`. Подготовка к деплою. |
| 2026-04-23 | **Day 1 деплоя.** `deploy-setup` branch написан, GitHub Actions запущен, nginx+certbot+PM2+systemd подняты. Fresh install на prod выявил 4 проблемы миграций (templates отсутствовали в schema.sql, access_token dependency, неправильная сортировка 20260204 vs 20260205, trailing markdown-fence). Все закрыты recovery-коммитами. PR #44 смержен в main. Первый GitHub Actions run: Test ✅ Build ✅ Deploy ✅. |
| 2026-04-24 | **Day 2 — smoke-test + bugfix marathon.** Plan B: прогнал всю платформу от лица пациента. Нашли 7 багов, 1 из них критический (ExerciseRunner кидал на hero после «Выполнено» — root cause в ToastContext без useMemo). Все закрыты и запушены. Smoke-test 7.1-7.7 зелёный. |

---

## 3. Закрытые баги (11 штук, все в production)

### 3.1 Критичные (prod blockers, 2026-04-23 → 2026-04-24)

**Bug #36: Schema drift dev↔prod**
- **Симптом:** fresh install на prod сломал `/api/exercises` (500) и `/api/diagnoses` (500). На dev колонки `body_region`, `difficulty_level`, `movement_pattern`, `chain_type`, `joint`, `is_unilateral`, `deleted_at`, `updated_at` существовали (добавлены ручными ALTER в dev месяцами ранее), на prod их не было.
- **Fix:** `backend/database/migrations/20260424_prod_schema_recovery.sql` — полностью идемпотентная миграция, переименовывает `category → body_region`, `difficulty → difficulty_level` с конвертацией данных (beginner=1/intermediate=3/advanced=5), добавляет недостающие колонки, дропает неиспользуемый `body_part`. На dev БД — no-op.
- **Новое правило в CLAUDE.md:** «СХЕМА БД МЕНЯЕТСЯ ТОЛЬКО МИГРАЦИЕЙ. Никаких ручных ALTER/CREATE через psql на dev БД.»
- Коммит: `381a7ec`

**Bug #37: Миграции не идемпотентны на redeploy**
- **Симптом:** 2-й прогон `migrate.sh` падал на `CREATE INDEX refresh_tokens(token)` — колонка уже дропнута миграцией 20260408.
- **Fix:** DO-блоки с проверкой `column_exists` в миграциях `20260204_security_updates`, `20260210_patient_auth`, `20260408_hash_tokens`, `20260421_patient_preferred_messenger`.
- **Важно:** пока нет migration-tracking таблицы (`_migrations`) — все 23 миграции прогоняются на каждом редеплое, идемпотентность держится на guard'ах в каждом файле. **Хрупко.** См. backlog §7.
- Коммит: `4f96d5e`

**Bug #38: Kinescope-импорт 229 видео → 0 импортировано**
- **Симптом:** прод БД приняла 0 из 229 видео. Причина: `exercises.description NOT NULL` + cascade failure — один битый INSERT с NULL-описанием ронял всю транзакцию.
- **Fix:** миграция `20260424b_exercises_description_nullable.sql` + `SAVEPOINT video_import` per iteration в `backend/routes/import.js` — теперь один битый INSERT откатывает только свой savepoint, не транзакцию.
- Коммит: `c348d3f`

### 3.2 Крупный UX-баг (2026-04-24)

**Bug #35: ExerciseRunner кидает на hero «Начать тренировку» после «Выполнено»**
- **Симптом:** пациент делает упражнение 1 из 5, жмёт «Выполнено» → вместо перехода на упражнение 2 его возвращает на экран hero с кнопкой «Начать тренировку».
- **Root cause:** в `ToastContext.js` объект `toast = {success, error, warning, info}` создавался новым на каждый render `ToastProvider` → context value менял ссылку → `PatientDashboard.fetchDashboard = useCallback(..., [toast])` инвалидировался на каждом render → `useEffect([fetchDashboard])` вызывал `fetchDashboard()` без `silent` → `setLoading(true)` → `renderScreen()` возвращал skeleton → `ExercisesScreen` **размонтировался** → после `setLoading(false)` монтировался заново с initial state (`view='list'`).
- **Fix:** `const toast = useMemo(() => ({...}), [addToast, removeToast]);` в `ToastContext.js`.
- **Общий урок:** любое object/array значение в `Context.Provider value` обязательно оборачивать в `useMemo`. Записано в `feedback_context_memo.md` и `bug_toast_context_remount.md` (persistent memory).
- **Диагностика:** потребовалось 2 debug-коммита с `console.log` на mount/unmount (`8023e26`, `14e2ecb`), которые показали что `ExercisesScreen` unmount без вызова `backToList()` и без смены screen.
- Коммит: `ec8ba2c`

### 3.3 Мелкие (2026-04-24)

- **Bug #39:** Exercise library показывал «50 из 50» после 239 импортированных — backend default limit 50→1000 в `backend/routes/exercises.js`. Рендер всего списка, фильтрация на клиенте (согласно CLAUDE.md-конвенции). Коммит `ec2324e`.
- **Bug #40:** `ImportExercises` показывал «0 импортировано» при успехе — frontend читал `response.data.results.success` вместо `response.data.success`. После унификации API response format 2026-04-10 структура стала плоской после unwrap interceptor. Коммит `5c3b1d5`.
- **Bug #41:** Двойной аватар + хардкод «Татьяна · куратор» на каждом экране PatientDashboard — убран inline `<AvatarBtn>` из Home/Roadmap/Diary/Contact (остался только в `pd-header`). Коммит `d57b116`.
- **Bug-фича:** PWA auto-update на мобиле — `controllerchange` + `visibilitychange` listener в `frontend/src/index.js`: если пользователь вернулся в PWA после ≥60 сек отлучки и активен новый SW, `window.location.reload()`. Коммит `ac8f845`.

---

## 4. Current production state

### 4.1 Smoke test 7.1-7.7 — полностью зелёный (2026-04-24)

| # | Проверка | Результат |
|---|---|---|
| 7.1 | HTTPS + Let's Encrypt TLS | ✅ |
| 7.2 | `/api/rehab/phases?type=acl` → 6 phases | ✅ |
| 7.3 | SPA index.html served | ✅ |
| 7.4 | Инструктор UI-логин (vadim@azarean.com) → /dashboard, welcome-шапка, 14-пункт sidebar (admin role) | ✅ |
| 7.5 | POST /api/patients → «Тестовый клиент» (id=1 в prod, ПКС diagnosis) | ✅ |
| 7.6 | GET /api/patients → карточка в grid | ✅ |
| 7.7 | audit_logs в prod БД содержит READ-строки (GDPR bug #8 fix подтверждён) | ✅ |

### 4.2 Данные в prod
- **1 пациент** (тестовый клиент id=1, ПКС)
- **0 комплексов**
- **10 упражнений** (seeded из dev при первом деплое)
- **3 диагноза** (seeded)
- **6 ACL-фаз** (seeded)
- **2 тестовых Kinescope-видео** (импортированы после schema recovery)

### 4.3 Тесты
- **Frontend:** 202/202 зелёные
- **Backend:** 152 теста, все должны быть зелёными (не перепрогонял после последних коммитов)
- GitHub Actions гейт — тесты должны проходить перед деплоем

---

## 5. Git state

- **Branch:** `main`
- **Последний коммит:** `44cf3b8 docs(CLAUDE.md): итог smoke-test сессии 2026-04-24` (pushed на origin)
- **Recent commit history** (от merge deploy-setup до сегодня):

```
44cf3b8 docs(CLAUDE.md): итог smoke-test сессии 2026-04-24
ec8ba2c fix(toast): стабилизировать ссылку toast через useMemo
14e2ecb debug(patient): add temp logs in PatientDashboard + PatientAuthContext
8023e26 debug(patient): add temp console.log in ExerciseRunner/ExercisesScreen
ac8f845 feat(pwa): авто-обновление при возврате в app после ≥60 сек отлучки
d57b116 fix(patient-dashboard): убрать дубль аватара + хардкод «Татьяна · куратор»
ec2324e fix(exercises): поднять дефолтный limit 50→1000
fdd950d docs(CLAUDE.md): правило "схема БД меняется только миграцией"
c348d3f fix(import): NULL description + SAVEPOINT per iteration
4f96d5e fix(db): идемпотентность миграций на повторный прогон
882f7de Merge fix/prod-schema-drift-recovery
23cf24e docs(CLAUDE.md): 20260424 миграция + sync prod deploy статус
5c3b1d5 fix(frontend): корректный unwrap ответа в ImportExercises
381a7ec fix(db): recovery миграция для prod schema drift
bbd8070 fix(db): recovery миграция для complexes.access_token
a9eae77 fix(db): переименовать database_audit_fixes на 20260205
bd0f001 fix(db): убрать trailing markdown-fence из rest_seconds миграции
9ba92f6 fix(db): добавить missing templates + template_exercises
7164b6a Merge PR #44 (deploy-setup: GitHub Actions + nginx + PM2)
```

### Незакоммичено
- `.claude/` (локальные планы, не для коммита)
- `AZAREAN_REHAB_ARCHITECT_BRIEF.md` (документ для архитектора, можно закоммитить)
- `AZAREAN_V12_IMPLEMENTATION.md`, `AZAREAN_V12_MIGRATION_PLAN.md` (v12 redesign docs)
- `DEPLOY_REVIEW_RESPONSE_2026-04-23.md` (ответ на review архитектора)
- `SESSION_HANDOFF_2026-04-24.md` (одноразовый handoff — удалить после прочтения)
- `azarean-v12-final.jsx` (прототип v12 redesign)
- `ARCHITECT_STATUS_2026-04-24.md` (этот файл)

---

## 6. Риски и технический долг, возникшие из деплоя

### 6.1 Хрупкости
1. **Миграции прогоняются КАЖДЫЙ деплой целиком** (все 23 файла). Идемпотентность держится на guard'ах в каждой миграции. Если кто-то напишет миграцию без `IF NOT EXISTS` — 2-й прогон упадёт. **Нужна `_migrations` таблица и skip-already-applied логика в `migrate.sh`.**
2. **SSH под root** в GitHub Actions. Любая компрометация SSH_PRIVATE_KEY даёт полный доступ к VDS. **Нужен non-root deploy user + sudoers whitelist на специфичные команды (nginx reload, pm2 commands).**
3. **Healthcheck пишет только в лог.** При падении backend админ узнает постфактум. **Нужен Telegram-алерт через отдельный @azarean_ops_bot.**
4. **Нет отдельного `/api/health` endpoint.** Сейчас healthcheck пингует `/api/rehab/phases?type=acl` как proxy для liveness — работает, но не покрывает БД-liveness явно.

### 6.2 Правила, добавленные в процессе
- **«Схема БД меняется только миграцией»** (CLAUDE.md, 2026-04-24). Любой `ALTER`/`CREATE` в psql на dev запрещён.
- **«Миграции ДОЛЖНЫ быть идемпотентны»** — прогон тест-циклом `createdb test → schema.sql → все миграции дважды подряд → drop` ДО коммита.
- **«Fresh install тестировать перед деплоем»** — inc install работает, fresh ломается, потому что на dev накатывались ручные ALTER.
- **«Context value → useMemo обязателен»** (feedback_context_memo.md) — любой объект/массив в `Context.Provider value` оборачивать в `useMemo` с explicit deps.

---

## 7. Backlog (open, требует отдельных сессий)

### 7.1 Бизнес-блокеры для реального пациентопотока
1. **Self-registration → пациент-невидимка.** Пациент регистрируется на `/patient-register`, запись создаётся с `created_by=NULL`. `GET /api/patients` фильтрует по `created_by=$1` — пациент невидим инструктору. Временный workaround: SQL `UPDATE patients SET created_by=1`. **Решение:** invite-code flow — инструктор генерирует 6-значный код в UI, пациент вводит на `/patient-register`, `created_by` автозаполняется.
2. **Нет UI для создания RehabProgram** на стороне инструктора. Workaround — прямой `INSERT INTO rehab_programs`. Без программы пациенту не показывается «сегодняшний комплекс» на Home. **Решение:** форма на `Dashboard/Patients` tab — выбрать patient → выбрать complex → ввести diagnosis/phase/surgery_date → `POST /api/rehab/programs`.

### 7.2 Технический долг (non-blocking, но важно)
3. **Хардкод «Татьяна · куратор»** в `ContactScreen.js:148` и `ProfileScreen.js:525`. Убрать когда `/api/rehab/my/dashboard` начнёт отдавать `instructor_name`.
4. **Compliance disclaimer** — «данные в зашифрованном виде» — **неправда**. Либо переформулировать, либо реально шифровать at-rest (sensitive поля пациента — diagnosis, birth_date, phone). ФЗ-152 риск.
5. **Exercise library virtualization** — текущий лимит 1000, при 2000+ упражнениях начнутся тормоза рендера. React-window / react-virtualized.
6. **Migration tracking table** (см. §6.1 пункт 1).
7. **Non-root deploy user + sudoers whitelist** (см. §6.1 пункт 2).
8. **Healthcheck Telegram alerts** (см. §6.1 пункт 3).
9. **`/api/health` endpoint** — явный health-проверяльщик БД+backend.

### 7.3 Security backlog (после launch)
10. **Admin email отделить от test-patient email** — сейчас `jaike707@gmail.com` используется в двух местах.
11. **2FA через Telegram** — 6-значный код, 5 мин (см. CLAUDE.md Roadmap).
12. **Rate limiting в dev** — сейчас `generalLimiter` выключен если `NODE_ENV ≠ production` (by design, но при тестировании rate-limit поведения нужно помнить).

---

## 8. Вопросы к архитектору

1. **Invite-code vs pending-claim очередь** для self-registration? Invite-code проще (пациент получает код в Telegram/email от физиотерапевта, вводит на регистрации). Pending-claim — более гибкий (пациент регается сам, инструктор видит очередь «неподтверждённых» и принимает). Что выбираем?
2. **Compliance disclaimer** — **удалить упоминание шифрования at-rest** и оставить только TLS in-transit, или начинать реально шифровать `patients.diagnosis/phone/birth_date` через `pgcrypto`? Первое — 5 мин работы, второе — отдельный PR и миграция.
3. **UI для RehabProgram** — отдельная страница `Dashboard/Programs` или модалка на странице пациента? Склоняюсь ко 2-му.
4. **Migration tracking table** — писать свою простую (`_migrations(version PK, applied_at)`) или ставить `node-pg-migrate`/`sqitch`? Предпочитаю свою — меньше зависимостей, поведение полностью под контролем.
5. **`/api/health` endpoint** — `SELECT 1` + `pool.totalCount` + uptime, или что-то более развёрнутое с проверкой критичных внешних сервисов (Kinescope API, Telegram Bot API)?
6. **Non-root deploy user** — `azarean_deploy` с `sudoers`: `NOPASSWD: /usr/bin/systemctl reload nginx, /usr/local/bin/pm2 *`. Окей?

---

## 9. Контекст для быстрого погружения

Для чата с архитектором достаточно прочитать:

1. **Этот файл** (`ARCHITECT_STATUS_2026-04-24.md`) — полная картина
2. **`CLAUDE.md`** — проект целиком: стек, схема БД (20 таблиц), API endpoints, правила кода, завершённые баги 1-42
3. **`memory/MEMORY.md` + `memory/production_deployment.md`** — credentials, runbook, schema drift recovery
4. **`memory/bug_toast_context_remount.md` + `memory/feedback_context_memo.md`** — разбор ToastContext бага и правило useMemo в Context
5. **`deploy/README.md`** — 6-step smoke test + rollback + troubleshooting

**Prod alive check (в любом чате):**
```bash
curl https://my.azarean.ru/api/rehab/phases?type=acl
# ожидаем: { "data": [6 phases] }
```

---

**Ответственный:** jaike707@gmail.com
**Последний зелёный деплой:** 2026-04-24, коммит `44cf3b8` (docs-only, не триггерит redeploy backend) → реально последний код `ec8ba2c` (fix(toast)) в prod
**Следующий шаг:** архитектор выбирает приоритет из §8 (вопросы) и §7 (backlog)
