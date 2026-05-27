# SESSION HANDOFF — Wave 2 Start (2026-05-16)

> **Цель этого документа:** позволить новой Claude-сессии (архитектор) бесшовно продолжить проектирование Wave 2 с того же места, без пере-обсуждения уже согласованного и без потери clinical foundation, проработанной за 2026-05-13 — 2026-05-16.
>
> **Как использовать:** прикрепить этот файл + `TZ_WAVE_2_INDEX.md` + `TZ_WAVE_2_01_schema_migrations.md` к первому сообщению новой сессии. Сказать: «Прочитай handoff и нужные memory-файлы, готов начинать с 2.02».

---

## ТЕКУЩЕЕ СОСТОЯНИЕ ПРОЕКТА (на 2026-05-16)

### Что в production

**URL:** https://my.azarean.ru (VDS 185.93.109.234, NetAngels РФ для 152-ФЗ)

**Wave 0** — закрыта в проде 2026-05-11/12 (6 коммитов): streak_days, HomeScreen program_label, diary→messages, replay CTA, accordion 4 секции, stuck banner.

**Wave 1** — закрыта в проде 2026-05-15 (10 коммитов через stacked PRs #51-#60). Multi-protocol foundation (program_types справочник), шаблоны программ, RehabProgramModal wizard, stuck detection instructor. Bug #12 (хардкод 'acl') закрыт полностью, Bug #13 (Комплекс #N) закрыт.

**Wave 1 retrospective hot-fix PR #61** — расширен force-push'ем после полного grep'а кодовой базы. 4 hidden хардкода `'acl'` в `routes/rehab.js`: 307 (`/my/program`), 367 (`/my/dashboard` phase lookup — критический), 414 (tips filter с 'general' sentinel pattern — оставлен корректно), 1294 (instructor `/programs` JOIN). Sentinel `'general'` в tips подтверждён через psql — оставляем (16 tips на dev БД с этим program_type).

**Метрики после Wave 1 + retrospective:**
- Backend тесты: 338 → ~430
- Frontend тесты: 236 → ~255
- 3 миграции Wave 1: `20260512_program_types`, `20260513_program_templates`, `20260513_phase_stuck_alerts`

**Активные пациенты:** 2 (id=14 avi707@mail.ru тестовый ACL, id=6 Vadim Azarenkov через Yandex OAuth)

### Что НЕ в production (открытый backlog Wave 1)

Эти hot-fixes должны быть смерджены **до старта Wave 2** или параллельно с 2.01:

| # | Severity | Что | Объём | Порядок |
|---|---|---|---|---|
| #3 | 🔴 HIGH | `bug_patient_stuck_status_hardcoded_acl.md` — TZ готов в корне | ~30 мин | 1-й merge |
| #5 | 🔴 HIGH | OAuth blocked после local-registration. **Дизайн архитектора дан**, TZ_HOTFIX_OAUTH_POST_REGISTRATION.md ждёт написания | 1-2ч | 2-й merge |
| #2 | 🟡 MEDIUM | `complex.title` field missing в CreateComplex.js — root cause Bug #13. Добавить text input | ~30 мин | 3-й merge |
| #1 | 🟡 MEDIUM | AdminContent CSS Modules unfinished — 30+ class имён не определены в `.module.css` (pre-existing с 2026-05-04) | ~1-2ч | 4-й merge |
| #4 | 🟢 LOW | invite-code share link UX — pre-fill `?code=XXXX` в URL → Register.js auto-fills | ~15-30 мин | 5-й merge |

**OAuth #5 — архитектурный дизайн (зафиксирован, нужен только TZ-файл):**
- Убрать `AND password_hash IS NULL` фильтр в `routes/patientAuth.js:1695,1902`
- Сохранить multi-match anti-misroute (`if rows.length === 1` — autolink only)
- Добавить email-match fallback после phone-match
- НЕ обновлять `password_hash` при OAuth-логине
- Опционально: `patients.last_login_method VARCHAR(20)` для audit (можно отложить)

---

## АРХИТЕКТУРНЫЕ РЕШЕНИЯ WAVE 2 (закреплены 2026-05-13 — 2026-05-16)

Эти решения **не пере-обсуждаются** в новой сессии — они результат 4-дневной clinical discussion с Vadim'ом. Просто принимаются как input.

### 1. Three-tier ROM measurement approach

Все три tier'а в одной Wave 2 (по решению Vadim'а 2026-05-15: «у нас тесты, руки развязаны»):

- **Tier 1** — numeric self-report (input + reference card, ±10-15° точность)
- **Tier 2** — manual canvas markup (инструктор кликает 3 точки на фото пациента, JS `Math.atan2()`, ±3-5° точность, ~250 строк vanilla canvas)
- **Tier 3** — MediaPipe Pose auto-detect (Apache 2.0 free лицензия, R²>0.98 для abduction/flexion, ER/IR хуже из-за occlusion, 10MB lazy-load через code-splitting)

**Tier 3 НЕ откладывается на post-pilot**, потому что мы pre-pilot и privacy review не блокирует.

### 2. MVP scope: shoulder + knee

Ankle/spine/hip — позже через AdminContent UI когда будет первый такой пациент. Не в Wave 2 MVP.

### 3. Финальные measurements

**Плечо (5 ROM + 2 girths):**

ROM:
- Forward Flexion (0-180°, Tier 1+2+3, profile view)
- Abduction (0-180°, Tier 1+2+3, frontal view)
- External Rotation в 0° (0-90°, Tier 1+2+3, frontal view, локоть 90°)
- Internal Rotation в 90° abduction (0-70°, Tier 1+2+3, frontal view)
- Hand-Behind-Back (categorical T1-L5 enum, Tier 1 only)

Girths:
- Mid-deltoid (cm, Tier 1)
- Mid-biceps (cm, Tier 1)

**Колено (2 ROM + 1 alternative + 5 girths):**

ROM:
- Flexion (0-135°+, Tier 1+2+3, profile view)
- Extension (0°, дефицит критичен для ACL, Tier 1+2+3, profile view)
- Heel-to-buttock distance (cm, Tier 1 only, home-friendly без AI/гониометра)

Girths:
- Knee joint line (через центр надколенника, swelling indicator)
- 5 cm above superior pole patella (VMO + suprapatellar effusion — Onishi 2025)
- 10 cm above (general vastus medialis atrophy — стандарт ACL studies)
- 15 cm above (mid-thigh global quadriceps mass — Soderberg classic)
- Calf max (gastrocnemius atrophy от immobilization)

**Vadim catch 2026-05-16:** «5 cm vs 10 cm — оба нужны». Я ошибся когда упрощал до 3-х точек, литература подтвердила. Включены все 4 thigh-точки + calf.

### 4. Bilateral logic

- **Baseline** (первый замер программы) — bilateral L+R **обязательно** (калибровка к личной норме пациента, asymmetry index)
- **Follow-up рутинный** — affected side only (80% замеров)
- **Re-calibration** — bilateral раз в 4-6 недель, UI напоминает если пропущено
- **Discharge** — bilateral обязательно (LSI assessment, для ACL стандарт return-to-sport)

Vadim insight: «не всегда bilateral, но для baseline критично» — встроено в schema через `measurement_session_id` grouping.

### 5. Pain tracking

**Гибрид UI:**
- VAS slider 0-10 как primary (compact, daily flow)
- Accordion «Уточнить» (опционально): multi-select locations + trigger + character
- Pain Event SOS — **отдельная entity** для acute эпизодов, full form, immediate push куратору

**Pain locations таксономия** (Vadim принял мою выборку 2026-05-16):

Knee (8): `knee_anterior`, `knee_posterior`, `knee_medial`, `knee_lateral`, `knee_inferior_patellar`, `knee_superior_patellar`, `tibia_anterior`, `calf_posterior` (red flag — DVT marker)

Shoulder (8): `shoulder_anterior`, `shoulder_lateral`, `shoulder_posterior`, `shoulder_superior`, `arm_anterior`, `arm_posterior`, `neck_lateral` (red flag — radiculopathy), `scapula_medial`

**Red flag automation:** push куратору через ops-alert при:
- pain в `calf_posterior` (knee) или `neck_lateral` (shoulder)
- ИЛИ `vas_score >= 8`
- ИЛИ `is_event = TRUE` (любой Pain Event)

### 6. Phase transition criteria — three types

- **measurement** — auto-check против `rom_measurements` / `girth_measurements` / `pain_entries` (threshold operators `>=`, `<=`, `=`, `>`, `<`, `between`, staleness_days default 7)
- **self_report** — пациент tap'ает yes/no на Roadmap с hint text
- **instructor_check** — куратор подтверждает очно через админ-UI (audit log)

**Default seed для ACL** — заложу из AAOS/APTA knowledge (~30 criteria) в коммите 2.03. Vadim откалибрует позже через AdminContent. Shoulder_general и knee_general — Vadim наполняет с нуля.

Vadim позиция: «делаем из того что ты знаешь — потом нужно будет сделать исследование по протоколам и мой опыт откалибровать».

### 7. Personal + общие reference photos

Dual-mode:
- При baseline визите в студии Vadim делает personal photos → `patients.measurement_reference_photo_url`
- При remote-registration пациент использует общие эталонные фото из content layer
- UI пациента: если есть personal → показывает их, иначе общие

Это позволяет регистрировать remote-only пациентов до студийного визита.

### 8. Privacy / 152-ФЗ

- Photo consent flow при первом upload'е (любого фото — ROM или pain event)
- `patients.photo_consent_at` + `photo_consent_version` поля в schema
- Биометрика (фото пациента) — спец категория ПД, для пилотной фазы acceptable risk
- Хранение на VDS NetAngels (РФ ОК для 152-ФЗ)
- JWT-protected access ко всем фото endpoints (по образцу avatars)
- Retention 6 месяцев после deactivation
- Юрист — после пилота

### 9. MediaPipe Pose

- **Apache 2.0 free** лицензия, никаких подписок/отчислений
- NPM пакет `@mediapipe/tasks-vision`
- 10MB WASM bundle, lazy-load через React.lazy + code-splitting
- Local inference в браузере, фото НЕ уходит к Google
- R²>0.98 для abduction/flexion (peer-reviewed 2023-2025), ER/IR хуже из-за occlusion → fallback на Tier 2
- Feature flag `MEDIAPIPE_ENABLED` в env для disable в emergency
- Validation tracking: `ai_suggested_degrees` vs финальный `value_degrees` — копим dataset для будущего fine-tuning

### 10. Контент-работа Vadim'а параллельно с Wave 2 кодом

Блокер для запуска UI пациента (не блокер для Wave 2 коммитов с placeholder'ами):

- 15 reference photos + 15 текстов инструкций — ~6-8ч в студии с Tatyana/Alyona как моделью
- Pain locations review (16 локаций) — 1ч
- Phase criteria для shoulder_general и knee_general — через AdminContent после 2.13 ships, ~3-4ч clinical time

---

## ОБЪЁМ WAVE 2 — 14 КОММИТОВ В 6 БЛОКАХ

**Итого:** 76-95 часов работы Claude Code, **3-4 недели** в темпе Wave 1.

### Блок A — Foundation (3 коммита, 13-16ч)
- **2.01** schema migrations (всё одной идемпотентной миграцией, 7 таблиц + ALTER patients × 3 колонки) — **TZ готов**
- **2.02** Pain locations seed (16 records) + AdminContent → PainLocationsTab inline CRUD
- **2.03** ACL criteria seed (~30 records, мой AAOS default) + AdminContent расширение PhasesTab с criteria sub-CRUD

### Блок B — Pain tracking (2 коммита, 11-13ч)
- **2.04** Backend pain endpoints (daily + event) + red flag automation + ops-alert
- **2.05** Frontend DiaryScreen расширенный + HomeScreen Pain Event SOS button + form

### Блок C — Measurements Tier 1+2 (3 коммита, 18-22ч)
- **2.06** Backend measurements endpoints (rom + girth + hbd) + photo upload infrastructure + reference photo serving
- **2.07** Frontend пациент UI Tier 1 numeric input + reference photos (общие + personal) + bilateral flow
- **2.08** Photo upload flow + Instructor canvas markup UI Tier 2 + markup queue + personal reference upload (студийный)

### Блок D — AI Tier 3 (2 коммита, 16-20ч)
- **2.09** MediaPipe Pose integration (code-splitting, lazy load, Pose Landmarker, angle compute из 33 landmarks, feature flag)
- **2.10** AI confidence handling + auto-fallback на manual markup + validation tracking + privacy consent UI

### Блок E — Criteria evaluation (3 коммита, 14-17ч)
- **2.11** Backend phase-criteria endpoints + auto-check evaluator (measurement criteria)
- **2.12** Self_report + instructor_check flows + staleness check
- **2.13** Frontend Roadmap UI с criteria checkboxes + Stuck banner stage 2 (criteria-aware)

### Блок F — Polish (1 коммит, 4-5ч)
- **2.14** Patients.js badges (pain events count / измерения устарели / готов к фазе) + tests cleanup + final retrospective grep

### Координация по файлам (риск merge-конфликтов)

| Файл | Коммиты | Заметка |
|---|---|---|
| `routes/rehab.js` | 2.04, 2.06, 2.11, 2.12, 2.13 | Часто, координировать |
| `routes/admin.js` | 2.02, 2.03 | Только Блок A |
| `services/telegramBot.js` | 2.04 | ops-alert |
| `frontend/.../DiaryScreen.js` | 2.05 | расширение pain |
| `frontend/.../HomeScreen.js` | 2.05 | Pain Event button |
| `frontend/.../RoadmapScreen.js` | 2.13 | criteria + stuck v2 |
| Новые экраны Measurement/ROMRunner | 2.05-2.10 | новые файлы |
| `frontend/.../AdminContent.js` | 2.02, 2.03 | inline CRUD |
| `frontend/src/pages/Patients.js` | 2.14 | badges |
| `frontend/src/services/api.js` | почти все | расширение |

---

## ПРИНЦИПЫ ИСПОЛНЕНИЯ (lessons from Wave 0/1)

1. **Один файл = один коммит.** STOP между коммитами.
2. **Verify-step grep'ом ПЕРЕД началом каждого TZ** (правило с 2026-05-13 после Wave 1 drift'ов). В каждом TZ есть секция «Verify-step» с конкретными командами.
3. **Все backend-тесты mock-based** (jest.mock для `db.js`). Integration-стиль не используется.
4. **Миграции — sanity SQL + idempotency cycle** (createdb → schema → migrate × 2 → drop).
5. **CSS Modules camelCase classes** обязательно (правило с `c8834b5`). Никаких kebab-case classnames внутри `.module.css`.
6. **Batch merge policy** — все 14 PR висят открытыми, мерджим в конце волны в строгом порядке #2.01 → #2.14. Каждая ветка от предыдущей.
7. **Push в main только по явному «ок»** от Vadim'а.
8. **После каждого commit — smoke в реальном браузере** (правило `feedback_smoke_real_browser.md`).
9. **Full grep retrospective ПЕРЕД пометкой Wave 2 closed** (lesson 2026-05-15 после Wave 1 hidden hardcodes).
10. **Wave 3 не параллельно** — линейно после Wave 2 + 24ч стабильности на проде.

---

## КАК АРХИТЕКТОР ПИШЕТ TZ (формат закреплён)

Каждый TZ-файл следует структуре `TZ_WAVE_2_01_schema_migrations.md`:

1. **Заголовок** + дата + roadmap link + цель + объём + риск
2. **Verify-step перед стартом** — конкретные grep / psql / ls команды + что искать + когда stopиться
3. **Зависимости** — от какой ветки строится
4. **Что блокирует** — почему этот коммит нужен
5. **Параллельная работа — координация** — что трогаем / НЕ трогаем
6. **Конкретная реализация** — SQL / код / схема компонентов
7. **Mock-based тесты** — без реальной БД
8. **NOT TOUCH** — явный список
9. **Smoke test** — в реальном браузере (или curl для backend-only)
10. **Файлы — итоговый чеклист** — что создать / изменить / НЕ трогать
11. **Текст коммита** — готовый, с Co-Authored-By trailer
12. **Пост-коммит** — что обновить в CLAUDE.md и memory
13. **Definition of Done** — checklist

**Premise drift защита:**
- TZ опирается на конкретные строки/имена функций которые могут сместиться
- Verify-step grep'ом перед каждым TZ — обязательно
- Если drift найден — Claude Code останавливается, спрашивает архитектора, не делает работу заново
- Drift'ы фиксируются в `memory/architect_premise_drift_2026-XX-XX.md`

---

## КАК ВЫГЛЯДИТ WORKFLOW

**Архитектор (Claude в чате):**
1. Пишет `TZ_WAVE_2_INDEX.md` (карта всей волны) — **готов**
2. Пишет `TZ_WAVE_2_01_schema_migrations.md` (первый коммит) — **готов**
3. Пишет 13 оставшихся TZ файлов **батчами по 2-3 за сообщение** (новые сессии по мере необходимости)

**Vadim:**
1. Получает TZ-файл
2. Запускает Claude Code в IDE с TZ-файлом
3. Claude Code: verify-step → код → тесты → commit на feature-ветке
4. Push на feature-ветку (НЕ main!), открыт PR
5. Smoke в браузере → если ок, статус ⏸ заморожен в `wave_2_progress.md`
6. Когда все 14 коммитов готовы — batch merge в main в строгом порядке #2.01 → #2.14
7. Prod deploy через CI/CD
8. Финальный prod-smoke
9. 24ч стабильности → Wave 3

---

## ЧТО НУЖНО ОТ НОВОЙ СЕССИИ АРХИТЕКТОРА

### Минимальный onboarding (10-15 минут)

Прочитать в указанном порядке:
1. **Этот handoff** (главное)
2. `TZ_WAVE_2_INDEX.md` (структура волны)
3. `TZ_WAVE_2_01_schema_migrations.md` (формат TZ)
4. `CLAUDE.md` (текущая схема БД и API) — особенно секции «Схема БД», «Правила кода», «Завершённые исправления»
5. Из memory (если есть доступ):
   - `memory/wave_1_complete.md`
   - `memory/wave_1_retrospective_2026-05-15.md`
   - `memory/architect_premise_drift_2026-05-13.md`
   - `memory/feedback_full_grep_after_bug_category_closed.md`

### Первое сообщение в новой сессии (template)

Vadim пишет архитектору:

> Wave 2 продолжение из handoff'а 2026-05-16. TZ_WAVE_2_INDEX + TZ_WAVE_2_01 утверждены. Прочитай handoff + INDEX + 01 + CLAUDE.md. Готов начинать с 2.02 (Pain locations seed + AdminContent → PainLocationsTab CRUD).

### Архитектор отвечает

Подтверждает что прочитал → пишет TZ 2.02 → present_files → ждёт «формат ок» → пишет следующий батч.

**Размер первого батча:** 2.02 + 2.03 (закрывает Блок A Foundation). Или 2.02 один если architect видит что концентрация важнее объёма.

---

## ВАЖНЫЕ NUANCES КОТОРЫЕ НОВАЯ СЕССИЯ ДОЛЖНА ПОМНИТЬ

### Stylistic / процессные

- **Vadim ценит pragmatic над perfectionism.** «Пилот не требует production-grade» — частая позиция. Когда архитектор начинает overcautious thinking (например, AI Tier 3 откладывать на post-pilot ради privacy review) — Vadim catches и корректирует. Архитектор не сопротивляется correction'ам, признаёт и адаптирует.
- **Vadim профессиональный физтер.** Clinical knowledge от Vadim'а первичен над AAOS/APTA textbook. Когда Vadim спрашивает «уверен про 10 см?» — архитектор делает web_search для verify, не упирается в свои изначальные guesses.
- **Vadim умеет читать код и premise drift'ы.** Catches несоответствия TZ vs реальность за минуты. Архитектор не пытается prove TZ был «прав в принципе» — признаёт drift и корректирует scope.

### Технические

- **Stack:** Express 5 + Postgres raw SQL (`query()` НЕ ORM), CommonJS backend; React 19 CRA + JavaScript (НЕ TypeScript) frontend.
- **CSS:** Modules с camelCase классами обязательно (правило `c8834b5`).
- **JWT auth:** instructor через localStorage, patient через httpOnly cookies.
- **22+ backend test files — все mock-based** (`jest.mock` для `db.js`). CI без Postgres. Integration-стиль НЕ используется.
- **AdminContent inline pattern** — все content CRUD табы (Phases, Tips, Videos, ProgramTypes, ProgramTemplates) inline в AdminContent.js. AdminUserModal — отдельный pattern для user CRUD, не для content.
- **`'general'` program_type sentinel** в tips — реальный pattern (16 записей в БД), оставлен в коде, не bug.

### Безопасность / privacy

- **Photo upload — биометрика.** Consent flow built-in в 2.06-2.10. Хранение на VDS NetAngels (РФ для 152-ФЗ).
- **JWT-protected** все фото endpoints, как existing `/api/patient-auth/avatar`.
- **OAuth flow стабилен** после Wave 1 hot-fix #5. НЕ переделывать.

### Что точно НЕ делать без явного запроса

- TypeScript migration
- CSS Modules → Tailwind/styled-components
- Использовать ORM
- Revive `/patient/:token` flow (удалён в миграции 20260409)
- Modify ExerciseRunner v4 LOCKED
- Use emoji в UI (только lucide-react)
- Use `pool` напрямую (только `query()`/`getClient()`)
- Add `success: true/false` в API responses
- Use Telegraf в Azarean Rehab
- Use Cyrillic в slash commands Telegram
- Trogать PatientDashboard.js + 4 dirty dark-theme файлов от 2026-05-04

---

## CHECKLIST НОВОЙ СЕССИИ ПЕРЕД НАПИСАНИЕМ 2.02

- [ ] Прочитан этот handoff
- [ ] Прочитан `TZ_WAVE_2_INDEX.md`
- [ ] Прочитан `TZ_WAVE_2_01_schema_migrations.md` (как образец формата)
- [ ] Прочитан `CLAUDE.md` (для current state)
- [ ] Прочитаны (если доступны) memory файлы — wave_1_complete, premise_drift, retrospective
- [ ] Понятна clinical foundation (16 pain locations, 13 measurements, three-tier ROM, three criterion types)
- [ ] Понятен формат TZ (13 секций, verify-step, mock-based тесты)
- [ ] Понятно что 2.02 = Pain locations seed + AdminContent → PainLocationsTab CRUD inline pattern
- [ ] Готов писать TZ 2.02

---

## КОНТАКТЫ И URLS

- **Repo:** https://github.com/jaike077-web/azarean-rehab
- **Prod:** https://my.azarean.ru
- **Vadim:** vadim@azarean.com, ops-bot `@vadim_azarenkov` (chat_id=183943760)
- **Test patient:** id=14, `avi707@mail.ru` / `Test1234`
- **Test instructor:** `vadim@azarean.com` / `Test1234`
- **Telegram bot prod:** `@az_zari_bot`
- **Telegram bot dev:** `@azarean_rehab_bot`

---

## POST-WAVE-2 ROADMAP (для контекста)

После закрытия Wave 2 (24ч стабильности на проде) — **closed pilot ready**.

**Critical path к closed pilot:**

1. Wave 1 (✅ в проде)
2. Wave 1 hot-fixes (5 mini-PR, ~3-5ч) — параллельно или до Wave 2
3. Wave 2 (76-95ч, 3-4 недели) — этот трек
4. Production gaps (Email Resend, /api/health, healthcheck Telegram alerts, compliance disclaimer fix) — ~6-10ч между Wave 2 и Wave 3
5. Wave 3 (multi-complex kind 'session/routine', frequency_per_day, session_summary VIEW, история тренировок) — 40-50ч
6. 24ч стабильности → 🚀 **closed pilot** (5-10 пациентов)

Wave 3 пишется в новой сессии после закрытия Wave 2 + накопленного pilot feedback.

**После closed pilot 4-6 недель + юрист параллельно** — public launch через 2-3 месяца от 2026-05-16.

---

## КОНЕЦ HANDOFF

Этот документ — единственное что нужно архитектору для возобновления Wave 2. Если что-то непонятно — спросить Vadim'а ДО написания первого TZ, не угадывать.

**Successor archتект знает:**
- Что построено (Wave 0+1+retrospective)
- Что нужно построить (Wave 2 — 14 коммитов в 6 блоках)
- Как строить (формат TZ, verify-step, mock-based тесты, batch merge)
- Что не трогать (4 dirty dark-theme файлы, ExerciseRunner LOCKED, и т.д.)
- Что Vadim уже сказал и что НЕ нужно переспрашивать (clinical foundation, three-tier approach, MVP scope, bilateral logic, pain locations, criteria types)

Удачи. Wave 2 — это критическая волна для clinical credibility всего продукта. Не торопись, делай качественно.
