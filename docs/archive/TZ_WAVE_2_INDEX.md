# Wave 2 — Клинический дневник (INDEX)

**Дата:** 2026-05-16
**Контекст:** PATIENT_UX_ROADMAP_2026-05-08_v2.md Волна 2 + clinical foundation 2026-05-13 — 2026-05-16
**Цель волны:** превратить упрощённый diary (pain/swelling/mobility/mood/sleep) в **полноценный клинический дневник** с:
- Структурированными measurements (ROM degrees, окружности cm, heel-to-buttock distance, hand-behind-back enum)
- Three-tier ROM measurement подход (numeric self-report + manual canvas markup + MediaPipe AI auto-detect)
- Structured pain tracking (VAS slider + локации + триггер + характер) + Pain Event entity для экстренных
- Structured phase transition criteria (auto-check + self-report + instructor-check)
- Stuck banner stage 2 (с criteria readiness)
- Per-instructor red flag automation через ops-alert (pain в опасных локациях, vas≥8)

**MVP scope:** Shoulder + Knee (по решению Vadim'а 2026-05-15). Ankle/Spine/Hip — через AdminContent UI позже когда понадобится.

---

## Связь с Wave 1 — что разблокировано

Wave 1 заложил multi-protocol foundation (program_types, program_templates, dynamic program_type повсюду). Wave 2 строится на этом:
- `rom_measurements.measurement_type` ссылается на per-program_type measurement codes (например `shoulder_forward_flexion_degrees`, `knee_flexion_degrees`)
- `phase_transition_criteria` JOIN'ит `rehab_phases` (Wave 1 расширил schema)
- `pain_locations` имеет FK на `program_types` — per-protocol списки локаций

Hot-fix Wave 1 (5 mini-PRs) должны быть закрыты **до старта Wave 2** (по приоритетам из retrospective 2026-05-15).

---

## Финальный clinical scope (закреплено 2026-05-16)

### Shoulder (5 ROM + 2 girths)
**ROM** (Tier 1+2+3 — все 3 tier'а):
- Forward Flexion
- Abduction
- External Rotation в 0°
- Internal Rotation в 90° abduction
- Hand-Behind-Back (categorical T/L enum, не градусы)

**Girths** (Tier 1 only — numeric input):
- Mid-deltoid
- Mid-biceps

### Knee (2 ROM + 1 alt + 5 girths)
**ROM:**
- Flexion (Tier 1+2+3)
- Extension (Tier 1+2+3)
- Heel-to-buttock distance (Tier 1 only — cm, home-friendly альтернатива)

**Girths** (Tier 1 only):
- Knee joint line
- 5 cm above superior pole patella (VMO)
- 10 cm above (general quadriceps)
- 15 cm above (mid-thigh)
- Calf max

### Bilateral logic
- **Baseline** (первый замер программы) — bilateral L+R обязательно (калибровка к личной норме)
- **Follow-up рутинный** — affected side only
- **Re-calibration** — bilateral раз в 4-6 недель (UI напоминает если пропущено)
- **Discharge** — bilateral обязательно (LSI assessment)

### Pain tracking
**Daily (DiaryScreen):**
- VAS slider 0-10 (primary, compact)
- Accordion «Уточнить» (опционально): locations multi-select + trigger + character

**Pain Event (HomeScreen SOS button):**
- Отдельная сущность для acute эпизодов
- Push куратору через ops-alert immediately
- Full form: VAS + locations + trigger + character + textarea + photo (опц.)

**Red flag automation:** при появлении pain в red-flag локациях (`knee.calf_posterior` DVT marker, `shoulder.neck_lateral` radiculopathy) или vas_score≥8 — push куратору даже из daily entry.

### Phase transition criteria
Three types:
- **measurement** — auto-check против rom_measurements / girth_measurements / pain_entries
- **self_report** — пациент tap'ает «могу/не могу» с hint text
- **instructor_check** — куратор подтверждает очно через инструкторский UI

Default seed для ACL — заложен мной из AAOS/APTA knowledge (~30 criteria), Vadim откалибровывает позже через AdminContent. Shoulder_general и knee_general criteria — Vadim наполняет с нуля через UI.

---

## Структура волны — 14 коммитов в 6 блоках

### Блок A — Foundation (schemas + content layer) — 3 коммита

| # | Файл | Что | Объём |
|---|---|---|---|
| 2.01 | `TZ_WAVE_2_01_schema_migrations.md` | Все таблицы одной миграцией: rom_measurements, girth_measurements, pain_locations, pain_entries, pain_entry_locations, phase_transition_criteria, patient_criterion_answers + ALTER patients (measurement_reference_photo_url). Sanity SQL + idempotency cycle | 3-4 ч |
| 2.02 | `TZ_WAVE_2_02_pain_locations_admin.md` | Seed 8 knee + 8 shoulder pain locations + AdminContent → PainLocationsTab inline CRUD по образцу ProgramTypesTab | 4-5 ч |
| 2.03 | `TZ_WAVE_2_03_criteria_admin_seed.md` | Seed ACL default criteria (~30 records, мой AAOS default) + AdminContent расширение PhasesTab с criteria sub-CRUD под каждой фазой | 6-7 ч |

### Блок B — Pain tracking — 2 коммита

| # | Файл | Что | Объём |
|---|---|---|---|
| 2.04 | `TZ_WAVE_2_04_pain_backend.md` | Backend `/api/rehab/my/pain` daily + event endpoints, red flag automation logic, ops-alert integration на trigger conditions | 5-6 ч |
| 2.05 | `TZ_WAVE_2_05_pain_frontend.md` | DiaryScreen расширенный: VAS slider + accordion «Уточнить» с locations/trigger/character. HomeScreen Pain Event SOS button + full form. CSS Module camelCase | 6-7 ч |

### Блок C — Measurement track Tier 1+2 — 3 коммита

| # | Файл | Что | Объём |
|---|---|---|---|
| 2.06 | `TZ_WAVE_2_06_measurements_backend.md` | Backend `/api/rehab/my/measurements` (rom + girth + hbd CRUD), measurement_session_id grouping для bilateral, photo upload infrastructure для ROM (по образцу avatars), общие reference photo serving | 5-6 ч |
| 2.07 | `TZ_WAVE_2_07_measurements_ui_tier1.md` | Frontend пациент UI: ROM/girth screens с numeric input + reference photos (общие из content layer, personal если есть), HBD numeric, baseline bilateral flow, follow-up affected-only flow | 7-8 ч |
| 2.08 | `TZ_WAVE_2_08_canvas_markup_tier2.md` | Photo upload flow для ROM, инструкторский canvas-overlay markup UI (3 точки → Math.atan2 угол), markup queue dashboard, personal reference photos upload (студийный flow) | 6-8 ч |

### Блок D — AI Tier 3 (MediaPipe) — 2 коммита

| # | Файл | Что | Объём |
|---|---|---|---|
| 2.09 | `TZ_WAVE_2_09_mediapipe_integration.md` | @mediapipe/tasks-vision integration, code-splitting (lazy load ROM screens + MediaPipe bundle отдельный chunk), Pose Landmarker setup, JS angle compute из 33 landmarks для каждого movement_type, feature flag MEDIAPIPE_ENABLED | 10-12 ч |
| 2.10 | `TZ_WAVE_2_10_ai_confidence_validation.md` | Confidence handling (auto-fallback на manual markup при confidence<0.8), validation tracking (ai_suggested_degrees vs final value_degrees), instructor verify UI для AI-suggested замеров, privacy consent flow при первом фото-upload'е | 6-8 ч |

### Блок E — Criteria evaluation — 3 коммита

| # | Файл | Что | Объём |
|---|---|---|---|
| 2.11 | `TZ_WAVE_2_11_criteria_backend.md` | Backend `/api/rehab/my/phase-criteria`, evaluator service (auto-check measurement criteria через latest measurements lookup), threshold operators (>=, <=, between, =) | 5-6 ч |
| 2.12 | `TZ_WAVE_2_12_criteria_self_instructor.md` | Self_report flow (patient_criterion_answers + endpoints POST/DELETE), instructor_check flow (admin endpoint + audit log), staleness check (свежесть measurement <7 дней) | 4-5 ч |
| 2.13 | `TZ_WAVE_2_13_roadmap_stuck_v2.md` | Frontend Roadmap UI: criteria checkboxes с тремя статусами (met/pending/not_met) + actionable hints. Stuck banner stage 2 (logic из Wave 0 #06 → criteria-aware): три варианта баннера (ready/time-exceeded-criteria-not-met/time-only) | 5-6 ч |

### Блок F — Polish — 1 коммит

| # | Файл | Что | Объём |
|---|---|---|---|
| 2.14 | `TZ_WAVE_2_14_patients_badges.md` | Patients.js: badges «N pain events за неделю» (если >2), «измерения устарели» (если no recent measurement >14d), «готов к Фазе N+1» (если criteria met but куратор не перевёл). Tests cleanup + final retrospective grep | 4-5 ч |

### Объём итого

- **14 коммитов**
- **76-95 часов** работы Claude Code
- 1 миграция (вся структура в одной идемпотентной)
- AI integration: ~16-20 часов из общего объёма (Блок D)
- Criteria: ~14-17 часов (Блок E)
- Pain: ~11-13 часов (Блок B)
- Measurements: ~18-22 часа (Блок C)
- Foundation: ~13-16 часов (Блок A)

Это **3-4 недели** в темпе Wave 1 (3-4 коммита в день когда есть моментум, 5-7 коммитов в неделю в спокойном темпе).

---

## Контент-работа Vadim'а

**Блокер для запуска UI пациента:**

| Категория | Объём |
|---|---|
| Reference photos (общие) — 15 эталонных фото | 4-6 часов в студии |
| Тексты инструкций — 15 штук | 2-3 часа |
| Pain locations review — подтвердить/исправить 16 локаций | 1 час |
| Phase criteria для shoulder_general и knee_general — Vadim наполняет через UI после 2.13 ships | 3-4 часа clinical time |
| Personal reference photos для тестовых пациентов | по 30 мин на пациента при baseline визите |

**Можно делать параллельно с Wave 2 кодом** (Claude Code не блокируется на ожидании контента — UI разворачивается с placeholder photo если нет реального). Финальная замена placeholder'ов на content — отдельный quick merge перед prod deploy.

---

## Принципы исполнения (повтор из Wave 0/1)

1. **Один файл = один коммит.** STOP между коммитами.
2. **Verify-step grep'ом ПЕРЕД началом каждого TZ** (правило с 2026-05-13 после Wave 1 drift'ов). В каждом TZ есть секция «Verify-step» с конкретными командами.
3. **Все backend-тесты mock-based** (jest.mock для `db.js`). Integration-стиль не используется.
4. **Миграции — sanity SQL + idempotency cycle** (createdb → schema → migrate × 2 → drop).
5. **CSS Modules camelCase classes** обязательно (правило с `c8834b5`).
6. **Batch merge policy** — все 14 PR висят открытыми, мерджим в конце волны в строгом порядке #2.01 → #2.14.
7. **Push в main только по явному «ок»** от Vadim'а.
8. **После каждого commit — smoke в реальном браузере** (правило `feedback_smoke_real_browser.md`).
9. **Full grep retrospective ПЕРЕД пометкой Wave 2 closed** (правило с 2026-05-15 после Wave 1 hidden hardcodes).
10. **Wave 3 не параллельно** — линейно после Wave 2 + 24ч стабильности на проде.

---

## Параллельная работа — координация

### НЕ ТРОГАТЬ во время Wave 2

- 4 файла uncommitted dark-theme от 2026-05-04 (если ещё не залиты)
- ExerciseRunner LOCKED
- PatientDashboard `pd-*` стили / `--az-*` palette
- OAuth flow (стабилен после hot-fix #5)
- AdminContent сейчас существующие табы (Phases, Tips, Videos, ProgramTypes, ProgramTemplates) — НЕ трогаем, только добавляем новые табы и расширения

### Координация по файлам (риск merge-конфликтов)

| Файл | 2.01-2.14 коммиты | Заметка |
|---|---|---|
| `routes/rehab.js` | 2.04, 2.06, 2.11, 2.12, 2.13 | Часто — координировать |
| `routes/admin.js` | 2.02, 2.03 | Только Блок A |
| `services/telegramBot.js` | 2.04 | ops-alert integration |
| `services/scheduler.js` | (не трогаем в Wave 2) | — |
| `frontend/src/pages/PatientDashboard/components/DiaryScreen.js` | 2.05 | расширение pain |
| `frontend/src/pages/PatientDashboard/components/HomeScreen.js` | 2.05 | Pain Event button |
| `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js` | 2.13 | criteria + stuck v2 |
| Новые экраны `MeasurementsScreen.js`, `ROMRunner.js`, `PainEventForm.js` | 2.05-2.10 | новые файлы |
| `frontend/src/pages/Admin/AdminContent.js` | 2.02, 2.03 | inline CRUD |
| `frontend/src/pages/Patients.js` | 2.14 | badges |
| `frontend/src/services/api.js` | почти все коммиты | расширение |

---

## `wave_2_progress.md` — журнал прогресса (формат)

```md
# Wave 2 — Прогресс

## Блок A — Foundation
| # | Статус | SHA | Дата | Smoke | PR | Заметки |
|---|---|---|---|---|---|---|
| 2.01 | ⏳ | — | — | — | — | — |
| 2.02 | ⏳ | — | — | — | — | — |
| 2.03 | ⏳ | — | — | — | — | — |

## Блок B — Pain tracking
| 2.04 | ⏳ | — | — | — | — | — |
| 2.05 | ⏳ | — | — | — | — | — |

## Блок C — Measurements Tier 1+2
| 2.06 | ⏳ | — | — | — | — | — |
| 2.07 | ⏳ | — | — | — | — | — |
| 2.08 | ⏳ | — | — | — | — | — |

## Блок D — AI Tier 3
| 2.09 | ⏳ | — | — | — | — | — |
| 2.10 | ⏳ | — | — | — | — | — |

## Блок E — Criteria
| 2.11 | ⏳ | — | — | — | — | — |
| 2.12 | ⏳ | — | — | — | — | — |
| 2.13 | ⏳ | — | — | — | — | — |

## Блок F — Polish
| 2.14 | ⏳ | — | — | — | — | — |

Статусы: ⏳ ждёт · 🔵 в работе · 🟡 готов к smoke · ⏸ заморожен (batch merge) · 🟢 в main · 🔴 откат
```

---

## DoD — вся Wave 2

- [ ] Все 14 коммитов в main
- [ ] Backend тесты ≥ 500 (старт ~430 после Wave 1 + hot-fixes)
- [ ] Frontend тесты ≥ 290 (старт ~255)
- [ ] Миграция Wave 2 прошла idempotency cycle
- [ ] Prod-smoke на минимум 2 пациентах (ACL + shoulder)
- [ ] MediaPipe lazy-load работает на mobile + dark theme
- [ ] Privacy consent UI показывается при первом фото upload'е
- [ ] Red flag automation triggred (тест через искусственный pain entry с calf_posterior)
- [ ] AdminContent: PainLocationsTab + расширение PhasesTab criteria — работают
- [ ] CLAUDE.md обновлён по каждому коммиту
- [ ] `memory/wave_2_complete.md` создан
- [ ] Снапшот `ARCHITECT_STATUS_2026-XX-XX.md` после закрытия
- [ ] **Full grep retrospective пройден** перед закрытием (lesson Wave 1)
- [ ] 24ч стабильности на проде до старта Wave 3

---

## Что после Wave 2

**Closed pilot готовность.** После Wave 2 у нас:
- Полноценный клинический дневник с structured measurements
- AI-assisted ROM track
- Critеria-aware Roadmap
- Pain event safety net

Следующие необязательные перед пилотом треки (~6-10ч):
- Email Resend integration
- `/api/health` endpoint
- Healthcheck Telegram alerts через ops-bot
- Compliance disclaimer fix

После них — **Wave 3** (multi-complex kind 'session/routine' + compliance frequency_per_day + session_summary VIEW + история тренировок). Wave 3 объём ~40-50ч, делается параллельно с пилотным запуском.

---

## Открытые вопросы — все закрыты на 2026-05-16

1. ✅ Three-tier ROM approach (numeric/markup/AI) — все три в одной волне (Vadim 2026-05-15)
2. ✅ Shoulder + Knee в MVP — ankle/spine/hip позже через AdminContent (Vadim 2026-05-15)
3. ✅ 5 shoulder ROM + 2 shoulder girths + 2 knee ROM + 1 HBD + 5 knee girths (с calf max) — финализировано 2026-05-16
4. ✅ Bilateral: baseline + periodic re-calibration + discharge. Default follow-up = affected only
5. ✅ Pain: гибрид VAS slider + accordion «Уточнить» + Pain Event SOS как отдельная entity
6. ✅ Pain locations: 8 knee + 8 shoulder, моя выборка принята
7. ✅ Red flag automation для `calf_posterior` / `neck_lateral` / vas≥8 — push куратору
8. ✅ Criteria: three types (measurement / self_report / instructor_check)
9. ✅ Criteria seed для ACL — Claude из AAOS knowledge, Vadim откалибровывает позже
10. ✅ MediaPipe Apache 2.0 free, integration в Wave 2

---

## Премис drift предотвращение

Lesson из Wave 1: TZ часто опирается на конкретные строки/имена функций которые сместились или не существуют. **Verify-step grep'ом перед каждым TZ — обязательно.**

Конкретные точки потенциального рассинхрона на момент 2026-05-16:

- **AdminContent.js** мог быть рефакторен (после hot-fix #1 CSS Modules). Перед 2.02/2.03 — grep структуры табов.
- **DiaryScreen.js** мог быть refactored если был включён в hot-fix CSS work. Перед 2.05 — grep.
- **rehab_phases.criteria_next** — текстовое поле, не должно конфликтовать со structured criteria из 2.03. Но всё равно verify.
- **services/api.js** растёт каждый коммит — отслеживать порядок добавлений helpers.

---

## Memory references

- `PATIENT_UX_ROADMAP_2026-05-08_v2.md` — корневой roadmap
- `TZ_WAVE_0_INDEX.md` + 6 TZ файлов Wave 0
- `TZ_WAVE_1_INDEX.md` (v2) + 10 TZ файлов Wave 1
- `memory/wave_0_complete.md`, `memory/wave_1_complete.md`
- `memory/wave_0_batch_merge_policy.md`
- `memory/architect_premise_drift_2026-05-13.md`
- `memory/wave_1_retrospective_2026-05-15.md`
- `memory/feedback_full_grep_after_bug_category_closed.md`
- `memory/feedback_one_change_per_session.md`
- `memory/feedback_smoke_real_browser.md`
- `CLAUDE.md` — стек, схема БД, правила кода
