# Wave 2 Closure Runbook v2 — Internal Pilot Deploy

**Дата:** 2026-05-19
**Scope:** Internal studio pilot
**Цель:** 14 PR ⏸ stack → production на `my.azarean.ru` через CI/CD
**Базируется на 4 source files:** `.github/workflows/deploy.yml`, `deploy/migrate.sh`, `deploy/nginx-my-azarean.conf`, `deploy/ecosystem.config.js`
**Ожидаемое время:** 2-3 часа wall clock (CI делает 80% работы)

---

## Pre-flight

- [ ] Stack 14 PR ⏸ на feature branches, последний `4f97006` (TZ 2.09)
- [ ] `main` ветка = `f7ef711`
- [ ] Локальный `dev` environment работает (backend :5000, frontend :3001)
- [ ] SSH доступ к VDS `185.93.109.234` (для one-time pre-deploy step и emergency rollback)
- [ ] `.env.production` уже стоит на VDS в `/opt/azarean-rehab/backend/.env`. **Если нет — заранее SSH туда и поставить.**
- [ ] GitHub Actions secrets настроены: `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`
- [ ] PostgreSQL 18 на VDS, БД `azarean_rehab` существует с pre-Wave-2 schema

### Pre-flight verification: backup infrastructure работает

Daily backup активен с 2026-04-23 — verify перед стартом:

```bash
ssh root@185.93.109.234
```

```bash
# 1. Cron entry установлен
cat /etc/cron.d/azarean-rehab-backup
# Expected: cron line с 22:15 UTC + path к deploy/backup.sh

# 2. Recent backups существуют (за последние 14 дней должны быть файлы)
ls -lah /opt/azarean-rehab/backups/ | head -20
# Expected: azarean_rehab-YYYYMMDD-HHMMSS.sql.gz файлы с recent timestamps

# 3a. Log без ошибок последние дни
tail -30 /var/log/azarean-rehab-backup.log
# Expected: "Backup OK" каждый день в 22:15 UTC, "Хранится копий: N" (N ≤ 14)

# 3b. Backup script на месте и executable
ls -la /opt/azarean-rehab/deploy/backup.sh
# Expected: -rwx... права + recent mtime
```

Если все три ✅ — Pre-flight passed.
Если что-то 🔴 — STOP, фиксим backup ДО Wave 2 deploy. (Wave 2 не может быть задеплоен без working backup — это страховка для всего runbook'а.)

**НЕ устанавливать новый cron** — он уже там с 2026-04-23. Re-install создаст дублирование.

**Что отменяется vs v1:**
- ~~Создание новых DNS A-records~~ → DNS уже настроен на my.azarean.ru
- ~~Создание nginx config с нуля~~ → config `deploy/nginx-my-azarean.conf` уже на VDS
- ~~Certbot для нового домена~~ → SSL уже установлен
- ~~Manual scp / rsync кода~~ → CI делает SCP tarball
- ~~Manual `npm ci --omit=dev`~~ → CI делает
- ~~Manual PM2 start~~ → CI делает `pm2 reload azarean-rehab --update-env`
- ~~Manual `psql -f migrations.sql`~~ → CI делает `bash deploy/migrate.sh`

---

## Phase 1 — Local validation (deferred smoke 2.08 + 2.09)

**Цель:** убедиться что Block C Tier 1 + photo flow работают перед CI.

```bash
# Terminal A
cd c:/Users/Вадим/Desktop/Azarean_rehab/backend && npm run dev

# Terminal B
cd c:/Users/Вадим/Desktop/Azarean_rehab/frontend && npm start
```

Логин `avi707@mail.ru` / `Test1234`.

### Smoke 2.08 — 5 сценариев
- [ ] **Card 1:** Открыть «Замеры» tab, форма пустая
- [ ] **Card 2:** POST ROM single — flexion knee L 90°, notes → success + история
- [ ] **Card 3:** POST bilateral pair — extension knee L=0° R=2° → два POST с одинаковым BIGINT `measurement_session_id`
- [ ] **Card 4:** POST HBB categorical — picker открылся, выбрать L3 → `value: "L3"` (string)
- [ ] **Card 5:** Validation — value=500 в ROM → toast error до API call

### Smoke 2.09 — 4 сценария
- [ ] **Card 1:** First user cancel — «Добавить фото» → ConsentDialog → Отмена → no API call
- [ ] **Card 2:** First user accept — checkbox + Принять → POST consent 200 → file picker → upload JPEG → thumbnail
- [ ] **Card 3:** Returning user — другой entry → «Добавить фото» → file picker напрямую (no dialog)
- [ ] **Card 4:** Photo viewer — click thumbnail → modal blob URL → Esc close

**Если 9/9 ✅ → Phase 2. Если 🔴 → STOP, фиксим.**

---

## Phase 2 — Test suite sanity

**Цель:** убедиться что CI не упадёт на тестах. (CI делает то же самое, но pre-CI check экономит цикл деплоя если что-то красное.)

```bash
cd backend && npm test
# Expected: 30 suites, 592 tests green
cd ../frontend && CI=true npx react-scripts test --watchAll=false
# Expected: 25 suites, 338 tests green
```

CI запускает идентично: backend `cd backend && npm test`, frontend `cd frontend && CI=true npx react-scripts test --watchAll=false`. Если у тебя локально проходит — у CI тоже пройдёт.

**Если красные:** STOP, фиксим перед push.

---

## Phase 3 — Pre-deploy commits (3 коммита на новой ветке)

**Цель:** добавить 3 коммита поверх `4f97006` перед batch merge.

### 3.1. Pilot disclaimer

Branch `chore/pilot-disclaimer` от `4f97006`.

Добавить одну строку в Profile или Welcome screen:

> *Это пилотная версия приложения студии Azarean Network для удобства между визитами. Не является медицинской услугой. По всем медицинским вопросам обращайтесь к вашему лечащему врачу.*

Commit message:
```
chore: pilot disclaimer в Welcome/Profile

Минимальный регуляторный disclaimer для internal pilot.
Полная regulatory pack — отдельный track REGULATORY_GAP.md.
```

### 3.2. Language baseline sweep

Branch `chore/language-baseline` от `chore/pilot-disclaimer`.

```bash
cd frontend/src
grep -rEn '\b(реабилитация|лечение|врач|диагноз|терапия)\b' --include="*.js" --include="*.css" components/ context/ services/
```

Заменить в **patient-visible strings** (label, header, toast, error):
- реабилитация → восстановление
- лечение → программа восстановления / тренировка
- врач → специалист / инструктор ЛФК
- диагноз → оценка состояния
- терапия → программа
- пациент (в UI) → клиент

**Внутренний код не трогаем** (комментарии, переменные, `req.patient` — другая semantics).

Commit:
```
chore: language baseline для патиент-визибл strings

Замена forbidden слов в UI labels/headers/toasts.
Внутренний код (req.patient, переменные) оставлен.
Полный sweep — отдельный track public launch.
```

### 3.3. ⚠️ Uploads persistence fix (deploy.yml) — БЛОКЕР

**Проблема:** `bug_avatar_lost_on_deploy.md` — atomic swap теряет `backend/uploads/` (avatars, diary_photos, measurements). Wave 2 photo upload бесполезен без этого fix'а.

**Fix:** symlink `backend/uploads` → `/opt/azarean-rehab/data/uploads` (persistent dir вне APP_DIR/backend/).

Branch `fix/uploads-persistence` от `chore/language-baseline`.

Открыть `.github/workflows/deploy.yml`. Найти секцию "Extract and swap symlinks". После строки `mv "$RELEASES/$RELEASE/frontend" "$APP_DIR/frontend"` (примерно после строки с `cp -r "$RELEASES/$RELEASE/deploy/"*`), но **перед** `cd "\$APP_DIR/backend" && npm ci`, добавить:

```bash
            # Fix bug_avatar_lost_on_deploy: symlink uploads → persistent /data/uploads
            mkdir -p "\$APP_DIR/data/uploads"
            chown -R \$(stat -c '%U:%G' "\$APP_DIR/backend") "\$APP_DIR/data/uploads" 2>/dev/null || true
            rm -rf "\$APP_DIR/backend/uploads"
            ln -sfn "\$APP_DIR/data/uploads" "\$APP_DIR/backend/uploads"
```

Commit:
```
fix: uploads symlink на persistent /data/uploads (bug_avatar_lost_on_deploy)

Atomic swap каталога backend терял uploads/ при каждом deploy.
Symlink на /opt/azarean-rehab/data/uploads — outside swap target,
сохраняется между deploys. One-time data migration выполняется
вручную на VDS перед первым deploy после merge (см. Phase 4).
```

### 3.4. Stack теперь 17 PR

```
af313b4 → ... → 4f97006(2.09) → <pilot-disclaimer> → <language-baseline> → <uploads-fix>
```

---

## Phase 4 — VDS prep (one-time data migration)

**Цель:** скопировать существующие uploads на persistent location ДО того как CI применит symlink fix.

**Запускается только ОДИН раз** — после Phase 3.3 commit, но до Phase 7 push.

```bash
ssh root@185.93.109.234

# Создать persistent dir и владельца
mkdir -p /opt/azarean-rehab/data/uploads
chown -R $(stat -c '%U:%G' /opt/azarean-rehab/backend) /opt/azarean-rehab/data/uploads

# Скопировать существующие uploads (avatars, diary_photos если есть)
if [ -d /opt/azarean-rehab/backend/uploads ] && [ ! -L /opt/azarean-rehab/backend/uploads ]; then
  cp -rp /opt/azarean-rehab/backend/uploads/. /opt/azarean-rehab/data/uploads/
  echo "Migrated. Current contents:"
  ls -la /opt/azarean-rehab/data/uploads/
fi

# НЕ создавать symlink сейчас — CI это сделает сам при следующем deploy
# Текущий backend остаётся с uploads/ как обычной директорией
```

**Verify:**
```bash
ls -la /opt/azarean-rehab/data/uploads/
# Должны видеть avatars/ и diary_photos/ если они существовали в backend/uploads/
```

После Phase 7 deploy CI создаст symlink, и `backend/uploads` будет указывать на `data/uploads` где уже лежат старые файлы.

---

## Phase 5 — PR #67 dark theme в main

```bash
git checkout main
git pull origin main
git log --oneline | head -5
# Если 16ed04c (dark theme) в выводе — skip
# Если нет:
git merge --no-ff 16ed04c -m "Merge PR #67: dark theme CSS Modules fix"
```

**Push НЕ делаем!** Push триггернёт CI и задеплоит dark theme отдельно от Wave 2. Делаем merge локально, push будет в Phase 7 уже со всем стеком.

---

## Phase 6 — Batch merge 17 PR в main (локально, без push)

```bash
git checkout main
git log -1 --format="%H %s"
# Должен быть 16ed04c (dark theme) или f7ef711

# Sequential merges
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
git merge --no-ff <disclaimer-sha> -m "chore: pilot disclaimer"
git merge --no-ff <language-sha> -m "chore: language baseline sweep"
git merge --no-ff <uploads-fix-sha> -m "fix: uploads symlink (bug_avatar_lost_on_deploy)"

# Verify local
git log --oneline | head -20
```

**Если conflict:**
- `git merge --abort`
- Проверить какой именно файл конфликтует
- Fix в исходной ветке этого PR, re-attempt merge

### Tag

```bash
git tag -a v0.1.0-pilot -m "Wave 2 closure — internal studio pilot"
```

**Не push'им tag сейчас.** Push в Phase 7.

---

## Phase 7 — Trigger production deploy

**Это момент истины.** Один `git push` запускает весь CI/CD.

### 7.0. Manual pre-Wave-2 snapshot (extra safety beyond daily cron)

Daily cron в 22:15 UTC даёт точку отката в worst case за последние 24 часа. Для Wave 2 deploy — берём **manual snapshot прямо перед push**, чтобы иметь точку отката с timestamp = момент перед deploy'ем.

```bash
ssh root@185.93.109.234
sudo bash /opt/azarean-rehab/deploy/backup.sh
# Скрипт создаст .sql.gz в /opt/backups/ с current timestamp

ls -lah /opt/azarean-rehab/backups/ | head -3
# Verify: новый azarean_rehab-YYYYMMDD-HHMMSS.sql.gz с current timestamp
```

Этот snapshot — **explicit pre-Wave-2 точка отката**. Если rollback понадобится (Phase 10), restore именно из этого файла, не из daily cron'а.

### 7.1. Push triggers CI

```bash
git push origin main
git push origin v0.1.0-pilot
```

**Что произойдёт автоматически** (per `.github/workflows/deploy.yml`):

1. **Test job** — `npm test` для backend + frontend на CI runner. ~3-5 min.
2. **Build job** — `npm run build` фронта с `REACT_APP_API_URL=''` (single-origin). `npm ci --omit=dev` backend. Tarball. ~2-3 min.
3. **Deploy job:**
   - SCP tarball на VDS
   - Extract в `releases/<timestamp>/`
   - Cp `backend/.env` из старого в новый (preserve secrets)
   - `mv backend backend.old.<ts>` + `mv frontend frontend.old.<ts>` (atomic swap)
   - `mv releases/<NEW>/backend → APP_DIR/backend`, тоже для frontend и deploy/
   - **NEW (Phase 3.3 fix):** `mkdir -p data/uploads && ln -sfn data/uploads backend/uploads`
   - `cd backend && npm ci --omit=dev`
   - `bash deploy/migrate.sh` — применяет 6 новых Wave 2 миграций (29 → 35: `20260516_wave2_schema`, `20260517_pain_locations_seed`, `20260518_acl_criteria_seed`, `20260519_ops_alerts`, `20260519_session_id_bigint`, `20260520_pain_character_to_array`)
   - `pm2 reload azarean-rehab --update-env` → graceful reload
   - Cleanup releases (keep 5) и .old.* (keep 2)
   - Smoke: `curl https://my.azarean.ru/` + `/api/rehab/phases?type=acl`

**Monitor:** GitHub Actions UI → repo → Actions → `Deploy to production VDS`. Каждый шаг с логами.

**Ожидаемое total time:** 10-15 min от push до smoke OK.

**Если CI красный:**
- Прочитай stderr в Actions UI
- Common causes:
  - Test red → проверь локально, fix, push (CI restart авто)
  - `migrate.sh` checksum mismatch → миграция в репо была отредактирована после apply. Создать новую миграцию для fix, не editing existing
  - SCP failed → SSH secret или VDS down. Manual SSH check VDS
  - PM2 reload failed → SSH на VDS, `pm2 logs azarean-rehab --lines 200`

---

## Phase 8 — Production smoke (10 шагов из браузера)

После CI зелёного, открой `https://my.azarean.ru` в браузере как тестовый пациент.

- [ ] **1.** Login screen загружается, console clean
- [ ] **2.** Login `avi707@mail.ru` / `Test1234` → PatientDashboard
- [ ] **3.** TabBar 5 tabs кликабельны
- [ ] **4.** Pain entry — локации, VAS=5, character, trigger, notes, submit → success + история
- [ ] **5.** ROM measurement — flexion knee L 90° → submit → история
- [ ] **6.** Bilateral — extension L=0° R=2° → две записи с одинаковым session_id
- [ ] **7.** Photo upload — ROM entry без фото → ConsentDialog (first time) → accept → file picker → JPEG ~1MB → thumbnail
- [ ] **8.** Photo view — click thumbnail → modal с blob → Esc close
- [ ] **9.** Diary entry — pain/swelling/mobility/mood/sleep → save
- [ ] **10.** Logout + re-login → session restore работает

**Параллельно Telegram bot:**
- [ ] Test patient (id=14 linked) — `/status` → response
- [ ] `/diary` 6-step wizard работает
- [ ] Wait 12:00 МСК → `/tip` arrives. Wait 21:00 → diary reminder.

**Uploads persistence verify** (важно для confidence что fix работает):
- [ ] После шага 7 (upload фото) → trigger второй deploy через GitHub Actions UI:
  - GitHub → repo `jaike077-web/azarean-rehab` → Actions
  - Слева workflow: `Deploy to production VDS`
  - Справа кнопка `Run workflow` ▼ → Branch `main` → `Пропустить тесты (для hotfix): true` → Run workflow
  - (skip_tests=true сэкономит 3-5 мин — тесты уже прошли минуты назад на первом деплое)
- [ ] CI прокатается (~5 мин) → reload страницы → photo thumbnail всё ещё видна, blob URL открывается
- [ ] Это подтверждает что symlink `backend/uploads → /opt/azarean-rehab/data/uploads` пережил второй atomic swap

**Почему workflow_dispatch, не empty commit:** empty commit `"test deploy"` остаётся в git history навсегда (noise). `workflow_dispatch` встроен в `deploy.yml:33-38` именно для таких manual triggers.

**Если 10/10 + uploads persist ✅ → Wave 2 closure DONE.**

---

## Phase 9 — Post-deploy

### 9.1. Announce
Telegram Татьяне + Алёне:
> Pilot версия my.azarean.ru развёрнута. Логин: <DM>. Pilot закрытый, никому не показывайте до отдельного разрешения. Фидбек — лично или в нашем чате.

### 9.2. Backup verification (НЕ install — уже работает)

Daily backup verified в Pre-flight. После Wave 2 deploy просто убедись что cron продолжает работать:

```bash
ssh root@185.93.109.234
tail -30 /var/log/azarean-rehab-backup.log
# Expected: "Backup OK" каждый день в 22:15 UTC + "Хранится копий: N"

ls -lah /opt/azarean-rehab/backups/ | head -5
# Recent azarean_rehab-*.sql.gz files
```

**НЕ добавляем новые crontab entries** — `deploy/backup.sh` уже покрывает needed scope (DB + 14-day rotation, since 2026-04-23).

Если позже понадобится backup для `/opt/azarean-rehab/data/uploads/` отдельно — это **backlog item для Wave 3**, добавляется в `deploy/backup.sh` отдельным PR, не через crontab edit на проде.

### 9.3. Wave 3 transition note

После 1-2 недель pilot use → Wave 3 planning. Первые TZ (preview):

1. **TZ 3.01 — Patient PDF export** (Pattern B phase 1) — кнопка «Поделиться с врачом», PDF generation, download to phone
2. **TZ 3.02 — Engagement & Retention early warning** — curator alerts, adaptive program
3. **TZ 3.03 — Markup canvas** (бывший TZ 2.10) — если pilot покажет нужным

---

## Phase 10 — Rollback playbook

### Принцип: JARVIS на jarvis.azarean.ru НЕ должен быть affected ни в одном rollback сценарии.

### Если CI failed на test/build (Phase 7)
- Просто fix локально, push снова. CI restart авто.
- `git push` не катит ничего на prod если test/build red.

### Если CI failed на deploy step (Phase 7) после migration apply
**Самый опасный сценарий** — миграции применены, но swap не завершён или PM2 не стартанул.

```bash
ssh root@185.93.109.234

# Status check
pm2 status
pm2 logs azarean-rehab --err --lines 100

# Если PM2 не работает с новым кодом — restore старый код:
cd /opt/azarean-rehab
ls -1dt backend.old.* | head -1
# Например backend.old.1716120000

mv backend backend.broken.$(date +%s)
mv backend.old.<latest> backend

ls -1dt frontend.old.* | head -1
mv frontend frontend.broken.$(date +%s)
mv frontend.old.<latest> frontend

pm2 reload azarean-rehab --update-env
pm2 status
# Должен быть online
```

**БД остаётся с новыми миграциями** — old код их не использует, но additive migrations не мешают. Главное — миграции **никогда не должны быть destructive (DROP COLUMN, DROP TABLE без data preservation)**.

### Если CI failed на migrate.sh (Phase 7)

`migrate.sh` exit 1 → CI red, deploy не дойдёт до swap. **Backend ещё работает на старом коде.** Никакого rollback не нужно — просто fix миграцию и push снова.

Если checksum mismatch — кто-то редактировал применённую миграцию. Создать новую миграцию для fix, НЕ editing existing.

### Если smoke failures (Phase 8) — критичные

```bash
# Простой rollback через git revert + push
git checkout main
git revert <last-merge-commit-sha>  # или revert несколько коммитов
git push origin main
# CI авто-деплоит revert
```

**При revert схема БД не откатывается** — миграции остаются, но old код их не использует. Поэтому migrations should be **additive only**.

Если нужен schema rollback — это серьёзный incident, требует pg_restore из бэкапа. Это NOT routine rollback. **На Wave 2 миграции additive** (verified в Phase 2 test pass) → schema rollback не нужен.

### Если nginx config поломан

`deploy.yml` не трогает nginx config (он уже стоит, и Wave 2 не требует изменений). Если что-то пошло не так с nginx — проверь не подключен ли twой кастомный config где-то ещё.

```bash
sudo nginx -t
sudo systemctl status nginx
sudo systemctl reload nginx
```

JARVIS server block в отдельном config файле, не задеть.

### Если uploads потеряны

`deploy/backup.sh` (2026-04-23) backup'ит DB по умолчанию. **Включает ли uploads — verify по содержимому `/opt/backups/`:**

```bash
ssh root@185.93.109.234
ls -la /opt/azarean-rehab/backups/ | grep -i upload
# Если есть uploads_*.tar.gz → restore из последнего:
# tar -xzf /opt/azarean-rehab/backups/uploads_<latest>.tar.gz -C /opt/azarean-rehab/data/
# Если только azarean_rehab-*.sql.gz → uploads не backup'ятся отдельно (текущее состояние)
```

Если uploads не backup'ятся:
1. Recovery невозможен из текущего backup setup
2. **Add to Wave 3 backlog:** расширить `deploy/backup.sh` чтобы tar'ить `/opt/azarean-rehab/data/uploads/` — отдельным PR
3. До этого fix'а uploads теряются полностью при catastrophic failure — известный риск pilot стадии

---

## Definition of Done

- [ ] Phase 1: 9 local smoke green
- [ ] Phase 2: 30+25 test suites green локально
- [ ] Phase 3: 3 коммита (disclaimer + language + uploads-fix)
- [ ] Phase 4: VDS one-time data migration — `/opt/azarean-rehab/data/uploads/` populated
- [ ] Phase 5: PR #67 dark theme в main (или verified)
- [ ] Phase 6: 17 PR merged локально + tag `v0.1.0-pilot`
- [ ] Phase 7: `git push origin main` → CI green → smoke curl OK
- [ ] Phase 8: 10/10 browser smoke + Telegram bot + uploads persist verify
- [ ] Phase 9: announce + crontab daily backups
- [ ] JARVIS на jarvis.azarean.ru работает throughout

**Wave 2 закрыт.**

---

## После closure — Wave 3 kickoff

Vadim вернётся через 1-2 недели pilot use с фидбеком от Татьяны / Алёны / 5-10 клиентов. Тогда пишу TZ 3.01 (PDF export per Pattern B) и далее.

---

*Generated by Claude Opus 4.7 — 2026-05-19. v3 incorporates backup infrastructure verification (cron 22:15 UTC active since 2026-04-23). Drift #33 closed. v2 написана с verification против 4 source files: deploy.yml, migrate.sh, nginx-my-azarean.conf, ecosystem.config.js.*
