# TZ Wave 2 · Hot-fix #8 — Retrospective grep на kebab-className orphans после c8834b5

**Дата:** 2026-05-18
**Версия:** v1
**Тип:** retrospective cleanup (после hot-fix #7 root cause discovery)
**Цель:** Найти и закрыть все orphan kebab-string `className=` в JSX, которые не были обновлены при Wave 1 hot-fix #1 (CSS Modules migration c8834b5, 2026-05-04). Эти строки в браузере дают `undefined` после lookup в module.css → нет CSS → silent visual bug. Hot-fix #7 нашёл один такой orphan в ToastContext.js — этот TZ закрывает остальные системно.
**Объём:** 30-60 минут (зависит от количества находок)
**Риск:** низкий, но **обязательно реальный browser smoke** на каждое исправленное место (не доверять jest — он мокает CSS Modules через Proxy и пропускает orphans).

**Память:** Hot-fix #8 — реакция на skip в Wave 1 hot-fix #1 (полная CSS Modules migration, но пропущен grep validation step).

---

## Цель memory rules после этого TZ

Усиление двух memory правил:

1. `feedback_smoke_real_browser.md` — расширить:
   > **После любой CSS-related миграции (CSS Modules, styled-components, Tailwind) обязательно сделать grep `className=["']\w+(-\w+)+["']` по всему `frontend/src/`. Любые matches — потенциальный orphan, требует ручного review.**

2. Новое правило `css_modules_orphan_audit.md`:
   > **При переименовании CSS-классов из kebab-case в camelCase для CSS Modules — JSX обновляется в ТОЙ ЖЕ commit'е. grep после миграции обязателен. Jest пропустит проблему из-за Proxy мока — только реальный DevTools inspect ловит. Любая legacy `className="<kebab>"` в JSX внутри CSS Modules файла = orphan.**

Записать в `memory/` оба обновления.

---

## Verify-step / Discovery

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) ГЛАВНЫЙ GREP — все kebab-string className в JSX
grep -rEn 'className=["\047]\w+(-\w+)+["\047]' frontend/src/ --include='*.js' --include='*.jsx' 2>/dev/null > /tmp/kebab_classnames.txt
wc -l /tmp/kebab_classnames.txt
cat /tmp/kebab_classnames.txt

# 2) Отделить ложные срабатывания — глобальные классы (валидны как kebab)
# В проекте есть глобальные стили (CSS без Modules). Класс из глобального .css — валидная kebab-string.
# Нужно для каждого найденного места проверить — есть ли соответствующий .module.css рядом

# Помощник: список .module.css файлов
find frontend/src -name "*.module.css" | head -30

# 3) Класс-локализация check — для каждого orphan'а:
#    - Лежит ли .module.css рядом с JSX файлом? (соглашение проекта)
#    - Если ДА → orphan: должен быть s.camelCaseKey
#    - Если НЕТ → класс может быть глобальный (валидный) ИЛИ orphan (если раньше был .module.css но удалён)

# 4) Конкретные подозрительные паттерны от c8834b5 миграции
# Все папки где была проведена CSS Modules миграция в Wave 1 hot-fix #1:
ls frontend/src/pages/Admin/*.module.css
ls frontend/src/components/**/*.module.css 2>/dev/null
ls frontend/src/contexts/*.module.css 2>/dev/null
# Сверь grep results с этими — orphan'ы наиболее вероятны в этих директориях

# 5) Уточняющий grep — игнорируя test файлы (тесты могут содержать kebab класс legitimately)
grep -rEn 'className=["\047]\w+(-\w+)+["\047]' frontend/src/ \
  --include='*.js' --include='*.jsx' \
  --exclude='*.test.js' --exclude='*.spec.js' \
  --exclude-dir='__tests__' --exclude-dir='__snapshots__'

# 6) Snapshot текущего состояния перед правками
grep -rln "from.*\.module\.css" frontend/src/ | head -20
# Это файлы которые ДОЛЖНЫ использовать s.X, не kebab strings
```

**Выход discovery — формат отчёта в smoke секции ниже:**

```
| Файл:строка | Орфэн-строка | Имеет ли .module.css | Решение |
|---|---|---|---|
| frontend/src/components/Toast/Toast.js:72 | className="toast-container" | YES (Toast.module.css) | FIX — заменить на s.toastContainer (УЖЕ закрыто hot-fix #7) |
| frontend/src/components/X/Y.js:99 | className="some-class" | YES | FIX |
| frontend/src/pages/Z/Foo.js:55 | className="legacy-button" | NO (globally styled) | SKIP — legitimate global class |
```

---

## Зависимости

Только Wave 2 hot-fix #7 (уже закрыт). От 2.01-2.03 не зависит.

**Ветка:** `wave-2/hotfix-08-orphan-classname-audit` от `wave-2/hotfix-07-toast-position` (98ca5f2).

---

## Что блокирует

- 2.05 (Frontend DiaryScreen + PainEventForm) — там будут новые модалки + toast'ы. Без закрытия orphans есть риск что мой smoke 2.05 встретит unexpected hidden bug.
- Любой будущий frontend коммит — orphan'ы продолжат накапливаться silently.

**Не блокирует 2.04** — это backend.

---

## Параллельная работа — координация

**ТРОГАЕМ (зависит от находок):**

- Каждый orphan = 1 файл изменён (импорт `s` + замена строки)
- Если в файле НЕТ существующего `import s from './X.module.css'` — добавляем (т.к. ему теперь нужен)
- Если соответствующий camelCase ключ в `.module.css` ОТСУТСТВУЕТ — это значит миграция была partial; добавляем класс в module.css сначала

**НЕ ТРОГАЕМ:**

- Глобальные CSS классы (валидные kebab-strings из не-module CSS)
- CSS bundle (`index.css`, `App.css`) — там kebab нормально
- ExerciseRunner v4 LOCKED (если orphan там найдётся — стопись, спроси)
- Тесты (jest мок Proxy продолжит работать без изменений)

---

## Конкретная реализация

### A) Discovery → классификация

После grep — каждая находка попадает в одну из 3 категорий:

**Категория 1 — Чистый orphan (требует FIX):**
- В файле JSX уже есть `import s from './X.module.css'`
- Соответствующий camelCase ключ существует в .module.css
- Но конкретная строка использует kebab `className="my-class"` вместо `className={s.myClass}`

→ **FIX:** заменить kebab-строку на `s.camelCaseKey`.

**Категория 2 — Partial migration (требует FIX расширенный):**
- В файле JSX НЕТ `import s from './X.module.css'` — забыли при миграции
- НО рядом существует X.module.css

→ **FIX:** добавить `import s from './X.module.css'`, заменить kebab на camelCase ключи. Если каких-то ключей в .module.css ещё нет — добавить.

**Категория 3 — Legitimate global class (SKIP):**
- В файле JSX нет .module.css (нет соответствующего файла рядом)
- Класс определён в `App.css` / `index.css` / `globals.css` / Bootstrap / другой глобальной таблице

→ **SKIP:** оставить как есть. Но **записать** в отчёт в smoke секции что это явно проверено.

### B) Special case — ToastContext.js (уже закрыт hot-fix #7)

Не повторяй fix. Просто verify что `frontend/src/contexts/ToastContext.js` (или фактический путь) не содержит больше orphan'ов: grep кратно.

### C) Memory rules update

Создать/обновить файлы:

**`memory/feedback_smoke_real_browser.md`** — добавить секцию в конец (НЕ перезаписывать существующее):

```markdown
## Усиление 2026-05-18 (после Hot-fix #7+#8)

После любой CSS-related миграции (CSS Modules, styled-components, Tailwind, переименование класса) — ОБЯЗАТЕЛЬНО прогнать:

    grep -rEn 'className=["\047]\w+(-\w+)+["\047]' frontend/src/ \
      --include='*.js' --include='*.jsx' \
      --exclude='*.test.js' --exclude-dir='__tests__'

Любые matches — потенциальные orphans. Jest пропустит (Proxy mock).
Только реальный браузер + DevTools Inspect ловит. Это **обязательный
verify-step** до закрытия CSS-related коммита.
```

**`memory/css_modules_orphan_audit.md`** — НОВЫЙ файл:

```markdown
# CSS Modules orphan audit правило

**Создано:** 2026-05-18 (Wave 2 Hot-fix #8)
**Источник:** скрытый bug в Toast container 14 дней после Wave 1 c8834b5

## Контекст

Wave 1 hot-fix #1 переименовал ~44 .module.css файла из kebab-case
ключей в camelCase + добавил `import s from './X.module.css'`. JSX
параллельно перешёл с `className="my-class"` на `className={s.myClass}`.

Один файл пропустили — `contexts/ToastContext.js:72`. Строка
`className="toast-container"` осталась как orphan на 14 дней.

## Симптом

- В JSX: `<div className="my-kebab-class">`
- Соответствующий .module.css содержит camelCase ключ `myKebabClass`
- В браузере `className="my-kebab-class"` НЕ матчит хэшированный класс
- Элемент остаётся без CSS → silent visual bug

## Почему jest не ловит

```javascript
// jest.config — CSS Modules мокаются через Proxy
moduleNameMapper: {
  '\\.module\\.css$': '<rootDir>/test/__mocks__/cssModule.js'
}

// cssModule.js
module.exports = new Proxy({}, {
  get: (_target, prop) => String(prop)
});
```

`s.toastContainer` → возвращает строку `"toastContainer"` (любой ключ).
В реальной сборке CSS Modules — `s.toastContainer` возвращает hashed
class или `undefined` если ключа нет. Jest тест проходит, прод — нет.

## Правило

1. **При переименовании CSS-классов** (kebab → camelCase, или любое):
   - Обновлять JSX в ТОТ ЖЕ коммит
   - НЕ откладывать "в следующий PR"
   - grep на orphans до закрытия коммита

2. **После любой CSS Modules миграции** обязательный verify-step:
   ```
   grep -rEn 'className=["\047]\w+(-\w+)+["\047]' frontend/src/
   ```

3. **При smoke любого CSS изменения** — реальный браузер + DevTools
   Computed Styles на затронутом элементе. Не доверять jest на CSS.

4. **Раз в волну** (Wave 2 завершение, Wave 3, и т.д.) — прогнать grep
   как retrospective check, найти любые накопившиеся orphans.
```

**`memory/toast_position_mobile_blind_spot.md`** — пометить RESOLVED:

```markdown
# RESOLVED 2026-05-18 — Hot-fix #7 + #8

[Существующий контент]

## RESOLUTION 2026-05-18

Real root cause: НЕ position blind-spot, а orphan kebab-className в
`contexts/ToastContext.js:72` после CSS Modules миграции c8834b5
(Wave 1 hot-fix #1, 2026-05-04). Контейнер 14 дней рендерился без
position/z-index → static positioning, normal DOM flow.

Closed:
- Hot-fix #7 (98ca5f2) — заменил orphan на `import s` + `s.toastContainer`
- Hot-fix #8 — retrospective grep на остальные orphans + memory rules
```

---

## Mock-based тесты

Тесты не нужны для самого hot-fix #8. Существующие frontend тесты должны продолжать проходить без изменений. Если какие-то тесты падают после fix'ов — это **обнаруженный latent regression** от orphan'а, не баг hot-fix #8.

```bash
cd frontend
CI=true npm test 2>&1 | tail -10
```

**Ожидание:** 271 passed / 271 total (после Block A + hot-fix #7). Если меньше — сообщить какие тесты упали (это полезный signal).

---

## NOT TOUCH

- ExerciseRunner v4 (LOCKED). Если orphan там найдётся — стопись, спроси архитектора.
- PatientDashboard `pd-*` классы — это **намеренно** не CSS Modules, а global scope (см. memory). Не считаются orphan'ами.
- Тесты — jest CSS Modules мок не меняем
- Backend
- Storybook / .stories.js если есть

**Особый случай — `pd-*` префикс:**

Из memory: `PatientDashboard` использует кастомный prefix `.pd-*` в **глобальном** CSS (не Modules) намеренно — для возможности override'ить из ExerciseRunner LOCKED scope. Эти `className="pd-X"` строки в `PatientDashboard/**/*.js` — **legitimate**, **не orphans**. Включить в SKIP в discovery отчёте.

---

## Smoke test (4-card format)

### Сценарий 1 — Discovery отчёт

```
Шаг 1.1 — Получить полный список kebab orphans
├─ Где: терминал в корне репо
├─ Что найти: команда grep из verify-step
├─ Что сделать: запустить grep, сохранить вывод в /tmp/kebab_classnames.txt
└─ Что увидеть: список файлов:строк с kebab className. Может быть 0, может быть много.
                Если 0 — отлично, переходи к шагу 4 (memory update).

Шаг 1.2 — Классификация каждой находки
├─ Где: /tmp/kebab_classnames.txt + IDE для inspect
├─ Что найти: каждая строка в файле
├─ Что сделать: для каждой — открыть JSX, проверить:
│              (a) есть ли .module.css рядом
│              (b) если да — есть ли соответствующий camelCase ключ
│              (c) категория 1/2/3 (orphan / partial migration / global)
└─ Что увидеть: таблица решений (см. формат discovery выше)
```

### Сценарий 2 — Fix каждой Категории 1+2 находки

Для **каждого** orphan'а:

```
Шаг 2.N — Fix orphan в файле X
├─ Где: frontend/src/path/to/file.js, конкретная строка
├─ Что найти: `className="some-kebab"` (или несколько на той же строке)
├─ Что сделать:
│  (a) Убедись `import s from './local.module.css'` есть в верху файла
│      Если нет — добавь
│  (b) В .module.css проверь что ключ `someKebab` (camelCase) существует
│      Если нет — это Категория 2, добавь класс
│  (c) Замени `className="some-kebab"` на `className={s.someKebab}`
└─ Что увидеть: JSX чище, без kebab string. Lint passes.
```

### Сценарий 3 — Реальный браузер smoke на каждый исправленный компонент

**Это самое важное.** jest не поймает регрессии — только реальный браузер.

```
Шаг 3.N — Browser smoke компонента после fix'а
├─ Где: http://localhost:3001/, навигация к странице где этот компонент рендерится
├─ Что найти: компонент на странице, который Y затронул fix
├─ Что сделать:
│  (a) Открыть DevTools → Elements
│  (b) Найти элемент в DOM
│  (c) Computed → проверить что класс хэшированный (не "some-kebab")
│  (d) Visual check — компонент выглядит ожидаемо (с правильным styling)
└─ Что увидеть:
   ✓ `class="X_someKebab__hash"` в DOM
   ✓ Computed styles ожидаемые (position, color, размер и т.д.)
   ✓ Visual без regression vs до hot-fix #8
```

### Сценарий 4 — Regression: остальные тесты + страницы

```
Шаг 4.1 — Frontend тесты
├─ Где: терминал, frontend/
├─ Что найти: `CI=true npm test`
├─ Что сделать: запустить
└─ Что увидеть: 271/271 passed (или больше — если добавили новые тесты)

Шаг 4.2 — Light/Dark тема regression
├─ Где: главные страницы (Admin Dashboard, Patient Dashboard, Toast triggers)
├─ Что найти: theme toggle (если есть UI) или manual установить в localStorage
├─ Что сделать: переключить light → dark → light, посмотреть страницы
└─ Что увидеть: компоненты которые трогали fix'ы — без визуальной regression

Шаг 4.3 — Mobile breakpoint regression
├─ Где: DevTools Device Toolbar, iPhone SE preset (375px)
├─ Что найти: те же затронутые страницы
├─ Что сделать: посмотреть
└─ Что увидеть: layout остаётся целостным
```

### Сценарий 5 — Подтвердить grep пустой после fix'ов

```
Шаг 5.1 — Final grep verification
├─ Где: терминал в корне репо
├─ Что найти: тот же grep что в Шаге 1.1
├─ Что сделать: запустить ещё раз
└─ Что увидеть: только Категория 3 находки (legitimate global classes
                + ExerciseRunner LOCKED + pd-* PatientDashboard).
                Их явно выписываем в отчёт как «оставлены намеренно».
```

---

## Файлы — итоговый чеклист

### Изменить (зависит от находок)
- N × `frontend/src/**/*.js` с orphan'ами — каждый получает FIX
- Возможно N × `frontend/src/**/*.module.css` — если нужно добавить отсутствующие camelCase ключи
- `memory/feedback_smoke_real_browser.md` — расширить
- `memory/css_modules_orphan_audit.md` — НОВЫЙ
- `memory/toast_position_mobile_blind_spot.md` — пометить RESOLVED с full root cause
- `CLAUDE.md` — короткая запись в «Завершённые исправления»

### НЕ ТРОГАТЬ
- ExerciseRunner v4 (LOCKED)
- pd-* классы в PatientDashboard (legitimate global)
- Тесты
- Backend
- CSS bundle (index.css, App.css, globals.css)

---

## Текст коммита

```
fix(ui): Wave 2 Hot-fix #8 — retrospective grep на kebab-className orphans

После Hot-fix #7 (98ca5f2) обнаружил orphan `className="toast-container"`
в ToastContext.js, проявившийся через 14 дней после CSS Modules миграции
c8834b5 (Wave 1 hot-fix #1, 2026-05-04). jest пропустил из-за Proxy mock.

Hot-fix #8 — retrospective audit. Прогнал grep по всему frontend/src на
`className=["']\w+(-\w+)+["']`. Найдено N orphan(s), исправлено M
(остальные — legitimate global classes / pd-* в PatientDashboard).

Memory updates:
- feedback_smoke_real_browser.md — добавлено правило об обязательном
  grep после CSS-related миграций
- css_modules_orphan_audit.md (НОВЫЙ) — описание паттерна, root cause
  jest blind spot, и правил предотвращения
- toast_position_mobile_blind_spot.md — RESOLVED с full root cause

Tests: 271/271 (без изменений как ожидалось — CSS Modules мок Proxy
пропускает orphans; реальный browser smoke на каждое исправленное
место в DOM Computed Styles).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**CLAUDE.md:**
- Секция «Завершённые исправления» — запись:
  > **Wave 2 hot-fix #8** — retrospective audit orphan kebab-className после c8834b5. Найдено/закрыто N orphans. Memory правила усилены.

---

## Definition of Done

- [ ] grep verify-step выполнен, полный список orphans на руках
- [ ] Классификация всех находок: Категория 1/2/3
- [ ] Каждый Категория 1+2 fix реализован
- [ ] Каждый исправленный компонент — реальный browser smoke в DevTools
- [ ] Computed Styles подтверждены для каждого исправленного места (`class="X_name__hash"`)
- [ ] Visual regression checked: light/dark тема, mobile breakpoint
- [ ] Frontend тесты 271/271 (или > если добавили)
- [ ] Final grep — нулевые Категория 1+2 находки, только Категория 3 остатки
- [ ] memory/feedback_smoke_real_browser.md обновлён
- [ ] memory/css_modules_orphan_audit.md создан
- [ ] memory/toast_position_mobile_blind_spot.md RESOLVED
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан с подсчётами N orphans / M исправлено в commit message
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR от ветки `wave-2/hotfix-08-orphan-classname-audit`, висит до batch merge

---

## После hot-fix #8

**Stack:** af313b4 → a6f7980 → 82544c0 → 98ca5f2 → <#8 sha> (5 PR ⏸)

**Block B Pain Tracking:**
- 2.04 (TZ v2 на руках) — можно запускать параллельно с #8 (backend, не зависит от frontend)
- 2.05 — TZ напишу после ⏸ 2.04 и UX feedback по Telegram alert format

**Backlog для Wave 3:**
- Возможно стоит подумать о замене jest CSS Modules Proxy мока на что-то более строгое — мок который возвращает `undefined` для ключей, отсутствующих в реальном .module.css. Это сложнее (нужно парсить .module.css на тестирующее время), но устранит slow-burn риск orphan'ов навсегда. Отдельный TZ когда будет время в Wave 3.

---

## Урок для архитектора (мне)

Hot-fix #7 TZ построил неправильную mental model — предположил position fix, не реальный root cause. Жил с memory `toast_position_mobile_blind_spot.md` как с истиной, не подверг сомнению.

**Новое правило для будущих TZ:**

> Когда симптом visual ("элемент не там где надо" / "стиль не применяется" / "разъезжается на mobile") — **первый verify-step = реальный браузер DevTools Inspect**, ДО гипотез о CSS. Computed Styles покажут истину сразу. Только после этого формулировать гипотезу root cause в TZ.

Это особенно важно для CSS — слишком много слоёв (browser default → global CSS → CSS Modules → inline styles → JS overrides). Любой может быть виноват. Inspect = единственный signal истины.
