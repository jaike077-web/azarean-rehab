# TZ Волна 0 · Коммит 04 — разблокировать повторный заход в комплекс

**Дата:** 2026-05-08
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #8 (минимальный фикс)
**Цель:** После первой завершённой сессии за день HomeScreen больше не блокирует повторный заход в комплекс. Появляется вторичная кнопка «Начать ещё раз ↻» рядом с подтверждением «Тренировка завершена».
**Объём:** 2-3 часа
**Риск:** низкий — изолированная UI-правка одного компонента, без backend изменений.

---

## Что блокирует

`HomeScreen.js` после первой завершённой сессии переключает hero-CTA на состояние «Готово · Комплекс завершён» по флагу `dashboardData.todayDone = true`. Повторный заход в комплекс через главный CTA **физически невозможен** до следующего дня.

Это блокирует реальные клинические use-cases:
- Раннее ACL: quad-set 5×/день
- Плечо: pendulum 3×/день
- Любая программа с frequency_per_day > 1

Полная поддержка `frequency_per_day` с counter «1/5» — это **Волна 3**. В Волне 0 — минимальный фикс: **разблокировать кнопку**, не вводя counter.

После этого коммита:
- Жмёт «Начать тренировку» → проходит → завершает
- На HomeScreen появляется блок «Тренировка завершена ✓» + вторичная кнопка «Начать ещё раз ↻»
- Тап на вторичную кнопку → снова открывает комплекс
- В Волне 3 это превратится в полноценный counter «2/5»

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js`
- `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js`
- `frontend/src/pages/PatientDashboard/PatientDashboard.css` или `HomeScreen.module.css` — добавление стилей для вторичной кнопки

**НЕ ТРОГАТЬ:**
- Backend — без изменений
- ExerciseRunner — это коммит 05
- DiaryScreen, ContactScreen — другие коммиты
- Логика `dashboardData.todayDone` на backend — оставляем как есть, только меняем UI поведение

---

## Backend — без изменений

В этом коммите backend **не трогается**. `dashboardData.todayDone` продолжает приходить как `boolean` (true если есть хотя бы одна completed сессия за сегодня).

В Волне 3 этот контракт изменится на `{ count: 2, target: 5 }`, но в Волне 0 — оставляем boolean.

---

## Шаг 1 — обновить hero-логику в HomeScreen.js

**Файл:** `frontend/src/pages/PatientDashboard/components/HomeScreen.js`
**Точка вставки:** найти блок рендера hero CTA (grep по `todayDone` или по тексту «Готово» / «Комплекс завершён»).

Старый код (примерно):

```jsx
<div className="pd-hero">
  <div className="pd-hero-meta">Сегодня · {programLabel} · Фаза {phase}</div>
  {todayDone ? (
    <>
      <div className="pd-hero-title">Тренировка завершена</div>
      <div className="pd-hero-sub">Отдохни — увидимся завтра</div>
    </>
  ) : (
    <>
      <div className="pd-hero-title">{complex.title}</div>
      <button className="pd-btn pd-btn-primary pd-hero-cta" onClick={onStart}>
        Начать тренировку
      </button>
    </>
  )}
</div>
```

Новый код:

```jsx
<div className="pd-hero">
  <div className="pd-hero-meta">
    Сегодня
    {program?.program_label && <> · {program.program_label}</>}
    {program?.current_phase && <> · Фаза {program.current_phase}</>}
  </div>

  {todayDone ? (
    <>
      <div className="pd-hero-title">
        <Check size={20} className="pd-hero-check" />
        Тренировка завершена
      </div>
      <div className="pd-hero-sub">{complex.title}</div>
      <div className="pd-hero-actions">
        <button
          className="pd-btn pd-btn-secondary pd-hero-cta-secondary"
          onClick={onStart}
        >
          <RotateCcw size={16} />
          Начать ещё раз
        </button>
      </div>
    </>
  ) : (
    <>
      <div className="pd-hero-title">{complex.title}</div>
      <button className="pd-btn pd-btn-primary pd-hero-cta" onClick={onStart}>
        Начать тренировку
      </button>
    </>
  )}
</div>
```

**Импорт иконок:**

```jsx
import { Check, RotateCcw } from 'lucide-react';
```

**Важно:**
- Иконка строго lucide-react, не emoji `↻` или `✓`
- Зелёный или нейтральный цвет для `pd-hero-check` (через CSS переменные)
- `pd-btn-secondary` — существующий класс secondary стиля. Если его нет в проекте — взять стиль кнопки попроще (outline, не filled), чтобы визуально отличалась от primary CTA
- Подсказка `complex.title` после «Тренировка завершена» — чтобы пациент понимал какой комплекс был выполнен (полезно если их несколько в Волне 3)

---

## Шаг 2 — стили для secondary CTA

**Файл:** `frontend/src/pages/PatientDashboard/PatientDashboard.css` (если глобальный) или `HomeScreen.module.css` (если уже на CSS Modules)

Добавить стили (если ещё нет существующих `.pd-btn-secondary` и `.pd-hero-cta-secondary`):

```css
/* Вторичная кнопка повторного захода */
.pd-hero-cta-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 1.5px solid var(--pd-primary);
  color: var(--pd-primary);
  border-radius: var(--pd-radius-md, 12px);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.pd-hero-cta-secondary:hover {
  background: var(--pd-primary);
  color: var(--pd-on-primary, #fff);
}

.pd-hero-cta-secondary:active {
  transform: translateY(1px);
}

.pd-hero-actions {
  margin-top: 12px;
}

.pd-hero-check {
  vertical-align: middle;
  margin-right: 6px;
  color: var(--pd-success, #10b981);
}
```

**Проверка тёмной темы.** В `[data-theme="dark"]` блок (если он там есть в этом же файле или в tokens.css) — убедиться что secondary кнопка читается на тёмном фоне. Тестировать в обоих темах.

---

## Шаг 3 — тест нового поведения

**Файл:** `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js`

Добавить:

```javascript
describe('HomeScreen — повторный заход после завершения', () => {
  const baseDashboard = {
    program: { id: 1, program_label: 'ПКС', current_phase: 3 },
    phase: { id: 3, title: 'Сила', subtitle: '...' },
    complex: { id: 1, title: 'Колено фаза 3' },
    streak: { current_streak: 5 }
  };

  test('todayDone=false — основной CTA "Начать тренировку"', () => {
    render(<HomeScreen dashboardData={{ ...baseDashboard, todayDone: false }} onStartComplex={jest.fn()} />);
    expect(screen.getByRole('button', { name: /начать тренировку/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ещё раз/i })).not.toBeInTheDocument();
  });

  test('todayDone=true — показывает "Тренировка завершена" + вторичную кнопку', () => {
    render(<HomeScreen dashboardData={{ ...baseDashboard, todayDone: true }} onStartComplex={jest.fn()} />);
    expect(screen.getByText(/тренировка завершена/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /начать ещё раз/i })).toBeInTheDocument();
    // Главный CTA "Начать тренировку" больше не показывается (он стал secondary с другим текстом)
    expect(screen.queryByRole('button', { name: /^начать тренировку$/i })).not.toBeInTheDocument();
  });

  test('тап по вторичной кнопке вызывает onStartComplex', () => {
    const onStart = jest.fn();
    render(<HomeScreen dashboardData={{ ...baseDashboard, todayDone: true }} onStartComplex={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: /начать ещё раз/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('todayDone=true — название комплекса показано как подзаголовок', () => {
    render(<HomeScreen dashboardData={{ ...baseDashboard, todayDone: true }} onStartComplex={jest.fn()} />);
    expect(screen.getByText(/колено фаза 3/i)).toBeInTheDocument();
  });
});
```

### Команды запуска

```bash
cd frontend && npm test -- --testPathPattern=HomeScreen --watchAll=false
```

---

## NOT TOUCH

В этом коммите **НЕ трогать**:

- Backend (`/api/rehab/my/dashboard` контракт остаётся прежним)
- ExerciseRunner — это коммит 05
- Логику `todayDone` на backend (она основана на existence хотя бы одной completed сессии в `progress_logs` за CURRENT_DATE)
- Counter `{ count, target }` — это Волна 3
- Поле `complexes.frequency_per_day` — это Волна 3
- Scheduler — никаких изменений в крон-задачах

---

## ⛔ STOP — smoke в реальном браузере

### Сценарий 1: «Свежий день, ещё не тренировался»

1. В БД: `DELETE FROM progress_logs WHERE created_at >= CURRENT_DATE AND complex_id IN (SELECT id FROM complexes WHERE patient_id = 14);`
2. Залогиниться пациентом id=14
3. На HomeScreen — hero показывает название комплекса + основной CTA «Начать тренировку»
4. **НЕ должно быть** «Тренировка завершена»

### Сценарий 2: «После тренировки — кнопка повторного захода»

1. Из сценария 1 — нажать «Начать тренировку», пройти комплекс до конца
2. Вернуться на HomeScreen (через TabBar или autoredirect)
3. Hero показывает:
   - Иконка ✓ + текст «Тренировка завершена»
   - Подзаголовок: название комплекса
   - **Вторичная кнопка** «Начать ещё раз ↻»
4. Эта кнопка визуально отличается от primary CTA (outline, тоньше, без заливки)

### Сценарий 3: «Повторный заход работает»

1. Из сценария 2 — нажать «Начать ещё раз ↻»
2. Открывается ExerciseRunner с тем же комплексом
3. Можно пройти упражнения снова
4. После завершения — снова возвращается в hero «Тренировка завершена» с кнопкой повтора (можно сделать 3-4-5 заходов подряд для теста)

### Сценарий 4: «Перезагрузка страницы сохраняет состояние»

1. Из сценария 2 — F5 на HomeScreen
2. Hero опять «Тренировка завершена» с кнопкой повтора (потому что на backend `todayDone = true`)
3. Не должно мигать или сбрасываться

### Сценарий 5: «Тёмная тема»

1. Переключить тему через ThemeToggle на ProfileScreen
2. Вернуться на HomeScreen в состоянии todayDone=true
3. Вторичная кнопка читаема, не сливается с фоном
4. Иконка ✓ зелёная или контрастная
5. Hover state работает (для desktop) или active state (для touch)

⛔ **Если хотя бы один сценарий проваливается — НЕ коммитить.**

---

## Файлы

**Создать:**
- (ничего нового)

**Изменить:**
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js`
- `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js`
- `frontend/src/pages/PatientDashboard/PatientDashboard.css` (или `HomeScreen.module.css`) — стили secondary CTA

**НЕ ТРОГАТЬ:**
- Backend целиком
- Любые другие frontend компоненты

---

## Коммит

**Текст:**

```
feat(home): разблокировать повторный заход в комплекс

#8 из Patient UX Roadmap v2 (Волна 0, минимальный фикс):
- После завершения сессии HomeScreen больше не блокирует повтор
- Hero показывает «Тренировка завершена ✓» + вторичную кнопку
  «Начать ещё раз ↻»
- Полная поддержка frequency_per_day с counter «N/M» — Волна 3

Изменения:
- HomeScreen.js: рендер hero для todayDone=true теперь включает
  secondary CTA для повторного запуска онStartComplex
- Иконки lucide-react Check + RotateCcw
- Стили pd-hero-cta-secondary (outline, отличается от primary)
- Проверена работа в обеих темах

Тесты: 4 frontend.
Roadmap: PATIENT_UX_ROADMAP_2026-05-08_v2.md #8 (минимальный фикс)
TODO: Wave 3 заменит на counter «N/M» с frequency_per_day
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Раздел «Открытые баги»: вычеркнуть «HomeScreen блокирует повторный заход»
- Раздел «Известные ограничения»: добавить «Counter «N/M» для frequency_per_day — Волна 3, сейчас просто разблок»

**`MEMORY.md` или `memory/wave_0_home_replay.md`:**
- «`todayDone` на backend остаётся boolean до Волны 3, не менять контракт сейчас»

**`wave_0_progress.md`:** строка `04` → `✅ done`, SHA, дата.

---

## Definition of Done

- [ ] Frontend тесты зелёные (4 новых)
- [ ] Smoke 1-5 пройдены в реальном браузере (включая dark theme)
- [ ] Кнопка повтора визуально secondary, не primary
- [ ] Иконки lucide-react, не emoji
- [ ] В консоли нет ошибок
- [ ] Документация обновлена
- [ ] **Push после явного «ок»**
