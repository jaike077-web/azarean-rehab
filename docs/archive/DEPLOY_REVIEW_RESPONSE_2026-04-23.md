# Ответ на review архитектора по deploy-плану

**Дата:** 2026-04-23
**Для:** архитектор проекта
**Ветка:** `deploy-setup` (коммит `4a70e1a`)
**Предыдущий коммит:** `5855102` (initial deploy infrastructure)

---

## 1. Ответы на 3 вопроса

### Q1. Почему backend на :3001 вместо :5000 как в dev?

**Специально :3001 — из брифа JARVIS-архитектора** (раздел 5 «Свободно для Azarean rehab»):

> Порт: 3001 (или любой 3001-3846, 3848-8442)

Это согласованное распределение портов на shared VDS. `:5000` — только в dev на локалке, к VDS отношения не имеет.

**Консистентность проверена** — все 4 места используют `:3001`:

| Файл | Строка |
|---|---|
| `deploy/ecosystem.config.js:55` | `PORT: 3001` |
| `deploy/nginx-my-azarean.conf:85` | `proxy_pass http://127.0.0.1:3001;` |
| `deploy/healthcheck.sh:14` | `PORT=3001` |
| `backend/.env.production.example:13` | `PORT=3001` |

### Q2. Healthcheck — какой URL пингает, что делает при fail?

**URL:** `http://127.0.0.1:3001/api/rehab/phases?type=acl` — публичный endpoint (без auth), возвращает JSON с 6 фазами ACL. Если 200 — и backend, и БД живы (phases читаются из rehab_phases таблицы). Нет необходимости создавать отдельный `/api/health` — existing endpoint покрывает liveness.

**При fail:**
- HTTP code ≠ 200 или timeout 10s → `pm2 restart azarean-rehab`
- Лог в `/var/log/azarean-rehab-health.log`
- **Telegram-алерты не отправляются** — согласен что стоит добавить, но это отдельная работа (нужен канал/бот для алертов). Занесено в Security backlog пункт 2.

**Частота:** каждые 5 минут через `/etc/cron.d/azarean-rehab-healthcheck` (ставится в `setup.sh`).

### Q3. `pm2 save && pm2 startup` автоматизировано?

**Было:** нет, только ручная инструкция в README. Это легко забыть → после reboot VDS процесс не поднимется. **Косяк, исправлен.**

**Стало (коммит `4a70e1a`):**

**setup.sh шаг 6** — `pm2 startup systemd -u root --hp /root`:
- Проверяет `systemctl list-unit-files | grep pm2-root.service` — идемпотентно
- Регистрирует systemd-юнит если его ещё нет
- Плюс `pm2 save` сразу после (сохраняет пустой список — нормально)

**deploy.yml** — `pm2 save` **после** каждого `pm2 start` или `pm2 reload`:
- При первом deploy: `pm2 start ecosystem.config.js` → `pm2 save` → список с `azarean-rehab` зафиксирован
- При reboot VDS: systemd запустит `pm2-root.service` → PM2 восстановит сохранённый список → `azarean-rehab` поднимется

---

## 2. Что изменилось в коде по review

Коммит `4a70e1a` в `deploy-setup`, 3 файла, +58/-2 строк:

### `deploy/setup.sh` — блок 6 переписан

```bash
# 6a. pm2 startup — регистрируем PM2 как systemd-сервис
PM2_STARTUP_DONE=$(systemctl list-unit-files 2>/dev/null | grep -c "pm2-root.service" || echo "0")
if [ "$PM2_STARTUP_DONE" = "0" ]; then
  pm2 startup systemd -u root --hp /root
fi

# 6b. pm2 save — всегда безопасно
pm2 save || true
```

### `.github/workflows/deploy.yml` — блок PM2

```yaml
if pm2 describe ${{ env.PM2_NAME }} >/dev/null 2>&1; then
  pm2 reload ${{ env.PM2_NAME }} --update-env
else
  pm2 start "\$APP_DIR/deploy/ecosystem.config.js"
fi
# pm2 save — обязательно после каждого старта/reload'a
pm2 save
```

### `deploy/README.md` — новая секция **«Security backlog»**

Зафиксированы 4 hardening-задачи на после launch:

1. **Non-root deploy user** — сейчас GitHub Actions ходит под `root`. Согласен с оценкой архитектора: для текущего этапа (2 тестовых пациента) допустимо, но для production с реальными ПДн 152-ФЗ — блокер compliance. **Приоритет MEDIUM, 1-2 часа работы, отдельный PR через 2-3 недели после запуска.**
2. **Healthcheck Telegram-алерты** — сейчас только логи
3. **Admin-email отдельный от test-patient** — `jaike707@gmail.com` используется и там и там, для prod стоит разделить
4. **`/api/health` endpoint** — сейчас используется `/api/rehab/phases` как proxy для liveness, дополнительный health endpoint чище для мониторинга

---

## 3. Точки консенсуса с архитектором

Архитектор подтвердил, что одобряет следующие архитектурные решения:

| Решение | Статус |
|---|---|
| Single-subdomain `my.azarean.ru` вместо двух (frontend + API через один nginx vhost) | ✅ одобрено: CORS не нужен, CSRF работает из коробки, один SSL-сертификат |
| GitHub Actions CI/CD с первого дня (вместо ручного scp+ssh) | ✅ одобрено: меньше ошибок, автотесты до деплоя, zero-downtime |
| PG14 совместимость миграций — аудит выполнен | ✅ одобрено: ни одна из 20 миграций не использует PG15+ features |
| Отдельный `@az_zari_bot` для prod (dev-бот `@azarean_rehab_bot` не трогаем) | ✅ одобрено: решает проблему polling-конфликта |
| `NODE_OPTIONS=--dns-result-order=ipv4first` + fork mode PM2 | ✅ одобрено: тот же подход что у JARVIS |
| Отдельный SSH-ключ для Actions (не личный) | ✅ одобрено |
| `azarean_user` PG-юзер отдельный от системного `postgres` | ✅ одобрено |

---

## 4. Открытые замечания — low priority

Один момент, который архитектор поднял, но он не блокирует запуск:

**Backup ownership:** `backup.sh` делает `pg_dump` от `azarean_user`, restore команда в README тоже от `azarean_user`. `azarean_user` — owner БД `azarean_rehab`, так что прав на dump/restore хватает. Extensions не используются (проверено — `CREATE EXTENSION` в миграциях нет). **Проблема не возникнет.** Если когда-нибудь добавим расширения (например `pg_stat_statements` для мониторинга) — надо будет delegate superuser-шаг при restore.

---

## 5. Текущий статус deploy'я

- [x] Все deploy-файлы написаны, проверены, closed-loop по review архитектора
- [x] Ветка `deploy-setup` запушена на GitHub, main не тронут
- [x] Prod-секреты сгенерены и переданы мейнтейнеру (JWT_SECRET, PATIENT_JWT_SECRET, SESSION_SECRET, DB_PASSWORD)
- [x] DNS `my.azarean.ru` → `185.93.109.234` пропагейтнулся (проверено через 8.8.8.8)
- [ ] **Ждём:** мейнтейнер генерирует SSH-ключ для Actions → добавляет на VDS → настраивает GitHub Secrets
- [ ] **Ждём:** мейнтейнер SSH на VDS → клонирует `deploy-setup` ветку → запускает `setup.sh` → заполняет `.env`
- [ ] **После этого:** merge `deploy-setup` → `main` → автотриггер первого деплоя через Actions
- [ ] Smoke-test https://my.azarean.ru/ + логин тестового пациента/инструктора

Мейнтейнер ведётся пошагово в чате с Claude Code, сейчас на **Шаге 1 (локальная генерация SSH-ключа)**.

---

## 6. После первого успешного запуска

Мониторинг на 24-48 часов:
- Логи `pm2 logs azarean-rehab` на ошибки
- `/var/log/azarean-rehab-health.log` — healthcheck каждые 5 мин
- `/opt/azarean-rehab/backups/` — первый ночной `pg_dump` в 03:15 Екб (22:15 UTC)
- В DevTools пациента: cookies `patient_access_token` с флагами Secure+HttpOnly+SameSite=Lax

Затем — открытие следующих задач:
- Security hardening PR (non-root deploy user)
- `/api/health` endpoint
- Telegram-алерты от healthcheck

---

**Ответственный за деплой:** jaike707@gmail.com (мейнтейнер)
**Вопросы по коду:** Claude Code в текущем чате
**Финальный статус будет обновлён после smoke-теста.**
