# Wave 3 Merge Runbook — Owner Command Center → Production

**Дата:** 2026-05-26 · **Architect:** Claude Opus 4.7
**Scope:** Merge ветки `wave-3/owner-command-center` (backend C1–C4 + frontend C5.1–C5.4) в `main` → деплой на прод через существующий CI/CD.
**Аудитория:** Vadim (ops). **Ожидаемое время:** 1–2 ч (большая часть — наблюдение CI + prod smoke).

> ⚠️ **Грунтовка:** этот runbook опирается на **MEMORY_RULES §8 (deployment architecture, verified)**, НЕ на ручные фазы `WAVE_2_CLOSURE_RUNBOOK.md` — те устарели (api.azarean.ru / ручной scp / PORT 5000 / PM2 `-backend`). Реальный деплой: **GitHub Actions на push в main**, single-origin `my.azarean.ru`, PM2 `azarean-rehab` :3001, `deploy/migrate.sh` checksum-tracking. Это **не первый деплой** — прод живой с 2026-04-23, инфра (nginx/SSL/PM2/DNS/backup-cron) уже стоит. Поэтому фаз меньше, чем в Wave 2.

---

## Pre-flight — подтвердить ДО старта (TZ-COMPLIANCE: открыть живые файлы, не угадывать)

- [ ] **Открыть и сверить 4 deploy-источника** (drift #33 lesson — без этого механика runbook'а может разойтись с репо):
  - `.github/workflows/deploy.yml` — триггер `push: main` (+ `workflow_dispatch`), pipeline test→build→pack→SCP→atomic swap→`npm ci --omit=dev`→`bash deploy/migrate.sh`→`pm2 reload azarean-rehab --update-env`→cleanup→smoke. Подтвердить, что это так.
  - `deploy/migrate.sh` — checksum-tracking, `_migrations` table, `--single-transaction`, checksum mismatch → exit 1, новые миграции применяются, изменённые → ошибка.
  - `deploy/ecosystem.config.js` — PM2 name `azarean-rehab`, fork, PORT 3001.
  - `deploy/nginx-my-azarean.conf` — single-origin (НЕ трогаем в этом деплое, CI его не меняет).
- [ ] **Ancestry ветки:** `git log main..wave-3/owner-command-center --oneline` (что приедет) + `git log wave-3/owner-command-center..main --oneline` (разошёлся ли main). Если main ушёл вперёд с момента ветвления — сначала rebase/merge main в ветку локально, прогнать тесты, потом мерджить обратно. Если main — предок ветки, merge чистый.
- [ ] **Ветка содержит revert `b5d59c7`** (откат `980a7f5`, локальный logAudit в admin.js) — подтвердить, что он в истории ветки (`git log --oneline | grep b5d59c7`).
- [ ] **Backup:** cron `deploy/backup.sh` уже стоит (22:15 UTC), НЕ переустанавливать. Но перед schema-миграцией — **снять ручной снапшот**: `sudo bash /opt/azarean-rehab/deploy/backup.sh` на VDS.
- [ ] **Тесты на tip ветки зелёные:** backend 701/36, frontend 393/33 (из отчёта C5.4).
- [ ] **JARVIS на jarvis.azarean.ru работает** — зафиксировать baseline (этот деплой его не трогает: single-origin my.azarean.ru, PM2 `azarean-rehab` ≠ JARVIS :3000, CI не правит nginx; но проверить до и после).

---

## Phase 1 — 🚩 GATE: снять риск «ложно-пустого» командного центра (ДО merge)

> ✅ **GATE ПРОЙДЕН (pre-flight 2026-05-26).** Проверено по живому коду: `\d rehab_programs` → `status DEFAULT 'active'`, `is_active DEFAULT true`; `POST /api/rehab/programs` (rehab.js:1457) **не указывает** `status`/`is_active` в INSERT → берутся из DEFAULT; обе dev-программы (id=1,2) `active`. Backlog «POST /programs создаёт inactive» — **устаревший**. Новые программы попадают в `funnel.active_program`/`segments`/`dynamics.cohort`. Процедура ниже сохранена для воспроизводимости; легаси-программы на проде доп.-проверяются в Phase 8.

**Почему первым:** командный центр читает канон «активная программа» = `rp.is_active = true AND rp.status = 'active'`. Wave 2 backlog зафиксировал: `POST /programs` **создаёт программы inactive** (был ручной SQL UPDATE workaround), хотя миграция `20260210` ставит `DEFAULT 'active'`. Если на реальных данных программы не `active` → `funnel.active_program=0`, сегменты пустые, `dynamics.cohort=0` → дашборд выглядит сломанным, хотя UI корректен (anti-175% класс, обратный знак).

- [ ] На dev: создать программу через UI (`POST /api/rehab/programs`), затем `SELECT id, is_active, status FROM rehab_programs ORDER BY id DESC LIMIT 3;`. Ожидаем `is_active=true, status='active'`.
- [ ] Если `status != 'active'` или `is_active=false` по умолчанию → **STOP, не мерджим волну в таком виде.** Это маленький backend-фикс (дефолт в `POST /programs` route ИЛИ миграция-бэкфилл существующих prod-программ). Закрыть отдельным мини-чекпойнтом на этой же ветке ДО merge, иначе пилот увидит пустой дашборд.
- [ ] Если `status='active'` корректно → gate пройден, идём дальше. (Также проверить на проде после деплоя в Phase 8 — на реальных пилотных программах.)

---

## Phase 2 — Local validation (command center на dev)

Per-checkpoint browser smoke C5.1–C5.4 уже пройдены. Здесь — быстрый end-to-end проход целиком как admin (`vadim@azarean.com` / `Test1234`):

- [ ] Главная (admin) = командный центр: шапка «С возвращением, {имя}» + pill роли + селектор периода.
- [ ] 5 панелей живые в порядке: Требует внимания → Воронка → Сегменты → Динамика → Инструкторы.
- [ ] На dev (2 пациента): honest empty-states работают — динамика боли = «недостаточно данных», воронка с числами, без «вечной загрузки».
- [ ] Клик по инструктору → модалка → кебаб → inline-меню (НЕ вторая модалка) → «Переназначить» → select без текущего → PATCH → toast.
- [ ] Смена периода 30d→7d→all рефетчит воронку(adhering)+динамику, не роняет панели.
- [ ] **Instructor-логин (не admin):** старая welcome без изменений (регрессия).
- [ ] Консоль чистая (Rule #20 — стили на токенах, тёмная тема читаема).

---

## Phase 3 — Test suite sanity

```bash
cd backend && npm test                          # 701 / 36 suites green
cd ../frontend && CI=true npm test -- --watchAll=false   # 393 / 33 suites green
npm run lint:modals --prefix frontend           # clean (120 файлов)
```
Красные → STOP, не деплоим.

---

## Phase 4 — 🚩 Service Worker cache bump (PWA stale-chunk lesson)

**Почему:** командный центр = новые фронт-чанки. Урок `feedback-sw-cache-bump-required` (CLAUDE.md): SW держал stale chunks 3 итерации тестов. Админ должен получить свежий бандл, а не закешированный.

- [ ] Найти SW версию: `grep -rn "CACHE_NAME\|CACHE_VERSION\|sw-v" frontend/public/ frontend/src/`.
- [ ] Если есть версионируемый CACHE_NAME → **бампнуть** (например `v7 → v8`) в этом же merge. Если SW не версионируется так — отметить в отчёте, проверить hard-refresh на проде в Phase 8.
- [ ] Коммит бампа — на ветку до merge (или в составе merge-commit).

---

## Phase 5 — Merge ветки в main + tag

```bash
git checkout main
git pull origin main
git log -1 --format="%H %s"        # зафиксировать pre-merge tip main

# Wave 3 — одна когезивная ветка (C1→C5.4), мерджим целиком --no-ff
git merge --no-ff wave-3/owner-command-center \
  -m "Merge Wave 3: owner command center (backend C1–C4 + frontend C5.1–C5.4)"

# Ancestry чистая (pre-flight: main — предок, 12 коммитов, расхождения нет) → конфликтов не ожидается.
```
- [ ] Merge без конфликтов.
- [ ] **Hygiene-пара `980a7f5` (fix audit) + `b5d59c7` (его revert) едет в main как есть — НЕ rebase'им.** Решение архитектора: revert эксплицитный, документирует logAudit-инцидент (Rule #35 paper trail); rebase shared-ветки ради косметики истории = риск без выгоды. `--no-ff` даёт явный merge-commit как маркер границы волны.
- [ ] Tag: `git tag -a v0.2.0-command-center -m "Wave 3 — owner command center"` (версию согласуй; Wave 2 был `v0.1.0-pilot`).

**НЕ пушим в этом шаге** — push в Phase 6 запускает деплой, делаем осознанно.

---

## Phase 6 — Push → CI/CD деплой + наблюдение

```bash
git push origin main --tags     # ← это триггерит GitHub Actions deploy.yml
```
- [ ] Открыть Actions, дождаться pipeline. **Урок `feedback-gh-run-watch-misleading` (CLAUDE.md): CI exit 0 ≠ deploy success — проверять per-job, не только зелёный run.** Конкретно убедиться, что прошли: `test` → `build` → SCP → atomic swap → `migrate.sh` → `pm2 reload` → smoke (`curl my.azarean.ru/` + `/api/rehab/phases?type=acl`).
- [ ] Если `migrate.sh` упал (checksum mismatch / SQL error) → деплой остановится; смотри Phase 11 rollback (миграция additive → БД обычно не откатывать).
- [ ] Concurrency `deploy-production`, `cancel-in-progress: false` — параллельные пуши ждут в очереди, не пушить второй раз пока идёт.

---

## Phase 7 — Verify миграции на проде (Rule #15)

C1 добавил миграцию: `assigned_instructor_id` на patients + cadence (`target_min/max/unit`) на complexes + бэкфилл + CHECK `chk_complexes_cadence`.

- [ ] На VDS: `psql azarean_rehab -c "\d patients"` — есть `assigned_instructor_id`.
- [ ] `psql azarean_rehab -c "\d complexes"` — есть `target_min/target_max/target_unit` + констрейнт.
- [ ] Бэкфилл отработал: `SELECT count(*) FROM patients WHERE assigned_instructor_id IS NOT NULL;` (= COALESCE(последний активный complex.instructor_id, created_by)).
- [ ] `_migrations` содержит новые файлы C1 с checksum'ами.
- [ ] Миграция **additive** (новые колонки, не drop) → rollback кода не требует rollback БД.
- [ ] **Uploads persistence:** `ls /opt/azarean-rehab/data/uploads/` — директория существует и не пуста. Symlink `backend/uploads → data/uploads` CI восстанавливает на КАЖДОМ deploy (не one-time), но если `data/` физически снесён — фото/аватары потеряны. One-time data-миграция уже сделана (Wave 2 closure, `a59be41`) — здесь только verify.
- [ ] **Легаси-программы (smoke-наблюдение, НЕ блокер):** `psql azarean_rehab -c "SELECT count(*) FROM rehab_programs WHERE status!='active' OR NOT is_active;"`. Если >0 — это программы, созданные до DEFAULT'а; объясняет, почему пациент мог не попасть в воронку. Чинится точечным UPDATE, деплой не блокирует.

---

## Phase 8 — Production smoke (command-center-specific)

Из браузера на `https://my.azarean.ru`, как **admin** (`jaike077@yandex.ru` / `Test1234` — prod admin):

- [ ] **1.** Login admin → главная = командный центр (не старая «175%» вьюха).
- [ ] **2.** 🚩 **Панели читают РЕАЛЬНЫЕ данные** (gate из Phase 1 на проде): если на проде есть активные программы — воронка/сегменты/динамика показывают непустые числа; если программы реально inactive → вернуться к Phase 1 fix. Это главная проверка деплоя.
- [ ] **3.** Требует внимания — реальные phase_stuck / pain_red_flag ИЛИ honest empty.
- [ ] **4.** Срез по инструкторам — строка(и) с caseload; клик → модалка с метриками + сигналы из `/attention?instructor_id`.
- [ ] **5.** Переназначение: кебаб → inline-форма → select других инструкторов (из getUsers) → PATCH → toast «Инструктор назначен» → пациент уехал из списка + caseload пересчитался. Проверить `audit_logs` → `PATIENT_REASSIGNED`.
- [ ] **6.** Селектор периода рефетчит без падений.
- [ ] **7.** Тёмная тема: severity-dot / amber-callout / карточки / модалка читаемы.
- [ ] **8.** **Регрессия:** instructor-логин (если есть prod instructor) → старая welcome; пациентские потоки (login, дневник, боль, замеры) не задеты.
- [ ] **9.** Hard-refresh / SW: админ получает свежий бандл (не stale chunks).
- [ ] **10.** JARVIS на jarvis.azarean.ru работает как до деплоя.

**10/10 ✅ → Wave 3 в проде.** 🟡 cosmetic → backlog. 🔴 (дашборд пустой на реальных данных / login broken / reassign 500) → Phase 11.

---

## Phase 9 — Post-merge full-codebase grep (Wave 1/2 lesson)

Урок `feedback_full_grep_after_bug_category_closed`: после batch merge — grep по всему репо на пропущенные хардкоды/drift'ы.

- [ ] `grep -rn "command-center\|commandCenter" backend/ frontend/src/` — все 5 endpoint'ов consumed, нет мёртвых ссылок.
- [ ] `grep -rn "status='active'\|status = 'active'\|is_active" backend/routes/rehab.js` — канон активной программы единообразен (связано с Phase 1 gate).
- [ ] `grep -rn "logAudit" backend/admin.js backend/routes/` — подтвердить, что revert `b5d59c7` оставил admin.js на локальном logAudit консистентно (хвост для MEMORY_RULES Rule #35 caveat).

---

## Phase 10 — Post-deploy + три хвоста

- [ ] Уведомить Татьяну/Алёну (если переходим к пилоту) — но это уже отдельное решение после merge.
- [ ] **Три хвоста (отдельным заходом после зелёного smoke):**
  1. Регенерация `MEMORY_RULES.md` (артефакт от архитектора → ты перезаливаешь): caveat про локальный `logAudit` в admin.js (#35) + JSDOM/pure-function (§5) + data-testid-vs-querySelector (из C5.4 drift #4) + Section 9 пометка «Wave 3 LIVE».
  2. Reconcile-карта волн (execution C1–C6 + стратегический 3–6, surgeon bridge → patient export).
  3. Удалить апрельский `CLAUDE.md` из project files + обновить репо-CLAUDE.md (Wave 3 LIVE, тесты ~701+393, ExerciseRunner v4, ~46 таблиц).

---

## Phase 11 — Rollback

Деплой = atomic swap, CI хранит `backend.old.<ts>` / `frontend.old.<ts>` (last 2) + releases (last 5).

### CI деплой упал на migrate.sh
- БД могла частично примениться? `migrate.sh` в `--single-transaction` per-migration → либо вся миграция, либо ничего. Проверь `_migrations`. Миграция additive → откатывать БД не нужно, чинишь причину (checksum/SQL) и re-run деплой.

### Prod smoke 🔴 (дашборд/login broken)
- Откат кода: на VDS swap обратно на `backend.old.<ts>` + `frontend.old.<ts>`, ИЛИ `git checkout <pre-merge-tag>` + повторный деплой через `workflow_dispatch`.
- Колонки `assigned_instructor_id`/cadence остаются (additive) — старый код их игнорирует, не мешают.

### JARVIS пострадал (не должен — CI не трогает nginx/JARVIS)
- Если внезапно: проверить, что PM2 `azarean-rehab` не занял :3000 (он на :3001). `pm2 list`. Принцип: **JARVIS никогда не в downtime из-за нас.**

---

## Definition of Done
- [ ] Pre-flight: 4 deploy-файла сверены, ancestry чистая, revert b5d59c7 в ветке, ручной backup снят.
- [ ] Phase 1: program.status='active' подтверждён (gate против ложно-пустого дашборда).
- [ ] Phase 2–3: local smoke + тесты (701/393) + lint green.
- [ ] Phase 4: SW cache bump (или отмечено).
- [ ] Phase 5–6: merge --no-ff + tag + push → CI per-job green.
- [ ] Phase 7: миграция C1 на проде (\d dump), бэкфилл, additive.
- [ ] Phase 8: 10/10 prod smoke, дашборд читает реальные данные.
- [ ] Phase 9: post-merge grep чистый.
- [ ] JARVIS работает до и после.

**Когда всё ✅** — Wave 3 (owner command center) в проде. Дальше: три хвоста → решение пилот / C6 RBAC.

---

*Wave 3 Merge Runbook. Architect: Claude Opus 4.7, 2026-05-26. Грунтован на MEMORY_RULES §8 (verified CI/CD), структура из WAVE_2_CLOSURE_RUNBOOK с исправленной механикой. Pre-flight требует сверки живых deploy-файлов (drift #33).*
