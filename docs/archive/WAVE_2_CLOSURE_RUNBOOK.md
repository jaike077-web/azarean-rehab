# Wave 2 Closure Runbook — Internal Pilot Deploy

**Дата:** 2026-05-19
**Scope:** Internal studio pilot (НЕ публичный запуск)
**Цель:** 14 PR ⏸ stack → production на VDS 185.93.109.234 → smoke с тестовым пациентом
**Аудитория:** Vadim (ops execution)
**Ожидаемое время:** 4-6 часов wall clock (с перерывами на проверки)

---

## Pre-flight — что должно быть в порядке до старта

- [ ] Stack 14 PR ⏸ на feature branches, последний commit `4f97006` (TZ 2.09)
- [ ] `main` ветка = `f7ef711` (с PR #67 dark theme как опциональным extra — см. Phase 4)
- [ ] SSH-доступ к VDS `185.93.109.234` (NetAngels)
- [ ] PostgreSQL 18 на VDS работает, текущая БД `azarean_rehab` (или название аналогичное JARVIS)
- [ ] `pg_dump pre_hf9` бэкап существует (НЕ удалять до конца runbook)
- [ ] PM2 установлен на VDS (как для JARVIS)
- [ ] nginx установлен на VDS, текущий config обслуживает `jarvis.azarean.ru`
- [ ] Cloudflare / DNS panel доступ для добавления A-записей если нужно

**Не блокеры (для pilot, не public launch):**
- ~~Полный compliance pass~~ → минимальный disclaimer в Phase 3
- ~~Лендинг с маркетингом~~ → нет публичного входа, юзеры по приглашению
- ~~ToS / Privacy Policy в полном объёме~~ → отдельный track REGULATORY_GAP.md
- ~~Языковые нормы вычитаны 100%~~ → быстрый sweep в Phase 3, остальное retroactively

---

## Phase 1 — Local validation (deferred smoke)

**Цель:** убедиться что Block C Tier 1 + photo flow работают на dev перед merge.

### 1.1. Запусти dev environment

```bash
# Terminal A — backend
cd c:/Users/Вадим/Desktop/Azarean_rehab/backend
npm run dev
# Backend на :5000

# Terminal B — frontend
cd c:/Users/Вадим/Desktop/Azarean_rehab/frontend
npm start
# CRA на :3001
```

### 1.2. Smoke 2.08 — 5 сценариев

Логинимся как `avi707@mail.ru` / `Test1234` (test patient id=14).

- [ ] **Card 1:** Открыть «Замеры» tab. Tab navigation работает, header "Замеры" виден, форма пустая, список истории пустой (или с тестовыми данными если есть).
- [ ] **Card 2:** POST ROM single side — выбрать «ROM», тип «Сгибание колена», single side L, value 90°, notes "тест". Submit → toast success, запись появилась в истории внизу.
- [ ] **Card 3:** POST bilateral pair — выбрать «ROM», тип «Разгибание колена», toggle bilateral ON, L=0°, R=2°, submit. Network DevTools: два POST request'а, оба с одинаковым `measurement_session_id` (Date.now() millis, BIGINT).
- [ ] **Card 4:** POST HBB categorical — выбрать «Hand Behind Back», categorical picker открылся, выбрать «L3», submit. Network: `value: "L3"` (string, NOT number).
- [ ] **Card 5:** Frontend validation — попытаться ввести `value=500` в ROM → toast error до API call. Network: НЕ должно быть запроса.

**Если все 5 ✅ → Phase 1.2 done.**
**Если что-то 🔴 → STOP, фиксим перед deploy.**

### 1.3. Smoke 2.09 — 4 сценария

- [ ] **Card 1:** First user, cancel consent — найти ROM entry без фото → «Добавить фото» → ConsentDialog открылся → «Отмена» → dialog закрылся, НЕ было POST /api/patient-auth/photo-consent.
- [ ] **Card 2:** First user accept + upload — «Добавить фото» → checkbox + «Принять» → POST consent 200 + toast «Согласие получено» → file picker открылся → выбрать JPEG ~1MB → POST `/api/rehab/my/rom/:id/photo` 200 → toast «Фото загружено» → thumbnail появился в карточке.
- [ ] **Card 3:** Returning user — другой ROM entry без фото → «Добавить фото» → ConsentDialog НЕ открылся, file picker напрямую → upload → success.
- [ ] **Card 4:** Photo viewer — click thumbnail → modal открылся с blob URL → click overlay → закрылся → reopen → click сам image → НЕ закрылся (stopPropagation) → Esc → закрылся.

**Если все 9 сценариев ✅ → переходим к Phase 2.**

---

## Phase 2 — Test suite sanity

**Цель:** последний commit `4f97006` должен пройти полный test suite без флейков.

```bash
# Backend tests
cd backend
npm test
# Expected: 30 suites, 592 tests, all green

# Frontend tests
cd ../frontend
npm test -- --watchAll=false
# Expected: 25 suites, 338 tests, all green
```

**Если красные:** STOP, выясни причину (схема, окружение, env vars). НЕ deploy с красными тестами.

**Per-PR sequential check НЕ нужен** — если последний commit зелёный, история чистая (no batching между PR делало промежуточные коммиты тоже зелёными).

---

## Phase 3 — Pre-deploy disclaimers + language sweep

**Цель:** минимум регуляторных touch'ей для pilot.

### 3.1. Welcome screen disclaimer

Добавить **одну строку** в Welcome или Profile screen:

> *Это пилотная версия приложения студии Azarean Network для удобства между визитами. Не является медицинской услугой. По всем медицинским вопросам обращайтесь к вашему лечащему врачу.*

Где разместить — на твоё усмотрение. Минимум — Profile screen внизу, серым мелким шрифтом. Идеально — Welcome onboarding modal при первом логине.

Коммит в новой ветке `chore/pilot-disclaimer` от `4f97006`, merge как 15-й PR.

### 3.2. Quick language sweep

```bash
# Найти forbidden слова в patient-visible UI strings
cd frontend/src
grep -rEn '\b(реабилитация|лечение|врач|диагноз|терапия)\b' --include="*.js" --include="*.css" components/ context/ services/
```

**Что делаем:**
- Если матч в **внутреннем коде** (комментарии, переменные, console.log) — игнор, fix retroactively
- Если в **patient-visible string** (label, header, toast text, error message) — заменить:
  - «реабилитация» → «восстановление»
  - «лечение» → «программа восстановления» / «тренировка»
  - «врач» → «специалист» / «инструктор ЛФК»
  - «диагноз» → «оценка состояния»
  - «терапия» → «программа»
  - «пациент» в UI → «клиент» (внутри кода `req.patient` оставить — это другая semantics)

**Соблюдение не 100%, а baseline.** Если что-то торчит на главных экранах — фикс. Если глубоко зарыто и редко видно — backlog для Wave 3.

Commit как `chore/language-baseline` от `chore/pilot-disclaimer`.

### 3.3. Stack теперь 16 PR

```
af313b4 → ... → 4f97006(2.09) → <disclaimer> → <language baseline>
```

---

## Phase 4 — PR #67 dark theme merge

**Цель:** dark theme fix должен оказаться в main до Wave 2 batch merge.

```bash
git checkout main
git pull origin main
git log --oneline | head -5
# Если 16ed04c (dark theme fix) НЕ в выводе → нужно мержить

git merge --no-ff 16ed04c -m "Merge PR #67: dark theme CSS Modules fix"
git push origin main
```

**Если уже в main** — skip этот step.

---

## Phase 5 — Batch merge Wave 2

**Цель:** 16 PR ⏸ → main, в строгом chronological order.

### 5.1. Pre-merge check

```bash
git checkout main
git pull origin main
git log -1 --format="%H %s"
# Должен быть последний из 16ed04c или f7ef711
```

### 5.2. Sequential merge

Один-в-один по списку (с disclaimer + language commits):

```bash
# Шаблон для каждого PR
git merge --no-ff <commit> -m "Wave 2: <description>"

# По порядку:
git merge --no-ff af313b4 -m "Wave 2.01: schema migrations"
git merge --no-ff a6f7980 -m "Wave 2.02: pain backend"
git merge --no-ff 82544c0 -m "Wave 2.03: pain UI"
git merge --no-ff 98ca5f2 -m "Wave 2 HF7: CSS Modules fix"
git merge --no-ff e6f11a9 -m "Wave 2 HF8: CSS orphans cleanup"
git merge --no-ff edd9e06 -m "Wave 2.04: PainEventForm"
git merge --no-ff a2ecad6 -m "Wave 2.05: reusable UI components"
git merge --no-ff d6a0b36 -m "Wave 2 HF9 v2: array CHECK + ON CONFLICT"
git merge --no-ff a206c24 -m "Wave 2 HF10: timezone + chip CSS + z-index"
git merge --no-ff c33cac8 -m "Wave 2.06: measurements backend"
git merge --no-ff 73e558e -m "Wave 2 HF11: session_id BIGINT"
git merge --no-ff d55203c -m "Wave 2.07: photo + consent backend"
git merge --no-ff 83b1d53 -m "Wave 2.08: measurements frontend Tier 1"
git merge --no-ff 4f97006 -m "Wave 2.09: photo capture + ConsentDialog"
git merge --no-ff <disclaimer-commit-hash> -m "Pilot disclaimer in Welcome/Profile"
git merge --no-ff <language-commit-hash> -m "Language baseline sweep"
```

**Если conflict на каком-то merge:**
- `git merge --abort`
- Чек что конфликт реальный (не false positive от --no-ff)
- Fix manually на ветке этого PR
- Force-rebase следующие PR на новый базис
- Re-attempt merge

### 5.3. Tag release

```bash
git tag -a v0.1.0-pilot -m "Wave 2 closure — internal studio pilot"
git push origin main --tags
```

### 5.4. Build artifacts locally

```bash
cd frontend
npm ci
npm run build
# Создаётся frontend/build/ — статика для nginx

cd ../backend
npm ci --production
# Готово к копированию на VDS
```

---

## Phase 6 — DNS + nginx на VDS

**Цель:** my.azarean.ru обслуживает frontend, api.azarean.ru обслуживает backend, JARVIS не задет.

### 6.1. DNS check

```bash
# С локальной машины
dig my.azarean.ru +short
dig api.azarean.ru +short
```

**Ожидание:** оба возвращают `185.93.109.234`.

**Если НЕ резолвится:**
- Заходишь в DNS panel (где сейчас зарегистрирован azarean.ru — Cloudflare / Reg.ru / другой)
- Добавляешь два A-record:
  - `my` → `185.93.109.234`
  - `api` → `185.93.109.234`
- TTL 300 сек (на случай если что-то быстро менять надо)
- Ждёшь распространения (5-15 минут)

### 6.2. SSH на VDS

```bash
ssh root@185.93.109.234
# Или твой обычный user если не root
```

### 6.3. Nginx config

Создаёшь два новых server block'а. **НЕ трогаем** существующий `jarvis.azarean.ru` config.

```bash
sudo nano /etc/nginx/sites-available/azarean-rehab
```

Содержание (адаптируй под существующий jarvis config — TLS, security headers могут быть в snippets):

```nginx
# Frontend — my.azarean.ru
server {
    listen 80;
    server_name my.azarean.ru;

    # Redirect to HTTPS после certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name my.azarean.ru;

    # SSL — будет настроен certbot
    # ssl_certificate /etc/letsencrypt/live/my.azarean.ru/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/my.azarean.ru/privkey.pem;

    root /var/www/azarean-rehab/frontend/build;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri /index.html;
    }

    # Static assets кеш
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}

# Backend — api.azarean.ru
server {
    listen 80;
    server_name api.azarean.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.azarean.ru;

    # ssl_certificate /etc/letsencrypt/live/api.azarean.ru/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.azarean.ru/privkey.pem;

    # Photo uploads до 10MB
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # Photos serve directly если хочется bypass Node (опционально, для производительности)
    # location /api/rehab/my/rom/.*/photo {
    #     proxy_pass http://127.0.0.1:5000;
    #     # JWT в Node остаётся обязательным
    # }
}
```

### 6.4. Активация config

```bash
sudo ln -s /etc/nginx/sites-available/azarean-rehab /etc/nginx/sites-enabled/azarean-rehab
sudo nginx -t
# Expected: syntax is ok, test is successful
sudo systemctl reload nginx
```

### 6.5. Let's Encrypt сертификаты

```bash
sudo certbot --nginx -d my.azarean.ru -d api.azarean.ru
# Follow prompts. Certbot автоматически обновит nginx config с SSL.
```

После — раскомментируй `ssl_certificate` строки если certbot не сделал автоматически, и `sudo systemctl reload nginx`.

**Verification:**
```bash
curl -I https://my.azarean.ru
curl -I https://api.azarean.ru/api/health
# Оба должны вернуть HTTP 200 или 404 (не 502 — это nginx работает, backend ещё не запущен это норма)
```

---

## Phase 7 — Database migrations apply

**ВНИМАНИЕ:** этот шаг изменяет prod БД. Бэкап ОБЯЗАТЕЛЕН.

### 7.1. Pre-migration backup

```bash
# На VDS
sudo -u postgres pg_dump azarean_rehab > ~/backups/pre_wave2_$(date +%Y%m%d_%H%M).sql
ls -lh ~/backups/
# Verify размер adequately
```

### 7.2. Migration check

```bash
cd /var/www/azarean-rehab/backend
# Если уже скопирован код, иначе scp / git clone сначала (см. Phase 8.1)

# Список миграций к применению
ls database/migrations/ | sort | tail -20
# Должны быть от 20260116 примерно до 20260519, всего 33 файла. До этой точки на prod — 16 (Wave 1 + ранние Wave 2).

# Текущее состояние prod
sudo -u postgres psql -d azarean_rehab -c "SELECT version FROM migrations ORDER BY version DESC LIMIT 5;"
# Если у тебя другая схема migrations tracking — адаптируй query
```

### 7.3. Run migrations

```bash
cd /var/www/azarean-rehab/backend
NODE_ENV=production npm run migrate
# Или прямой вызов: node database/runMigrations.js
```

**Expected output:** "17 migrations applied" (с 16 до 33), no errors.

**Verification:**
```bash
sudo -u postgres psql -d azarean_rehab -c "\dt" | head -40
# Должны появиться: pain_entries, rom_measurements, girth_measurements, phase_transition_criteria и т.д.

sudo -u postgres psql -d azarean_rehab -c "\d patients" | grep photo_consent_at
# Колонка должна быть
```

### 7.4. Rollback procedure (если что-то поломалось)

```bash
# Восстановление из бэкапа
sudo -u postgres dropdb azarean_rehab
sudo -u postgres createdb azarean_rehab
sudo -u postgres psql azarean_rehab < ~/backups/pre_wave2_<timestamp>.sql
# Проверь что count(*) совпадают с pre-migration

# Откатываемся, не deploy'имся, разбираемся в чём проблема
```

---

## Phase 8 — PM2 deploy

### 8.1. Деплой кода

**Вариант A — git pull (если репо clone'нут на VDS):**

```bash
cd /var/www/azarean-rehab
sudo git fetch origin main
sudo git checkout v0.1.0-pilot
sudo chown -R deploy:deploy .  # или твой user
```

**Вариант B — scp с локальной машины:**

```bash
# Локально
rsync -avz --exclude node_modules --exclude .git \
    c:/Users/Вадим/Desktop/Azarean_rehab/ \
    deploy@185.93.109.234:/var/www/azarean-rehab/
```

### 8.2. Backend dependencies + env

```bash
# На VDS
cd /var/www/azarean-rehab/backend
npm ci --production
```

**`.env.production`** должен содержать:
- `DATABASE_URL` — prod PG connection
- `JWT_SECRET` (instructor) — отдельный от dev
- `PATIENT_JWT_SECRET` — отдельный от dev
- `OPS_BOT_TOKEN` + `OPS_CHAT_ID` (твой Telegram chat для alerts)
- `TELEGRAM_BOT_TOKEN` для patient-facing bot
- `UPLOAD_DIR=/var/www/azarean/uploads/measurements`
- `NODE_ENV=production`
- `PORT=5000`
- `FRONTEND_ORIGIN=https://my.azarean.ru` (для requireSameOrigin / CORS)

**Создай upload dir** если не существует:
```bash
sudo mkdir -p /var/www/azarean/uploads/measurements
sudo chown deploy:deploy /var/www/azarean/uploads/measurements
sudo chmod 750 /var/www/azarean/uploads/measurements
```

### 8.3. Frontend build deployment

Если build делал локально:
```bash
# Локально
scp -r frontend/build/ deploy@185.93.109.234:/var/www/azarean-rehab/frontend/
```

Если на VDS:
```bash
cd /var/www/azarean-rehab/frontend
npm ci
REACT_APP_API_BASE=https://api.azarean.ru npm run build
```

### 8.4. PM2 ecosystem config

```bash
cd /var/www/azarean-rehab
nano ecosystem.config.js
```

```js
module.exports = {
  apps: [
    {
      name: 'azarean-rehab-backend',
      cwd: '/var/www/azarean-rehab/backend',
      script: './server.js',  // или index.js — в зависимости от entrypoint
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: '/var/log/azarean-rehab/error.log',
      out_file: '/var/log/azarean-rehab/out.log',
      max_memory_restart: '500M',
      restart_delay: 4000
    }
  ]
};
```

```bash
sudo mkdir -p /var/log/azarean-rehab
sudo chown deploy:deploy /var/log/azarean-rehab

pm2 start ecosystem.config.js
pm2 save
pm2 startup  # follow output для enable on boot
```

### 8.5. Verify

```bash
pm2 status
# azarean-rehab-backend should be online

pm2 logs azarean-rehab-backend --lines 50
# No errors on startup

curl https://api.azarean.ru/api/health
# Expected: 200 OK или твой health endpoint response
```

---

## Phase 9 — Production smoke (10 шагов)

Из браузера (не curl), как тестовый пациент.

- [ ] **1.** Открыть `https://my.azarean.ru` — login screen загружается без ошибок console
- [ ] **2.** Login as `avi707@mail.ru` / `Test1234` — попадает в PatientDashboard, главный экран рендерится
- [ ] **3.** TabBar: проверить все 5+ tabs кликабельны (Главная, Боль, Замеры, Дневник, Профиль)
- [ ] **4.** Создать pain entry — выбрать локации, VAS=5, character, trigger, notes → submit → success toast → запись в истории
- [ ] **5.** Создать ROM measurement — flexion knee L 90° → submit → запись в истории
- [ ] **6.** Bilateral measurement — extension knee bilateral L=0° R=2° → submit → две записи same session_id
- [ ] **7.** Photo upload — ROM entry без фото → «Добавить фото» → ConsentDialog (первый раз) → accept → file picker → выбрать JPEG → upload → thumbnail
- [ ] **8.** Photo view — click thumbnail → modal с blob URL → Esc close
- [ ] **9.** Diary entry — pain/swelling/mobility/mood/sleep → save → запись
- [ ] **10.** Logout + re-login — session restore не падает (F5 flicker bug — known issue, не блокер)

**Параллельно — Telegram bot:**
- [ ] Test patient привязан к Telegram (id=14) — проверь что получает /status command response
- [ ] /diary command — 6-step wizard работает
- [ ] Scheduler: дождись 12:00 МСК → /tip arrives. Дождись 21:00 МСК → diary reminder

**Если 10/10 ✅ → Wave 2 closure DONE.**

**Если что-то 🟡 cosmetic** (flicker, mobile layout off) — backlog для Wave 3, не блокер.

**Если что-то 🔴 critical** (login broken, photo не загружается, scheduler не работает) — STOP, rollback per Phase 11.

---

## Phase 10 — Post-deploy housekeeping

### 10.1. Announce to studio team

Telegram сообщение Татьяне + Алёне:
> Pilot версия my.azarean.ru развёрнута. Логин: <выдай по DM>. Пилот закрытый, никому не показывайте до отдельного разрешения. Фидбек собираем через нас лично или в нашем рабочем чате.

### 10.2. Wave 3 transition note

После недели pilot use → начинаем Wave 3 planning. Первые два TZ (предварительно):

1. **TZ 3.01 — Patient PDF export** (Pattern B implementation phase 1)
   - Кнопка «Поделиться с врачом» в Profile или Roadmap
   - PDF генерация (jsPDF или server-side puppeteer): ROM history graph, pain log, exercise completion, photos с метками
   - Download to phone

2. **TZ 3.02 — Engagement & Retention module (early warning)**
   - Curator alerts: 3+ дня без захода, рост VAS без следующей записи, нет упражнений 7+ дней
   - Адаптивная программа: при regression — pause progression + alert

**Markup canvas (бывший TZ 2.10)** — после Engagement (Wave 3.03), не первым. Pilot покажет нужен ли он.

### 10.3. Monitoring базовый

```bash
# На VDS — добавь в crontab
crontab -e
```

```cron
# Daily DB backup at 03:30 МСК
30 3 * * * sudo -u postgres pg_dump azarean_rehab | gzip > /home/deploy/backups/daily_$(date +\%Y\%m\%d).sql.gz

# Cleanup backups older than 30 days
0 4 * * * find /home/deploy/backups/ -name "daily_*.sql.gz" -mtime +30 -delete
```

PM2 уже даёт автоrestart на crash + logs. Этого хватит для pilot. Polish — Wave 3+.

---

## Phase 11 — Rollback playbook (если что-то пошло не так)

### Если migrations failed (Phase 7)

```bash
# Восстанови БД из pre-migration backup
sudo -u postgres dropdb azarean_rehab
sudo -u postgres createdb azarean_rehab
sudo -u postgres psql azarean_rehab < ~/backups/pre_wave2_<timestamp>.sql
```

App остаётся в pre-Wave-2 состоянии. Разбираешься в логах что не так.

### Если PM2 start failed (Phase 8)

```bash
pm2 logs azarean-rehab-backend --err --lines 100
# Прочитай stderr — обычно env vars или DB connection

# Если миграции применены но app не стартует:
# Backend rollback к pre-Wave-2 коду:
cd /var/www/azarean-rehab
sudo git checkout <previous-tag-or-commit>
cd backend && npm ci --production
pm2 restart azarean-rehab-backend
```

**При этом** prod БД уже с новыми таблицами — old код их не использует, но они не мешают. Главное — миграции **additive**, не drop column'ов.

### Если smoke failures (Phase 9) — критичные

Если **login broken** или **app не загружается вообще**:

```bash
# Frontend rollback: restore previous build из backup ИЛИ
# rebuild с previous tag
cd /var/www/azarean-rehab
git checkout <previous-tag>
cd frontend && npm ci && REACT_APP_API_BASE=https://api.azarean.ru npm run build

# Backend rollback аналогично
cd ../backend && npm ci --production
pm2 restart azarean-rehab-backend
```

### Если nginx config поломан

```bash
# Backup существующего config был сделан?
ls -lh /etc/nginx/sites-available/azarean-rehab.backup-* 2>/dev/null

# Удалить новый, restore old
sudo rm /etc/nginx/sites-enabled/azarean-rehab
sudo nginx -t && sudo systemctl reload nginx
# JARVIS должен работать как и работал
```

**Принцип rollback:** **JARVIS никогда не должен быть в downtime** из-за наших действий. Если что-то ломает JARVIS — немедленно rollback nginx changes.

---

## Definition of Done

- [ ] Phase 1: 9 local smoke scenarios passed
- [ ] Phase 2: 30 backend suites + 25 frontend suites green
- [ ] Phase 3: Pilot disclaimer + language baseline committed
- [ ] Phase 4: PR #67 в main (или verified в main)
- [ ] Phase 5: 16 PR batch merged + tag `v0.1.0-pilot` pushed
- [ ] Phase 6: my.azarean.ru + api.azarean.ru с valid SSL отвечают
- [ ] Phase 7: 17 migrations applied, pre-backup сохранён
- [ ] Phase 8: PM2 azarean-rehab-backend online, frontend build deployed
- [ ] Phase 9: 10/10 prod smoke passed
- [ ] Phase 10: Команда уведомлена, daily backup в crontab
- [ ] JARVIS на jarvis.azarean.ru продолжает работать без задержек

**Когда всё ✅** — Wave 2 закрыт, у тебя production internal pilot system, можно запускать живых клиентов студии.

---

## После closure — Wave 3 kickoff

Vadim вернётся в архитектурный chat через 1-2 недели pilot use с:
- Фидбеком от Татьяны / Алёны / 5-10 клиентов
- Решением: какие фичи приоритизировать в Wave 3
- Возможно — discovery про новые pain points которые pilot выявил

Тогда пишу TZ 3.01 (PDF export per Pattern B), TZ 3.02 (Engagement & Retention), и т.д.

**Markup canvas** (бывший TZ 2.10) — рассмотрим после фидбека: если клиенты + Татьяна говорят «фотки полезны, но я не понимаю что замерять на них» — markup в раннем Wave 3. Если фотки сами по себе работают как documentation — markup можно отложить дальше.

---

*Generated by Claude Opus 4.7 — 2026-05-19, после Block C closure + Pattern B decision.*
*Internal pilot scope. Public launch — отдельный runbook когда подойдёт.*
