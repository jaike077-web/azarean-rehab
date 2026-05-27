# TZ HOTFIX #1 — AdminContent.module.css завершение миграции

**Дата:** 2026-05-15
**Объём:** ~1.5-2 часа работы (CSS copy + smoke 5 табов × 2 темы)
**Risk:** LOW — изолированный CSS, не трогает логику
**Тип:** Hot-fix косметики (pre-existing pre-Wave 1)
**Архитектор:** GO в варианте «дубликат class definitions» — минимально-инвазивно, без рефакторинга в shared module

---

## Контекст

CSS Modules миграция 2026-05-04 (commit `c8834b5`) перенесла **только базовые tab-стили** (80 строк: `.adminContent`, `.contentTabs`, `.contentTab`, `.contentHeader`, `.contentFormGrid`) в `AdminContent.module.css`. **НЕ перенесла** 30+ классов которые используются в AdminContent.js но определены только в `AdminUsers.module.css`.

В результате страница «Контент» (5 табов: Типы программ / Шаблоны программ / Фазы / Советы / Видео) в проде с 2026-05-04 имеет **только browser-default стили** для таблиц, форм, кнопок, модалок, бейджей, empty states.

**Не заметили 9 дней:**
- Прод имеет одного админа (Vadim), редко открывает «Контент»
- В dev/test почти не открывали (всё через psql)
- CI/build green — tests мокают CSS через Proxy, `s.foo === undefined` не ловится
- Wave 1 #1.05 + 1.07 (новые табы AdminContent) добавили **ещё больше** использований этих классов, ухудшая ситуацию

**Confirmed user impact (prod-smoke 2026-05-13):** Vadim открыл «Контент» → «Типы программ» → увидел плоскую таблицу без бордеров на белом фоне, кнопки без стилизации, форма-модалка без обводки, dark theme не подхватывается.

---

## Verify-step

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. Размер обоих файлов
"C:/Program Files/Git/usr/bin/wc.exe" -l \
  frontend/src/pages/Admin/AdminContent.module.css \
  frontend/src/pages/Admin/AdminUsers.module.css
# Ожидается: AdminContent ~79 строк, AdminUsers ~409 строк

# 2. Полный список классов используемых в AdminContent.js (через s.X)
grep -oE 's\.[a-zA-Z][a-zA-Z0-9_]+' frontend/src/pages/Admin/AdminContent.js | sort -u
# Сравнить с классами в AdminContent.module.css:
grep -oE '^\.[a-zA-Z][a-zA-Z0-9_]+' frontend/src/pages/Admin/AdminContent.module.css | sort -u
# Разница = missing classes which need to be copied

# 3. Полный список классов в AdminUsers.module.css
grep -oE '^\.[a-zA-Z][a-zA-Z0-9_]+' frontend/src/pages/Admin/AdminUsers.module.css | sort -u

# 4. Проверить что в working tree нет других CSS правок которые могут конфликтовать
git status --short | grep "Admin.*module.css"
# Ожидается: пусто (после stash dark-theme)
```

**Полный класс-список для копирования** (из grep'а AdminContent.js):

```
adminActionBtn         — кнопки действий в таблицах
adminBadge             — общий бейдж
adminBtnDanger         — primary danger button
adminBtnPrimary        — primary action button
adminBtnSecondary      — secondary action button
adminEmptyState        — wrapper empty state
adminFormError         — error-text внутри формы
adminFormGroup         — input + label container
adminLoading           — loading state
adminModal             — модалка contents
adminModalClose        — close X в углу
adminModalForm         — form-grid внутри модалки
adminModalHeader       — заголовок + close в модалке
adminModalActions      — footer кнопки в модалке
adminModalOverlay      — backdrop модалки
adminSectionTitle      — h2 на странице
adminTable             — table styles
adminTableWrap         — table container с scroll
badgeInstructor        — синий бейдж
btnDanger              — red modifier для action btn
btnSuccess             — green modifier
btnWarning             — yellow modifier (если использу.)
emptyStateContent      — wrapper текста empty
emptyStateIcon         — icon в empty
rowInactive            — серая строка для is_active=false
tdActions              — td c кнопками
tdId                   — td с ID
tdName                 — td с названием
tdUrl                  — td с URL (видео)
```

**Проверка после verify**: точный финальный список — после `grep | sort -u`.

---

## Что менять

### Файл: `frontend/src/pages/Admin/AdminContent.module.css`

**Подход:** копирование class definitions из `AdminUsers.module.css` в конец `AdminContent.module.css`. Прямой импорт `AdminUsers.module.css` в `AdminContent.js` НЕ РАБОТАЕТ из-за CSS Modules scoping (каждый файл — свой namespace).

Альтернатива через `composes:` создаст coupling — отложили в Wave 2/3 backlog для рефакторинга в `Admin.shared.module.css`.

#### Шаги:

1. **Прочитать `AdminUsers.module.css`** целиком (409 строк), найти **все** class definitions классов из списка выше.
2. **Скопировать** соответствующие блоки в **конец** `AdminContent.module.css`.
3. **Не копировать**: `.adminUsers`, `.adminSearchBar*`, `.tdEmail`, `.tdDate`, `.tdEmpty`, `.badgeAdmin`, `.badgeActive`, `.badgeInactive`, `.badgeLocked`, `.adminSectionHeader` — это специфичные для AdminUsers, не используются в AdminContent.

#### Шаблон финального файла `AdminContent.module.css`:

```css
/* =====================================================
   ADMIN CONTENT - Azarean Network
   ===================================================== */

/* === Existing AdminContent-specific styles (DO NOT REMOVE) === */
.adminContent { ... }
.contentTabs { ... }
.contentTab { ... }
.contentHeader { ... }
.adminModalWide { ... }
.contentFormGrid { ... }
/* (всё что было до 79 строки) */

/* === Wave 1 retrospective hot-fix #1 2026-05-15 === */
/* Скопировано из AdminUsers.module.css — миграция CSS Modules от 2026-05-04
 * не доперенесла эти классы в AdminContent.module.css.
 * Backlog (Wave 2/3): рефакторинг в shared Admin.shared.module.css через composes.
 */

/* Tables */
.adminTableWrap { ... }
.adminTable { ... }
.adminTable th { ... }
.adminTable td { ... }
.adminTable tbody tr { ... }
.adminTable tbody tr:hover { ... }
.rowInactive { ... }
.tdId { ... }
.tdName { ... }
.tdActions { ... }
.tdUrl { ... }       /* extra для AdminContent (видео URL) */

/* Buttons */
.adminBtnPrimary { ... }
.adminBtnPrimary:hover { ... }
.adminBtnPrimary:disabled { ... }
.adminBtnSecondary { ... }
.adminBtnSecondary:hover { ... }
.adminBtnDanger { ... }
.adminBtnDanger:hover { ... }
.adminActionBtn { ... }
.adminActionBtn:hover { ... }
.adminActionBtn.btnDanger:hover { ... }
.adminActionBtn.btnSuccess:hover { ... }
.adminActionBtn.btnWarning:hover { ... }

/* Badges */
.adminBadge { ... }
.badgeInstructor { ... }

/* Modal */
.adminModalOverlay { ... }
.adminModal { ... }
.adminModalHeader { ... }
.adminModalHeader h3 { ... }
.adminModalClose { ... }
.adminModalClose:hover { ... }
.adminModalForm { ... }
.adminFormGroup { ... }
.adminFormGroup label { ... }
.adminFormGroup input,
.adminFormGroup select,
.adminFormGroup textarea { ... }
.adminFormGroup input:focus,
.adminFormGroup select:focus,
.adminFormGroup textarea:focus { ... }
.adminFormError { ... }
.adminModalActions { ... }

/* Empty state */
.adminEmptyState { ... }
.emptyStateContent { ... }
.emptyStateIcon { ... }
.emptyStateContent h3 { ... }
.emptyStateContent p { ... }

/* Misc */
.adminLoading { ... }
.adminSectionTitle { ... }
```

#### Important: НЕ ТРОГАТЬ AdminUsers.module.css

Только **копировать читая**. AdminUsers продолжает работать как есть. **Никаких** изменений в:
- `AdminUsers.module.css` 
- `AdminUsers.js`
- Тестов `AdminPanel.test.js`

---

## Проверка имён классов в CSS (Wave 0/Wave 1 урок)

**КРИТИЧНО:** CRA по умолчанию **НЕ конвертирует** dash-case в camelCase в CSS Modules. Если класс в CSS определён как `.foo-bar`, в JS он доступен **только** через `s['foo-bar']`, **НЕ** через `s.fooBar`.

**Проверка после копирования:**

```bash
# Найти все class definitions в новом AdminContent.module.css
grep -oE '^\.[a-zA-Z][a-zA-Z0-9_-]+' frontend/src/pages/Admin/AdminContent.module.css | sort -u

# Сравнить с использованиями в AdminContent.js
grep -oE 's\.[a-zA-Z][a-zA-Z0-9_]+' frontend/src/pages/Admin/AdminContent.js | sed 's/^s\.//' | sort -u

# Каждый s.X должен иметь .X в CSS. Если в CSS .x-y (dash-case) — JS должен использовать s['x-y']
# AdminUsers.module.css всё camelCase — должно быть OK.
```

См. инцидент `c8834b5` 2026-05-04 + [memory/feedback_smoke_real_browser.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_smoke_real_browser.md).

---

## Smoke test — ОБЯЗАТЕЛЕН в реальном браузере

**Юнит-тесты НЕ ловят** CSS Modules undefined-классы (Proxy mock возвращает любое имя как строку). Только реальный браузер.

### Сценарий 1 — Light theme

1. Запустить `npm start` локально (`PORT=3001 BROWSER=none`)
2. Login как admin (`vadim@azarean.com` / `Test1234`)
3. Sidebar → **Контент**
4. **Таб «Типы программ»** (default):
   - Таблица со списком program_types (acl/knee_general/shoulder_general) должна иметь:
     - Заголовок таблицы с фоном
     - Хвер на строках
     - Кнопки «Создать», «Редактировать», «Удалить» — стилизованные
     - Empty state если нет данных
5. **Таб «Шаблоны программ»**:
   - Таблица + кнопка «Создать»
   - Модалка «Создать шаблон» — overlay backdrop + центрированный контент + close X
6. **Таб «Фазы»**:
   - Filter dropdown по program_type
   - Таблица фаз с pencil/trash actions
7. **Таб «Советы»**:
   - Таблица tips
   - Модалка создания tip с form-grid
   - Badge'и категорий стилизованы
8. **Таб «Видео»**:
   - Таблица видео с URL preview
   - Модалка создания видео

### Сценарий 2 — Dark theme

В сайдбаре переключатель темы → Dark. Повторить все 5 табов из Сценария 1. Все элементы должны:
- Использовать tokens (`var(--color-bg-surface)`, `var(--color-text)`)
- Иметь читаемый контраст
- Borders + shadows визуально корректны

### Сценарий 3 — Regression check (AdminUsers НЕ сломан)

Sidebar → **Пользователи**. Должна быть как раньше — таблица users со всеми стилями. Если что-то сломалось — мы случайно тронули AdminUsers.module.css (НЕ должно быть). Git diff покажет.

### Сценарий 4 — DevTools проверка

В Chrome DevTools (F12) → Elements → выбрать любой `<button>` в AdminContent. В Computed/Styles должны быть applied стили (не browser defaults). Class имя должно быть **hashed** (`AdminContent_adminBtnPrimary__XYZ123`), не plain `adminBtnPrimary` — это подтверждает CSS Modules работает.

---

## Тесты

### Frontend

**Не добавляются** новые тесты — CSS Modules мок через Proxy не способен поймать regression здесь. Тесты `AdminPanel.test.js` продолжают работать через мок.

**Прогнать существующие:**
```bash
cd frontend && CI=true npx react-scripts test --watchAll=false
# 252/252 ожидается, без изменений
```

### Backend

Не затронут.

### CRA build check

```bash
cd frontend && CI=true npm run build 2>&1 | tail -20
# Должен compile без warning'ов на CSS
```

---

## Definition of Done

- [ ] Verify-step 4 проверки пройдены — точный класс-список для копирования получен
- [ ] `AdminContent.module.css` расширен ~330 строками скопированных из `AdminUsers.module.css`
- [ ] Все классы из `AdminContent.js` имеют соответствующие definitions в `AdminContent.module.css` (grep сравнение)
- [ ] **Класс имена camelCase** (не dash-case) — иначе `s.X === undefined`
- [ ] AdminUsers.module.css **НЕ ТРОНУТ** (git diff показывает 0 changes)
- [ ] AdminUsers.js **НЕ ТРОНУТ**
- [ ] CRA build clean (`npm run build` без CSS warnings)
- [ ] Frontend tests 252/252 зелёные
- [ ] **Smoke в реальном браузере: 5 табов × 2 темы (10 проверок)** — ОБЯЗАТЕЛЬНО
- [ ] AdminUsers regression check — страница «Пользователи» работает как раньше
- [ ] DevTools проверка — class имена hashed
- [ ] Commit на ветке `hotfix/admin-content-css-modules` от main
- [ ] Mini-PR с body описанием + ссылками на before/after screenshots (опционально)
- [ ] После merge — обновить memory `bug_admin_content_css_modules_unfinished.md` пометкой closed + SHA
- [ ] Update memory `feedback_smoke_real_browser.md` если уроки новые

---

## Commit message

```
fix(admin-content): доперенести CSS Modules классы (pre-existing с 2026-05-04)

CSS Modules миграция от 2026-05-04 (commit c8834b5) перенесла в
AdminContent.module.css только базовые tab-стили. 30+ классов
(adminTable, adminBtnPrimary, adminModalOverlay, и т.д.) использовались
в AdminContent.js но определены только в AdminUsers.module.css.

Из-за CSS Modules scoping s.adminTable === undefined в AdminContent →
страница «Контент» (5 табов: Типы программ, Шаблоны программ, Фазы,
Советы, Видео) рендерилась только с browser-default стилями.

Не заметили 9 дней потому что:
- Прод имеет одного админа, редко открывает «Контент»
- CI/tests мокают CSS через Proxy — undefined класс OK для теста
- Wave 1 #1.05 + 1.07 добавили новые табы по тому же inline-pattern → ухудшили

Fix: дубликат class definitions из AdminUsers.module.css в AdminContent.module.css.
Альтернатива через composes отложена в Wave 2/3 backlog для рефакторинга
в shared Admin.shared.module.css.

Smoke 5 табов × 2 темы пройден.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## NOT TOUCH

- **`AdminUsers.module.css`** — копировать читая, но НЕ модифицировать
- **`AdminUsers.js`** — не трогать
- **`AdminContent.js`** — не трогать (только CSS добавляется, JS уже использует все классы)
- **Tests `AdminPanel.test.js`** — не трогать (Proxy mock работает)
- **Dark-theme dirty файлы** в working tree — изоляция через `git stash` перед стартом, restore после
- **Specific AdminUsers-only классы** — `.adminUsers`, `.adminSearchBar*`, `.tdEmail`, `.tdDate`, `.tdEmpty`, `.badgeAdmin`, `.badgeActive`, `.badgeInactive`, `.badgeLocked`, `.adminSectionHeader` — НЕ копировать (не нужны в AdminContent)
- **CSS variables в скопированных классах** (`var(--color-bg)`, `var(--color-text)`) — НЕ менять, они уже работают с light+dark themes
- **`.module.css` глобально для всех Admin pages** — не делать (это рефакторинг, не hot-fix)

---

## Backlog items после этого PR

1. **Wave 2/3 рефакторинг:** вынести shared admin styles в `Admin.shared.module.css`, оба файла через `composes:` импортируют. Сейчас дубликат — это технический долг.
2. **CSS Modules audit:** прогнать grep по **всем** `*.module.css` + `*.js` парам — есть ли ещё файлы с similar issue (классы используются, но не определены)?
   ```bash
   for js in $(find frontend/src -name "*.js" | xargs grep -l "import s from"); do
     css="${js%.js}.module.css"
     [ ! -f "$css" ] && continue
     # сравнить классы как в verify-step
   done
   ```
   Это можно сделать в отдельной задаче (memory backlog).

---

## Связано

- [memory/bug_admin_content_css_modules_unfinished.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/bug_admin_content_css_modules_unfinished.md)
- [memory/feedback_smoke_real_browser.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_smoke_real_browser.md) — почему юнит-тесты не ловят
- [memory/feedback_one_change_per_session.md](.claude/projects/c--Users-------Desktop-Azarean-rehab/memory/feedback_one_change_per_session.md) — почему миграция CSS Modules + Dark theme в одной сессии 2026-05-04 запутали
- Bug #15 (MDEditor + global inputs dark-theme) — родственная CSS Modules долг категория (не fix этим PR)
- `c8834b5` (CRA dash-case → camelCase fix) — критический prior incident той же темы
