# Wave 1 — Multi-protocol Foundation + Шаблоны программ (INDEX, v2)

**Дата:** 2026-05-13 (split 1.08 update)
**Контекст:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` + brief `WAVE_1_ARCHITECT_BRIEF.md`
**Изменения v2 относительно v1 (2026-05-12):** split коммита 1.08 на 1.08a (backend prep) + 1.08b (UI wizard) по договорённости от 2026-05-13. Wave 1 теперь 10 коммитов вместо 9.

---

## Связь с Wave 0 — что закрыто, что осталось

(без изменений с v1, см. `git log` ради точных SHA Wave 0)

**Закрыто Wave 0 + hot-fix `52631a2`:** Bug #7, #11, #14. Bug #12 закрывался частично — полностью закроется в 1.04 (см. ниже).

**Поглощается Wave 1:**
- Bug #12 — закрыт в **1.04** (`commit ceb32aa`, премиса драфтилась на api.js:462 не RoadmapScreen:344)
- Bug #13 (RehabProgramModal «Комплекс #N» fallback) — закрывается в **1.08a backend** (derived_title в `GET /complexes`) + **1.08b frontend** (использование поля).

**НЕ в этой волне:** Bug #15 (MDEditor dark theme), Star Tracker трек, open questions Wave 2.

---

## Принципы исполнения

(unchanged) Один файл = один коммит. STOP между. Batch merge policy. Feature-ветки от предыдущей. НЕ выдумывать, **verify-step через grep перед стартом каждого ТЗ** (договорённость 2026-05-13). НЕ миксовать с соседним. Wave 2 не параллельно — линейно после Wave 1 + 24ч стабильности.

**Новое правило 2026-05-13:** Все backend-тесты mock-based (jest.mock для `db.js` или для всего `routes/...`), integration-стиль с реальной БД НЕ используется (не вписывается в infra — 22 файла мокают, CI без Postgres). Миграции верифицируются sanity SQL + обязательный idempotency cycle `createdb → schema → migrate × 2 → drop`.

---

## Структура волны — блок A + блок B (10 коммитов)

### Блок A — Фундамент multi-protocol (ЗАКРЫТ — 5 коммитов на feature-ветках)

| # | Файл | SHA | Статус | Заметка |
|---|---|---|---|---|
| 1.01 | `TZ_WAVE_1_01_program_types_migration.md` | `a3dfff7` | ⏸ | sanity SQL тесты вместо integration |
| 1.02 | `TZ_WAVE_1_02_program_type_dashboard.md` | `b0170f1` | ⏸ | без отклонений |
| 1.03 | `TZ_WAVE_1_03_home_label_full_replacement.md` | `fa177b4` | ⏸ | drift: regex был на бэке, frontend не трогался |
| 1.04 | `TZ_WAVE_1_04_roadmap_telegram_dynamic.md` | `ceb32aa` | ⏸ | drift: хардкод в api.js:462 не RoadmapScreen. Bug #12 closed |
| 1.05 | `TZ_WAVE_1_05_admin_phases_program_type.md` | `8c420b2` | ⏸ | drift: filter + поле уже были в коде, реальный scope меньше |

Backend: 344 → 397 (+53). Frontend: 243 → 243 (без новых dedicated, AdminPanel.test.js не сломан).

### Блок B — Шаблоны программ + stuck detection (в работе — 1.06+1.07 готовы)

| # | Файл | SHA | Статус | Что |
|---|---|---|---|---|
| 1.06 | `TZ_WAVE_1_06_program_templates_migration.md` | `8223b60` | ⏸ | program_templates + endpoints, idempotency ✓ |
| 1.07 | `TZ_WAVE_1_07_admin_program_templates.md` | `77f2e7e` | ⏸ | AdminContent inline-pattern, 7 endpoints |
| **1.08a** | **`TZ_WAVE_1_08a_wizard_backend_prep.md`** | — | ⏳ | **NEW: backend derived_title для Bug #13 + filter** |
| **1.08b** | **`TZ_WAVE_1_08b_wizard_ui.md`** | — | ⏳ | **NEW: frontend wizard переписка** |
| 1.09 | `TZ_WAVE_1_09_stuck_detection_instructor.md` | — | ⏳ | Yellow/red badge + Telegram push + cron |

**Объём блока B (с split'ом):** 21-26 часов вместо изначальных 19-24 (+1-2ч overhead split'а).
**Объём Wave 1 общий:** 33-43 часов, 10 коммитов.

---

## Параллельная работа — координация

### НЕ ТРОГАТЬ

- 4 файла uncommitted dark-theme от 2026-05-04 (`PatientDashboard.js`, `DiaryScreen.css`, `tokens.css` × 2). Везение блока A что ни один коммит их не задел. **Для 1.08b критично:** проверь grep'ом что переписка `RehabProgramModal.js` не каскадит в `PatientDashboard.js`. По плану — не должна.
- ExerciseRunner LOCKED
- PatientDashboard `pd-*` / `--az-*` palette
- Patient OAuth flow (стабильны после `52631a2`)
- Star Tracker — не закладываем

### Координация routes/файлов на оставшиеся 3 коммита

| Файл | 1.08a | 1.08b | 1.09 |
|---|---|---|---|
| `routes/complexes.js` | расширение SELECT для derived_title | — | — |
| `routes/rehab.js` | — | — | + endpoint `/programs/:id/stuck-status` |
| `routes/patients.js` | — | — | + поле `is_stuck_on_phase` агрегат |
| `services/scheduler.js` | — | — | weekly cron |
| `services/telegramBot.js` | — | — | `notifyInstructorOnRedStuck` |
| `services/stuckDetection.js` (новый) | — | — | основной модуль |
| `frontend/.../RehabProgramModal.js` → директория | — | вся переписка | — |
| `frontend/src/pages/Patients.js` | — | — | yellow badge |
| `frontend/src/services/api.js` | — | + `getComplexes({patient_id})` если нужно | — |

Параллельных конфликтов между 1.08a/1.08b/1.09 нет — разные backend модули и разные frontend файлы.

---

## `wave_1_progress.md` — формат с учётом split

```md
# Wave 1 — Прогресс

## Блок A — Фундамент multi-protocol
| # | Статус | SHA | ... |
| 1.01 | ⏸ | a3dfff7 | ... |
| 1.02 | ⏸ | b0170f1 | ... |
| 1.03 | ⏸ | fa177b4 | ... |
| 1.04 | ⏸ | ceb32aa | ... |
| 1.05 | ⏸ | 8c420b2 | ... |

## Блок B — Шаблоны программ + stuck
| # | Статус | SHA | ... |
| 1.06 | ⏸ | 8223b60 | ... |
| 1.07 | ⏸ | 77f2e7e | ... |
| 1.08a | ⏳ | — | NEW split |
| 1.08b | ⏳ | — | NEW split |
| 1.09 | ⏳ | — | — |

Статусы: ⏳ ждёт · 🔵 в работе · 🟡 готов к smoke · ⏸ заморожен · 🟢 в main · 🔴 откат
```

После split — обновить wave_1_progress.md: строку «1.08» удалить, добавить «1.08a» и «1.08b».

---

## DoD Wave 1 (без изменений с v1)

- [ ] Все 10 коммитов в main
- [ ] Backend тесты ≥ 410, Frontend ≥ 250
- [ ] Обе миграции idempotency-cycle пройдены
- [ ] Prod-smoke на 3+ пациентах разного состояния
- [ ] CLAUDE.md обновлён, Bug #12 + Bug #13 вычеркнуты
- [ ] `memory/wave_1_complete.md` создан
- [ ] Снапшот `ARCHITECT_STATUS_2026-05-XX.md`
- [ ] 24 часа стабильности на проде до старта Wave 2

---

## Открытые вопросы Wave 1 — все закрыты

Решения зафиксированы в коммитах 1.01-1.07 + adjustment 2026-05-13.

---

## Premise drift журнал (для пост-mortem Wave 1)

Зафиксировано в `memory/architect_premise_drift_2026-05-13.md`:

1. **1.03** — `mapDiagnosisToLabel` была в backend (`utils/programLabels.js`), не frontend
2. **1.04** — хардкод `'acl'` в `services/api.js:462` default parameter, не `RoadmapScreen.js:344`
3. **1.05** — фильтр `?program_type` и поле в POST `/admin/phases` уже были в коде

Урок: commit message'ы могут быть misleading про слой ("HomeScreen" → подсказало frontend, но fix был на бэке). Verify-step grep'ом перед каждым TZ — новое правило, работает.

---

## Связанные документы

- `PATIENT_UX_ROADMAP_2026-05-08_v2.md`
- `TZ_WAVE_0_INDEX.md` + 6 TZ файлов Wave 0
- `memory/wave_0_complete.md`, `wave_0_batch_merge_policy.md`, `wave_1_block_a_done.md`
- `memory/architect_premise_drift_2026-05-13.md`
- `memory/feedback_one_change_per_session.md`
- `CLAUDE.md`
