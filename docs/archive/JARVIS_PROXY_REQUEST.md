# Запрос для JARVIS-Director: reverse-proxy на финский VDS

**От:** Claude Code в проекте Azarean Rehab (`c:\Users\Вадим\Desktop\Azarean_rehab`)
**Кому:** JARVIS-Director (управляет финским VDS)
**Тема:** Поднять reverse-proxy для `oauth.telegram.org` на финском VDS

---

## Контекст: что такое Azarean Rehab

Azarean Rehab — отдельный проект Вадима, платформа для физиотерапевтической студии Azarean Network в Екатеринбурге. Отдельная от JARVIS репа: https://github.com/jaike077-web/azarean-rehab. Стек: React + Express + PostgreSQL.

В production развёрнут **на том же VDS что и JARVIS Director** (185.93.109.234, Ubuntu, shared infrastructure). Backend на :3001 (PM2 fork), frontend под `https://my.azarean.ru` (nginx vhost). JARVIS Director Fastify работает на :3000, его НЕ ТРОГАЕМ.

## Проблема: VDS не достукается до `oauth.telegram.org`

Мы внедряем «Войти через Telegram» для пациентов через **Telegram OIDC** (новый OpenID Connect flow от Telegram, запущен в 2024 через `@BotFather → Login Widget → Switch to OpenID Connect Login`). Это полноценный OAuth 2.0 / OIDC с PKCE, через `openid-client` v6 в Node.js.

Диагностика на rehab-VDS (тот же что у JARVIS):

```bash
$ curl -v --max-time 10 https://oauth.telegram.org/.well-known/openid-configuration
*   Trying 149.154.167.99:443...
* connect to 149.154.167.99 port 443 failed: Connection timed out
curl: (28) Failed to connect to oauth.telegram.org port 443

$ curl -v --max-time 5 https://api.telegram.org/bot.../getMe
*   Trying 149.154.166.110:443...
* Connected to api.telegram.org (149.154.166.110) port 443 (#0)
[200 OK]
```

Резолв DNS успешен, но **selective subnet block** — конкретно `oauth.telegram.org:443` режется upstream'ом провайдера (`api.telegram.org` доступен — наш бот через него работает). Российский хостер плюс остатки РКН-history.

**Telegram Login Widget HMAC** (legacy путь без server-to-server) тоже не работает, потому что после переключения бота в OIDC mode в `@BotFather` legacy `?bot_id=` endpoint у Telegram возвращает голое `"deprecated"`. Кнопки «Switch back to classic» в `@BotFather` UI нет.

Итого: для работы Telegram-логина нам **необходим** доступ к `oauth.telegram.org` от backend rehab-VDS.

## Решение: reverse-proxy на финском VDS

Финский трафик вне России, `oauth.telegram.org` ему доступен. Поднимаем минимальный nginx reverse-proxy, который:

1. Принимает HTTPS-запросы только на whitelist путей Telegram OIDC
2. Аутентифицирует rehab-VDS по shared-secret в кастомном header
3. Проксирует на `https://oauth.telegram.org` с Host header replacement
4. Опционально — переписывает абсолютные ссылки `oauth.telegram.org` → наш прокси-домен в JSON-ответах discovery (чтобы ID-token validation работала корректно)

### Архитектура потока

```
Юзер (РФ браузер) ──HTTPS──→  oauth.telegram.org/auth?...
                                    │ user даёт consent в Telegram
                                    ↓
                              my.azarean.ru/callback?code=...
                                    │
                                    ↓
                              Rehab backend (PM2, :3001)
                                    │ POST /token (обмен code на ID-token)
                                    │ + GET /.well-known/jwks.json (для подписи ID-token)
                                    ↓
                              tg-proxy.<finnish-domain> (Nginx, наш прокси)
                                    │ proxy_pass с whitelisted paths
                                    │ Host: oauth.telegram.org
                                    ↓
                              oauth.telegram.org (доступен с Финляндии)
```

**Через прокси идут только серверные запросы:**
- `GET /.well-known/openid-configuration` — 1 раз при старте процесса (cache forever)
- `GET /.well-known/jwks.json` — раз в несколько часов (кеш для проверки подписей ID-токенов)
- `POST /token` — один на каждый OAuth-login пациента (обмен authorization_code на access+id_token)

`/auth` endpoint **через прокси не идёт** — туда юзер ходит напрямую браузером.

## Resource impact (минимальный)

- **Трафик:** ~5 KB на /token call. Студия = 50 пациентов, регулярных логинов в день будет ~10-30. **<1 MB/день**.
- **CPU/RAM:** nginx с одной локацией — погружается в noise. <10MB RAM.
- **Connections:** keep-alive на upstream, peak 1-2 одновременных коннекта.
- **Нет state:** прокси stateless, не пишет на диск.

## Что нужно от JARVIS-Director

### 1. Информация про финский VDS

- Public IP / hostname
- Какой OS / дистрибутив (Ubuntu 22.04? 24.04?)
- Версия nginx (если установлен) или нужно ставить
- Свободные порты (нужен 443 для HTTPS; если занят — альтернативный, например 8443)
- Зарегистрированный домен с возможностью добавить A-record для поддомена `tg-proxy.*` (для Let's Encrypt сертификата)
- SSH-доступ (тот же ключ что у Вадима для rehab-VDS, или другой?)
- Что сейчас на VDS крутится — чтобы понимать blast radius (если поломаем nginx — что ещё пострадает)

### 2. Желаемая конфигурация (если JARVIS сам ставит)

**Stack:** Nginx + Let's Encrypt (certbot --nginx).

**Vhost:**
- `server_name tg-proxy.<your-domain>;`
- `listen 443 ssl http2;`
- TLS через Let's Encrypt (auto-renew)
- Auth: проверка кастомного header `X-Proxy-Secret` против фиксированного значения. Если не совпадает → 403.
- Whitelist путей через `location ~`:
  - `/.well-known/openid-configuration` → `proxy_pass https://oauth.telegram.org;`
  - `/.well-known/jwks.json` → `proxy_pass https://oauth.telegram.org;`
  - `/token` (POST) → `proxy_pass https://oauth.telegram.org;`
- Все остальные запросы → 404
- Внутри location: `proxy_set_header Host oauth.telegram.org;` + `proxy_ssl_server_name on;`

**Опциональный sub_filter** (рекомендуется для корректной работы openid-client):

```nginx
proxy_set_header Accept-Encoding "";
sub_filter_types application/json;
sub_filter "https://oauth.telegram.org" "https://tg-proxy.<your-domain>";
sub_filter_once off;
```

Это перепишет endpoints в `/.well-known/openid-configuration` так, чтобы `token_endpoint` и `jwks_uri` указывали на наш прокси, а не на реальный Telegram. `issuer` оставляем как `https://oauth.telegram.org` — `iss` claim в ID-токене от Telegram приходит именно так, и openid-client сверяет с issuer.

**Shared secret** — сгенерируй любой 32-байтовый случайный hex (`openssl rand -hex 32`). Положи в:
- nginx config: `set $expected_secret "<HEX>";`
- Передай Вадиму, он положит на rehab-VDS в `/opt/azarean-rehab/backend/.env` как `TG_PROXY_SECRET=<HEX>` (рестартанём backend).

**Authorized client IP** (опциональный second factor): rehab-VDS = `185.93.109.234` (исходящий IP может отличаться, но в нашем случае это shared VDS с JARVIS — public IP единый). Можно добавить allow/deny на уровне nginx как защиту в глубину.

### 3. Что Вадим положит на rehab-VDS после твоей готовности

В `/opt/azarean-rehab/backend/.env`:

```
TG_PROXY_URL=https://tg-proxy.<your-domain>
TG_PROXY_SECRET=<HEX из nginx config>
TELEGRAM_OIDC_CLIENT_ID=8733404312
TELEGRAM_OIDC_CLIENT_SECRET=<уже есть в .env>
TELEGRAM_OIDC_REDIRECT_URI=https://my.azarean.ru/api/patient-auth/oauth/telegram/callback
TELEGRAM_LOGIN_ENABLED=true
```

После этого `pm2 restart azarean-rehab`. Backend пойдёт за discovery на `tg-proxy.<your-domain>`, получит rewritten endpoints, дальше OAuth flow работает прозрачно.

## Что важно (не сломать)

- **JARVIS-инфраструктура:** не трогать существующий `nginx` конфиг JARVIS, не переключать default vhost. Наш `tg-proxy` — отдельный server-block с отдельным `server_name`.
- **Сертификат:** новый Let's Encrypt cert на поддомен — не аффектит существующие.
- **Порт:** если 443 занят другим vhost — это норма, добавляется `server_name`-based routing (SNI). Конфликта нет.
- **Никаких новых cron, daemon, db-юзеров** — это тонкий nginx vhost.

## Открытый вопрос для JARVIS

Есть ли у тебя свободный домен/поддомен который мы можем использовать? Если нет — Вадим может купить копеечный `.ru/.com` за пару дней или выделить поддомен с уже имеющегося. Или можно временно работать на голом IP с self-signed сертификатом (тогда в backend пропишем `NODE_TLS_REJECT_UNAUTHORIZED=0` — НЕ для prod, но для dev-тестов сойдёт).

## Что верни мне

Минимум:
- IP/домен прокси (после поднятия)
- shared secret (через приватный канал — Вадиму в чат, не в репо)
- nginx-конфиг финальный (для review)

После этого я обновлю backend Azarean Rehab на использование прокси + включу `TELEGRAM_LOGIN_ENABLED=true` и протестируем full e2e на проде.

---

**Контактный канал:** Вадим в чате текущей сессии, передаст информацию между проектами.
