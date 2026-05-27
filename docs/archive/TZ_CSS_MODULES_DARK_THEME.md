# ТЗ: CSS Modules миграция + Dark theme

**Дата:** 2026-04-30
**Состояние перед стартом:** 502 теста ✓ (293 backend + 209 frontend), prod alive, last commit `9431ab7`
**Оценка:** CSS Modules ~6-8ч (10 PR-этапов) + Dark theme ~4ч (3 PR-этапа). Всего ~10-12ч в 13 коммитов.

---

## 0. Принципы безопасности (читать перед каждым этапом)

1. **Никогда не делать «refactor everything»** — 1 этап = 1 PR = 1 коммит = ≤1 страница. Каждый этап обратим через `git revert`.
2. **После каждого этапа — обязательно:**
   - `cd frontend && npx react-scripts test --watchAll=false` (209 тестов должны остаться зелёными)
   - Smoke-тест в браузере: открыть переведённую страницу, кликнуть по основным action'ам.
   - Commit с префиксом `refactor(css):` или `feat(theme):`.
   - Push? — **только по запросу пользователя**, не автоматом.
3. **LOCKED — не трогать ни при каких обстоятельствах:**
   - [ExerciseRunner.js](frontend/src/pages/PatientDashboard/components/ExerciseRunner.js) и связанный CSS (`.pd-runner` scope, `.crd/.sec/.dot/.btn/.tmr/.fb-toggle/.rpe-b/.pv/.plbl/.cmt`, `--az-*` переменные)
   - Дизайн-эталон 1:1 с iOS-референсом, любое изменение CSS ломает визуал
4. **Не переименовывать классы — только перепаковывать в module.** То же `.modal-overlay` остаётся `styles.modalOverlay` в module.
5. **PatientDashboard уже scoped (`pd-` prefix + 168 переменных в `tokens.css`).** Не трогаем структуру — только токены добавляем для dark theme.
6. **Тесты на класс-селекторы** (`querySelector('.loading-spinner')` в [LoadingSpinner.test.js:18-23](frontend/src/components/LoadingSpinner.test.js#L18-L23)) — переименование сломает тест. Решение: при миграции LoadingSpinner добавить `data-testid` и поменять тест ОДНОВРЕМЕННО с компонентом в одном коммите.
7. **CSS Modules CRA 5 нативно поддерживает** — файлы `*.module.css` автоматически scoped, ничего настраивать не нужно.

---

## 1. Что меняется и что НЕ меняется

### Меняется (инструкторская часть, патиентский Auth flow)
| Файл (CSS) | Файл (JS) | Дублей в classNames | Стратегия |
|---|---|---|---|
| `pages/Diagnoses.css` | `Diagnoses.js` | 14 общих классов | → `Diagnoses.module.css` |
| `pages/Patients.css` | `Patients.js` (834 строки!) | 25 общих классов | → `Patients.module.css` |
| `pages/MyComplexes.css` | `MyComplexes.js` | 18 общих | → `MyComplexes.module.css` |
| `pages/Trash.css` | `Trash.js` | 6 общих | → `Trash.module.css` |
| `pages/CreateComplex.css` | `CreateComplex.js` | 22 общих | → `CreateComplex.module.css` |
| `pages/EditComplex.css` | `EditComplex.js` | 17 общих | → `EditComplex.module.css` |
| `pages/Exercises/Exercises.css` | `Exercises.js` | 8 общих | → `Exercises.module.css` |
| `pages/Exercises/ExerciseDetail.css` | `ExerciseDetail.js` | 7 общих | → `ExerciseDetail.module.css` |
| `pages/Exercises/components/*.css` | `components/*.js` (6 файлов) | 12 общих | → `*.module.css` |
| `pages/Login.css` | `Login.js` | 4 общих | → `Login.module.css` |
| `pages/PatientAuth/*.css` | `PatientAuth/*.js` (4 файла) | scoped уже | → `*.module.css` |
| `pages/Admin/*.css` (5 файлов) | `Admin/*.js` | scoped уже | → `*.module.css` |
| `pages/Dashboard.css`, `EditTemplate.css`, `ImportExercises.css` | соответствующие | мало дублей | → `*.module.css` |
| `components/*.css` (12 файлов) | `components/*.js` | смешано | → `*.module.css` (внимательно к Toast/ConfirmModal — переиспользуемые) |

### НЕ меняется
- ✗ [ExerciseRunner.js](frontend/src/pages/PatientDashboard/components/ExerciseRunner.js) и его CSS (LOCKED)
- ✗ Все `pd-*` файлы PatientDashboard (`HomeScreen.css`, `DiaryScreen.css`, `ExercisesScreen.css`, `RoadmapScreen.css`, `ProfileScreen.css`, `ContactScreen.css`, `ComplexDetailView.css`, `PatientDashboard.css`, `tokens.css`, `components/ui/*.css`) — **уже scoped через `pd-` prefix + `--pd-*` токены, фактически работают как module-by-convention**
- ✗ `index.css` — глобальные стили (body, button reset, скроллбар, focus-visible, safe-area, print) — остаются глобальными
- ✗ `App.css` — root-level layout

### Удаляется (мёртвый код)
- 🗑 `pages/Exercises/ExercisesTemp.css` — нет JS-импорта (`grep "ExercisesTemp" frontend/src/**/*.js` = 0)
- 🗑 Decision Summary комментарий из [common.css](frontend/src/styles/common.css) (308 строк отчёта о дублях — артефакт прошлой попытки)
- 🗑 [common.css](frontend/src/styles/common.css) сам после Этапа 9 (когда `.exercise-description` уйдёт в `MyComplexes.module.css` как единственный реальный consumer)

---

## 2. Этапы (CSS Modules)

> **Каждый этап = отдельный коммит. После каждого — `npm test`. Push — по запросу.**

### Этап 0 — design tokens файл (foundation для dark theme + единая палитра инструктора)

Создать `frontend/src/styles/tokens.css`:
```css
:root {
  /* Палитра — light (default) */
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-2: #f1f5f9;
  --color-border: #e2e8f0;
  --color-text: #1e293b;
  --color-text-muted: #64748b;

  --color-primary: #667eea;
  --color-primary-hover: #5568d3;
  --color-primary-bg: rgba(102, 126, 234, 0.1);

  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-danger-hover: #dc2626;

  --color-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --color-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --color-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

  /* Spacing/radius — без изменений, для совместимости */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}
```

Импортировать в [index.css](frontend/src/index.css) первой строкой `@import './styles/tokens.css';`.

**Важно:** на этом этапе ничего не использовать — только определяем токены. Старые цвета `#667eea`, `#e2e8f0` и т.д. остаются в страницах. Ничего не должно сломаться.

**Тестирование:** `npm test` → все 209 ✓. Открыть в браузере любую страницу — визуал идентичен.

**Коммит:** `feat(css): добавить базовые design tokens (foundation для CSS Modules + dark theme)`

---

### Этап 1 — удалить мёртвый код

1. `git rm frontend/src/pages/Exercises/ExercisesTemp.css`
2. Из [common.css](frontend/src/styles/common.css) удалить блок Decision Summary (строки 1-323), оставить только реальный CSS (`.exercise-description` и `.exercise-description.collapsed/expanded`).

**Тестирование:** `npm test` → все ✓. Сохранили работающий `.exercise-description` для PatientView потомков (он ещё используется в MyComplexes.js).

**Коммит:** `chore(css): удалить мёртвый ExercisesTemp.css + отчёт о дублях из common.css`

---

### Этап 2 — мини-страницы (warm-up, низкий риск)

Перевести в порядке от простого к сложному. Стандартный шаблон:

```jsx
// Было:
import './Diagnoses.css';

// Стало:
import styles from './Diagnoses.module.css';

// JSX:
<div className="page-header">       →   <div className={styles.pageHeader}>
<button className="btn-primary">    →   <button className={styles.btnPrimary}>
<div className="modal-overlay">     →   <div className={styles.modalOverlay}>
```

Для CSS Modules — все имена классов в `*.module.css` остаются дефис-кейс, в JS используются как camelCase автоматически:
```css
/* Diagnoses.module.css */
.page-header { ... }
.btn-primary { ... }
```
В JSX доступ: `styles.pageHeader`, `styles.btnPrimary`.

**Условные классы:**
```jsx
// Было: className={`btn ${isActive ? 'active' : ''}`}
// Стало: className={`${styles.btn} ${isActive ? styles.active : ''}`}
// или с classnames lib (если ещё не установлена — НЕ ставить ради этого):
className={[styles.btn, isActive && styles.active].filter(Boolean).join(' ')}
```

**Глобальные классы внутри module** (если нужно из библиотеки или legacy селектор): `:global(.legacy-class) { ... }`

#### 2.1 — `Login.css` → `Login.module.css`
- Файлы: [Login.js](frontend/src/pages/Login.js) + [Login.css](frontend/src/pages/Login.css)
- 4 общих класса: `.btn-primary`, `.error-message`, `.form-group`, `.spinner`
- Smoke: попробовать залогиниться `vadim@azarean.com` / `Test1234`
- Коммит: `refactor(css): Login → CSS Modules`

#### 2.2 — `PatientAuth/*.css` (4 файла)
- Файлы: PatientLogin, PatientRegister, PatientForgotPassword, PatientResetPassword
- Smoke: открыть `/patient-login`, попробовать ввести email
- Коммит: `refactor(css): PatientAuth страницы → CSS Modules`

#### 2.3 — `Admin/*.css` (5 файлов)
- AdminAuditLogs, AdminContent, AdminStats, AdminSystem, AdminUsers
- Smoke: залогиниться как admin → tab Admin → пощёлкать по подразделам
- Коммит: `refactor(css): Admin панель → CSS Modules`

---

### Этап 3 — Diagnoses (отдельная страница, изолированная)

- Файлы: [Diagnoses.js](frontend/src/pages/Diagnoses.js) + Diagnoses.css
- 14 классов, все в одной странице
- Smoke: tab Diagnoses → создать тестовый диагноз → отредактировать → удалить → проверить что попал в архив
- Коммит: `refactor(css): Diagnoses → CSS Modules`

---

### Этап 4 — Trash (минимум функционала)

- Файлы: [Trash.js](frontend/src/pages/Trash.js) + Trash.css
- 6 общих классов
- Smoke: tab Trash → восстановить пациента → восстановить комплекс
- Коммит: `refactor(css): Trash → CSS Modules`

---

### Этап 5 — MyComplexes

- Файлы: [MyComplexes.js](frontend/src/pages/MyComplexes.js) + MyComplexes.css
- 18 общих классов
- ⚠️ Использует `.exercise-description` из common.css — переместить в `MyComplexes.module.css` как `:global(.exercise-description)` или просто скопировать стиль внутрь модуля
- Smoke: tab MyComplexes → открыть карточку комплекса → раскрыть/свернуть описание упражнения
- Коммит: `refactor(css): MyComplexes → CSS Modules + переезд .exercise-description`

---

### Этап 6 — Patients (834 строки JS — крупнейшая страница)

- Файлы: [Patients.js](frontend/src/pages/Patients.js) + Patients.css
- 25 общих классов — самый большой набор
- ⚠️ Использует RehabProgramModal — НЕ ТРОГАТЬ его CSS (это компонент)
- Smoke (полный):
  - Создать тестового пациента
  - Сгенерировать invite-code
  - Назначить программу через `RehabProgramModal`
  - Удалить (soft) → восстановить из Trash
- Коммит: `refactor(css): Patients → CSS Modules`

---

### Этап 7 — CreateComplex / EditComplex (DnD!)

- Файлы: CreateComplex.js, EditComplex.js + соответствующие CSS
- 22 + 17 классов, много общих между ними
- ⚠️ **DnD-классы критичны:** `.is-dragging`, `.drag-handle`, `.selected-exercise`, `.selected-exercises-list` — после миграции проверить визуально что drag-and-drop работает
- ⚠️ ExerciseSelector имеет свой CSS — мигрируется отдельно в Этапе 8
- Smoke:
  - tab CreateComplex
  - Выбрать пациента, диагноз
  - Перейти к шагу 3 (DnD)
  - Перетащить упражнение, изменить порядок, убрать через `.remove-exercise-btn`
  - Сохранить, открыть `EditComplex` → отредактировать
- Коммит: `refactor(css): CreateComplex + EditComplex → CSS Modules`

---

### Этап 8 — Exercises (страница + 6 компонентов)

- Файлы: [Exercises.js](frontend/src/pages/Exercises/Exercises.js), [ExerciseDetail.js](frontend/src/pages/Exercises/ExerciseDetail.js) + 6 компонентов в `Exercises/components/`
- Самый большой подкаталог: ExerciseCard, ExerciseFilters, ExerciseModal, ExerciseSelector, ExerciseViewModal, DeleteConfirmModal
- ⚠️ **ExerciseSelector используется в CreateComplex/EditComplex** — поэтому миграция его module-стилей не должна сломать те страницы
- ⚠️ ExerciseViewModal встраивает Kinescope iframe — не трогать `.video-container` структуру
- Smoke:
  - tab Exercises (библиотека)
  - Применить фильтры
  - Открыть ExerciseDetail
  - Открыть ExerciseModal (создание)
  - Открыть ExerciseViewModal (просмотр с видео)
  - Из CreateComplex открыть ExerciseSelector
- Коммит: `refactor(css): Exercises страница + 6 компонентов → CSS Modules`

---

### Этап 9 — переиспользуемые компоненты + удалить common.css

- Файлы: `components/*.css` (12 файлов): BackButton, Breadcrumbs, ConfirmModal, ErrorBoundary, InviteCodeModal, LoadingSpinner, PatientSplash, RehabProgramModal, Skeleton, skeletons/*, Toast
- ⚠️ **LoadingSpinner.test.js использует `querySelector('.loading-spinner')`** — в одном коммите менять и тест, и компонент (заменить querySelector на `getByTestId('loading-spinner')`, добавить `data-testid` в JSX)
- ⚠️ ConfirmModal используется через `useConfirm` hook — проверить что не сломан (через [hooks/useConfirm.js](frontend/src/hooks/useConfirm.js))
- ⚠️ Toast использует ToastContext — проверить что toast.success/info/error всё ещё показываются с правильными цветами
- После всех — удалить `frontend/src/styles/common.css` (если `.exercise-description` уже переехал в Этапе 5)
- Удалить импорт `import './styles/common.css';` из [index.js](frontend/src/index.js)
- Smoke:
  - Toast: вызвать любое действие которое триггерит toast
  - ConfirmModal: попробовать удалить пациента — должна выпасть конфирм-модалка
  - LoadingSpinner: страница которая медленно грузится (Patients например при cold start)
  - InviteCodeModal: сгенерить invite-code — должна показать модалку с copy-кнопкой
  - RehabProgramModal: создать программу пациенту
- Коммит: `refactor(css): переиспользуемые компоненты → CSS Modules + удалить common.css`

---

### Этап 10 — Dashboard, EditTemplate, ImportExercises (последние)

- Файлы: [Dashboard.css](frontend/src/pages/Dashboard.css), EditTemplate.css, ImportExercises.css
- Малые страницы, мало классов
- Smoke: открыть Dashboard (главная инструктора), открыть Import (CSV), Edit Template
- Коммит: `refactor(css): остатки страниц → CSS Modules`

---

## 3. Этапы (Dark theme)

> **Стартовать только после полного завершения Этапов 0-10 CSS Modules.** Иначе глобальные стили будут конфликтовать с переменными темы.

### Этап 11 — расширить design tokens темой

В [tokens.css](frontend/src/styles/tokens.css) добавить:

```css
/* Light theme — уже есть в :root */

/* Dark theme — переопределение через class */
[data-theme="dark"] {
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-surface-2: #334155;
  --color-border: #475569;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;

  --color-primary: #818cf8;
  --color-primary-hover: #a5b4fc;
  --color-primary-bg: rgba(129, 140, 248, 0.15);

  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #f87171;
  --color-danger-hover: #ef4444;

  --color-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --color-shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --color-shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}

/* Auto-detect через prefers-color-scheme — fallback если пользователь не выбирал */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* копия dark переменных */
  }
}
```

**Также для PatientDashboard `--pd-*` переменных** — добавить dark-варианты в `tokens.css` PatientDashboard'а ([frontend/src/pages/PatientDashboard/tokens.css](frontend/src/pages/PatientDashboard/tokens.css)). НО! **Важно:** проверить что `--az-*` (ExerciseRunner) НЕ переопределяются — они LOCKED, должны оставаться iOS-палитрой как сейчас.

**Тестирование:** `npm test` ✓. Открыть в браузере, через DevTools поставить `<html data-theme="dark">` руками — все страницы должны переключиться, ExerciseRunner остаётся в iOS-light.

**Коммит:** `feat(theme): добавить dark theme tokens`

---

### Этап 12 — ThemeContext + переключатель в Profile

Создать `frontend/src/context/ThemeContext.js`:
- State: `theme: 'light' | 'dark' | 'system'`
- Persist: `localStorage.azarean_theme`
- Effect: применяет `document.documentElement.setAttribute('data-theme', resolvedTheme)`, где `resolvedTheme` = либо явное либо разрешённый из `prefers-color-scheme`
- Слушать `matchMedia('(prefers-color-scheme: dark)').addEventListener('change')` чтобы перерендериться при смене ОС-темы (если выбрано 'system')

Подключить `<ThemeProvider>` в [App.js](frontend/src/App.js) обёрткой над всем (внутри `<Router>` чтобы можно было использовать в любом маршруте).

**Переключатель** — добавить в:
- [ProfileScreen.js](frontend/src/pages/PatientDashboard/components/ProfileScreen.js) — секция «Тема» с тремя radio-кнопками: «Светлая / Тёмная / Системная» (используя уже существующий `Switch.js` или `ChipGroup.js` UI-компонент)
- [Dashboard.js](frontend/src/pages/Dashboard.js) — для инструктора в header (рядом с logout-кнопкой), как Sun/Moon icon из `lucide-react`

**Тесты:**
- Unit-тест `ThemeContext.test.js`: проверить что localStorage читается, что setTheme обновляет attribute, что 'system' слушает matchMedia
- Smoke в браузере: переключить — все страницы перерисовались, ExerciseRunner НЕ изменился (iOS-light всегда)

**Коммит:** `feat(theme): ThemeContext + переключатель в Profile/Dashboard`

---

### Этап 13 — заменить хардкод цветов на токены (длинная работа)

**Это самая большая часть dark-theme работы.** Ради безопасности — делать постранично:

1. Поиск хардкода: `grep -rE "#[0-9a-fA-F]{3,8}|rgb\(|rgba\(" frontend/src --include="*.module.css"` → дать список
2. По каждой странице — заменить на токены:
   - `#667eea` → `var(--color-primary)`
   - `#e2e8f0` → `var(--color-border)`
   - `#1e293b` → `var(--color-text)`
   - `#ffffff` → `var(--color-surface)`
   - и т.д.
3. **Не трогать:**
   - `--az-*` ExerciseRunner (LOCKED)
   - Градиенты, SVG-цвета, картинки (если их сложно переменизировать — оставить, dark-mode будет с теми же декоративными элементами)
   - Скриншоты в roadmap (рендерятся через картинки)
4. После каждой страницы — `npm test` + smoke в обеих темах.

**Коммит-стратегия:** один коммит на 2-3 родственные страницы (`refactor(theme): Patients/MyComplexes/Trash → токены`).

После всего — финальный smoke:
- Светлая тема: всё как раньше
- Тёмная тема: текст читается, контраст не плохой, ExerciseRunner остаётся в iOS-light
- Системная тема: переключение ОС → UI меняется

---

## 4. Что делать если сломалось

### «Тесты упали после миграции страницы X»
1. `git diff HEAD~1 frontend/src/pages/X.js` — проверить что нет опечаток в `styles.xxx`
2. Открыть страницу в браузере — если визуально OK, но тест зелёный в snapshot/getByText — возможно тест ловил `class="..."` напрямую. Поправить тест на `data-testid`.
3. Если визуально сломано (классы не применились) — `console.log(styles)` в JSX, проверить что module экспортирует ожидаемые ключи.

### «После dark-theme текст не читается на каком-то экране»
1. DevTools → element → Computed → найти конфликтующее правило с хардкодом цвета
2. Заменить хардкод на `var(--color-...)` в этом правиле
3. Если проблема в `.module.css` который генерируется минификатором (`Patients_btnPrimary__abc123`) — debug ничем не отличается, просто открыть `*.module.css` исходник.

### «Откатить этап»
- `git revert HEAD` — каждый этап обратим, потому что 1 этап = 1 коммит.
- Если этап уже запушен и в проде что-то сломалось — `git revert <hash> && git push origin main` → CI/CD откатит за ~3 минуты.

---

## 5. Чек-лист готовности

После каждого этапа:
- [ ] `cd frontend && npx react-scripts test --watchAll=false` → 209/209 ✓
- [ ] `cd frontend && npm run build` → нет ошибок (catches CSS Module syntax errors которые тесты не ловят)
- [ ] Smoke-тест в браузере на :3001 (frontend dev) — проверить заявленные сценарии для этапа
- [ ] `git status` чистый, нет лишних файлов
- [ ] Commit с сообщением по шаблону `refactor(css):` или `feat(theme):`

После завершения CSS Modules (Этапы 0-10):
- [ ] Файл [common.css](frontend/src/styles/common.css) удалён
- [ ] `find frontend/src -name "*.module.css" | wc -l` ≥ 50 (примерно столько модулей создастся)
- [ ] `grep -rn "import.*\.css'" frontend/src --include="*.js" | grep -v module.css | grep -v index.css | grep -v App.css | grep -v PatientDashboard` → пусто (нет старых импортов)

После завершения Dark theme (Этапы 11-13):
- [ ] `localStorage.azarean_theme` сохраняется
- [ ] Toggle в Profile (пациент) и Dashboard (инструктор) работает
- [ ] `prefers-color-scheme: dark` авто-применяется при выборе 'system'
- [ ] ExerciseRunner остаётся в iOS-light независимо от темы
- [ ] Контраст в темной теме ≥ WCAG AA (4.5:1 для текста) — проверить через Chrome DevTools Lighthouse

---

## 6. Чего НЕ делать (anti-goals)

- ✗ Не переписывать структуру компонентов (split, merge, refactor logic) — только CSS-imports.
- ✗ Не переименовывать классы из дефис-кейс в camelCase в CSS-файлах — пусть остаются как есть, CSS Modules сами трансформируют доступ.
- ✗ Не вводить styled-components / emotion / tailwind — out of scope, чисто перепаковка существующих стилей.
- ✗ Не оптимизировать дубли при миграции (`.btn-primary` живёт в 5 файлах) — каждый module имеет свою копию. Это OK: scoped CSS = небольшое дублирование, но нет конфликтов. Когда-нибудь можно вынести в `Button.module.css` shared-компонент, но это задача другого ТЗ.
- ✗ Не делать одновременно CSS Modules + Dark theme — только последовательно. Иначе debug кошмар.
- ✗ Не push'ить на main подряд несколько этапов — давать пользователю время прокликать smoke в браузере перед каждым push.

---

## 7. Краткая шпаргалка CSS Modules в CRA 5

```jsx
// 1. Импорт
import styles from './MyPage.module.css';

// 2. Простой класс
<div className={styles.header}>          // CSS: .header { ... }
<div className={styles.pageTitle}>       // CSS: .page-title { ... } — camelCase в JS

// 3. Несколько классов
<div className={`${styles.btn} ${styles.primary}`}>

// 4. Условный класс
<div className={isActive ? styles.active : ''}>
<div className={[styles.card, isLoading && styles.loading].filter(Boolean).join(' ')}>

// 5. Глобальный класс внутри module (для сторонних библиотек / legacy)
// CSS:
//   :global(.legacy-class) { color: red; }
//   .myClass :global(.kinescope-iframe) { width: 100% }

// 6. composes (наследование стилей)
// CSS:
//   .btnPrimary {
//     composes: btn from './shared.module.css';
//     background: blue;
//   }
```

---

## 8. Прежде чем начать — диалог с пользователем

Перед стартом подтвердить:
1. Делаем оба этапа (CSS Modules + Dark theme) или только CSS Modules?
2. Push после каждого этапа или собрать все этапы локально и потом одним push'ем?
3. Если что-то ломается — пинговать сразу или продолжать после revert'а?

После подтверждения — начать с **Этапа 0** (design tokens, безопасный warm-up).
