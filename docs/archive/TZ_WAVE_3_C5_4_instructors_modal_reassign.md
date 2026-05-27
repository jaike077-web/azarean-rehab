# TZ Wave 3 — C5.4: Таблица инструкторов + модалка + переназначение

**Ветка:** `wave-3/owner-command-center`, продолжаем от tip **`ac53ead`** (C5.3).
Цепочка базы: `… → 791a2ba (C5.2) → ac53ead (C5.3)`.
**Тип:** frontend под-чекпойнт (**4 из 4, финальный**). **Исполнитель:** Claude Code.
**Зависимости в репо:** `WAVE_3_COMMAND_CENTER_API_CONTRACT.md`, `MEMORY_RULES.md`.
**DoD:** «Срез по инструкторам» = таблица из `/instructors`; клик по строке → модалка инструктора (метрики из строки + список сигналов из `/attention?instructor_id`); inline-переназначение через `PATCH`; z-index 9000; **NO modal-on-modal**. Фронт командного центра **закрыт**. STOP с финальным отчётом C5.

---

## 0. Verify-step — правила (architect signature)

По контракту + recon, не из памяти. Правила (MEMORY_RULES):
- **Rule #29** (§3): z-index модалки = **9000** (toast 10000 не трогаем).
- **Modal close pattern** (CLAUDE.md + recon): `useModalOverlayClose(onClose)` spread на overlay, hook **ВЫШЕ** `if(!open) return null` (Rules of Hooks); Esc-handler + `document.body.style.overflow='hidden'` в useEffect. CI gate `npm run lint:modals` **обязан остаться green**.
- **NO modal-on-modal** (макет + §макетные правила): кебаб и форма переназначения — **inline внутри модалки** (absolutely-positioned div), НЕ второй overlay. Лишних `.instructorModalOverlay` в дереве быть не должно.
- **Rule #34 (anti-175%)** на фронте: единственная арифметика — display-процент `active%` одной строки с guard на 0. Инвариант `active+at_risk+dormant+churned == caseload−no_program` НЕ сверяем (гарантия бэкенда).
- **Rule #25** (§5): новые методы в namespace'ах уже добавлены (C5.1: `admin.commandCenter.*`, `patients.assignInstructor`); `useEffect` deps без context-функций → `useCallback`.
- **JSDOM-урок (C5.2/C5.3):** цвет severity-dot НЕ ассертить через inline-style. Переиспользовать **named export `severityColor`** из `AttentionPanel.js` (не дублировать, не рефакторить AttentionPanel — bug-fix ≠ рефактор соседа).
- **Rule #20** (§3): CSS Modules camelCase; smoke в браузере обязателен.
- **CLAUDE.md:** lucide-react только; комментарии на русском; не выдумывать роуты (`/patients/:id` нет → `navigate('/patients')`).

---

## 1. ТОЧНЫЕ поля payload (из контракта — НЕ угадывать)

### `GET /api/admin/command-center/instructors` → после unwrap `response.data`:
```
period                       (string)
adherence_window_days        (number)
instructors[]                (array)
instructors[].instructor_id  (number)
instructors[].instructor_name(string)
instructors[].role           ('admin'|'instructor' — отображать как есть, не маппить вслепую)
instructors[].caseload       (number)
instructors[].no_program     (number)
instructors[].active         (number)
instructors[].at_risk        (number)
instructors[].dormant        (number)
instructors[].churned        (number)
instructors[].unanswered     (number)
instructors[].red_flags      (number)
instructors[].stuck          (number)
```
Только инструкторы с ≥1 привязанным пациентом (нулевые НЕ приходят). Инвариант (не сверяем): `active+at_risk+dormant+churned == caseload − no_program`.

### `GET /api/admin/command-center/attention?instructor_id=N&limit=` → `response.data`:
```
items[]  с теми же полями, что в C5.2 (kind, patient_id, patient_name, instructor_id,
         instructor_name, severity, summary, created_at) ; total
```
⚠️ unwrap: `r.data.items`, `r.data.total` (total ВНУТРИ data — как в C5.2).

### `PATCH /api/patients/:id/assign-instructor`:
```
body: { instructor_id: number, reason?: string }
→ response.data = { id, assigned_instructor_id } ; message = "Инструктор назначен"
ошибки: невалидный пациент/инструктор → 400/404. admin-only. audit PATIENT_REASSIGNED (бэкенд).
```

---

## 2. Решение по источнику списка для переназначения (correctness — важно)

⚠️ **`/instructors` отдаёт ТОЛЬКО инструкторов с ≥1 пациентом** — значит инструктор с 0 пациентов в этот список НЕ попадает и не может быть целью переназначения. Это неполный пул.

**Поэтому список целевых инструкторов для `<select>` переназначения берём из `admin.getUsers()`** (полный список юзеров), фильтр: `is_active === true` И `role ∈ {instructor, admin}` И `id !== row.instructor_id` (исключить текущего). `value = user.id` (= `instructor_id` для PATCH), `label = user.full_name`. Грузить **лениво** — `admin.getUsers()` вызывается при первом открытии inline-формы переназначения, не на mount модалки.

Данные `/instructors` используются ТОЛЬКО для таблицы и шапки/метрик модалки, НЕ как источник целей переназначения.

---

## 3. Файлы

### 3.1 `frontend/src/pages/CommandCenter/InstructorsPanel.js` (новый)
- Fetch на mount (**НЕ период-зависим** — поля строки current-state): `admin.commandCenter.getInstructors()` → `setRows(r.data.instructors || [])`. `useCallback([])`.
- Таблица по паттерну admin: обернуть в `s.adminTableWrap` нет — у нас свой модуль; воспроизвести стиль через локальные классы `s.instrTableWrap`/`s.instrTable` (th/td/hover/rowInactive), на токенах как `AdminContent.module.css` (можно скопировать правила стилей, имена camelCase).
- Колонки: **Инструктор** (`instructor_name` + бейдж роли `s.roleBadge`) · **Пациентов** (`caseload`) · **Без прогр.** (`no_program`) · **Активны** (`active`) · **Под риском** (`at_risk`) · **Без ответа** (`unanswered`) · **Flags** (`red_flags`) · (хвостовая колонка `<ChevronRight/>`).
  `stuck`/`dormant`/`churned` в payload есть — **не показываем**.
- **Клик по строке → открыть модалку:** `<tr onClick role="button" tabIndex={0} onKeyDown=(Enter/Space) style={{cursor:'pointer'}}>`. Hover — через `s.instrTable tbody tr:hover`. Стейт `selectedRow`.
- Рендер `<InstructorModal>` при `selectedRow` (см. 3.2), передать `row={selectedRow}`, `onClose`, `onReassigned` (= рефетч `getInstructors`).
- **Empty:** нет строк → «Нет инструкторов с привязанными пациентами».
- loading/error+retry.

### 3.2 `frontend/src/pages/CommandCenter/InstructorModal.js` (новый)
Пропсы: `{ row, onClose, onReassigned }`.
- **Структура модалки** (паттерн AdminUserModal, но свои классы):
  - `useModalOverlayClose(onClose)` — **выше** `if(!row) return null`.
  - useEffect: Esc → onClose; `document.body.style.overflow='hidden'`, restore в cleanup.
  - `<div className={s.instructorModalOverlay} role="presentation" {...overlayProps}>` (z-index **9000** в CSS) `> <div className={s.instructorModal} role="dialog" aria-modal="true">`.
  - Header: `row.instructor_name` + бейдж `row.role` + `<button className={s.imClose} onClick={onClose}><X/></button>`.
- **Strip метрик (из `row`, без fetch):**
  - «Активны: {row.active} ({activePct}%)», где `const denom = row.caseload - row.no_program; const activePct = denom > 0 ? Math.round(100*row.active/denom) : 0;` (display-only, guard).
  - «Под риском: {row.at_risk}», «Без ответа: {row.unanswered}», «Red flags: {row.red_flags}», «Пациентов: {row.caseload}», «Без программы: {row.no_program}».
- **Список «требует внимания» этого инструктора:** на mount модалки fetch `admin.commandCenter.getAttention({ instructor_id: row.instructor_id, limit: 50 })` → `setItems(r.data.items||[])`. Строка: dot `severityColor(item.severity)` (**import из AttentionPanel**) + `item.summary` + `item.patient_name` + кебаб `<MoreHorizontal/>`.
  - Свой loading / empty («У этого инструктора нет открытых сигналов»).
  - Клик по имени пациента / строке (не по кебабу) → `navigate('/patients')` + `onClose()`.
- **Кебаб «...» (inline-меню, НЕ модалка):** клик по `<MoreHorizontal/>` тогглит `openMenuFor` (id строки). Меню = absolutely-positioned `<div className={s.kebabMenu}>` внутри модалки с пунктом «Переназначить куратора».
- **Inline-переназначение (НЕ вложенная модалка):** «Переназначить куратора» раскрывает inline-форму прямо под/в меню:
  - При открытии — лениво `admin.getUsers()` (если ещё не грузили), фильтр из §2 → `targetOptions`.
  - `<select>` целевого инструктора (из `targetOptions`, текущий исключён) + опц. `<input>` причина + кнопка «Переназначить» + «Отмена».
  - submit → `patients.assignInstructor(item.patient_id, { instructor_id: selectedId, reason })`.
    - успех → `toast.success(message)` (из `response.meta.message` или дефолт) + рефетч `/attention?instructor_id` этой модалки (пациент уедет из списка) + `onReassigned()` (родитель рефетчит `/instructors` — caseload'ы сместятся). Закрыть меню/форму.
    - ошибка → `toast.error` (400/404 → понятный текст), форма остаётся.
- **Закрытие модалки:** X, Esc, клик по overlay (hook). `onClose` сбрасывает `selectedRow` в родителе + закрывает меню.

### 3.3 `frontend/src/pages/CommandCenter/InstructorsPanel.test.js` + `InstructorModal.test.js` (новые)
- Panel: рендер строк из мок-`{instructors:[...]}`, колонки, клик по строке открывает модалку, empty.
- Modal: шапка/метрики из `row` (activePct с guard на `caseload-no_program=0`); fetch attention на mount (мок); список/empty; кебаб открывает inline-меню (**ассертить, что второго `.instructorModalOverlay` НЕ появилось** — NO modal-on-modal); inline-форма: `getUsers` мок → select исключает текущего; submit вызывает `patients.assignInstructor(patient_id, {instructor_id, reason})` с верными аргументами; успех → toast + onReassigned вызван.
- severity-цвет — через импортированный `severityColor`, НЕ через inline-style (JSDOM-урок).

### 3.4 `frontend/src/pages/CommandCenter/CommandCenter.js` (правка)
- Заменить последнюю заглушку «Срез по инструкторам» на `<InstructorsPanel/>`. Порядок финальный: Attention → Funnel → Segments → Dynamics → **Instructors**.

### 3.5 `frontend/src/pages/CommandCenter/CommandCenter.module.css` (дополнить)
camelCase, на токенах: `.instrTableWrap`, `.instrTable` (th/td/hover/rowInactive по образцу AdminContent), `.roleBadge`, `.instructorModalOverlay` (`position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center`), `.instructorModal` (`background:var(--color-surface-3); border-radius:var(--radius-xl); box-shadow:var(--shadow-modal); max-height:calc(100vh - 32px); overflow-y:auto`), `.imHeader`, `.imClose`, `.imMetrics`, `.imMetric`, `.imAttnRow`, `.kebabBtn`, `.kebabMenu` (`position:absolute; z-index:1` относительно модалки — НЕ новый overlay), `.reassignForm`, `.reassignSelect`, `.imBtnPrimary`, `.imBtnSecondary`.

---

## 4. Verify-step (приложить вывод)
```bash
grep -rn "getInstructors\|assignInstructor\|getUsers" frontend/src/pages/CommandCenter/
grep -rn "instructor_id" frontend/src/pages/CommandCenter/InstructorModal.js   # attention filter + exclude current
grep -rn "9000" frontend/src/pages/CommandCenter/CommandCenter.module.css       # z-index модалки
grep -rn "useModalOverlayClose\|severityColor" frontend/src/pages/CommandCenter/InstructorModal.js  # паттерн + reuse
grep -rEn 'className=["\x27]\w+(-\w+)+["\x27]' frontend/src/pages/CommandCenter/  # 0 kebab-orphans (Rule #20)
npm run lint:modals --prefix frontend                                            # GREEN (новая модалка по паттерну)
cd frontend && CI=true npm test -- --watchAll=false
```

## 5. Тестовый чек-лист C5.4
- [ ] Panel: строки/колонки/клик→модалка/empty.
- [ ] Modal: метрики из row, activePct guard при denom=0; attention fetch на mount; кебаб → inline-меню (НЕ второй overlay — assert); reassign select из getUsers исключает текущего; submit → правильный вызов assignInstructor; success → toast + onReassigned.
- [ ] `lint:modals` GREEN (критично — новая модалка обязана пройти CI gate).
- [ ] severity-цвет через `severityColor`, не inline-style (JSDOM).
- [ ] Существующие тесты целы.
- [ ] Smoke (`npm start`, реальный браузер, Rule #20):
  - [ ] клик по строке инструктора → модалка с метриками из строки.
  - [ ] список сигналов из `/attention?instructor_id` (на dev — сигналы patient #14 под админом).
  - [ ] кебаб → inline-меню (НЕ вторая модалка поверх).
  - [ ] «Переназначить» → select без текущего инструктора → PATCH → toast «Инструктор назначен» → пациент уехал из списка + таблица caseload обновилась.
  - [ ] Esc / overlay / X закрывают; клик по пациенту → `/patients`.
  - [ ] тёмная тема: overlay, модалка (`--color-surface-3`), бейджи, severity-dot читаемы.

## 6. Что НЕ делаем в C5.4
- НЕ берём цели переназначения из `/instructors` (неполный пул — см. §2; источник = `getUsers`).
- НЕ делаем modal-on-modal (кебаб/форма inline).
- НЕ сверяем инварианты сумм на клиенте (Rule #34).
- НЕ создаём роут `/patients/:id`, не делаем resolve алертов из дашборда (post-pilot), не делаем drill-down.
- НЕ рефакторим AttentionPanel (только импорт `severityColor`); не трогаем Attention/Funnel/Segments/Dynamics, instructor welcome, ExerciseRunner.

---

### 🛑 STOP C5.4 — финал C5
Commit-отчёт: tip SHA + **полный** verify-grep всех панелей + полная дельта тестов (backend/frontend) + список drift'ов за весь C5 + подтверждение `lint:modals` green. После этого фронт командного центра закрыт — следующий шаг обсудим (batch-merge волны / C6 RBAC / pilot).

---

*C5.4 TZ (финальный фронт командного центра). Architect: Claude Opus 4.7, 2026-05-26. Ветка `wave-3/owner-command-center` от `ac53ead`. Поля — из WAVE_3_COMMAND_CENTER_API_CONTRACT.md. Per-checkpoint STOP, NO batching.*
