# Azarean Rehab — Deploy Runbook

Файлы в этой папке обеспечивают production-деплой на shared VDS `185.93.109.234` (где уже работает JARVIS Director).

**Домен:** `https://my.azarean.ru` (single-origin, frontend + API через один nginx vhost).

---

## Структура

| Файл | Назначение |
|---|---|
| `nginx-my-azarean.conf` | Nginx server block (http + https + SPA routing + `/api` proxy) |
| `ecosystem.config.js` | PM2 fork-mode конфиг, `NODE_OPTIONS=--dns-result-order=ipv4first` |
| `setup.sh` | **Одноразовая** инициализация VDS (БД, юзер, nginx, certbot, cron) |
| `migrate.sh` | Прогон всех миграций + seeds на prod БД |
| `backup.sh` | Ежедневный `pg_dump` в 03:15 Екб, 14 копий |
| `healthcheck.sh` | Каждые 5 минут — PM2 status + HTTP ping |
| `../backend/.env.production.example` | Шаблон .env (секреты подставляются вручную) |
| `../.github/workflows/deploy.yml` | CI/CD pipeline |

---

## Архитектура deploy'я

```
     GitHub main branch
            │ push
            ▼
  GitHub Actions (deploy.yml)
            │
            ├── test (backend + frontend)
            ├── build (frontend: CRA → build/, backend prod deps)
            └── deploy:
                   ssh → /tmp/release.tar.gz
                   extract → /opt/azarean-rehab/releases/<ts>/
                   preserve existing .env
                   swap → /opt/azarean-rehab/{backend,frontend}
                   npm ci --omit=dev
                   migrate.sh
                   pm2 reload azarean-rehab
                   smoke test

  VDS (185.93.109.234)
  ├── nginx :80/:443 → my.azarean.ru
  │   ├── / → static /opt/azarean-rehab/frontend/build/
  │   └── /api/* → http://127.0.0.1:3001
  ├── PM2 azarean-rehab → /opt/azarean-rehab/backend/server.js
  └── PostgreSQL 14 localhost:5432
      ├── azarean_rehab (наша БД)
      └── jarvis_director (не трогаем!)
```

---

## Первоначальная настройка (делать ОДИН РАЗ, руками)

### Шаг 0. Подготовка локально (у тебя, jaike707@)

**Сгенерировать SSH-ключ для GitHub Actions:**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/gh-actions-azarean -N "" -C "gh-actions@azarean"
# Создаст ~/.ssh/gh-actions-azarean (приватный) + ~/.ssh/gh-actions-azarean.pub (публичный)
```

**Добавить публичный ключ на VDS:**

```bash
# С твоего компа (SSH под root через основной ключ)
ssh -i ~/.ssh/id_ed25519 root@185.93.109.234 \
  "cat >> ~/.ssh/authorized_keys" < ~/.ssh/gh-actions-azarean.pub
```

### Шаг 1. DNS (через панель NetAngels)

- `my.azarean.ru` → A → `185.93.109.234` ✅ (ты уже добавил)
- `my-api.azarean.ru` → можно удалить, не используется (single-subdomain setup)

Проверить: `nslookup my.azarean.ru` должен вернуть `185.93.109.234`.

### Шаг 2. GitHub Secrets

В репо `Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Значение |
|---|---|
| `SSH_PRIVATE_KEY` | Содержимое файла `~/.ssh/gh-actions-azarean` (**приватный**) |
| `SSH_HOST` | `185.93.109.234` |
| `SSH_USER` | `root` |

**Секреты для `.env` в GitHub НЕ кладём** — они живут на VDS в `/opt/azarean-rehab/backend/.env` под chmod 600.

### Шаг 3. Настройка VDS (ssh root@185.93.109.234)

```bash
# 3.1 Склонить репо во временное место для получения deploy-скриптов
#     (GitHub Actions сам обновит всё при первом деплое, но setup.sh нужен уже сейчас)
mkdir -p /opt/azarean-rehab/deploy
cd /tmp
git clone -b deploy-setup https://github.com/jaike077-web/azarean-rehab.git azarean-temp
cp -r /tmp/azarean-temp/deploy/* /opt/azarean-rehab/deploy/
cp    /tmp/azarean-temp/backend/.env.production.example /opt/azarean-rehab/backend/
chmod +x /opt/azarean-rehab/deploy/*.sh
rm -rf /tmp/azarean-temp

# 3.2 Запустить setup
bash /opt/azarean-rehab/deploy/setup.sh
#     ↑ задаст вопрос пароль postgres юзера — введи (запомни!)
#     ↑ скопирует .env.production.example → .env (пустой шаблон)
#     ↑ поставит nginx config
#     ↑ запросит certbot (подтверди y)
#     ↑ установит cron

# 3.3 Заполнить .env реальными секретами
nano /opt/azarean-rehab/backend/.env
#     Вставить из чата Claude Code: JWT_SECRET, PATIENT_JWT_SECRET, SESSION_SECRET
#     DB_PASSWORD — тот что ты ввёл на шаге 3.2
#     TELEGRAM_BOT_TOKEN=8733404312:AAGgWEcWDZ0WNDcQ_-zj5-ZLiJAKRpbJzF8
#     TELEGRAM_BOT_USERNAME=az_zari_bot
#     KINESCOPE_API_KEY / KINESCOPE_PROJECT_ID — скопировать из dev backend/.env

# 3.4 Проверить
ls -la /opt/azarean-rehab/backend/.env     # должно быть -rw------- root root
nginx -t && systemctl reload nginx
curl -I https://my.azarean.ru/              # 404 (ещё нет кода) — ОК
```

### Шаг 4. Первый деплой через GitHub Actions

На GitHub:
- Открыть `Actions` → `Deploy to production VDS` → `Run workflow` → выбрать ветку `main`
- Ветка `deploy-setup` после ревью должна быть смёржена в `main`, только тогда main содержит `.github/workflows/deploy.yml`

Workflow сделает:
1. Тесты (backend 197 + frontend 208)
2. Build фронтенда + упаковка
3. SSH upload → swap → `npm ci` → `migrate.sh` → `pm2 reload`
4. Smoke-test

Если всё OK — `pm2 save && pm2 startup` (чтобы процесс поднимался после reboot):

```bash
ssh root@185.93.109.234
pm2 save
pm2 startup  # скажет: «скопируй и выполни эту команду» — выполнить
```

---

## Обычный deploy (после initial setup)

Просто push в `main`:

```bash
git push origin main
```

GitHub Actions сам сделает остальное. Watch: https://github.com/jaike077-web/azarean-rehab/actions

**Zero-downtime:** `pm2 reload` не рвёт соединения — graceful.

---

## Откат (rollback)

Старые релизы лежат в `/opt/azarean-rehab/releases/<timestamp>/` (5 последних).

```bash
ssh root@185.93.109.234

# Найти предыдущий релиз
ls -lt /opt/azarean-rehab/releases/

# Swap вручную
cd /opt/azarean-rehab
mv backend backend.broken
mv frontend frontend.broken
PREV=$(ls -1t releases/ | sed -n '2p')   # предпоследний
mv releases/$PREV/backend backend
mv releases/$PREV/frontend frontend
cp backend.broken/.env backend/.env
pm2 reload azarean-rehab
curl -I https://my.azarean.ru/
```

---

## Troubleshooting

### `502 Bad Gateway`
PM2 процесс не отвечает. `pm2 logs azarean-rehab --lines 100`, `pm2 restart azarean-rehab`.

### Миграции упали
`migrate.sh` использует `--single-transaction` → частичные изменения откатились. Смотри вывод GitHub Actions log, найди какая миграция упала, проверь совместимость с PG14.

### Cookie не ставится (401 на /me)
Проверить что nginx прокидывает `X-Forwarded-Proto: https`. В `ecosystem.config.js` важен `NODE_OPTIONS=--dns-result-order=ipv4first`. SameSite=Lax — ок.

### Telegram бот не отвечает
- Токен в .env корректный? `cat /opt/azarean-rehab/backend/.env | grep TELEGRAM`
- Dev-бот остановлен? Если два процесса на одинаковый токен — polling конфликт (но у нас токены разные, проверь что не спутали).

### certbot
`certbot renew --dry-run` — проверить renewal. Auto-renew уже в cron от certbot-пакета.

### БД бэкапы
`ls -lh /opt/azarean-rehab/backups/` — 14 последних.

Восстановление:
```bash
gunzip -c /opt/azarean-rehab/backups/azarean_rehab-20260423-221500.sql.gz | \
  psql -h localhost -U azarean_user -d azarean_rehab
```

### PG14 совместимость
Проверено в deploy-setup ветке — ни одна из 20 миграций не использует PG15+ фичи (MERGE, GENERATED, `gen_random_uuid()`). Всё штатно работает.

---

## Security backlog (после первого успешного запуска)

Это MEDIUM-приоритетные hardening-задачи, которые сознательно отложены, чтобы не блокировать первый деплой. Запланировать через 2-3 недели после боевого запуска.

### 1. Non-root deploy user на VDS

**Сейчас:** GitHub Actions ходит на VDS под `root`. Если GitHub-аккаунт или репо скомпрометируется (утёкший PAT коллаборатора, malicious action в merged PR, credential stuffing) — атакующий получает root на shared VDS → доступ к JARVIS БД + возможность установить miner / использовать IP для атак.

**Правильно:**
- Создать юзера `deploy` на VDS с UID != 0
- Дать ему `chown -R deploy:deploy /opt/azarean-rehab/`
- Узкий `sudoers.d/deploy` whitelist: только `nginx reload`, `systemctl restart pm2-root`, `pm2 restart azarean-rehab`
- В `authorized_keys` для gh-actions-ключа прописать `command="..."` restriction или использовать `rrsync` для ограничения пути

**Оценка работы:** 1-2 часа для Claude Code, отдельный PR.

### 2. Healthcheck алерты в Telegram

Сейчас `healthcheck.sh` при fail рестартует PM2 и пишет в лог. **Алерты куратору/мейнтейнеру не уходят.** Если процесс падает в 3 ночи — узнаем утром из логов.

**Правильно:** отдельный TG-бот `@azarean_alerts_bot` (или webhook в Telegram) → отсылать сообщение при HTTP 5xx/timeout. 30 мин работы.

### 3. Production admin-email ≠ test patient email

`jaike707@gmail.com` сейчас используется и как admin-контакт (certbot, security-алерты), и как один из тестовых пациентов в проекте. Для prod compliance лучше разделить: `admin@azarean.ru` для сервиса, `jaike707@` только как личная почта.

### 4. `/api/health` endpoint

Healthcheck сейчас использует публичный `/api/rehab/phases?type=acl` как proxy для liveness. Это работает, но:
- Семантически `/api/health` чище (и привычнее для мониторингов)
- Можно добавить более глубокие проверки (DB ping, Kinescope reachability)

Low priority, но в будущий PR.

---

## Не делать

- **Не открывать 5432 наружу** — БД только localhost
- **Не трогать `jarvis_director` БД**
- **Не менять `authorized_keys` root'а** без предупреждения владельца VDS
- **Не запускать PM2 в cluster mode** (ESM несовместим)
- **Не забыть про `NODE_OPTIONS=--dns-result-order=ipv4first`** — IPv6 не маршрутизируется
- **Не коммитить `backend/.env`** (есть в .gitignore)

---

## Контакты при инцидентах

- Мейнтейнер Azarean: jaike707@gmail.com (он же — сам пациент id=14)
- Владелец VDS (JARVIS): @тот-же-мейнтейнер
- Telegram bot prod: `@az_zari_bot` (token в .env)
- Telegram bot dev: `@azarean_rehab_bot`
