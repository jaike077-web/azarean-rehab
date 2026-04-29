# Session Handoff — 2026-04-29

Бесшовный переезд в новый чат. Удалить когда прочитан.

## TL;DR

Очень продуктивный день. 11 коммитов в `main`, всё в проде. Закрыты:
**Sentry-альтернатива (Telegram ops-bot)**, **OAuth boundary tests**,
**iPhone OAuth BIGINT баг** (Telegram sub > 9.22e18), **читаемые алерты с
категоризацией**, **Email через Y360 SMTP**, **rate-limit на OAuth
callbacks**, **tg-proxy monitoring**, **GDPR data export endpoint**,
**Self-delete с grace period**, **schema drift detection cron**.

Backend: 218 → 293 тестов (+75). Frontend: 209/209 ✓.

**Открыто:** Compliance legal position документ (отложен пользователем),
Resend signup как fallback (опциональный).

## Что произошло за день (хронологически)

### Sентры → ops-bot
Architect ревью попросил подключить Sentry. SDK уже был установлен в
noop-режиме без DSN. Юзер пошёл на sentry.io — получил **403 от Cloudflare**
(VPN exit IP в blocklist) → решили что Sentry в принципе нерабочий для
наших источников ошибок (rehab-VDS на AdminVPS — российский IP, у
пациентов тоже РФ без VPN). Sentry ingest заблокирован для русских IP.

Заменили на **собственный Telegram ops-bot @vadim_azarenkov** (chat_id=183943760).
- `backend/utils/opsAlert.js` — sender через нативный fetch на api.telegram.org
- Дедуп hash(title + первая строка body) TTL 10 мин, hourly cap 30
- `backend/routes/log-error.js` — `POST /api/log-error` для frontend (rate-limit 30/мин)
- `frontend/src/components/ErrorBoundary.js` componentDidCatch + window.error +
  unhandledrejection → keepalive fetch
- Sentry SDK оставлен в noop без DSN — на случай если когда-нибудь
  поднимем sentry-ingest proxy через JARVIS-Финляндию

Коммит: `46c87bb`

### Читаемые алерты + категоризация
Юзер сказал «непонятно что это и что делать» про первый smoke-test alert.
Переписал формат: «Тип: Frontend · ТЕСТ / Где: личный кабинет / Что делать: ...».

Категоризация:
- **Frontend:** ТЕСТ (smoke/manual) / СТАРЫЙ БАНДЛ (ChunkLoadError) /
  СВЯЗЬ (Failed to fetch) / БАГ В UI (Cannot read prop) / ОШИБКА UI
- **Backend:** БД (PG codes 22xxx/23xxx/42xxx) / СЕРВИС НЕДОСТУПЕН
  (ECONNREFUSED) / ТАЙМАУТ / AUTH (JWT) / ОШИБКА БЭКЕНДА

Хелперы `describePage(url)` (URL → «личный кабинет пациента»),
`describeUA(ua)` («Chrome 144 / Windows»).

Также добавил `sendOpsAlert` в catch-блоки Telegram + Yandex OAuth callback'ов
— раньше там был только console.error, поэтому iPhone-баг (см. ниже)
пришлось искать через pm2 logs.

Коммит: `300f214`

### iPhone OAuth BIGINT баг
Юзер тестировал Telegram OIDC login на iPhone — получал `oauth_error=ошибка обработки входа`. Десктоп работал (returning login по существующему provider_id),
iPhone падал.

Через ops-bot не пришло потому что catch-блок не слал тогда. Лез в pm2 logs:
```
value "10399974012659476296" is out of range for type bigint
```

Telegram OIDC начал возвращать `sub > 9.22e18` (BIGINT max) с 2024-2025.
У Вадима десктопный Telegram-аккаунт был старый (sub=7358444850707888434),
iPhone — новый (sub=10399974012659476296).

Миграция `20260429_telegram_chat_id_numeric.sql` — ALTER COLUMN BIGINT →
NUMERIC(20). pg-node возвращает int8/numeric одинаково (как строку из-за
JS Number precision до 2^53), миграция type-only.

**Урок (зафиксирован в `memory/telegram_oidc_proxy.md` грабля #6):**
не использовать BIGINT для Telegram-связанных IDs (chat_id, user_id, sub).
Только NUMERIC(20) или TEXT.

Коммит: `d390b19`

### OAuth boundary tests (priority #1 архитектора)
До сегодня `routes/patientAuth.js` OAuth-эндпоинты имели **0 unit-тестов**.
Логика silent autolink проверена ровно одним живым кейсом (id=6 Вадим — он сам).

`backend/tests/__tests__/oauthCallback.routes.test.js` — 18 тестов на 8 веток
match-flow:
1. Returning login (provider_id matches)
2. Phone-autolink single match → autolink + audit OAUTH_AUTOLINK
3. No match → /patient-register с pre-fill
4. **Multi-match → НЕ автолинкует** (anti-misroute защита, родитель↔ребёнок
   с одним телефоном — главная зона риска по 152-ФЗ)
5. Claimed account (password_hash NOT NULL) → SQL-фильтр отсекает
6. State expired
7. Deactivated patient → fail с oauth_error
8. Phone format normalization (8... → +7...)
+ 6 Yandex-вариантов + edge cases (consent denied, OIDC throws, no-code).

Коммит: `49cf7c5`

### Email через Y360 SMTP (с two-tier fallback к Resend)
Resend оказался compliance-проблемой — серверы в США, трансграничная
передача персональных данных по 152-ФЗ требует уведомления Роскомнадзора +
согласия пациента. Не годится для российского пилота.

**Архитектура two-tier:**
- Tier 1: **Yandex 360 SMTP** (smtp.yandex.ru:465 SSL через nodemailer)
  — основной канал, серверы в РФ, лучшая deliverability в Yandex/Mail.ru
- Tier 2: Resend (REST API) — fallback при Y360 fail
- Tier 3: console.log stub (dev/test)

Юзер купил Y360 за 290 ₽/мес, прошли весь setup-чек:
1. Подключение домена `my.azarean.ru` (TXT yandex-verification)
2. MX-запись `my → mx.yandex.net`
3. DKIM на `mail._domainkey.my` (multi-string TXT, 280 символов)
4. SPF на `my` объединённый: `v=spf1 include:_spf.yandex.net include:_spf.resend.com ~all`
5. Создан ящик `noreply@my.azarean.ru`
6. App-password создан в id.yandex.ru/security/app-passwords

**Грабли** (см. `memory/email_y360_setup.md`):
- DNS зона на NetAngels (NS = ns1-ns4.netangels.ru), не Reg.ru — Reg.ru только регистратор
- NetAngels reload зоны с задержкой ~1-2 мин для длинных TXT (DKIM 280 char)
- Yandex просит «host: @» — но в NetAngels это `my` (NetAngels сам дописывает `.azarean.ru`)
- NetAngels MX-форма требует IP — для внешнего сервера оставить пустым
- DKIM длинная — multi-string TXT с двумя quoted сегментами через пробел
- Yandex'овский validator кеширует prev fail на 30-60 сек — подождать
- Yandex SPF предлагает `redirect=` — нам нельзя (заменяет всё), используем `include:`

Smoke OK: `provider:y360, id:<48077fe7-...@my.azarean.ru>`, письмо в Gmail Inbox мгновенно.

Resend сейчас без API key — fallback не активен. Юзер может позже
зарегистрироваться на resend.com (signup → DNS verify → API key) и
прислать `RESEND_API_KEY` для активации tier 2.

Коммит: `aed3043` + docs `15d492f`

### Rate-limit на OAuth callbacks
Архитектор справедливо заметил: на `/oauth/{telegram,yandex}/callback`
был только `generalLimiter` (100/15min, и только в production). Добавил
**oauthCallbackLimiter** — 20/15min с IP в проде, 1000/15min в test.
Покрывает start endpoint и callback одновременно.

Коммит: `afd30e4`

### tg-proxy monitoring
Telegram OIDC ходит через финский reverse-proxy на VDS JARVIS-Director'а
(78.17.1.70). Если прокси упадёт — узнавали бы из жалоб пациентов.

`deploy/check-tg-proxy.sh` — cron каждые 5 мин делает GET
`tg-proxy.azarean.ru/.well-known/openid-configuration` с X-Proxy-Secret.
1-й fail тихий (transient), 2-й (10 мин) → alert в Telegram. 12-й (60 мин)
→ повторный alert. Recovery после серии fail'ов — отдельная нотификация.

Cron установлен на проде через `setup.sh` логику в `deploy/setup.sh` +
вручную создал `/etc/cron.d/azarean-rehab-tg-proxy`.

Коммит: `afd30e4` (вместе с rate-limit)

### GDPR data export endpoint
**Архитектор priority P2 #2.** Закрывает 152-ФЗ право доступа к ПДн.

`GET /api/patient-auth/me/data-export`:
- Один JSON со всеми данными пациента: профиль (allowlist), rehab_programs,
  complexes (с упражнениями), progress_logs, diary_entries (+ photo metadata),
  streaks, messages, notification_settings, audit_logs (LIMIT 1000)
- Photo `file_path` НЕ возвращается, только `download_url` на existing endpoint
- Audit `DATA_EXPORT` пишется
- Content-Disposition: attachment + JSON MIME для browser download

UI в Profile screen → секция «Мои данные» → кнопка «Скачать мои данные»
(`Download` icon из lucide). Handler через нативный fetch с `credentials:'include'`
(не axios — patientApi unwrap interceptor попортил бы blob).

Коммит: `2425275`

### Self-delete + grace period + cron hard delete
**Архитектор priority P2 #3.** Закрывает 152-ФЗ ст.21 / GDPR Art.17.

Архитектура: soft delete сразу + **30 дней grace period** перед hard delete.

Миграция `20260429_patient_deletion_queue.sql`:
```sql
CREATE TABLE patient_deletion_queue (
  id SERIAL PK, patient_id INT FK CASCADE,
  requested_at, scheduled_for, reason,
  cancelled_at, executed_at
);
-- partial UNIQUE на patient_id WHERE executed_at IS NULL AND cancelled_at IS NULL
-- index на scheduled_for для cron lookup
```

`DELETE /api/patient-auth/me` body `{ confirm:true, current_password?, reason? }`:
- Если password_hash есть — обязателен current_password (bcrypt verify)
- OAuth-only (password_hash IS NULL) — достаточно cookie + confirm
- Транзакция: SET is_active=false → INSERT в queue (scheduled_for=NOW+30d) →
  DELETE refresh tokens (force logout)
- Cookies очищаются в response
- Audit ACCOUNT_DELETE_REQUESTED
- Idempotent: 200 если уже soft-deleted

Cron `processPatientDeletionQueue()` в scheduler.js (03:30 МСК ежедневно):
- Берёт due-записи (scheduled_for < NOW), audit ACCOUNT_DELETE_EXECUTED →
  hard DELETE patient (CASCADE подчищает complexes/progress/diary/messages)

UI в Profile → «Мои данные» → collapsible «Удалить аккаунт» с красным
предупреждением, поле текущего пароля, optional textarea reason, чекбокс
«Я понимаю». После успеха → toast → 2.5 сек → handleLogout().

Коммит: `2b216b9`

### Schema drift detection cron
**Архитектор priority P2 #4.** Анти-регрессия для Bug #36 (schema drift dev↔prod 2026-04-23/24).

`deploy/check-schema-drift.sh` — daily 04:00 МСК:
- pg_dump --schema-only --no-owner --no-privileges --schema=public
- diff с baseline в `/var/lib/azarean-rehab/schema-baseline.sql`
- Если diff и нет новых миграций → alert в ops-bot
- Если diff и появились миграции → legitimate, baseline auto-update
- Bootstrap при первом запуске: snapshot текущей prod-схемы как baseline +
  counter миграций фиксируется

**Грабля PG18:** pg_dump оборачивает output в `\restrict <random>` /
`\unrestrict <random>` — токен меняется при каждом запуске → false-positive
DRIFT detected. Решение: `grep -vE '^\\\\'` (все строки начинающиеся с `\`).

Прогон ✓ на проде после фикса.

**Юзер получил один false-positive alert** до фикса (от моего тестового
прогона на проде) — успокоен, объяснил.

Коммиты: `bd52ef9` (init) + `a9394fa` (PG18 fix)

## Текущее состояние prod

### Сервисы
- Backend pm2 «azarean-rehab» fork mode на :3001
- Nginx proxy + Let's Encrypt
- Telegram bot @az_zari_bot (long polling)
- Scheduler (5 cron-задач в backend Node)

### Cron на VDS (4 шт.)
1. `/etc/cron.d/azarean-rehab-backup` — daily 03:15 Екб (pg_dump 14-day rotation)
2. `/etc/cron.d/azarean-rehab-healthcheck` — every 5 min (curl `/api/rehab/phases`,
   threshold 3 fails → pm2 restart)
3. `/etc/cron.d/azarean-rehab-tg-proxy` — every 5 min (мониторинг финского
   прокси, alert после 2 fails)
4. `/etc/cron.d/azarean-rehab-schema-drift` — daily 04:00 МСК (pg_dump diff
   против baseline)

### Backend Scheduler cron (5 задач)
1. Exercise reminders (every minute, per-user TZ)
2. Diary reminders (21:00 МСК)
3. Daily tip (12:00 МСК)
4. Cleanup expired tokens (03:00 МСК)
5. **Patient deletion queue** (03:30 МСК) — новое сегодня

### ENV vars в `/opt/azarean-rehab/backend/.env`
Сегодня добавилось:
- `OPS_BOT_TOKEN=8779891710:AAH...` (ops-bot для алертов)
- `OPS_CHAT_ID=183943760`
- `YANDEX_SMTP_USER=noreply@my.azarean.ru`
- `YANDEX_SMTP_PASSWORD=ilmgvcljrxzqxuew` (app-password)

⚠️ Эти секреты были опубликованы в чат — **revoke рекомендуется** перед
коммерческим запуском (новые в @BotFather и id.yandex.ru, обновить ENV через SSH).

### Тесты
- Backend: **293/293 ✓** (19 suites)
- Frontend: **209/209 ✓** (14 suites)
- ИТОГО: 502 теста

### Last commit на проде
`a9394fa fix(schema-drift): игнорировать PG18 \restrict/\unrestrict random tokens`

## Открытое — нужно действие пользователя

| # | Что | Что нужно | Срочность |
|---|---|---|---|
| 1 | **Resend signup** (fallback к Y360) | resend.com signup → DNS verify → API key → прислать в чат | Низкая (Y360 справляется) |
| 2 | **Compliance legal position документ** | мой драфт `docs/legal_position.md` (~1ч) + юрист (1-2 нед календарно) | Перед коммерческим маркетингом |
| 3 | Revoke секретов opубликованных в чате | новый OPS_BOT_TOKEN + YANDEX app-password | Перед коммерческим launch |

## Backlog — P3 / long-term (по запросу)

- 2FA для админов (когда будет 2-й админ — Татьяна)
- At-rest шифрование sensitive полей (diagnosis/birth_date/phone) через pgcrypto —
  если юрист скажет нужно
- Audit log partitioning (при росте >1M записей, сейчас ~30 строк/день)
- CSS Modules миграция (закроет 80+ дублей классов)
- Exercise library virtualization (react-window) при >2000 упражнений
- Hardcoded «Татьяна» cleanup в [ContactScreen.js:148](frontend/src/pages/PatientDashboard/components/ContactScreen.js#L148) и [ProfileScreen.js:525](frontend/src/pages/PatientDashboard/components/ProfileScreen.js#L525) — после `/api/rehab/my/dashboard` начнёт отдавать `instructor_name`
- Telegram bot link-code login fallback к OAuth — только если глюк auto-redirect
  у oauth.telegram.org регулярный
- ROM CV measurement (MediaPipe Pose, замер угла сустава по фото) — required feature
- Dark theme

## Грабли которые узнали сегодня (для будущих чатов)

1. **Sentry.io ingest заблокирован для русских IP** — VPN решает marketing site но не источники ошибок (прод-VDS, браузеры пациентов в РФ). Альтернатива — Telegram ops-bot.
2. **Telegram OIDC sub > BIGINT max с 2024-2025** — использовать NUMERIC(20) или TEXT для chat_id/user_id.
3. **Resend серверы в США** — для российского сервиса с пациентами это трансграничная передача ПДн (152-ФЗ). Y360 SMTP в РФ закрывает compliance.
4. **DNS на NetAngels, не Reg.ru** — `dig NS azarean.ru` возвращает ns1-4.netangels.ru. Reg.ru только регистратор.
5. **NetAngels reload зоны 1-2 мин для длинных TXT**. Не паниковать.
6. **PG18 pg_dump `\restrict <random>`** — рандомные токены каждый запуск, фильтровать в schema-diff.
7. **Multi-string TXT** (DKIM > 255 char) с двумя quoted сегментами — RFC valid, NetAngels принимает только в этой форме.
8. **Yandex'овский SPF predefault `redirect=`** — нельзя, заменит всё. Использовать `include:`.

## Команды для быстрого погружения в новом чате

```bash
# Prod alive check
curl https://my.azarean.ru/api/rehab/phases?type=acl

# Проверить что smoke email через Y360 работает
ssh root@185.93.109.234 'cd /opt/azarean-rehab/backend && node -e "
require(\"dotenv\").config();
const email = require(\"./utils/email\");
email.sendPasswordResetEmail(\"jaike707@gmail.com\", \"smoke-token-XYZ\")
  .then(r => console.log(JSON.stringify(r, null, 2)));
"'

# Schema drift check сейчас (вне cron)
ssh root@185.93.109.234 'bash /opt/azarean-rehab/deploy/check-schema-drift.sh; echo "exit: $?"'

# Все Azarean cron jobs
ssh root@185.93.109.234 'ls -la /etc/cron.d/azarean-rehab-*'

# pm2 + uptime
ssh root@185.93.109.234 'pm2 info azarean-rehab --no-color | grep -E "uptime|created"'

# Последние 50 ошибок backend (если что-то идёт не так)
ssh root@185.93.109.234 'tail -50 /var/log/pm2/azarean-rehab-error.log'

# Текущая схема таблиц — `pg_dump` через psql
ssh root@185.93.109.234 'sudo -u postgres psql -d azarean_rehab -c "\\dt"'
```

## Что начинать с нового чата

Зависит от приоритета:
- **Если коммерческий маркетинг скоро** → drafted legal position документ + поиск юриста
- **Если хочется добавить новую фичу** → P3 список (2FA, hardcoded Татьяна cleanup, Telegram link-code fallback)
- **Если хочется fallback Resend** → signup на resend.com + DNS

Прочитать первым делом:
1. **Этот файл** — полная картина дня
2. `CLAUDE.md` — стек, схема БД, API, грабли (расширен #50-53 сегодня)
3. `memory/MEMORY.md` — индекс памяти
4. `memory/email_y360_setup.md` — детали Y360 setup
5. `memory/ops_bot_alerts.md` — детали ops-bot

---

**Last commit**: `a9394fa` (fix schema-drift PG18 tokens)
**State прода**: всё работает, 0 живых пациентов, ~2 тестовых
**Backend tests**: 293/293 ✓ (19 suites)
**Frontend tests**: 209/209 ✓ (14 suites)
