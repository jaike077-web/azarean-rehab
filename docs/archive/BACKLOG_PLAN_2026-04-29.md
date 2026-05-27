# План backlog'а — 2026-04-29

**Контекст:** RehabProgramModal + Yandex OAuth + Telegram OIDC + invite-code в проде. End-to-end флоу пилота технически работает. Ноль живых пациентов — руки развязаны на любые правки.

**Цель плана:** провести систему от «технически готова» до «выдержит первый пилот» без накопления legacy-долга.

---

## Phase A — Pre-pilot must-haves (эта неделя)

### A.1 — Sentry observability

**Цель:** видеть prod-баги в реальном времени, без ожидания жалобы пациента.

**Scope:**
- Backend: `@sentry/node` + `@sentry/profiling-node`, init **первой строкой** в [backend/server.js](backend/server.js), error handler middleware (Sentry expressIntegration), tag `environment: process.env.NODE_ENV`.
- Frontend: `@sentry/react`, init в [frontend/src/index.js](frontend/src/index.js), ErrorBoundary поверх корневого `<App />`. Source maps опционально (после первой неделии работы).
- ENV: `SENTRY_DSN` (backend) + `REACT_APP_SENTRY_DSN` (frontend). Если переменные пустые — Sentry SDK ничего не делает (noop), dev не нагружается.
- PII scrubbing: дефолтный + явный allowlist (`password`, `passwordHash`, `token`, `refresh_token`, `code`, `code_hash`, `code_verifier`).
- `tracesSampleRate: 0.1` для prod (10% трафика трассируется), `0` для dev.

**Coordination:** трогает [server.js](backend/server.js) и [index.js](frontend/src/index.js) — больше никто не пишет в эти файлы из параллельных чатов.

**ETA:** 30-45 минут включая тесты.

**DoD:**
- [ ] backend стартует без ошибок без DSN (Sentry noop)
- [ ] backend падает с DSN — видим event в Sentry dashboard
- [ ] frontend ошибка в render — попадает в Sentry
- [ ] PII не утекает: проверить что в события не попадает password из 401-запроса
- [ ] коммит `feat(observability): Sentry на backend и frontend`

### A.2 — Email integration (Resend)

**Цель:** password reset работает на проде. Сейчас [backend/utils/email.js](backend/utils/email.js) — `console.log` стаб.

**Scope:**
- Заменить тело `sendPasswordResetEmail` и `sendVerificationEmail` на Resend SDK (`resend` npm пакет).
- ENV: `RESEND_API_KEY`, `EMAIL_FROM=Azarean <noreply@my.azarean.ru>`.
- Если `RESEND_API_KEY` отсутствует → fallback на текущий console.log (dev-режим без интеграции продолжает работать).
- Шаблоны: HTML + plain text fallback. Минимум форматирования — кнопка-ссылка + объяснение.
- Domain verification на Resend для `my.azarean.ru` (DNS записи в Reg.ru — separate manual task на 1 раз).

**Альтернативы рассмотрены:**
- **Mailgun**: сложнее onboarding, дороже на масштабе.
- **SendGrid**: 100/день free но требует кредитку при апгрейде.
- **SMTP relay (Yandex 360)**: бесплатно для своего домена, но порт 25/465/587 на VDS может быть прибит провайдером — risk.
- **Resend**: 3000/месяц free, чистый API, поддерживает домены через DNS.

**Coordination:** автономно. Только [utils/email.js](backend/utils/email.js) + `.env` пример.

**ETA:** 2-3 часа включая DNS + проверку на проде.

**DoD:**
- [ ] `Resend` пакет установлен, send-функция вызывает Resend API
- [ ] Без `RESEND_API_KEY` — fallback на console.log (dev совместимость)
- [ ] DNS-записи (SPF, DKIM, DMARC) пропущены через Resend в Reg.ru — domain verified
- [ ] Smoke test: `curl -X POST /api/patient-auth/forgot-password` → реальное письмо приходит → ссылка работает
- [ ] Коммит `feat(email): Resend integration для password reset`

### A.3 — /api/health endpoint + healthcheck.sh backoff

**Цель:**
1. Заменить cron-стук в `/api/rehab/phases?type=acl` на dedicated `/api/health` (сейчас healthcheck.sh бьёт в бизнес-эндпоинт — если фазы сломаются, цикл рестартов).
2. Добавить threshold: 3 фейла подряд → restart, не 1.

**Scope:**
- Backend: новый `backend/routes/health.js` с `GET /api/health`. Без auth. Возвращает `{ status, uptime_sec, db: {alive, ms} }`. **Без version** (reconnaissance hygiene). DB ping — `SELECT 1`, timeout 2 сек.
- Rate limit на `/api/health` — exclude из generalLimiter (иначе healthcheck сожрёт лимит).
- [deploy/healthcheck.sh](deploy/healthcheck.sh): счётчик фейлов в `/var/lib/azarean-rehab/health-fails` (создавать если нет), increment на fail, reset на success. Restart PM2 только при `>=3`.
- Endpoint регистрируется в `server.js` **до** `app.use('/api', generalLimiter)`.

**Coordination:** автономно.

**ETA:** 1-1.5 часа.

**DoD:**
- [ ] `curl http://localhost:5000/api/health` → 200 + JSON с `status: ok`
- [ ] При остановленной БД → 503 + `db.alive: false`
- [ ] healthcheck.sh не рестартует на одиночный 5xx, рестартует на 3 подряд
- [ ] Backend тест на `/api/health` (success + db-fail)
- [ ] Коммит `feat(health): /api/health endpoint + backoff threshold в healthcheck`

### A.4 — Legal position документ (параллельно, не код)

**Цель:** письменно обосновать «это не медицинское изделие по ПП №1416, а информационная система студии физиотерапии». Без этого нельзя публично маркетировать.

**Scope:**
- `docs/legal_position.md` — драфт от меня с ключевыми тезисами (НЕ диагностируем, НЕ лечим, НЕ медицинская организация, всё по согласованию с врачом-физиотерапевтом, рекомендации заранее одобрены человеком-инструктором).
- Поиск медицинского юриста в Екб (Pravoved, Profi.ru, рекомендации) — пользователем.
- Консультация → ревью драфта → подпись Татьяны и пользователя.

**Coordination:** не код, но запускать процесс **сегодня** — календарный lead time 1-2 недели.

**ETA:** 1-2 часа моего времени на драфт; календарно 1-2 недели до подписи.

**DoD:**
- [ ] Драфт написан и сохранён в `docs/legal_position.md`
- [ ] Юрист найден и записан на консультацию
- [ ] После консультации — финальный текст подписан в `docs/`

---

## Phase B — Pre-pilot nice-to-haves (следующая неделя)

### B.1 — Audit log retention plan

**Цель:** не дать `audit_logs` расти бесконечно. Через год активного использования — десятки миллионов строк.

**Решение (выбрать одно):**
- **Partitioning by month** (PostgreSQL 12+ native) + drop партиций старше 1 года. Идеально под audit pattern.
- **Archive to S3-compatible storage** (Reg.ru Object Storage есть) + delete from main table.
- **Просто DELETE WHERE created_at < NOW() - INTERVAL '1 year'** в cron-скрипте. Самое простое.

**ФЗ-152 требует** хранить логи доступа к ПДн **не менее 3 лет** при определённых условиях (см. legal position документ). Нужно сверить с юристом.

**ETA:** 1 час на решение + 2-3 часа на имплементацию.

**Coordination:** автономно.

### B.2 — `_migrations` checksum table

**Цель:** предотвратить повторение Bug #36 (schema drift) — отслеживать какие миграции применены, ловить если кто-то изменил уже применённую.

**Scope:**
- Миграция `20260430_create_migrations_table.sql` создаёт `_migrations(filename PK, applied_at, checksum)`.
- Bootstrap-скрипт: INSERT всех существующих filename'ов из `backend/database/migrations/` с NULL checksum («legacy mark», прошли до checksum-эпохи).
- Переписать [deploy/migrate.sh](deploy/migrate.sh):
  - читает все `.sql` файлы из migrations/
  - для каждого: проверяет в `_migrations`. Нет → apply + INSERT. Есть и checksum совпадает → skip. Есть и checksum НЕ совпадает (после legacy NULL) → exit 1 с алертом.
  - политика: «миграции после apply immutable, исправления — только новой миграцией».

**ETA:** 1.5-2 часа.

**Coordination:** автономно. Не трогает application code.

---

## Phase C — После первых 5-10 пациентов в пилоте

### C.1 — GDPR / ФЗ-152 data subject rights endpoints

**Цель:** пациент имеет право скачать **все свои данные** и **удалить аккаунт**. По закону.

**Scope:**
- `GET /api/patient-auth/me/data-export` — JSON со всеми полями: profile, all diary entries (включая photos metadata), progress_logs, messages, complexes, programs. Стримом если объём большой.
- `DELETE /api/patient-auth/me` — soft delete (is_active=false) с явным подтверждением (текущий пароль + checkbox «понимаю последствия»). Hard delete через 30 дней по cron — даём grace period.
- UI: новый блок в Profile-экране «Мои данные» с двумя кнопками.

**ETA:** 4-5 часов.

### C.2 — Runtime schema drift detection

**Цель:** cron-скрипт раз в день сравнивает фактическую схему prod с ожидаемой (генерируется из последней применённой миграции). Алерт в Telegram если расхождение.

**Scope:**
- `deploy/check-schema-drift.sh` — `pg_dump --schema-only` + diff с ожидаемым. Threshold: только колонки и таблицы (индексы и constraints — слишком шумные).
- Cron 1 раз в день в 04:00 Екб.
- Алерт: Telegram бот sendMessage в твой личный chat_id (отдельный alert-bot или существующий @az_zari_bot).

**ETA:** 2-3 часа.

### C.3 — Non-root deploy user

**Цель:** не пускать GitHub Actions под root на VDS. Минимизировать blast radius при компрометации SSH-ключа.

**Scope:**
- `azarean_deploy` user без sudo → конкретный allowlist через `/etc/sudoers.d/azarean_deploy`:
  - `pm2 reload/restart/save/logs/status azarean-rehab`
  - `systemctl reload nginx`
  - **Backup и migrate под root** через явный sudoers-вход (не пытаемся читать `.env` под deploy user — `.env` остаётся root chmod 600).
- `azarean_deploy` владеет `/opt/azarean-rehab/` кроме `.env`.
- Перенос SSH-ключа GitHub Actions с root на azarean_deploy.

**Coordination:** требует SSH-доступа к VDS, не делается из чата автономно. Я готовлю скрипт, ты выполняешь.

**ETA:** 1-2 часа.

---

## Phase D — Когда понадобится

### D.1 — At-rest encryption (pgcrypto) для чувствительных полей

Реальное шифрование `patients.diagnosis`, `diary_entries.notes`, `progress_logs.notes`, `messages.content` (если содержит медицинские данные).

**Scope:**
- pgcrypto extension (`CREATE EXTENSION pgcrypto`)
- Миграция переименования колонок в `*_encrypted BYTEA`
- Все SELECT/INSERT через `pgp_sym_decrypt` / `pgp_sym_encrypt`
- Master key в `.env` (chmod 600), backup'ится отдельно (без него — данные не достать!)
- Полнотекстовый поиск по этим полям умирает — запросы вроде `WHERE diagnosis ILIKE '%ACL%'` нужно переводить на decrypt-then-filter (медленно).

**ETA:** 2-3 дня. **Не делается до**: legal position документа (юрист скажет насколько обязательно), и до момента когда disclaimer уже не справляется с риском.

### D.2 — 2FA для admin role

Через Telegram (у нас бот уже есть). 6-значный код, 5 мин TTL, после login admin вводит код пришедший в TG.

**Триггер:** появление 2-го админа (Татьяна получает admin role) ИЛИ публичный маркетинг.

**ETA:** 4-5 часов.

### D.3 — Hardcoded «Татьяна» cleanup

Сейчас в [ContactScreen.js:148](frontend/src/pages/PatientDashboard/components/ContactScreen.js#L148) и [ProfileScreen.js:525](frontend/src/pages/PatientDashboard/components/ProfileScreen.js#L525) хардкод имени куратора.

**Scope:**
- backend `/api/rehab/my/dashboard` начинает отдавать `curator: { full_name, avatar_url }` (откуда брать — из patients.created_by → users)
- Frontend: убрать хардкод, читать из dashboard data

**ETA:** 1-1.5 часа.

### D.4 — Exercise library virtualization

Когда упражнений будет >1000 — браузер тормозит на рендере списка. `react-window` для виртуализации.

**Триггер:** когда фактический pageload >2 сек.

**ETA:** 2-3 часа.

### D.5 — CSS Modules миграция

80+ дублей CSS-классов (см. CLAUDE.md «Открытые баги #7»). Глобальные `.btn-primary`, `.modal-overlay` и т.п.

**Триггер:** когда конфликт стилей повредит фичу. Сейчас работает.

**ETA:** 1-2 дня.

---

## Порядок исполнения

Делаем последовательно: A.1 → A.2 → A.3 → B.1 → B.2.

Phase C/D — по мере необходимости, не за один проход.

A.4 (legal position) — параллельно, lead time календарный.

После каждой фичи — отдельный коммит + push, чтобы CI/CD деплоил поэтапно. Никаких feature-веток с накоплением — мы один разработчик, мерж-конфликты с параллельными чатами уже не страшны после Yandex+RehabProgram сегодня.

---

## Что обновлять после каждой фичи

- [CLAUDE.md](CLAUDE.md) — секция «Завершённые исправления», добавить запись с номером
- [MEMORY.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-Azarean-rehab\memory\MEMORY.md) — соответствующая `## Closed bugs` секция
- При закрытии чего-то из «Architectural gaps» в MEMORY — зачёркивать через `~~`

---

## Стартуем сейчас: Phase A.1 — Sentry
