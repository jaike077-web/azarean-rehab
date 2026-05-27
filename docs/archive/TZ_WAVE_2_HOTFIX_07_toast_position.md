# TZ Wave 2 · Hot-fix #7 — Toast position fix (bottom → top + z-index)

**Дата:** 2026-05-18
**Версия:** v1
**Тип:** pre-Block-B hot-fix (между 2.03 и 2.04)
**Цель:** Исправить toast position blind-spot (memory `toast_position_mobile_blind_spot.md`, 2026-05-08). Toast'ы внизу страницы невидны при открытой модалке + scrollable content. Переносим на верх + повышаем z-index выше modal backdrop. Подготовка к 2.05 PainEventForm где этот баг критичен (пациент не увидит подтверждение red-flag alert).
**Объём:** 1-2 часа
**Риск:** низкий — CSS only fix + один z-index. Регрессионный риск — где-то ранее предполагалось bottom-toast как часть UX.

**Применённые правила:**
- ✅ Audit action verbs UPPERCASE (если будет логирование — не нужно в этом hot-fix'е)
- ✅ CSS Modules где применимо (Toast — выясняется в verify-step)
- ✅ Atomic smoke инструкции (4-card format — новое правило 2026-05-18)

---

## Verify-step перед стартом

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) Найти Toast компонент и его CSS
find frontend/src -name "Toast*" -o -name "*ToastContext*" | head -10
# Ожидание: ToastContext.js + Toast.js + Toast.module.css (или Toast.css)

# 2) Текущая позиция в CSS — bottom или fixed bottom?
grep -rn "bottom:\|position:\s*fixed" frontend/src/components/Toast* frontend/src/contexts/Toast* 2>/dev/null
# Ожидание: видна строка `bottom: 20px` (или similar). Это то что меняем.

# 3) z-index Toast vs Modal — Toast должен быть выше
grep -rn "z-index" frontend/src/components/Toast* frontend/src/contexts/Toast* 2>/dev/null
grep -rn "z-index" frontend/src/pages/Admin/AdminContent.module.css 2>/dev/null | grep -i modal
# Цель: Toast z-index > Modal z-index. Если modal=1000, toast должен быть 1100+

# 4) Существующие модалки — где могут конфликтовать
grep -rln "adminModal\|patientModal\|modal\b" frontend/src/**/*.module.css 2>/dev/null
# Ожидание: список всех модалок чтобы проверить smoke

# 5) Patient-facing toast usage — DiaryScreen, ExercisesScreen
grep -rn "toast\.\(success\|error\|info\|warning\)" frontend/src/pages/PatientDashboard/ | head -10
# Ожидание: видим где toast используется в patient UI — это область smoke

# 6) Mobile considerations — есть ли responsive media query для toast?
grep -rn "@media.*max-width\|@media.*min-width" frontend/src/components/Toast* frontend/src/contexts/Toast* 2>/dev/null
# Если есть — учесть в fix'е. Если нет — добавить mobile-safe positioning

# 7) Tests для Toast — могут проверять position-зависимое поведение
grep -rn "Toast\|addToast" frontend/src/**/*.test.js 2>/dev/null | head -10
# Ожидание: тесты не должны сломаться от смены позиции (CSS, не функциональность)
```

**Если grep покажет:**
- Toast файлы расположены не в `frontend/src/components/Toast*` — адаптируй пути ниже под фактическое местоположение
- z-index modal'ов варьируется (1000, 100, etc) — найди максимальный и +100 для toast
- Mobile media query отсутствует — добавь `@media (max-width: 480px)` с подкорректированным top offset (учитывая высоту хедера если есть sticky)

---

## Зависимости

Никаких. Чистый CSS + один JSX (опционально для z-index inline override).

**Ветка:** `wave-2/hotfix-07-toast-position` от `wave-2/03-criteria-admin-seed` (rebase chain).

---

## Что блокирует

- 2.05 PainEventForm — модалка с critical user feedback (red-flag alert confirmation)
- 2.07+ другие modal'ные формы пациентского UI
- В целом любые toast'ы при открытой модалке во всём приложении

---

## Параллельная работа — координация

**ТРОГАЕМ:**

| Файл | Что |
|---|---|
| `frontend/src/components/Toast.module.css` (или аналог) | Replace `bottom: X` → `top: X`; повысить z-index выше modal'ов |
| `frontend/src/components/Toast.test.js` (если есть) | Возможно тривиальное обновление если в тестах есть assertion на position |

**НЕ ТРОГАТЬ:**

- ToastContext API (toast.success/error сигнатура — не меняем)
- Toast анимация (slide-in direction может остаться bottom-up — или поменять на top-down, не критично)
- Бизнес-логика toast'ов (когда показывается, какой текст)
- Любые другие компоненты — это узкий fix

---

## Конкретная реализация

### A) CSS — Toast container переезжает на top

**Текущий (примерно):**
```css
.toastContainer {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

**Новый:**
```css
.toastContainer {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;  /* выше любых модалок */
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Mobile safe — учесть sticky header если есть */
  max-width: calc(100vw - 40px);
  pointer-events: none;  /* контейнер не мешает кликам сквозь себя */
}

.toastContainer > * {
  pointer-events: auto;  /* сами toast'ы кликабельны (для close button) */
}

@media (max-width: 480px) {
  .toastContainer {
    top: 12px;
    left: 12px;
    right: 12px;
    align-items: stretch;  /* full width на mobile */
  }
}
```

**Slide-in анимация:** если была `transform: translateY(100%) → 0` (slide up from bottom), поменять на `translateY(-100%) → 0` (slide down from top). Найти `@keyframes` в том же файле, заменить.

```css
/* было */
@keyframes toastSlideIn {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

/* стало */
@keyframes toastSlideIn {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0);     opacity: 1; }
}
```

### B) z-index hierarchy подтверждение

После fix должна быть следующая иерархия:

| Layer | z-index | Что |
|---|---|---|
| Base content | 0-99 | Обычный flow |
| Header (sticky) | 100-499 | Если есть sticky header |
| Modal backdrop | 500-999 | Затемнение под модалкой |
| Modal content | 1000-1499 | Сама модалка |
| Toast container | **9999** | Toast — поверх всего |

Если в grep verify-step нашёл modal z-index=10000+ (что нестандартно) — toast должен быть выше + проверить что modal не блокирует pointer events на toast (Toast.pointerEvents должен оставаться `auto`).

### C) JSX — никаких изменений

ToastContainer JSX не трогаем. Только CSS файл.

---

## Mock-based тесты

Минимально. Toast position — visual concern, не функциональный. Существующие тесты должны продолжать работать:

```bash
cd frontend
CI=true npm test -- Toast 2>&1 | tail -10
```

**Ожидание:** 0 failures. Если есть assertion на конкретное CSS свойство (например `expect(container).toHaveStyle({ bottom: '20px' })`) — найди и обнови на `top: '20px'`.

**Опционально добавить:** один тест что Toast рендерится с правильным container'ом (smoke):

```javascript
it('Toast container has top positioning class (Wave 2 hot-fix #7)', () => {
  render(<ToastProvider><TriggerToast /></ToastProvider>);
  fireEvent.click(screen.getByText('Show toast'));
  const container = document.querySelector('[class*="toastContainer"]');
  expect(container).toBeInTheDocument();
  // CSS property test — может не работать в jsdom если CSS Modules
  // const styles = window.getComputedStyle(container);
  // expect(styles.position).toBe('fixed');
});
```

---

## NOT TOUCH

- ToastContext.js / Toast.js JSX (только CSS)
- Бизнес-логика когда показывается toast
- Любые другие компоненты
- LOCKED-зоны (ExerciseRunner v4 etc)

---

## Smoke test (4-card format — новое правило 2026-05-18)

### Сценарий 1 — Toast виден на чистой странице (baseline)

```
Шаг 1.1 — Сделать toast на странице без модалки
├─ Где: http://localhost:3001/dashboard (после логина инструктора)
├─ Что найти: кнопка «+ Создать комплекс» в верхней части
├─ Что сделать: click → переход на CreateComplex → залить минимальные поля → save
└─ Что увидеть: toast «Комплекс создан» появляется в правом верхнем углу,
                slide-in сверху, через 3-4 сек исчезает

Шаг 1.2 — Проверить позицию на скриншоте
├─ Где: тот же экран после save
├─ Что найти: toast в верхней правой области viewport
├─ Что сделать: scroll до конца страницы (если контент длинный)
└─ Что увидеть: toast остаётся фиксирован в правом верхнем углу, не уезжает
                со скроллом
```

### Сценарий 2 — Toast виден поверх модалки (главный fix)

```
Шаг 2.1 — Открыть модалку с длинным контентом
├─ Где: Админ → Контент → таб «Фазы»
├─ Что найти: любая ACL фаза, кнопка «Редактировать»
├─ Что сделать: click → откроется PhaseForm modal с 10+ полей
└─ Что увидеть: модалка открыта, поля видны, scrollable если не помещается

Шаг 2.2 — Триггернуть toast через действие в модалке
├─ Где: открытая PhaseForm modal
├─ Что найти: любое поле (например title), кнопка «Сохранить»
├─ Что сделать: НЕ меняй ничего, нажми «Сохранить» (или меняй и сохраняй)
└─ Что увидеть: toast «Фаза обновлена» появляется ПОВЕРХ модалки в правом верхнем
                углу. Это главная проверка fix'а — до hot-fix #7 toast прятался
                за модалкой внизу.

Шаг 2.3 — Triggernuth ошибку через модалку
├─ Где: PhaseForm в режиме создания (Админ → Контент → Фазы → «+ Добавить»)
├─ Что найти: поле «Программа» — НЕ заполнять
├─ Что сделать: оставить пустым, нажать «Сохранить»
└─ Что увидеть: toast.error поверх модалки, виден полностью, не обрезан
                верхним краем viewport
```

### Сценарий 3 — Mobile проверка (320-480px ширина)

```
Шаг 3.1 — Эмулировать mobile в DevTools
├─ Где: любая страница в Chrome / Firefox DevTools
├─ Что найти: Device Toolbar (Ctrl+Shift+M / Cmd+Shift+M), iPhone SE preset
├─ Что сделать: переключить на 375px ширину
└─ Что увидеть: page рендерится в narrow viewport

Шаг 3.2 — Триггернуть toast в mobile-режиме
├─ Где: тот же режим, на странице с любым action triggering toast
├─ Что найти: любая кнопка которая показывает toast (login error, save и т.д.)
├─ Что сделать: вызвать action
└─ Что увидеть: toast растягивается на почти всю ширину (max-width: 100vw - 24px),
                не выходит за края, читается полностью. Top offset = 12px,
                под sticky header если он есть.
```

### Сценарий 4 — Regression: остальные страницы не сломались

```
Шаг 4.1 — Patient dashboard toast
├─ Где: http://localhost:3001/login (логин test patient avi707@mail.ru/Test1234) → /patient-dashboard
├─ Что найти: DiaryScreen (нижняя navigation tab)
├─ Что сделать: открыть diary, заполнить минимум, сохранить
└─ Что увидеть: toast «Запись сохранена» в правом верхнем (не за нижней
                navigation tab)

Шаг 4.2 — PainLocationsTab из 2.02
├─ Где: Админ → Контент → таб «Локации боли»
├─ Что найти: любая локация, кнопка «Редактировать»
├─ Что сделать: открыть edit modal, не меняя сохранить
└─ Что увидеть: toast «Локация обновлена» поверх модалки (та же проверка что
                в сценарии 2, но другая модалка — sanity check)

Шаг 4.3 — Множественные toast'ы
├─ Где: любая страница где можно быстро триггернуть 3+ toast'а подряд
├─ Что найти: кнопка с быстрым action (например «Сохранить» при no-op изменении)
├─ Что сделать: click 3 раза подряд (или 3 разных action'а)
└─ Что увидеть: 3 toast'а stack'ятся в правом верхнем, slide-in каждый, gap
                между ними 8px, по очереди исчезают
```

---

## Файлы — итоговый чеклист

### Изменить
- `frontend/src/components/Toast.module.css` (или фактический путь — adapt из verify-step)
  - `bottom: X` → `top: X`
  - `z-index: 1000` (или текущий) → `z-index: 9999`
  - `@keyframes toastSlideIn` — direction reverse
  - Mobile @media query
  - `pointer-events: none` / `auto` для click-through
- `frontend/src/components/Toast.test.js` (только если есть position-зависимые assertions — иначе skip)
- `CLAUDE.md` — короткая запись в «Завершённые исправления»

### НЕ ТРОГАТЬ
- ToastContext.js / Toast.js (JSX логика)
- Любые другие компоненты
- Тесты других suites

---

## Текст коммита

```
fix(ui): Wave 2 hot-fix #7 — toast position bottom → top + z-index above modals

Memory: toast_position_mobile_blind_spot.md (2026-05-08). Поднято
повторно в smoke 2.03 при тестировании PhaseForm modal с критериями.

Проблема: toast.success/error внизу страницы был невидим при открытой
модалке + scrollable content. Особенно критично для будущей 2.05
PainEventForm (red-flag alert confirmation должен быть виден пациенту
сразу).

Fix:
- ToastContainer переехал из bottom-right в top-right
- z-index повышен до 9999 (выше всех modal'ов 1000-1499)
- Slide-in анимация развёрнута: translateY(-100% → 0)
- Mobile @media (max-width: 480px): top: 12px, stretch на всю ширину
- pointer-events: none на контейнер, auto на сами toast'ы (click-through)

Pre-Block-B хот-фикс. Не требует pre-2.04 backend изменений.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**CLAUDE.md:**
- Секция «Завершённые исправления» — запись:
  > **Wave 2 hot-fix #7** — toast position bottom → top + z-index. Закрыт blind-spot из memory 2026-05-08. Pre-Block-B preparation для 2.05 PainEventForm critical feedback.

**Memory:**
- `toast_position_mobile_blind_spot.md` — пометить как RESOLVED in hot-fix #7
- `wave_2_progress.md` — добавить строку про hot-fix #7 (между Block A и Block B)

---

## Definition of Done

- [ ] Verify-step выполнен: пути Toast подтверждены, текущая позиция найдена, z-index modal'ов установлен
- [ ] CSS изменён: `bottom` → `top`, z-index 9999, mobile media query, click-through pointer-events
- [ ] Slide-in направление развёрнуто (либо явно, либо CSS реверсирован)
- [ ] Существующие Toast тесты зелёные (regression ≤ 0)
- [ ] Smoke сценарий 1 ✅ (toast на чистой странице)
- [ ] Smoke сценарий 2 ✅ (**главный** — toast виден поверх PhaseForm modal)
- [ ] Smoke сценарий 3 ✅ (mobile 375px)
- [ ] Smoke сценарий 4 ✅ (regression patient dashboard + PainLocations + multiple toasts)
- [ ] CLAUDE.md обновлён
- [ ] memory/toast_position_mobile_blind_spot.md помечен RESOLVED
- [ ] Коммит создан с указанным текстом + Co-Authored-By trailer
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR открыт от ветки `wave-2/hotfix-07-toast-position`, висит с остальными до batch merge

---

## После hot-fix #7

Block B Pain Tracking starts:
- **2.04** — Backend pain endpoints + red-flag automation + ops-alert (TZ v2 на руках)
- **2.05** — Frontend DiaryScreen + Pain Event SOS (TZ напишу после ⏸ 2.04 и UX feedback по PainEventForm requirements)

При 2.05 PainEventForm — toast «Запись сохранена. Куратор получит уведомление о красном флаге.» теперь будет виден пациенту сразу, поверх модалки. **Это критично** — иначе пациент с серьёзным симптомом может уйти, не зная что инцидент уже эскалирован.
