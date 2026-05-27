# Wave 1 — Финальный отчёт архитектору после прод-деплоя

**Дата:** 2026-05-15
**Статус:** ✅ Wave 1 полностью смерджена в main и задеплоена. Prod-smoke 4/5 ✅. 8 backlog finding'ов готовы к разбору.

---

## TL;DR

- **10 PR смерджены через GitHub UI/CLI** в 60-минутный batch (#51 → #60) с retarget+rebase+force-push+squash-merge циклом
- **10 deploy success** на my.azarean.ru, ops-bot тихо
- **Backend 423/423, Frontend 252/252** (метрики после Wave 1)
- **Bug #12 (хардкод acl) и Bug #13 (Комплекс #N) закрыты**
- **8 backlog finding'ов из prod-smoke** — некоторые требуют твоих решений
- **Ждём твоих ответов** на 4 OPEN questions для Wave 2 TZ

---

## Что приехало в прод

### Блок A — Multi-protocol foundation (Bug #12 закрыт)

| # | SHA | Что |
|---|---|---|
| 1.01 | `f71038e` | Миграция `program_types` (PK code) + ALTER `rehab_programs` ADD `program_type VARCHAR(50) NOT NULL DEFAULT 'acl'` + FK. Seed `acl/knee_general/shoulder_general`. Regex-backfill по diagnosis. |
| 1.02 | `9ba85a4` | `GET /api/rehab/program-types` публичный + JOIN program_types в `/my/dashboard` (program.program_label/joint/surgery_required) |
| 1.03 | `a995ef1` | Удалён `backend/utils/programLabels.js` + 16 тест-кейсов. `program_label` теперь только из JOIN с справочником |
| 1.04 | `d9fab17` | Убран дефолт 'acl' в `services/api.js` getPhases. RoadmapScreen reads program_type из dashboardData. telegramBot SQL подтягивает фазы через `rp.program_type` JOIN'ом. **Bug #12 закрыт полностью** |
| 1.05 | `b34ad63` | AdminContent: CRUD program_types (inline ProgramTypesTab), select в PhaseForm, filter в PhasesTab. App-level ptCheck в `/admin/phases`. **Блок A завершён** |

### Блок B — Шаблоны программ + stuck detection (Bug #13 закрыт)

| # | SHA | Что |
|---|---|---|
| 1.06 | `f6f9617` | Миграция `program_templates` (code UNIQUE, FK→program_types, surgery_required, default_phase_count, variant_of self-FK) + junction `program_template_phase_complexes` (FK CASCADE, UNIQUE per template+phase). ALTER `rehab_programs ADD program_template_id` (tracking). ALTER `templates ADD program_type` (фильтрация). 2 публичных endpoint'а. `POST /api/rehab/programs` принимает `program_template_id` (резолвит program_type из шаблона) |
| 1.07 | `16b300a` | AdminContent ProgramTemplatesTab + ProgramTemplateForm + PhaseComplexEditor + PhaseComplexRow (всё inline по существующему паттерну). 7 admin endpoints CRUD + UPSERT junction через ON CONFLICT DO UPDATE |
| 1.08a | `81c4305` | Computed `derived_title` в 4 SELECT'ах `routes/complexes.js`: `COALESCE(NULLIF(title, ''), first 2 exercises joined ' · ')`. Bug #13 backend prep |
| 1.08b | `e7b4944` | `RehabProgramModal.js` → директория: router + CreateWizard 3-step (Template → Details → Review) + EditForm 1-step + ComplexSelector. Read-only бейдж «Создано из шаблона». **Bug #13 закрыт** |
| 1.09 | `c74c468` | `phase_stuck_alerts` таблица (UNIQUE program/phase/level, дедуп). `services/stuckDetection.js` (yellow 1.3× / red 1.7×, parseDurationWeeksUpper для VARCHAR диапазонов). Weekly cron понедельник 09:00 МСК (6-я задача scheduler'а). Red push через `opsAlert.sendOpsAlert` (вместо per-instructor — `users.telegram_chat_id` нет в схеме). `GET /api/rehab/programs/:id/stuck-status` + `is_stuck_on_phase` EXISTS-агрегат в `/api/patients`. Yellow stuckBadge в Patients.js |

### Метрики
- Backend тесты: 338 → **423** (+85)
- Frontend тесты: 236 → **252** (+16)
- 3 миграции БД, все идемпотентны
- 7 premise drift'ов отловлены и адаптированы

---

## Prod-smoke результаты (2026-05-15)

| Сценарий | Что проверяли | Статус |
|---|---|---|
| 1 | ACL пациент (Vadim id=6 через Yandex OAuth) | ✅ HomeScreen label «ПКС реабилитация», Roadmap фазы (7) грузятся |
| 2 | CreateWizard для нового пациента | ✅ 3 шага открываются, program_type dropdown работает, derived_title виден в селекторе комплекса |
| 3 | Shoulder-пациент с label «Реабилитация плеча» | ✅ **Bug #12 E2E verified для не-ACL**. Label из `program_types` справочника. Roadmap пустой (нет seed phases для shoulder_general — backlog) |
| 4 | program_template через AdminContent | ✅ ProgramTypesTab + PhaseComplexEditor работают. CSS broken (pre-existing) |
| 5 | Red push в ops-bot через cron | ⚠️ E2E не выполнен (SSH classifier-block). Покрыт **8 mock-based unit-тестами**. Плановый cron Mon 09:00 МСК подтвердит на проде |

---

## Premise drift'ы из Wave 1 (7 шт.)

Все зафиксированы в [memory/architect_premise_drift_2026-05-13.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/architect_premise_drift_2026-05-13.md).

**Pattern:** TZ опирался на конкретные строки/имена функций → проверка grep'ом находила смещение → адаптация без потери scope. Договорённость «verify-step grep'ом перед каждым TZ» работает.

Сводка drift'ов:
1. **1.03** — `mapDiagnosisToLabel` не существовал; фикс был на backend (`programLabels.js`), не frontend
2. **1.04** — Хардкод `'acl'` в `services/api.js:462`, не `RoadmapScreen.js:344`. PatientDashboard.js (dirty) не тронут
3. **1.05** — `?program_type=` фильтр + поле program_type в форме УЖЕ существовали. Реальный scope меньше
5. **1.07** — «AdminUserModal pattern» — реально inline-pattern в AdminContent.js. Продолжил inline
6. **1.08b** — RehabProgramModal уже был dual-mode (create/edit). Wizard только для create-ветки (вариант A)
7 (5 sub-drifts) — **1.09**: `duration_weeks` VARCHAR с диапазонами → shared `phaseDuration.js`; нет `users.telegram_chat_id` → opsAlert; не повторяем хардкод 'acl' → `program.program_type`; CSS Modules camelCase → `stuckBadge`; Patients.js grid/list dual view → вставка в `patientInfo`

---

## Архитектурные решения (зафиксированы)

### От тебя 2026-05-13, подтверждены практикой
1. **opsAlert для red-push** — pragmatic, работает с 1 инструктором; migration `users.telegram_chat_id` в backlog (триггер: 2-й куратор)
2. **CreateWizard только для create-ветки** — EditForm остаётся 1-step
3. **Yellow alert без push (by design)** — только badge в Patients.js
4. **Thresholds 1.3 / 1.7 для пилота** — стартовые, корректировка по данным

### От меня в ходе работы
- **Stacked PRs batch merge strategy** — base = previous branch, после merge'а retarget+rebase+force-push. Diff чистый (1 commit per PR). 10 циклов за ~60 минут.
- **`rehab_phases.duration_weeks` VARCHAR-диапазон** — shared `utils/phaseDuration.js` для пациентского + инструкторского stuck check (DRY)
- **TELEGRAM_BOT_TOKEN gate scheduler'а** сохранён (existing pattern)
- **Dark-theme dirty файлы изолированы** через `git stash` перед каждым rebase

---

## 8 Backlog finding'ов из prod-smoke (требуют твоих решений)

### 🔴 HIGH — Архитектор-fix (блокер коммерческого запуска)

**5. OAuth blocked после local-регистрации** — [memory](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_oauth_blocked_after_local_registration.md)

`backend/routes/patientAuth.js:1695,1902` — Telegram + Yandex callback'и фильтруют `WHERE phone = $1 AND password_hash IS NULL`. После self-registration через invite-code password_hash != NULL → phone-autolink **больше не работает**. Каждый новый пациент после Wave 1 invite-flow попадает в ловушку при попытке OAuth: callback redirect'ит на `/patient-register` с pre-fill, но invite-code обязателен и старый use'нут → тупик.

**Why blocker:** real flow — пациент регистрируется через email+password (Wave 1 #invite-code), через неделю забывает пароль, хочет Yandex → не может войти. Только `/forgot-password` спасает.

**Why security-sensitive:** изменение OAuth auto-link логики (расширение `password_hash IS NULL`-фильтра) требует твоего дизайна. Возможные подходы:
- Убрать `AND password_hash IS NULL` + сохранить multi-match anti-misroute (`if rows.length === 1`)
- Добавить email-match как fallback (явный или строгий)
- Решить: linkType остаётся `phone_autolink` или новый `oauth_link_post_registration` для audit?

**Запрос:** нужен дизайн от тебя + TZ для hot-fix.

### 🟡 MEDIUM — Hot-fix mini-PRs (4 шт., proportional к value)

| # | Memory | Объём | Что |
|---|---|---|---|
| 2 | [bug_complex_title_field_missing_in_ui](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_complex_title_field_missing_in_ui.md) | ~30 мин | `complexes.title` в БД есть, но в CreateComplex.js поля нет. Все complexes с `title=NULL`. **Root cause Bug #13** — derived_title только косметика |
| 3 | [bug_patient_stuck_status_hardcoded_acl](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_patient_stuck_status_hardcoded_acl.md) | ~30 мин | Пациентский `/my/stuck-status` хардкодит `program_type='acl'`. **TZ готов в корне.** Shoulder/knee_general пациенты не видят stuck banner. Wave 1 #1.04 убрал хардкод в trio (RoadmapScreen/api.js/telegramBot), но этот endpoint остался за scope |
| 1 | [bug_admin_content_css_modules_unfinished](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_css_modules_unfinished.md) | ~1-2ч | 30+ class имён в AdminContent.js не определены в `AdminContent.module.css` (только 80 строк tabs). Pre-existing с 2026-05-04 CSS Modules миграции — никто не заметил т.к. админ редко открывает страницу. Wave 1 #1.05+1.07 добавили новые табы с тем же broken pattern. Fix: вынести shared admin classes |
| 4 | [bug_invite_code_share_link](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_invite_code_share_link.md) | ~15-30 мин | Telegram-share UX: trailing colon в тексте, код не tap-to-copy. Real fix: pre-fill `?code=XXXX` в URL → Register.js auto-fills. Снимает необходимость копирования |

### 🟢 LOW / Архитектор-вопросы (backlog)

| # | Memory | Why |
|---|---|---|
| 6 | [feature_per_instructor_telegram_linking](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feature_per_instructor_telegram_linking.md) | Миграция `users.telegram_chat_id` + UI linking. Триггер: 2-й активный куратор. До тех пор opsAlert работает |
| 7 | [backlog_seed_phases_for_non_acl_program_types](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/backlog_seed_phases_for_non_acl_program_types.md) | `rehab_phases` сидированы только для `acl` (7 фаз). Shoulder/knee_general пациенты видят пустой Roadmap. **Нужен от тебя дизайн структуры фаз** + seed-файлы для shoulder_general / knee_general |
| 8 | [feature_multiple_programs_per_patient](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feature_multiple_programs_per_patient.md) | БД допускает N программ (нет UNIQUE), UI работает с одной (LIMIT 1). Архитектурный gap для «плечо+колено одновременно». **3 варианта решения** (UNIQUE / N+UI / is_primary гибрид) — твой выбор |

---

## Feedback правила (новые из smoke)

- [feedback_precise_ui_paths.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_precise_ui_paths.md) — точные UI-пути в smoke-чеклистах (grep перед написанием инструкций)
- [feedback_dont_assume_pilot_size.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_dont_assume_pilot_size.md) — не обесценивать архитектурные баги через «1 пациент = пилот»

Оба — продолжение существующего pattern'а ([feedback_dont_assume_user_needs.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_dont_assume_user_needs.md) от 2026-05-08): severity оценивается через нормальный flow продукта, не через текущий объём пользователей.

---

## Состояние

### Main commits (последние 10 = вся Wave 1)
```
c74c468 feat(stuck): инструкторская сторона detection — bейджи и opsAlert push (#60)
e7b4944 feat(rehab-program-modal): dual-mode (CreateWizard + EditForm) + Bug #13 closed (#59)
81c4305 feat(complexes): derived_title computed field для Bug #13 fallback (#58)
16b300a feat(admin): CRUD UI для program_templates + phase_complexes junction (#57)
f6f9617 feat(db, api): program_templates + endpoints + POST /programs принимает template_id (#56)
b34ad63 feat(admin): CRUD program_types + select PhaseForm + filter PhasesTab (#55)
d9fab17 feat(roadmap, telegram): динамический program_type — Bug #12 закрыт (#54)
a995ef1 feat(home): program_label полностью из справочника program_types (#53)
9ba85a4 feat(api): program_types endpoint + program_label в dashboard (#52)
f71038e feat(db): справочник program_types + rehab_programs.program_type (#51)
```

### Миграции на проде (applied via `deploy/migrate.sh` checksum-tracking)
- `20260512_program_types.sql` ✓
- `20260513_program_templates.sql` ✓
- `20260513_phase_stuck_alerts.sql` ✓

### Feature-ветки
Все 10 удалены (origin + local). Чисто.

### Dirty файлы dark-theme
4 файла uncommitted (не Wave 1 — от 2026-05-04 dark-theme работ архитектора). Stash восстановлен после batch merge. Изоляция сохранена.

---

## Wave 2 — что ждёт от тебя

Архитектурные **4 OPEN questions** + 1 решение, которые нужны для написания TZ Wave 2 (клинический дневник):

1. **Measurement details для плеча** — какие конкретно измерения (ROM forward flexion / abduction / IR / ER)? Frequency? Через фото или ввод цифр?
2. **Measurement details для голеностопа** — DF/PF angle, swelling girth, single-leg balance time?
3. **Measurement details для позвоночника** — Schober test, lateral flexion, pain on movement?
4. **Measurement details для ТБС** — Trendelenburg, hip flexion, SLR?
5. **Simplified pain events vs полная модель** — VAS 0-10 числом / эмодзи / категории (нет/тупо/острая)? Pain location body diagram или free text?

**Параллельно с Wave 2** можно начинать разбирать прод-backlog finding'ов выше — особенно блокер #5 (OAuth).

---

## Точка входа в проект для нового чата

`SESSION_HANDOFF_2026-05-15_WAVE1_DONE.md` (в корне репо) — полная сводка с навигацией по backlog + командам.

---

🟢 **Wave 1 ушла в прод. Ждём твои ответы для Wave 2 и решение по OAuth-блокеру.**
