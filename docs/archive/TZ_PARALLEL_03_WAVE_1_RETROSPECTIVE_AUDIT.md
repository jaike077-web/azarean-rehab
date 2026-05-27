# TZ #03 — Wave 1 retrospective audit — оставшиеся endpoint'ы #1.04 (api.js, RoadmapScreen, telegramBot)

**Дата:** 2026-05-16
**Severity:** HIGH (anti-regression проверка после Wave 1 retrospective)
**Тип:** Audit — read-only grep + verification, без code changes
**Связано:** [memory/feedback_full_grep_after_bug_category_closed.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_full_grep_after_bug_category_closed.md), [memory/wave_1_retrospective_2026-05-15.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_retrospective_2026-05-15.md), [SESSION_HANDOFF_2026-05-15_HOTFIXES_DONE.md](SESSION_HANDOFF_2026-05-15_HOTFIXES_DONE.md) section «Открытый backlog → HIGH».

---

## Контекст

После Wave 1 retrospective (PR #61, commits `6718bfa` + `f48a104`, 2026-05-15) был сделан полный grep `routes/rehab.js` — найдены 4 пропущенных хардкода `program_type = 'acl'`. Закрыты в том же PR.

В handoff отмечено:
> «мы прогрепали `routes/rehab.js`, но не Wave 1 #1.04 (api.js, RoadmapScreen, telegramBot) — там тоже могли остаться хардкоды. Можно сделать перед Wave 2 (~30 мин полного grep'а).»

Это ТЗ — выполнение этого audit'а. **Уже исполнено в этой сессии** (2026-05-16) — документирую результаты.

---

## Audit-методология

### Grep-запросы

Проверены **production-код файлы**, исключая тесты (тесты используют `'acl'` как fixture — это норма):

#### 1. Frontend

```bash
# Все JS-файлы фронта на литералы 'acl' / "acl" / ПКС
grep -rn "'acl'\|\"acl\"\|ПКС" frontend/src --include='*.js' --include='*.jsx' \
  --exclude='*.test.js' --exclude='*.test.jsx'
```

#### 2. Backend

```bash
# Production-код бэка, кроме тестов
grep -rn "'acl'\|\"acl\"\|ПКС" backend --include='*.js' \
  --exclude-dir=tests --exclude-dir=__tests__
```

#### 3. SQL и миграции

Не проверяются — там литералы `'acl'` корректны (это seed-data и FK references).

---

## Результаты grep'а (2026-05-16)

### Файлы под suspicion (Wave 1 #1.04 scope)

| Файл | Что искали | Результат |
|---|---|---|
| [frontend/src/services/api.js](frontend/src/services/api.js) | `'acl'` | **1 совпадение, строка 461 — комментарий «дефолт 'acl' убран»** ✅ |
| [frontend/src/pages/PatientDashboard/components/RoadmapScreen.js](frontend/src/pages/PatientDashboard/components/RoadmapScreen.js) | `'acl'` | **1 совпадение, строка 352 — комментарий «дефолт 'acl' убран»** ✅ |
| [backend/services/telegramBot.js](backend/services/telegramBot.js) | `'acl'`, ПКС | **0 совпадений** ✅ |

**Вывод по #1.04 scope:** **ЧИСТО.** Никаких хардкодов вне комментариев нет.

### Полный обзор оставшихся `'acl'` в production-коде

#### Backend production-код

| Файл:строка | Контекст | Severity | Решение |
|---|---|---|---|
| [backend/routes/rehab.js:33](backend/routes/rehab.js#L33) | `const { type = 'acl' } = req.query;` (default для `GET /api/rehab/phases?type=`) | 🟢 LOW (by-design) | **Оставить.** Wave 1 #1.04 фронт передаёт `type` явно (RoadmapScreen.js:352). Backend default — safety net. Подтверждено архитектором. |
| [backend/routes/rehab.js:366](backend/routes/rehab.js#L366) | Комментарий `// Wave 1 retrospective 2026-05-15: program_type из rp.*, не хардкод 'acl'` | ✅ (комментарий, не хардкод) | — |
| [backend/routes/rehab.js:1383](backend/routes/rehab.js#L1383) | `INSERT ... VALUES (..., COALESCE($9, 'acl'), ...)` (default program_type при создании программы) | 🟢 LOW (by-design) | **Оставить.** Архитектор: «90% knee, дефолтим в acl». |
| [backend/routes/admin.js:505](backend/routes/admin.js#L505) | `program_type = 'acl'` default в POST `/api/admin/phases` | 🟢 LOW (by-design) | **Оставить.** UX default при создании фазы через AdminContent. FK с program_types обеспечивает валидацию. |
| [backend/services/stuckDetection.js:30](backend/services/stuckDetection.js#L30) | Комментарий `// program_type из самой программы — Wave 1 #1.01 убрал хардкод 'acl'` | ✅ (комментарий) | — |

#### Frontend production-код

| Файл:строка | Контекст | Severity | Решение |
|---|---|---|---|
| [frontend/src/services/api.js:461](frontend/src/services/api.js#L461) | Комментарий «дефолт 'acl' убран» | ✅ (комментарий) | — |
| [frontend/src/pages/PatientDashboard/components/RoadmapScreen.js:352](frontend/src/pages/PatientDashboard/components/RoadmapScreen.js#L352) | Комментарий «дефолт 'acl' убран» | ✅ (комментарий) | — |
| [frontend/src/pages/Admin/AdminContent.js:148](frontend/src/pages/Admin/AdminContent.js#L148) | PhaseForm state init `program_type: 'acl'` | 🟢 LOW (by-design) | **Оставить.** UX default при создании фазы. Юзер меняет select перед submit. |
| [frontend/src/pages/Admin/AdminContent.js:157](frontend/src/pages/Admin/AdminContent.js#L157) | PhaseForm edit fallback `phase.program_type \|\| 'acl'` | 🟢 LOW (by-design) | **Оставить.** Safety net на случай null-значения (БД constraint NOT NULL DEFAULT 'acl' — fallback парный). |
| [frontend/src/pages/Admin/AdminContent.js:641](frontend/src/pages/Admin/AdminContent.js#L641) | ProgramTemplateForm state init fallback `programTypes[0]?.code \|\| 'acl'` | 🟢 LOW (by-design) | **Оставить.** Defensive — если API не вернул program_types, используем `'acl'` как fallback (всегда есть в seed). |
| [frontend/src/pages/Admin/AdminContent.js:655](frontend/src/pages/Admin/AdminContent.js#L655) | ProgramTemplateForm edit fallback `initial.program_type \|\| 'acl'` | 🟢 LOW (by-design) | **Оставить.** Аналог 157. |

### Прочие подозрительные литералы

| Файл:строка | Что | Severity |
|---|---|---|
| [frontend/src/pages/Admin/AdminContent.js:550](frontend/src/pages/Admin/AdminContent.js#L550) | Placeholder `«ПКС BPTB-графт»` (empty state hint) | 🟢 LOW (UI copy) |
| [frontend/src/pages/Admin/AdminContent.js:700,709](frontend/src/pages/Admin/AdminContent.js#L700) | Placeholder в input `«ПКС BPTB-графт»` / `«Шаблон для пациентов после пластики ПКС BPTB»` | 🟢 LOW (UI copy) |

**Эти placeholders — UI copy для empty form.** Не функциональные хардкоды.

### Test fixtures (НЕ являются хардкодами)

```
backend/tests/fixtures.js — 'acl' в test program data
backend/tests/__tests__/*.test.js — 'acl' в mock query rows
frontend/src/components/RehabProgramModal.test.js — 'acl' в mock data
frontend/src/test-utils/mockData.js — 'acl' в test fixtures
frontend/src/pages/PatientDashboard/components/HomeScreen.test.js — 'acl' в mock dashboard
```

**Это test data, не production хардкоды.** Норма.

---

## Заключение audit'а

| Категория | Статус |
|---|---|
| **#1.04 scope (api.js, RoadmapScreen, telegramBot)** | ✅ **CLEAN** — никаких хардкодов вне комментариев |
| **Wave 1 retrospective scope (rehab.js)** | ✅ Закрыт PR #61 2026-05-15 |
| **Остальные `'acl'` в production-коде** | ✅ Все **by-design defaults** (5 случаев) или comments (4 случая). Подтверждены архитектором в [ARCHITECT_QUESTION_HARDCODES_AUDIT_2026-05-15.md](ARCHITECT_QUESTION_HARDCODES_AUDIT_2026-05-15.md). |
| **Bug #12 status** | ✅ Closed completely (CLAUDE.md tech debt таблица + memory `wave_1_retrospective_2026-05-15.md`) |

**Итог:** **полностью CLEAN.** Никаких новых code-changes не требуется.

---

## Action items

### 1. Зафиксировать audit в memory

Создать [memory/wave_1_retrospective_audit_2026-05-16.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_retrospective_audit_2026-05-16.md) с результатами этого audit'а.

### 2. Обновить CLAUDE.md (опционально)

Добавить в секцию «Завершённые исправления» (или продолжить текущую запись Wave 1 retrospective) запись:

> **Wave 1 retrospective audit 2026-05-16:** дополнительный full-codebase grep по `api.js`, `RoadmapScreen`, `telegramBot` (handoff backlog HIGH). Результат: **CLEAN** — никаких новых хардкодов. Все оставшиеся `'acl'` в production-коде (5 случаев) — by-design defaults, подтверждены архитектором. Bug #12 status: closed completely.

### 3. Опционально: anti-regression unit-тест

Защитить от рекурсии (если в будущем кто-то введёт хардкод обратно):

```js
// backend/tests/__tests__/anti_regression_acl_hardcoded.test.js (новый)
const fs = require('fs');
const path = require('path');

describe('Wave 1 anti-regression: no hardcoded program_type = \'acl\' in queries', () => {
  test('routes/rehab.js does not have program_type = \'acl\' in SQL strings outside comments', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/rehab.js'), 'utf8');
    // Match SQL string literals containing program_type = 'acl' (not in comments)
    const matches = src.match(/(?<!\/\/[^\n]*?)program_type\s*=\s*'acl'/g);
    expect(matches).toBeNull();
  });
});
```

**Решение:** оставить **на усмотрение Vadim'а / архитектора.** Anti-regression тест полезен, но pattern может ловить false positives — нужен дизайн от архитектора.

---

## Что НЕ делаем в этом ТЗ

| Что | Почему |
|---|---|
| Удаление by-design defaults (rehab.js:33, rehab.js:1383, admin.js:505, AdminContent.js fallbacks) | Архитектор подтвердил by-design (см. PR #61 architect Q&A) |
| Замена placeholders «ПКС BPTB-графт» в AdminContent | UI copy, не функциональный код |
| Удаление test fixtures с `'acl'` | Tests могут использовать любые fixture значения |
| Документация zombie endpoint `/my/program` | Отдельный backlog item — [memory/zombie_endpoint_my_program.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/zombie_endpoint_my_program.md) |

---

## Деплой план

**Code-changes: 0.** Этот audit — pure documentation/memory work.

1. Создать memory file [`wave_1_retrospective_audit_2026-05-16.md`](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_retrospective_audit_2026-05-16.md).
2. Добавить line в MEMORY.md index.
3. Опционально: добавить short note в CLAUDE.md в Wave 1 retrospective запись.
4. **Без PR'а** — это локальная фиксация. Если решено добавить anti-regression unit-test (Action item 3) — отдельный мини-PR.

---

## Стоимость / время

- **Grep + verification:** уже выполнено в этой сессии (~10 минут)
- **Создание memory + CLAUDE.md update:** ~10 минут
- **Опциональный anti-regression тест:** ~30 минут

---

## Что делать в следующий раз (process improvement)

Зафиксировано как feedback rule [memory/feedback_full_grep_after_bug_category_closed.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_full_grep_after_bug_category_closed.md):

> Перед пометкой bug-категории «closed completely» (особенно если bug охватывает несколько endpoint'ов / файлов): full-codebase grep по теме — 5 минут затрат, риск-avoidance максимальный.

Применить в Wave 2 / Wave 3 при закрытии любой sweep-категории багов.

---

## Связано

- [memory/wave_1_retrospective_2026-05-15.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/wave_1_retrospective_2026-05-15.md) — retrospective PR #61
- [memory/feedback_full_grep_after_bug_category_closed.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_full_grep_after_bug_category_closed.md) — feedback rule
- [ARCHITECT_QUESTION_HARDCODES_AUDIT_2026-05-15.md](ARCHITECT_QUESTION_HARDCODES_AUDIT_2026-05-15.md) — оригинальная findings для PR #61
- [SESSION_HANDOFF_2026-05-15_HOTFIXES_DONE.md](SESSION_HANDOFF_2026-05-15_HOTFIXES_DONE.md) — handoff с backlog HIGH item для этого audit'а
