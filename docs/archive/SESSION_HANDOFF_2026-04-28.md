# Session Handoff — 2026-04-28 (Phase 1 invite-code + Phase 2 Telegram OIDC через прокси)

Файл для бесшовного перехода в новый чат. Удалить когда прочитан.

## TL;DR

Закрыты Phase 1 (invite-code flow) и Phase 2 (Telegram OIDC через финский reverse-proxy). Silent autolink по phone-match работает в проде, проверен на пациенте id=6. **Следующий шаг — Yandex OIDC** аналогично Telegram'у, но БЕЗ прокси (Yandex доступен с rehab-VDS напрямую).

## Что закрыто сегодня

### Phase 1 — invite-code flow для регистрации пациентов
**Зачем:** закрывает архитектурный gap «self-registered пациент с `created_by=NULL` невидим инструктору» (фильтр в `GET /api/patients` по `created_by=$1`).

**Реализация:**
- Миграция `backend/database/migrations/20260427_patient_invite_codes.sql` — новая таблица + 3 индекса
- `backend/utils/inviteCode.js` — 8-символьный alphabet без `0/O/1/I/l`, normalize, validate format
- `POST /api/patients/:id/invite-code` (инструктор) — генерит код, 24ч TTL, used-once, инвалидирует старые
- `POST /api/patient-auth/register` — теперь требует `invite_code` (обязательное поле). Транзакция с `SELECT FOR UPDATE` для race-condition защиты, email-conflict check.
- Frontend: новый компонент `InviteCodeModal` в Patients tab с copy-to-clipboard и `t.me/share` ссылкой
- `PatientRegister.js` — добавлено поле `invite_code` первым в форме, pre-fill из OAuth-callback'а

**Коммит:** `e3970f6 feat(patient-auth): invite-code flow для регистрации пациентов`

### Phase 2a — phone normalizer (фундамент под OAuth phone-match)
**Зачем:** Telegram OIDC отдаёт verified phone в E.164. Чтобы phone-match работал, в БД все номера должны быть в E.164.

**Реализация:**
- `backend/utils/phone.js` — `normalizePhone(raw)`, `phonesEqual(a, b)`. Правила: leading `8` + 10 цифр → `+7`, 11 цифр без `+` → `+`, 10 цифр → `+7`, валидация финального E.164 `^\+\d{10,15}$`
- 17 unit-тестов в `backend/tests/__tests__/phone.test.js`
- routes/patients.js POST/PUT + patientAuth.js POST `/register` + PUT `/me` нормализуют перед записью
- Миграция `20260427_normalize_patient_phones.sql` — бэкфилл существующих записей (DO-блок с теми же правилами в чистом SQL). Идемпотентна.

**Коммит:** `30e031f feat(phone): нормализация телефонов в E.164`

### Phase 2b/c — Telegram OIDC через финский прокси
**Главная боль:** rehab-VDS (185.93.109.234) физически не достукается до `oauth.telegram.org` (selective subnet block у российского хостера AdminVPS — `api.telegram.org` доступен, `oauth.telegram.org` нет).

**Решение:** JARVIS-Director поднял nginx reverse-proxy на финском VDS (78.17.1.70):
- URL: `https://tg-proxy.azarean.ru` (Let's Encrypt)
- Whitelist: только `/.well-known/openid-configuration`, `/.well-known/jwks.json`, `POST /token`
- Auth: header `X-Proxy-Secret`
- IP allowlist: только 185.93.109.234
- `sub_filter` переписывает endpoints в discovery JSON (`token_endpoint`, `jwks_uri` → `tg-proxy.azarean.ru`), `issuer` оставляет как `https://oauth.telegram.org` (для `iss` claim проверки)

**Backend:**
- `backend/services/telegramOidc.js` — `openid-client@6` с `customFetch`, lazy-require внутри функций (Jest падает на ESM import-statement если резолвить на module-load)
- Миграция `20260427_oauth_pkce_nonce.sql` — добавила `code_verifier` + `nonce` в `patient_oauth_states`
- Endpoints в `routes/patientAuth.js`:
  - `GET /oauth/providers` — какие включены
  - `GET /oauth/telegram` — старт, генерит state/nonce/PKCE, 302 на oauth.telegram.org
  - `GET /oauth/telegram/callback` — used-once state, обмен code на ID-token через прокси, match-flow

**Match-flow в callback:**
1. `provider_id` (claims.sub) совпал с `auth_provider='telegram'` → returning login
2. `phone_number` (нормализованный) совпал с пациентом без `password_hash` (single match) → silent autolink, audit `OAUTH_AUTOLINK`
3. Иначе → 302 на `/patient-register?oauth_provider=telegram&phone=...&full_name=...`

**Frontend:**
- `PatientLogin.js` — useEffect загружает `/oauth/providers`, кнопка Telegram редиректит, обработка `?oauth_error=...`
- `PatientRegister.js` — pre-fill phone/full_name из query, info-баннер «введите код от инструктора»
- Hint под OAuth-кнопками про auto-redirect issue (oauth.telegram.org WebSocket иногда не возвращает сигнал в браузер при consent в Desktop)

**Коммиты:**
- `7cb4742` feat(oauth): Telegram OIDC через прокси-VDS в Финляндии
- `a89ae5f` fix(oauth): убрать `telegram:bot_access` из обязательных scopes (toggle off → silent fail)
- `b29a661` fix(oauth): pg type-deduction для phone-autolink UPDATE
- `897a82b` feat(patient-login): hint про auto-redirect issue

## Грабли (см. memory/telegram_oidc_proxy.md)

1. **Legacy Login Widget HMAC мёртв** после `BotFather → Switch to OpenID Connect Login`. `oauth.telegram.org/auth?bot_id=...` возвращает голое `"deprecated"`. Кнопки «Switch back» в BotFather UI нет.
2. **`telegram:bot_access` scope не делать обязательным** — toggle «Разрешить писать Вам» в consent по дефолту off, если scope требуем — Telegram молча фейлит без редиректа.
3. **pg `inconsistent types deduced for parameter $1`** — один `$1` для двух колонок разных типов (`provider_id VARCHAR` + `telegram_chat_id BIGINT`) не работает. Передавать дважды через `$1` и `$2`.
4. **openid-client@6 ESM в CJS** — `require()` внутри функций, не на верхнем уровне модуля.
5. **`claims.name` может быть имя бренд-аккаунта** (например «Azarean Network» если пациент с такого аккаунта в Telegram). Это корректное значение, не баг.

## Env vars на проде

`/opt/azarean-rehab/backend/.env`:
```
TELEGRAM_OIDC_CLIENT_ID=8733404312
TELEGRAM_OIDC_CLIENT_SECRET=elCprtl-6x9SD0Hy_wST_MmltLK3h5slSi5rB8lsVj9z0NPgxLo18A
TELEGRAM_OIDC_REDIRECT_URI=https://my.azarean.ru/api/patient-auth/oauth/telegram/callback
TG_PROXY_URL=https://tg-proxy.azarean.ru
TG_PROXY_SECRET=d2bd012cc195b755fc9f9d1902decf10e9f1edd555d70ce84d0574343594a02f
TELEGRAM_LOGIN_ENABLED=true
```

⚠️ Client secret и прокси-secret в чате — **сейчас не ротируем** (юзер хочет convenience), при реальном launch revoke в BotFather и обновить по SSH.

## Текущий state репо

- Branch `main`, ahead-of-origin 0 (всё запушено)
- Последний коммит: `897a82b feat(patient-login): hint про auto-redirect issue Telegram OIDC`
- 214/214 backend тестов + 202/202 frontend = **416 зелёных**
- Смоук в проде: `id=6 Вадим Азаренков, auth_provider=telegram, provider_id=7358444850707888434, telegram_chat_id=7358444850707888434` ✓

## Open backlog

| # | Что | Срочность |
|---|---|---|
| 1 | **Yandex OIDC** | следующий чат начинает с этого |
| 2 | iPhone Login (Yandex iOS / Safari) — нужны детали | когда поедут реальные пациенты с iOS |
| 3 | Тест второго номера +79920120726 (не идёт редирект) | нужен второй заход |
| 4 | Bot link-code как fallback к OAuth | только если OAuth глючит у многих |
| 5 | Revoke TG client_secret + dedup .env | перед реальным launch |
| 6 | Compliance disclaimer «зашифрованные данные» — переформулировать (на самом деле только TLS+bcrypt+SHA-256, не at-rest шифрование) | средне |
| 7 | UI для создания RehabProgram | средне |

## Что начинать в новом чате — Yandex OIDC

**Что нужно сделать (ориентировочно ~3-4 часа):**

1. **Регистрация в Yandex OAuth** на https://oauth.yandex.ru:
   - Создать приложение «Azarean Network»
   - Платформа: «Веб-сервис»
   - Callback URI: `https://my.azarean.ru/api/patient-auth/oauth/yandex/callback`
   - Permissions: `login:email`, `login:info`, `login:phone` (если нужно для phone-match — стоит проверить что это даст verified phone)
   - Получить `Client ID` + `Client Secret`

2. **Backend:**
   - `backend/services/yandexOidc.js` — копия `telegramOidc.js`, но **без прокси** (Yandex напрямую доступен)
   - `ISSUER = 'https://login.yandex.ru'` (уточнить exact OIDC issuer)
   - Discovery URL: `https://login.yandex.ru/.well-known/openid-configuration` (если поддерживают OIDC, иначе использовать обычный OAuth 2.0)
   - В `routes/patientAuth.js`:
     - `GET /oauth/yandex` — старт
     - `GET /oauth/yandex/callback` — match-flow с phone (Yandex отдаёт phone если scope разрешён)
   - Обновить `/oauth/providers` чтобы yandex.enabled=true когда credentials в env

3. **Config:**
   - В `backend/config/config.js`: `yandexOidc: {clientId, clientSecret, redirectUri}`

4. **Env vars:**
   - `YANDEX_OIDC_CLIENT_ID`, `YANDEX_OIDC_CLIENT_SECRET`, `YANDEX_OIDC_REDIRECT_URI` в .env (dev + prod)
   - Можно добавить `YANDEX_LOGIN_ENABLED` feature flag по аналогии

5. **Frontend:**
   - В `PatientLogin.js` — кнопка «Яндекс» уже есть, нужно убрать toast «в разработке» когда provider enabled
   - В `PatientRegister.js` pre-fill будет работать автоматически (тот же ?phone= ?full_name=)

6. **Тесты + smoke + commit + push**

**Ключевые отличия от Telegram:**
- Прокси НЕ нужен — Yandex напрямую доступен
- Yandex использует **OAuth 2.0**, не классический OIDC. Проверить через discovery — может быть нужно вручную обращаться к token-endpoint вместо openid-client'а. Если у Yandex есть OIDC-discovery — использовать openid-client. Если только OAuth 2.0 — использовать другую библиотеку (`simple-oauth2` или прямой fetch).
- Phone scope (`login:phone`) даёт verified phone — нужно проверить что отдаётся в claims.

**Проверить документацию:**
- https://yandex.ru/dev/id/doc/ru/concepts/about — общая дока
- https://yandex.ru/dev/id/doc/ru/codes/code-url — Authorization Code flow
- https://yandex.ru/dev/id/doc/ru/user-information — какие поля возвращаются (включая phone)

## Полезные SSH-команды

```bash
# Войти на rehab-VDS
ssh -i ~/.ssh/azarean_rehab_deploy root@185.93.109.234

# Проверить что в БД (запрос напрямую через ssh-jump из Git Bash)
ssh -i ~/.ssh/azarean_rehab_deploy root@185.93.109.234 'sudo -u postgres psql -d azarean_rehab -c "SELECT id, full_name, auth_provider, provider_id FROM patients WHERE id = 6;"'

# pm2 logs (стандартный stdout+stderr)
pm2 logs azarean-rehab --lines 50 --nostream | tail -50

# Прямой error log файл (содержит console.error из catch блоков)
tail -50 /var/log/pm2/azarean-rehab-error.log

# Что задеплоено
ls -la /opt/azarean-rehab/backend
cat /opt/azarean-rehab/backend/services/telegramOidc.js | head -5
```

## Test users в проде

- Инструктор: `vadim@azarean.com` / `Test1234`
- Пациент с привязкой через Telegram: id=6, full_name=«Вадим Азаренков», phone=`+79089049130`, auth_provider=telegram

---

**Финальная команда, если нужно:** прочитать CLAUDE.md → memory/MEMORY.md → memory/telegram_oidc_proxy.md → этот SESSION_HANDOFF. Этого достаточно для продолжения с Yandex OIDC.
