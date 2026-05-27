# Инцидент: блокировка api.telegram.org на сети NetAngels

**Дата:** 22.05.2026
**Длительность:** ~1ч 40мин (с момента падения до полного восстановления)
**Серьёзность:** High — три из четырёх production Telegram-ботов потеряли связь с Telegram API. Клиенты не получали напоминания, RSVP-кнопки не работали, диагностические уведомления о расписании не доставлялись.
**Затронутые сервисы:** jarvis-client-bot (`@az_signup_bot`), jarvis-backend admin (`@Azarean_Jarvis_bot`), azarean-rehab (`@az_zari_bot`)
**НЕ затронуто:** Max-бот (`@id861504938863_bot`) — у него другая инфраструктура (`botapi.max.ru`), DPI-блокировки на него не было.

---

## TL;DR

Сетевой провайдер VDS (NetAngels) включил DPI-фильтр на `api.telegram.org` по SNI — TCP-коннект до Telegram-серверов проходит, но TLS-handshake обрывается. Все наши TG-боты на VDS оказались отрезаны от Telegram. Решение — поднять reverse-proxy на нашем зарубежном VDS (AdminVPS FI, `tg-proxy.azarean.ru`) и заставить ботов ходить через него. Реализовано фабрикой `createTelegraf()` + переменной `TELEGRAM_API_ROOT`. Восстановление полное.

---

## Хронология (UTC, +5 = Asia/Yekaterinburg)

| Время UTC | Время Екб | Событие |
|---|---|---|
| **05:02:18** | 10:02 | Последний успешный RSVP клиентского бота (notification #716 → confirmed) |
| **05:06:02** | 10:06 | Первая ошибка `read ECONNRESET` к `api.telegram.org`. Watchdog считает попытки. |
| **05:13–05:58** | 10:13–10:58 | Watchdog регистрирует 10 подряд probe failures, отправляет TG-алерт админу (но сам алерт уйти не может — тот же канал!). Бот в крашлупе, PM2 рестартует. |
| **05:59:44** | 10:59 | Telegraf вылетает в `Error: Bot is not running!` — `process.exit(1)` сработал. |
| **06:00–06:05** | 11:00–11:05 | azarean-rehab крашится 28 раз за 75 минут — у него нет watchdog/auto-recovery, каждая попытка polling вылетает с EFATAL. |
| **06:13** | 11:13 | Пользователь сообщил («клиентские боты макс и телеграм лежат»). |
| **06:14–06:18** | 11:14–11:18 | Диагностика: проверено состояние PM2, прочитаны логи, выполнен `curl` от прода → подтверждена DPI-блокировка (TCP OK, TLS висит). |
| **06:18–06:20** | 11:18–11:20 | Проверены альтернативные узлы: AdminVPS FI (78.17.1.70) отдаёт `api.telegram.org` за 192мс. Прод может ходить до FI/MSK по всем портам. |
| **06:20–06:25** | 11:20–11:25 | Согласовано решение с пользователем (reverse-proxy через FI). |
| **06:25–06:30** | 11:25–11:30 | На FI добавлен `location /tg/` в `tg-proxy.conf`, обнаружен баг `no resolver` для динамического `proxy_pass`. Добавлен resolver `1.1.1.1 8.8.8.8 ipv6=off`. |
| **06:30** | 11:30 | Создана фабрика `createTelegraf()`, заменены 13 вызовов `new Telegraf(...)` в 8 файлах. Typecheck чистый, build OK. |
| **06:31** | 11:31 | Развёрнут tarball на прод, добавлен `TELEGRAM_API_ROOT` в .env. |
| **06:32** | 11:32 | Первый рестарт — ошибка `<html>...is not valid JSON`. Понятно: Telegraf-URL-resolution съел `/tg`-префикс без trailing slash. |
| **06:35** | 11:35 | Исправлен trailing slash в env (`/tg/` вместо `/tg`), второй рестарт. |
| **06:39:07** | 11:39 | **`bot_health.telegram_client.last_poll_ok_at`** — первый успешный poll через прокси. jarvis-client-bot восстановлен. |
| **06:39–06:43** | 11:39–11:43 | Применён патч `baseApiUrl` в `/opt/azarean-rehab/backend/services/telegramBot.js`, добавлен env `TELEGRAM_API_URL`. |
| **06:46:31** | 11:46 | azarean-rehab: `🤖 Telegram бот запущен (long polling)` — восстановлен. |

**Простой:** клиентский TG-бот — 1ч 37мин (05:02 → 06:39), rehab — ещё больше (был в крашлупе с момента появления блокировки до 06:46).

---

## Симптомы

Все три бота на VDS получали одинаковую цепочку:
```
TLSv1.3 (OUT), TLS handshake, Client hello (1)
... timeout (никакого ответа от сервера) ...
* Operation timed out after 10001 milliseconds with 0 bytes received
read ECONNRESET
```

`curl -v https://api.telegram.org` с прода:
- Resolved IP: 149.154.166.110 — OK
- TCP connect to :443 — OK (`Connected to api.telegram.org`)
- TLS ClientHello отправлен — OK (`[512 bytes data]`)
- Ответ от сервера — **никогда не приходил**, по истечении 10s соединение принудительно закрывалось

Это классическая сигнатура **DPI-блокировки по SNI**: межсетевое оборудование провайдера или upstream-провайдера видит SNI в TLS ClientHello (нешифрованное поле в TLSv1.2 и в первом ClientHello TLSv1.3 без ECH), узнаёт `api.telegram.org` и обрывает соединение.

Подтверждения:
- `curl` от AdminVPS FI до того же `api.telegram.org` → 302 за 192мс (норма)
- `curl` к `botapi.max.ru` с прода → 404 за 159мс (норма; блокировка таргетированная)
- TCP-уровень не блокирован (TCP-handshake завершается)
- Никаких изменений в нашем коде или конфигурации серверов в этот момент не было — deploy azarean-rehab был **совпадением по времени**

---

## Корневая причина

**Провайдер VDS (NetAngels, AS NN) или его upstream-провайдер включил DPI-блокировку `api.telegram.org` по SNI.**

Это решение НЕ нашей инфраструктуры — мы лишь жертва внешних обстоятельств. Россия периодически блокирует Telegram-инфраструктуру либо точечно (через DPI у конкретных операторов), либо широко. Конкретно `api.telegram.org` (домен Bot API) долго оставался доступным даже когда основной Telegram-домен блокировался, но это окно закрылось.

**Почему именно сейчас:** скорее всего РКН/провайдер обновил DPI-правила. Никаких событий с нашей стороны (deploy, миграция, изменение сети) не было — диагностика подтвердила, что в /etc/hosts ничего не менялось, iptables правила старые, нет лимитов rate.

**Почему Max не пострадал:** Max — российская инфраструктура (`botapi.max.ru`, ВК-холдинг), для неё нет смысла блокировать.

---

## Принятые меры (детально)

### 1. Reverse-proxy на AdminVPS FI

В `/etc/nginx/sites-available/tg-proxy.conf` на 78.17.1.70 добавлен `location ~ ^/tg/(.*)$`:
```nginx
location ~ ^/tg/(.*)$ {
    allow 185.93.109.234;
    deny  all;
    access_log off;
    client_max_body_size 50m;
    proxy_set_header Host api.telegram.org;
    proxy_ssl_name   api.telegram.org;
    proxy_buffering off;
    proxy_pass https://api.telegram.org/$1$is_args$args;
}
```
Безопасность:
- IP-allowlist для 185.93.109.234 (единственный prod-VDS, который может стучаться)
- Bot tokens сами являются секретом
- `access_log off` — не пишем токены в логи

Regex `^/tg/(.*)$` покрывает и `/tg/bot<TOKEN>/<method>` (API), и `/tg/file/bot<TOKEN>/<path>` (file downloads).

Заодно добавлен `resolver 1.1.1.1 8.8.8.8 valid=300s ipv6=off` — был нужен для динамического `proxy_pass` (с переменной `$1`), и как побочный эффект починил `project_finnish_vds_ipv6_flap` (oauth-локации больше не пытаются IPv6).

### 2. Фабрика `createTelegraf`

Новый файл [src/notifications/telegraf-factory.ts](src/notifications/telegraf-factory.ts):
```ts
export function createTelegraf(token: string): Telegraf {
  const apiRoot = process.env.TELEGRAM_API_ROOT?.trim();
  if (apiRoot) return new Telegraf(token, { telegram: { apiRoot } });
  return new Telegraf(token);
}
```
Все 13 prod-вызовов `new Telegraf(token)` заменены на `createTelegraf(token)` в:
- src/notifications/telegram.ts
- src/notifications/client-bot-telegram.ts
- src/notifications/client-bot-max.ts (там тоже Telegraf для admin-уведомлений)
- src/notifications/client-messenger.ts
- src/notifications/external-monitor.ts
- src/scheduler.ts
- src/scripts/run-client-bot.ts

### 3. Env-переменные

Прод `/opt/jarvis-director/.env`:
```
TELEGRAM_API_ROOT=https://tg-proxy.azarean.ru/tg/
```
Прод `/opt/azarean-rehab/backend/.env`:
```
TELEGRAM_API_URL=https://tg-proxy.azarean.ru/tg
```

Разница в trailing slash — НЕ опечатка: Telegraf использует `new URL()` (relative-resolution, нужен slash), а node-telegram-bot-api делает string concat (slash не нужен и сломает).

### 4. Патч azarean-rehab

В `/opt/azarean-rehab/backend/services/telegramBot.js:32`:
```js
bot = new TelegramBot(token, { polling: true, baseApiUrl: process.env.TELEGRAM_API_URL || 'https://api.telegram.org' });
```
Поскольку rehab не использует dotenv в `server.js`, env передан через shell + `pm2 restart --update-env` + `pm2 save` (попал в `/root/.pm2/dump.pm2`).

---

## Что НЕ сработало с первого раза — lessons in action

### Грабли 1: nginx 502 — `no resolver defined`
При первом тесте получили `502 Bad Gateway`. nginx error log: `no resolver defined to resolve api.telegram.org`. **Причина:** nginx резолвит upstream при старте только когда URL — статический литерал. Динамический `proxy_pass https://api.telegram.org/$1$is_args$args;` требует явного `resolver`. **Урок:** при использовании переменных в `proxy_pass` всегда добавлять `resolver` директиву.

### Грабли 2: Telegraf проглотил префикс `/tg`
После первого деплоя в логах: `https://tg-proxy.azarean.ru/bot<TOKEN>/getMe` — БЕЗ `/tg`. **Причина:** Telegraf использует `new URL(method, apiRoot)`. По WHATWG URL spec, `new URL('bot/x', 'https://host/tg')` возвращает `https://host/bot/x` (path `/tg` без trailing slash трактуется как файл и заменяется). С trailing slash `https://host/tg/` — резолвится правильно в `https://host/tg/bot/x`. **Записано в [lessons_telegraf_apiroot_trailing_slash.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\lessons_telegraf_apiroot_trailing_slash.md).**

### Грабли 3: env-переменная rehab не подхватилась после `pm2 restart`
Добавили `TELEGRAM_API_URL` в `.env` rehab, но `pm2 env 4` показывал пусто. **Причина:** rehab не использует `dotenv` в `server.js` — он берёт env только из `pm2 dump` (а тот был зафиксирован при первом `pm2 start`). **Решение:** `export TELEGRAM_API_URL=... && pm2 restart --update-env && pm2 save`. Теперь переменная в dump, переживёт reboot.

### Грабли 4: rehab без watchdog
azarean-rehab крашится при каждой ошибке polling — нет error-handler на `bot.on('polling_error')`. За 75 минут блокировки — 28 рестартов PM2. **Это надо чинить отдельно** — см. секцию профилактики.

---

## Текущее состояние

| Компонент | Состояние | Метрика |
|---|---|---|
| jarvis-backend | ✅ online | uptime стабильный |
| jarvis-client-bot | ✅ online, polling через proxy | `bot_health.telegram_client.last_poll_ok_at` обновляется каждые ~50с |
| azarean-rehab | ✅ online, polling через proxy | `🤖 Telegram бот запущен (long polling)` |
| Max-бот | ✅ online, не пострадал | `bot_health.max.last_poll_ok_at` обновляется |
| tg-proxy.azarean.ru/tg/ | ✅ работает | `getMe` 200 за ~250мс (overhead ~50мс vs direct) |

Watchdog v3 (heartbeat polling-stuck) работает поверх прокси — он трекает успешные возвраты getUpdates, которые теперь идут через FI. Никаких изменений в watchdog не потребовалось.

---

## Что осталось сделать

1. **Локальный коммит в jarvis-director** — изменения в 8 файлах сейчас только в `dist` на проде, в master не закоммичены. Сделать частью текущего `project_cleanup_plan_2026_05_16`. Файлы:
   - `src/notifications/telegraf-factory.ts` (новый)
   - `src/notifications/{telegram,client-bot-telegram,client-bot-max,client-messenger,external-monitor}.ts`
   - `src/scheduler.ts`
   - `src/scripts/run-client-bot.ts`

2. **Локальный патч azarean-rehab** (`C:\Users\Вадим\Desktop\Azarean_rehab\backend\services\telegramBot.js`) — продакшен-патч применён только в `/opt/azarean-rehab` на VDS. Следующий deploy с локали перетрёт. Нужно:
   - Применить тот же `baseApiUrl: process.env.TELEGRAM_API_URL || 'https://api.telegram.org'`
   - Добавить `TELEGRAM_API_URL` в `ecosystem.config.js` (если используется) или `.env`
   - Если используется dotenv — убедиться что подгружается в server.js (не только test-db.js)

3. **Обновить `CLAUDE.md`** проекта — добавить упоминание `TELEGRAM_API_ROOT` в секцию env-переменных и краткое пояснение про fallback (текст из [project_telegram_proxy_via_fi.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\project_telegram_proxy_via_fi.md)).

---

## Профилактика — как избежать повторения

### Уровень 1: убрать единую точку отказа канала уведомлений

**Проблема:** когда падает Telegram, watchdog честно фиксирует проблему и пытается прислать алерт... в тот же Telegram. Алерт уходит в никуда, мы узнаём об инциденте только когда клиенты звонят/пишут.

**Действия:**
- ✅ Алерты watchdog уже дублируются в Max через `sendToClient(..., 'both')` для критичных уведомлений — пользователи получают, но **админ-алерты `sendAlarm()` идут только в TG** (`process.env.TELEGRAM_CHAT_ID`). Нужно добавить Max-зеркалирование критичных server-side алертов (минимум — watchdog probe-failed, integrity check fail, bot-down).
- Реализовать через новую функцию `sendCriticalAlert(text)` в `src/notifications/critical-alerts.ts`: пытается TG → fallback на Max → fallback на email через любой SMTP.
- **Эстимейт:** 2-3 часа.

### Уровень 2: внешний мониторинг

**Проблема:** наш собственный мониторинг (jarvis-backend → jarvis-msk и обратно) тоже на нашей инфре. UptimeRobot мониторит только HTTP-endpoints, не bot health.

**Действия:**
- UptimeRobot уже мониторит `jarvis.azarean.ru/`, `api2.studiosila.ru/health`, `tg-proxy.azarean.ru/health` (см. `reference_uptimerobot.md`).
- **Добавить:** keyword-monitor на новый endpoint `https://jarvis.azarean.ru/api/bot-health` (публичный, возвращает JSON-сводку `bot_health` таблицы). UptimeRobot будет триггерить если `telegram_client.consecutive_probe_failures > 3` — алерт в push+email независимо от того, лежит ли наш Telegram.
- **Эстимейт:** 1-2 часа (endpoint без аутентификации, ограничение IP UptimeRobot для безопасности).

### Уровень 3: cron-проба api.telegram.org с прода

**Проблема:** мы узнали о DPI через симптом (бот лёг), а не через причину (api.telegram.org недоступен). Между этими событиями — 4 минуты, но если бы знали сразу — рекавери быстрее.

**Действия:**
- Добавить в `scheduler.ts` cron `*/3 * * * *` который делает `fetch('https://api.telegram.org/')` (HEAD, timeout 5с). При 3 fails подряд — алерт через `sendCriticalAlert` с указанием «возможна DPI-блокировка, проверь tg-proxy».
- **Преимущество:** ловит проблему независимо от того, есть ли активность ботов. Ночью, когда никто не пишет — тоже сработает.
- **Эстимейт:** 1 час.

### Уровень 4: watchdog rehab

**Проблема:** azarean-rehab падает в крашлуп при первой же ошибке polling. PM2 рестартит, бот снова падает — спам в логи, нагрузка на CPU, риск удара в `max_restarts` лимит.

**Действия:**
- В `/opt/azarean-rehab/backend/services/telegramBot.js` добавить:
  ```js
  bot.on('polling_error', (err) => {
    console.error('[polling_error]', err.code, err.message);
    // НЕ падать — node-telegram-bot-api сам ретраит. Просто логируем.
  });
  ```
- Опционально — watchdog как в jarvis-director (heartbeat в БД, авто-рестарт через 10 мин silent fail).
- **Эстимейт:** 30 минут для базового, 4-5 часов для полноценного.

### Уровень 5: документация и автоматизация прокси

**Действия:**
- ✅ Memory обновлён: [project_telegram_proxy_via_fi.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\project_telegram_proxy_via_fi.md) описывает архитектуру и откат.
- Добавить в `weekly-audit.sh` проверку: «работает ли `tg-proxy.azarean.ru/health`», «не превышает ли latency через прокси N секунд vs direct».
- В CLAUDE.md секцию «Production deploy» добавить упоминание `TELEGRAM_API_ROOT` и `TELEGRAM_API_URL`.

### Уровень 6: ускорение восстановления

**Проблема:** на инцидент 22.05 ушло ~1ч 40мин «человеческого времени». Это много для downtime.

**Действия:**
- **runbook** в `docs/INCIDENT_TELEGRAM_BLOCKED.md` (5 минут на чтение, 10 минут на применение):
  1. Симптом: ECONNRESET в логах ботов
  2. Проверь `curl https://api.telegram.org` с прода — если timeout, DPI
  3. Проверь `curl https://tg-proxy.azarean.ru/tg/bot<TEST_TOKEN>/getMe` — если 200, прокси работает
  4. На проде: `TELEGRAM_API_ROOT=https://tg-proxy.azarean.ru/tg/ pm2 restart jarvis-backend jarvis-client-bot --update-env`
  5. На rehab: `export TELEGRAM_API_URL=... && pm2 restart azarean-rehab --update-env && pm2 save`
  6. Проверь bot_health в БД
- Поскольку код уже подхватывает env — **в следующий раз восстановление займёт 5 минут**, без правки кода. Сейчас этой опции не было, потому что код не знал про прокси.

---

## Уроки

1. **Любой одиночный канал уведомлений — single point of failure.** TG-алерты про падение TG-бота физически не могут работать. Always have a fallback channel.
2. **Reverse-proxy через зарубежный VDS — must-have для российской прод-инфры.** Не «если заблокируют», а «когда». Мы уже имели `tg-proxy.azarean.ru` для oauth.telegram.org — расширение на bot API заняло 15 минут вместо часов.
3. **DPI-блокировки по SNI не таргетируют конкретный сервер — они работают на пути.** Поэтому смена IP, бэкенда, домена через CNAME не помогает. Помогает только обход через другой сетевой путь (другая страна, прокси, VPN, MTProto).
4. **Telegraf URL-resolution — нестандартный момент.** `apiRoot` с path-prefix требует trailing slash. Это документировано в Telegraf, но легко упустить. Записано в memory — впредь не наступим.
5. **Совпадения по времени запутывают диагностику.** Пользователь связал инцидент с deploy rehab («после deploy упало»). На самом деле deploy был неудачным совпадением — rehab упал из-за общей блокировки, а не из-за своих изменений. Первое, что делаем при диагностике: проверяем, действительно ли есть причинно-следственная связь, или это `post hoc ergo propter hoc`.

---

## Связанные документы

- [project_telegram_proxy_via_fi.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\project_telegram_proxy_via_fi.md) — техническая схема прокси
- [lessons_telegraf_apiroot_trailing_slash.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\lessons_telegraf_apiroot_trailing_slash.md) — урок про trailing slash
- [project_bot_health_monitoring.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\project_bot_health_monitoring.md) — watchdog v3 (работает поверх прокси без изменений)
- [project_finnish_vds_ipv6_flap.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\project_finnish_vds_ipv6_flap.md) — побочно починен через resolver `ipv6=off`
- [reference_vpn_outage_diagnostics.md](C:\Users\Вадим\.claude\projects\c--Users-------Desktop-jarvis-director\memory\reference_vpn_outage_diagnostics.md) — 4-тестовый чек-лист DPI/хостер/РКН
