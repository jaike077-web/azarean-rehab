# TZ Волна 0 · Коммит 05 — расширить accordion в ExerciseRunner

**Дата:** 2026-05-08
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #4
**Цель:** Расширить раскрывающийся блок описания упражнения в ExerciseRunner с 3 секций (description / instructions / contraindications) до 4 (description / how_to+cues / tips / merged safety) + badge «✓ Безопасно при воспалении» на ExerciseCard. Hint'ы рядом с полями в ExerciseModal для инструктора.
**Объём:** 4-6 часов
**Риск:** **средний** — затрагивает LOCKED-зону (`ExerciseRunner.js`). Vadim **разрешил** трогать. Smoke в реальном браузере **критически обязателен**.

---

## Что блокирует

В таблице `exercises` хранится **7 текстовых полей** + 1 boolean флаг, заполняемые инструктором:

| Поле | Сейчас в UI | После коммита |
|---|---|---|
| description | ✅ показывается | ✅ |
| instructions | ✅ показывается | ✅ (как часть «Как делать») |
| cues | ❌ DEAD | ✅ (внутри секции «Как делать», подзаголовок «Подсказки во время выполнения») |
| tips | ❌ DEAD | ✅ (отдельная секция «Полезно знать») |
| contraindications | ✅ показывается | ✅ (часть merged «Безопасности») |
| absolute_contraindications | ❌ DEAD | ✅ (часть merged «Безопасности») |
| red_flags | ❌ DEAD | ✅ (часть merged «Безопасности», с особым акцентом) |
| safe_with_inflammation | ❌ DEAD | ✅ (badge на ExerciseCard для инструктора + бейдж в accordion для пациента) |

Инструктор сейчас может тратить время на тщательное заполнение `red_flags` («острая боль в задней части коленного сгиба, хруст с резкой болью») — это уходит в `/dev/null`.

После коммита: вся работа инструктора видна пациенту, безопасность не теряется.

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `frontend/src/pages/PatientDashboard/components/ExerciseRunner.js` — **LOCKED** часть, разрешено
- `frontend/src/pages/Exercises/components/ExerciseModal.js` — добавление hint'ов
- `frontend/src/pages/Exercises/components/ExerciseCard.js` — badge safe_with_inflammation
- `frontend/src/pages/PatientDashboard/components/ExerciseRunner.test.js` — обновление тестов
- CSS файлы для новых стилей safety-секции

**НЕ ТРОГАТЬ:**
- Backend — без изменений (все поля уже возвращаются)
- Структура БД — без миграций
- Timer / RPE / pain slider в ExerciseRunner — **не трогать ни одной линии**
- Анимации `pdIn` / `pdBk` — не трогать
- Layout `.pg`, `.crd`, `.sec`, `.dot`, `.btn`, `.tmr`, `.fb-toggle`, `.rpe-b`, `.pv`, `.plbl`, `.cmt` — НЕ ТРОГАТЬ ни классы, ни их CSS правила
- iOS палитру `--az-*` в scope `.pd-runner` — не менять

---

## Backend — без изменений

Endpoint `/api/rehab/my/exercises` уже возвращает все 8 полей (`description`, `instructions`, `cues`, `tips`, `contraindications`, `absolute_contraindications`, `red_flags`, `safe_with_inflammation`). Проверить grep'ом по routes/rehab.js что SELECT не урезает поля.

Если SELECT в endpoint выглядит как `SELECT id, title, video_url FROM exercises ...` — **расширить** до полного списка. Это будет минимальная backend-правка, в случае необходимости добавить отдельным шагом 0.

```sql
-- Шаблон SELECT для проверки/расширения
SELECT
  e.id, e.title, e.short_title, e.description, e.video_url, e.thumbnail_url,
  e.body_region, e.difficulty_level, e.exercise_type, e.equipment, e.position,
  e.duration_seconds,
  e.instructions, e.cues, e.tips,
  e.contraindications, e.absolute_contraindications, e.red_flags,
  e.safe_with_inflammation
FROM exercises e
WHERE ...
```

---

## Шаг 0 (опциональный) — проверить backend SELECT

**Файл:** `backend/routes/rehab.js`
**Точка вставки:** найти handler `GET /my/exercises` (или эквивалент которым ExerciseRunner получает данные).

Проверить SELECT в этом handler. Если возвращаются не все поля — расширить SELECT. Это очень мелкая правка, без отдельного теста (тесты ExerciseRunner покроют косвенно). Можно сделать частью этого же коммита — не выносить отдельно.

---

## Шаг 1 — изучить текущий accordion в ExerciseRunner

**Файл:** `frontend/src/pages/PatientDashboard/components/ExerciseRunner.js`

**Перед изменениями:** прочитать весь файл целиком (316 строк). Зафиксировать в памяти:
- Где строки accordion (примерно 209-222 по report)
- Какие классы используются (`.crd`, `.sec`, `.dot` — в `.pd-runner` scope)
- Как переключается expand/collapse (вероятно `useState` + `aria-expanded`)
- Где SVG chevron

**Сделать backup перед началом:**

```bash
cp frontend/src/pages/PatientDashboard/components/ExerciseRunner.js \
   frontend/src/pages/PatientDashboard/components/ExerciseRunner.js.backup-wave0-05
```

После успешного завершения коммита — удалить backup. Это страховка на случай если что-то сломается.

---

## Шаг 2 — расширить accordion на 4 секции

**Файл:** `frontend/src/pages/PatientDashboard/components/ExerciseRunner.js`
**Точка вставки:** найти существующий accordion-блок с кнопкой «▶ Описание и инструкции».

Старая разметка (примерно):

```jsx
<div className="crd">
  <button className="fb-toggle" onClick={() => setOpen(!open)}>
    <ChevronRight className={open ? 'rotated' : ''} />
    Описание и инструкции
  </button>
  {open && (
    <div className="fb-content">
      {exercise.description && (
        <section className="sec">
          <h4>Описание</h4>
          <p>{exercise.description}</p>
        </section>
      )}
      {exercise.instructions && (
        <section className="sec">
          <h4>Инструкции</h4>
          <p>{exercise.instructions}</p>
        </section>
      )}
      {exercise.contraindications && (
        <section className="sec sec-danger">
          <h4>Противопоказания</h4>
          <p>{exercise.contraindications}</p>
        </section>
      )}
    </div>
  )}
</div>
```

Новая разметка:

```jsx
<div className="crd">
  <button className="fb-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
    <ChevronRight className={open ? 'rotated' : ''} size={16} />
    {open ? 'Свернуть описание' : 'Описание и инструкции'}
  </button>

  {open && (
    <div className="fb-content">

      {/* 1. Описание */}
      {exercise.description && (
        <section className="sec">
          <h4 className="sec-title">Описание</h4>
          <p className="sec-text">{exercise.description}</p>
        </section>
      )}

      {/* 2. Как делать (instructions + cues внутри как подзаголовок) */}
      {(exercise.instructions || exercise.cues) && (
        <section className="sec">
          <h4 className="sec-title">Как делать</h4>
          {exercise.instructions && (
            <p className="sec-text">{exercise.instructions}</p>
          )}
          {exercise.cues && (
            <div className="sec-cues">
              <h5 className="sec-subtitle">Подсказки во время выполнения</h5>
              <p className="sec-text">{exercise.cues}</p>
            </div>
          )}
        </section>
      )}

      {/* 3. Полезно знать (tips) */}
      {exercise.tips && (
        <section className="sec">
          <h4 className="sec-title">Полезно знать</h4>
          <p className="sec-text">{exercise.tips}</p>
        </section>
      )}

      {/* 4. Безопасность (merged contraindications + absolute + red_flags) */}
      {(exercise.contraindications || exercise.absolute_contraindications || exercise.red_flags) && (
        <section className="sec sec-danger">
          <h4 className="sec-title sec-title-danger">
            <AlertTriangle size={16} />
            Безопасность
          </h4>

          {exercise.absolute_contraindications && (
            <div className="sec-block sec-block-strong">
              <h5 className="sec-subtitle">Нельзя выполнять при:</h5>
              <p className="sec-text">{exercise.absolute_contraindications}</p>
            </div>
          )}

          {exercise.contraindications && (
            <div className="sec-block">
              <h5 className="sec-subtitle">С осторожностью при:</h5>
              <p className="sec-text">{exercise.contraindications}</p>
            </div>
          )}

          {exercise.red_flags && (
            <div className="sec-block sec-block-stop">
              <h5 className="sec-subtitle">Прекрати и обратись к врачу при:</h5>
              <p className="sec-text">{exercise.red_flags}</p>
            </div>
          )}
        </section>
      )}

      {/* 5. Безопасно при воспалении (badge) */}
      {exercise.safe_with_inflammation && (
        <div className="sec-badge sec-badge-safe">
          <Check size={14} />
          <span>Безопасно при активном воспалении</span>
        </div>
      )}

    </div>
  )}
</div>
```

**Импорты:**

```jsx
import { ChevronRight, AlertTriangle, Check } from 'lucide-react';
```

**Принципиально:**
- **Не менять** структуру `<div className="crd">` обёртки — это часть LOCKED CSS системы
- **Не менять** классы `crd`, `sec`, `fb-toggle`, `fb-content` — добавляем только **новые** классы (`sec-title`, `sec-text`, `sec-subtitle`, `sec-cues`, `sec-block`, `sec-block-strong`, `sec-block-stop`, `sec-badge`, `sec-badge-safe`, `sec-title-danger`)
- Иконки строго lucide-react, размер 14-16px
- Никаких inline-стилей — всё через CSS-классы

---

## Шаг 3 — добавить CSS для новых классов

**Файл:** `frontend/src/pages/PatientDashboard/PatientDashboard.css` (или `ExerciseRunner.module.css` если уже на CSS Modules)

Добавить (НЕ менять существующие правила `.crd`, `.sec`, `.fb-toggle`, `.fb-content`):

```css
/* Wave 0 commit 05 — расширенный accordion в ExerciseRunner.
   Не трогает существующие классы LOCKED-зоны. */

.pd-runner .sec-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px 0;
  color: var(--az-label, #1c1c1e);
}

.pd-runner .sec-title-danger {
  color: var(--az-danger, #ff3b30);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pd-runner .sec-subtitle {
  font-size: 13px;
  font-weight: 500;
  margin: 8px 0 4px 0;
  color: var(--az-label-2, #6e6e73);
}

.pd-runner .sec-text {
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  color: var(--az-label, #1c1c1e);
  white-space: pre-wrap;
}

.pd-runner .sec-cues {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--az-separator, #c6c6c8);
}

.pd-runner .sec-block {
  margin-bottom: 10px;
}

.pd-runner .sec-block:last-child {
  margin-bottom: 0;
}

.pd-runner .sec-block-strong .sec-text {
  font-weight: 500;
}

.pd-runner .sec-block-stop {
  background: var(--az-danger-bg, rgba(255, 59, 48, 0.1));
  border-left: 3px solid var(--az-danger, #ff3b30);
  padding: 8px 10px;
  border-radius: 6px;
}

.pd-runner .sec-block-stop .sec-subtitle {
  color: var(--az-danger, #ff3b30);
}

.pd-runner .sec-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  margin-top: 12px;
}

.pd-runner .sec-badge-safe {
  background: var(--az-success-bg, rgba(52, 199, 89, 0.12));
  color: var(--az-success, #34c759);
}
```

**Тёмная тема** (если нужна — проверить что переменные `--az-*` уже определены для dark в существующих файлах). Если нет — добавить fallback'ы выше уже учли.

---

## Шаг 4 — добавить hint'ы в ExerciseModal для инструктора

**Файл:** `frontend/src/pages/Exercises/components/ExerciseModal.js` (примерный путь, найти grep'ом)

Этот компонент — форма редактирования упражнения для инструктора. Найти input'ы для полей `description`, `instructions`, `cues`, `tips`, `contraindications`, `absolute_contraindications`, `red_flags`, `safe_with_inflammation`.

Добавить hint-метку рядом с лейблом каждого поля. Формат:

```jsx
<div className="form-field">
  <label htmlFor="cues">
    Подсказки (cues)
    <span className="form-hint" title="Показывается пациенту в разделе «Как делать → Подсказки во время выполнения»">
      <Info size={12} />
      Показывается пациенту
    </span>
  </label>
  <textarea id="cues" value={cues} onChange={...} />
</div>
```

Маппинг hint'ов:

| Поле | Hint |
|---|---|
| description | «Показывается пациенту в первой секции accordion» |
| instructions | «Показывается пациенту в секции "Как делать"» |
| cues | «Показывается пациенту как "Подсказки во время выполнения"» |
| tips | «Показывается пациенту в секции "Полезно знать"» |
| contraindications | «Показывается в секции "Безопасность" → "С осторожностью при:"» |
| absolute_contraindications | «Показывается в секции "Безопасность" → "Нельзя выполнять при:"» |
| red_flags | «Показывается в секции "Безопасность" → "Прекрати и обратись к врачу при:"» |
| safe_with_inflammation | «Показывается как зелёный бейдж "Безопасно при воспалении"» |

Стиль hint:

```css
.form-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  font-weight: normal;
}

.form-hint svg {
  opacity: 0.7;
}
```

---

## Шаг 5 — badge safe_with_inflammation в ExerciseCard для инструктора

**Файл:** `frontend/src/pages/Exercises/components/ExerciseCard.js` (примерный путь)

Этот компонент — карточка упражнения в библиотеке для инструктора. Добавить бейдж рядом с другими бейджами (body_region, difficulty):

```jsx
{exercise.safe_with_inflammation && (
  <span className="exercise-card-badge exercise-card-badge-safe">
    <Check size={11} />
    Можно при воспалении
  </span>
)}
```

CSS — переиспользовать существующие стили бейджей в этом файле или добавить:

```css
.exercise-card-badge-safe {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

[data-theme='dark'] .exercise-card-badge-safe {
  background: rgba(52, 199, 89, 0.18);
  color: #4cd964;
}
```

---

## NOT TOUCH

В этом коммите **НЕ трогать** ни одной строки:

- Timer (`.tmr` блок), его state, его CSS
- RPE zones (`.rpe-b` блок и логика 1-10)
- Pain gradient slider (`.plbl`, `.pv`)
- Stopwatch, rest timer
- Animations `pdIn`, `pdBk`
- Layout `.pg` wrapper (max-width: 720px)
- Media queries (480/769/1801)
- Существующие классы `.crd`, `.sec`, `.dot`, `.btn`, `.fb-toggle`, `.fb-content` — добавляем только новые рядом
- Flow «HomeScreen → ExerciseRunner напрямую» — не вмешиваться
- Slide-in анимации
- iOS палитру `--az-*` (можно использовать переменные, но не определять новые в `.pd-runner` scope)

**Отдельная проверка перед коммитом:** прогнать `git diff frontend/src/pages/PatientDashboard/components/ExerciseRunner.js` и убедиться что:
- Все мои изменения **только внутри блока accordion** (между `<button className="fb-toggle">` и закрывающим `</div>` его контента)
- Никаких изменений в обработчиках timer / RPE / pain
- Никаких изменений в hooks (`useState`, `useEffect`) кроме accordion-state если он уже был

---

## Тесты

### Backend — без новых тестов

В этом коммите backend не меняется (если только не пришлось расширять SELECT в шаге 0 — тогда покрывается smoke).

### Frontend

**Файл:** `frontend/src/pages/PatientDashboard/components/ExerciseRunner.test.js`

```javascript
describe('ExerciseRunner — расширенный accordion', () => {
  const baseExercise = {
    id: 1,
    title: 'Приседание у стены',
    description: 'Базовое упражнение для четырёхглавой мышцы',
    instructions: '1. Встань спиной к стене.\n2. Опустись в полуприсед.\n3. Удерживай 30 секунд.',
    cues: 'Колено идёт по линии второго пальца стопы. Спина прямая.',
    tips: 'Если трудно — держись за стену руками.',
    contraindications: 'Острая боль в колене.',
    absolute_contraindications: 'Первые 2 недели после ACL операции.',
    red_flags: 'Резкая боль с хрустом, отёк увеличивается во время упражнения.',
    safe_with_inflammation: false,
    video_url: 'https://kinescope.io/embed/abc',
    duration_seconds: 30
  };

  function renderRunner(exerciseOverrides = {}, otherProps = {}) {
    return render(
      <ExerciseRunner
        exercise={{ ...baseExercise, ...exerciseOverrides }}
        complexExercise={{ sets: 3, reps: 10, rest_seconds: 30 }}
        onFinish={jest.fn()}
        onBack={jest.fn()}
        {...otherProps}
      />
    );
  }

  test('accordion свернут по умолчанию', () => {
    renderRunner();
    expect(screen.queryByText(/как делать/i)).not.toBeInTheDocument();
  });

  test('после клика на toggle — все 4 секции видны', () => {
    renderRunner();
    fireEvent.click(screen.getByRole('button', { name: /описание и инструкции/i }));
    expect(screen.getByText(/^Описание$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Как делать$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Полезно знать$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Безопасность$/i)).toBeInTheDocument();
  });

  test('секция "Как делать" содержит instructions и cues', () => {
    renderRunner();
    fireEvent.click(screen.getByRole('button', { name: /описание/i }));
    expect(screen.getByText(/спиной к стене/)).toBeInTheDocument();
    expect(screen.getByText(/Подсказки во время выполнения/i)).toBeInTheDocument();
    expect(screen.getByText(/Колено идёт по линии/)).toBeInTheDocument();
  });

  test('секция "Безопасность" merged contraindications + absolute + red_flags', () => {
    renderRunner();
    fireEvent.click(screen.getByRole('button', { name: /описание/i }));
    expect(screen.getByText(/Нельзя выполнять при:/i)).toBeInTheDocument();
    expect(screen.getByText(/первые 2 недели/i)).toBeInTheDocument();
    expect(screen.getByText(/С осторожностью при:/i)).toBeInTheDocument();
    expect(screen.getByText(/Острая боль в колене/i)).toBeInTheDocument();
    expect(screen.getByText(/Прекрати и обратись к врачу при:/i)).toBeInTheDocument();
    expect(screen.getByText(/Резкая боль с хрустом/i)).toBeInTheDocument();
  });

  test('badge "Безопасно при воспалении" когда safe_with_inflammation=true', () => {
    renderRunner({ safe_with_inflammation: true });
    fireEvent.click(screen.getByRole('button', { name: /описание/i }));
    expect(screen.getByText(/безопасно при активном воспалении/i)).toBeInTheDocument();
  });

  test('badge не показывается когда safe_with_inflammation=false', () => {
    renderRunner({ safe_with_inflammation: false });
    fireEvent.click(screen.getByRole('button', { name: /описание/i }));
    expect(screen.queryByText(/безопасно при активном воспалении/i)).not.toBeInTheDocument();
  });

  test('секции скрываются если соответствующие поля пустые', () => {
    renderRunner({
      description: '',
      cues: '',
      tips: '',
      contraindications: null,
      absolute_contraindications: null,
      red_flags: null
    });
    fireEvent.click(screen.getByRole('button', { name: /описание/i }));
    expect(screen.queryByText(/^Описание$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Полезно знать$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Безопасность$/)).not.toBeInTheDocument();
    // Только "Как делать" должна остаться (instructions есть в base)
    expect(screen.getByText(/^Как делать$/)).toBeInTheDocument();
  });

  test('секция "Как делать" не показывается если ни instructions ни cues нет', () => {
    renderRunner({ instructions: '', cues: '' });
    fireEvent.click(screen.getByRole('button', { name: /описание/i }));
    expect(screen.queryByText(/^Как делать$/)).not.toBeInTheDocument();
  });
});
```

**Регрессионный тест на не-сломанность LOCKED-зоны:**

```javascript
describe('ExerciseRunner — НЕ ломает существующие фичи', () => {
  test('таймер запускается при клике Play', () => { /* ... */ });
  test('RPE кнопки 1-10 кликаются', () => { /* ... */ });
  test('pain slider меняет значение', () => { /* ... */ });
  test('кнопка «Выполнено» вызывает onFinish с правильными параметрами', () => { /* ... */ });
  test('кнопка «Пропустить» отмечает completed=false', () => { /* ... */ });
});
```

Эти регрессионные тесты могут быть уже существующими в `ExerciseRunner.test.js` — НЕ ТРОГАТЬ их, только запустить и убедиться что зелёные.

### Команды запуска

```bash
cd frontend && npm test -- --testPathPattern=ExerciseRunner --watchAll=false
```

---

## ⛔ STOP — smoke в реальном браузере (КРИТИЧНО для LOCKED)

После CSS Modules инцидента `c8834b5` правило `feedback_smoke_real_browser.md` обязательно. **Особенно для этого коммита.**

### Сценарий 1: «Полное упражнение в светлой теме»

1. Залогиниться пациентом id=14
2. Открыть HomeScreen → «Начать тренировку»
3. ExerciseRunner с упражнением №1
4. **Проверить что не сломано (regression):**
   - Таймер кликается, считает
   - RPE кнопки 1-10 переключаются
   - Pain slider двигается, цвет меняется
   - Кнопка «Пауза» работает
   - Кнопка «Выполнено» переходит к следующему упражнению
   - Кнопка «Пропустить» работает
   - Rest timer появляется между упражнениями
   - Slide-in анимация при переходе между упражнениями плавная
5. **Проверить новый accordion:**
   - Кнопка «Описание и инструкции» кликается
   - Раскрывается 4 секции (если все поля заполнены)
   - Chevron поворачивается при expand/collapse
   - Текст читаемый, отступы нормальные

### Сценарий 2: «Упражнение с red_flags»

1. В библиотеке через инструкторскую сторону у одного из упражнений в комплексе пациента id=14 заполнить:
   - `cues = "Колено по линии второго пальца"`
   - `tips = "Можно держаться за стену"`
   - `absolute_contraindications = "Первые 2 недели после операции"`
   - `red_flags = "Резкая боль с хрустом — стоп"`
   - `safe_with_inflammation = true`
2. У пациента — открыть это упражнение в Runner
3. Раскрыть accordion
4. **Проверить:**
   - Все 4 секции видны
   - В «Как делать» есть подзаголовок «Подсказки во время выполнения» с текстом cues
   - В «Безопасность» три блока: «Нельзя выполнять при», «С осторожностью при», «Прекрати и обратись к врачу при»
   - Блок «Прекрати и обратись» визуально выделен (background, border)
   - Бейдж «✓ Безопасно при активном воспалении» в зелёном цвете

### Сценарий 3: «Упражнение с минимальными данными»

1. Найти/создать упражнение с заполненным только `instructions` (остальное null/empty)
2. Открыть в Runner, раскрыть accordion
3. **Проверить:**
   - Видна только одна секция «Как делать»
   - Нет пустых заголовков «Описание», «Полезно знать», «Безопасность»
   - Нет ни одного бейджа

### Сценарий 4: «Тёмная тема»

1. Переключить тему на dark
2. Открыть Runner с заполненным упражнением
3. Раскрыть accordion
4. **Проверить:**
   - Текст читаемый на тёмном фоне
   - Блок «Прекрати и обратись» (red_flags) — фон с красным оттенком, не сливается
   - Бейдж «Безопасно при воспалении» — зелёный, читается
   - Иконки lucide-react (AlertTriangle, Check) — правильного цвета

### Сценарий 5: «iOS Safari (если возможно)»

1. Открыть на iPhone (если есть доступ к dev окружению с HTTPS, иначе пропустить)
2. Открыть Runner, раскрыть accordion
3. **Проверить:**
   - Шрифты не сломаны
   - Иконки рендерятся
   - Touch на toggle работает
   - Скролл внутри accordion (если контент длинный) не блокирует scroll Runner'а

### Сценарий 6: «Регрессия — старые упражнения с пустыми новыми полями»

1. Залогиниться, открыть упражнение которое в проде уже было — у него description и contraindications заполнены, остальные — null (т.к. инструктор раньше не знал о cues/tips/red_flags)
2. Раскрыть accordion
3. **Проверить:**
   - Видны секции «Описание», «Безопасность» (с одним блоком «С осторожностью»)
   - Нет пустых секций
   - **Visual regression** — макет совпадает с тем что было до коммита (но с другими отступами заголовков)

⛔ **Smoke сценарии 1-4 (минимум) — обязательны. Сценарий 5 если есть iPhone, 6 — обязательно для регрессии. Если хотя бы один проваливается — НЕ коммитить.**

---

## Файлы

**Создать:**
- (ничего нового)

**Изменить:**
- `frontend/src/pages/PatientDashboard/components/ExerciseRunner.js` — **LOCKED-зона**, расширение accordion. Backup перед началом.
- `frontend/src/pages/PatientDashboard/PatientDashboard.css` (или соответствующий module.css) — новые классы для accordion-секций
- `frontend/src/pages/Exercises/components/ExerciseModal.js` — hint-метки рядом с полями
- `frontend/src/pages/Exercises/components/ExerciseCard.js` — badge safe_with_inflammation
- `frontend/src/pages/PatientDashboard/components/ExerciseRunner.test.js` — новые тесты + проверка регрессии
- (опционально) `backend/routes/rehab.js` — расширить SELECT в `/my/exercises` если нужно

**НЕ ТРОГАТЬ:**
- Структура БД, миграции
- Timer / RPE / pain slider в ExerciseRunner
- Анимации `pdIn` / `pdBk`
- Существующие CSS классы `.crd`, `.sec`, `.fb-toggle`, `.fb-content`, `.tmr`, `.rpe-b`, `.pv`
- iOS палитра `--az-*` определения

---

## Коммит

**Текст:**

```
feat(runner): расширить accordion упражнения с 3 до 4 секций

#4 из Patient UX Roadmap v2 (Волна 0):
- Accordion в ExerciseRunner теперь показывает все поля упражнения,
  заполняемые инструктором
- 4 секции: Описание | Как делать (+cues) | Полезно знать | Безопасность
- Безопасность объединяет contraindications + absolute_contraindications
  + red_flags с визуальной градацией от «с осторожностью» до «прекрати»
- Badge «Безопасно при воспалении» (safe_with_inflammation) показывается
  пациенту в accordion и инструктору на ExerciseCard
- Hint-метки в ExerciseModal показывают инструктору где какое поле
  отрисуется на стороне пациента

LOCKED-зона ExerciseRunner затронута только в области accordion-блока.
Timer, RPE, pain slider, анимации, layout — НЕ изменены.
Smoke в реальном браузере прогнан в обеих темах.

Тесты: 8 frontend + 5 регрессионных существующих.
Roadmap: PATIENT_UX_ROADMAP_2026-05-08_v2.md #4
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Раздел «LOCKED — Не изменять без явного запроса» / «ExerciseRunner v3»: **обновить** запись:
  > «Accordion расширен до 4 секций (Wave 0 коммит 05). Layout, timer, RPE, pain slider, анимации остаются LOCKED. Дальнейшие изменения accordion разрешены без специального согласования, остальное — по-прежнему LOCKED.»
- Раздел «Известные ограничения / Dead fields»: вычеркнуть `cues`, `tips`, `absolute_contraindications`, `red_flags`, `safe_with_inflammation`

**`MEMORY.md` или `memory/wave_0_runner_accordion.md`:**
- «`ExerciseRunner.js` accordion разблокирован для расширений в Волне 0. Поля упражнения теперь все используются.»
- «Backup `ExerciseRunner.js.backup-wave0-05` удалён после успешного smoke»

**Удалить backup:**

```bash
rm frontend/src/pages/PatientDashboard/components/ExerciseRunner.js.backup-wave0-05
```

**`wave_0_progress.md`:** строка `05` → `✅ done`, SHA, дата.

---

## Definition of Done

- [ ] Все 4 секции accordion рендерятся корректно (smoke 1-4)
- [ ] Регрессия не нарушена: timer/RPE/pain slider/анимации работают (smoke 1)
- [ ] Тёмная тема не сломана (smoke 4)
- [ ] iOS Safari не сломан (smoke 5 если есть устройство)
- [ ] Frontend тесты зелёные (8 новых + регрессионные)
- [ ] Hint-метки в ExerciseModal видны инструктору
- [ ] Badge safe_with_inflammation на ExerciseCard работает
- [ ] `git diff` для ExerciseRunner.js показывает изменения **только в области accordion**
- [ ] Backup-файл удалён
- [ ] Документация обновлена (CLAUDE.md статус LOCKED, MEMORY.md запись)
- [ ] **Push после явного «ок»**
