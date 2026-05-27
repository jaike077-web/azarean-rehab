# TZ Wave 2 · Hot-fix #10 — DailyPainSection pre-load + ChipGroup selected + Toast z-index

**Дата:** 2026-05-19
**Базовая ветка:** `d6a0b36` (HF#9 v2 — pain_character TEXT[])
**Новая ветка:** `wave-2/hotfix-10-daily-pain-ui-fixes`
**Цель:** закрыть 2 fail'а из smoke 2.05 + 1 observed CSS bug перед Block C (measurements).
**Объём:** 1.5-2 часа
**Риск:** низкий — точечные UI/CSS правки + 1 endpoint touch (если отсутствует), без schema изменений.

---

## Источник — smoke 2.05 + HF#9 (19.05.2026, 17:58)

| # | Симптом | Шаг smoke |
|---|---------|-----------|
| **A** | После submit multi-character в DailyPainSection и F5 — chips пустые (массив не pre-load'ится из БД) | 5.5 fail |
| **B** | При клике в LocationChips последняя нажатая chip становится серой с белым текстом; предыдущая чипа зелёная (selected state inverted) | 3.3 mention |
| **C** | Тост поверх PainEventForm modal не виден (пользователь видит только inline-ошибки, toast не подсвечивается) | 6.1 low confidence |

---

## Verify-step перед стартом (правило #15 — output в отчёт)

**Обязательный grep + cat до начала кода. Положи output текстом в commit report.**

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# === Fix A — DailyPainSection pre-load ===
# 1.1. Найди компонент DailyPainSection
grep -rln "DailyPainSection" frontend/src/

# 1.2. Покажи код компонента полностью
cat frontend/src/components/DailyPainSection.js  # или путь который нашёл

# 1.3. Найди где DailyPainSection используется (DiaryScreen, HomeScreen?)
grep -rn "DailyPainSection" frontend/src/components/ frontend/src/screens/

# 1.4. Найди existing GET endpoint для сегодняшней pain_entry
grep -n "is_event.*false\|daily.*pain\|pain.*today" backend/routes/rehab.js | head -20
grep -rn "rehab.painEntries\|painEntries\.\|pain-entries" frontend/src/services/

# 1.5. Если есть GET endpoint — покажи код возврата pain_character (важно: TEXT[] должен сериализоваться как JSON array)
# grep + sed по найденному файлу

# === Fix B — ChipGroup selected inverted ===
# 2.1. Покажи ChipGroup полностью
cat frontend/src/components/ui/ChipGroup.js
cat frontend/src/components/ui/ChipGroup.module.css

# 2.2. Найди LocationChips (если отдельный компонент)
grep -rln "LocationChips\|location.*chip\|painLocation" frontend/src/components/

# 2.3. Проверь :focus / :focus-visible / :active правила
grep -nE ":focus|:active|:focus-visible" frontend/src/components/ui/ChipGroup.module.css

# === Fix C — Toast z-index ===
# 3.1. Покажи Toast компонент и его CSS
grep -rln "ToastContext\|ToastProvider\|toast.success\|toast.error" frontend/src/
cat frontend/src/context/ToastContext.js  # или путь
cat frontend/src/components/Toast.js  # или путь, может быть в context/
cat frontend/src/components/Toast.module.css  # или global CSS файл с .toast классом

# 3.2. Покажи модалку PainEventForm + её CSS (или global modal styles)
grep -n "PainEventForm\|pain-event-form" frontend/src/components/
cat frontend/src/components/PainEventForm.module.css 2>/dev/null || \
  grep -nE "z-index|\.modal|\.backdrop" frontend/src/components/PainEventForm.module.css frontend/src/components/PainEventForm.js

# 3.3. Сравни z-index Toast vs Modal — выведи числа явно
grep -nE "z-index" frontend/src/components/Toast.module.css \
                   frontend/src/components/PainEventForm.module.css \
                   frontend/src/styles/global.css 2>/dev/null
```

**Output ВСЕХ этих команд → в commit report текстом.** Архитектор пишет TZ HF#11 (если потребуется) из этих artifacts, не из памяти (правило #15).

**Stop-условия:**
- Если файлы не найдены по ожидаемым путям → выведи `find frontend/src -name "DailyPainSection*"` и аналогично для других — НЕ угадывать что-то другое.
- Если GET endpoint для daily pain отсутствует → создай новый (см. Fix A ниже), это OK.

---

## Зависимости

Ветка `wave-2/hotfix-10-daily-pain-ui-fixes` от `d6a0b36` (последний в Wave 2 stack).
После закрытия — push в feature branch, ⏸ заморозить (НЕ merge), стек становится 9 PR.

---

## Что блокирует

**НЕ блокирует** TZ 2.06 (measurements + photo upload + AI consent endpoint) — Block C можно стартовать параллельно после ⏸ этого HF.

Но желательно влить HF#10 перед deploy на dev — иначе pre-load баг = пациенты видят "пустую" форму после reload → дубли в БД.

---

## ❌ НЕ создавать / ❌ НЕ трогать

- ❌ ExerciseRunner v4 — LOCKED zone
- ❌ pain_entries schema (миграции) — HF#9 v2 закрыл TEXT[], схема финальна
- ❌ utils/opsAlert.js — Wave 1 fix #50, переиспользуем как есть
- ❌ ChipGroup API surface (prop names `selected`, `onChange`, и т.д.) — только internal logic / CSS
- ❌ Migrations folder — никаких новых .sql

---

## ✅ Переиспользуем (existing infrastructure)

- `frontend/src/context/ToastContext.js` — toast singleton, не дублировать провайдер
- `frontend/src/components/ui/ChipGroup.js` — компонент остаётся, чиним внутри
- `frontend/src/services/patientApi.js` — методы `rehab.painEntries.*`, расширяем существующий namespace
- `backend/routes/rehab.js` — добавляем endpoint в существующий файл, новый route файл не создавать
- `req.patient.id` из `middleware/patientAuth.js` — НЕ `req.user.patient_id`

---

## Конкретная реализация

### Fix A — DailyPainSection pre-load массива после F5

**Причина (вероятная — verify через grep подтвердит):**
1. После HF#9 v2 backend хранит `pain_character` как `TEXT[]` (PG array).
2. Submit в DailyPainSection работает корректно (5.4 passed, БД факт подтвердил массив).
3. На mount компонента либо нет fetch, либо fetch возвращает данные но pre-fill не происходит, либо ChipGroup `selected` prop получает не-массив.

**Решение — три шага:**

#### A.1. Backend — GET endpoint для сегодняшней daily pain_entry

**Если endpoint уже есть** (verify через grep `pain.*today\|is_event.*false`) — пропустить, проверить только что `pain_character` возвращается массивом, а не stringified.

**Если endpoint отсутствует — добавить в `backend/routes/rehab.js`:**

```javascript
// GET /api/rehab/my/pain-entries/daily?date=YYYY-MM-DD (default = today)
router.get('/my/pain-entries/daily', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;  // НЕ req.user.patient_id
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const result = await query(`
      SELECT
        pe.id,
        pe.entry_date,
        pe.vas_score,
        pe.trigger_type,
        pe.pain_character,     -- TEXT[] — pg драйвер вернёт JS array
        pe.notes,
        pe.is_event,
        pe.red_flag_triggered,
        COALESCE(
          json_agg(json_build_object('code', pel.location_code, 'label', pl.label))
            FILTER (WHERE pel.location_code IS NOT NULL),
          '[]'::json
        ) AS locations
      FROM pain_entries pe
      LEFT JOIN pain_entry_locations pel ON pel.pain_entry_id = pe.id
      LEFT JOIN pain_locations pl ON pl.code = pel.location_code
      WHERE pe.patient_id = $1
        AND pe.entry_date = $2
        AND pe.is_event = FALSE
      GROUP BY pe.id
      LIMIT 1
    `, [patientId, date]);

    if (result.rows.length === 0) {
      return res.json({ data: null, message: 'No daily entry for this date' });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('GET /my/pain-entries/daily error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch daily pain entry' });
  }
});
```

**Проверь node-postgres `pain_character`:** должен прийти как JS-массив (`['sharp','throbbing']`), а не как строка `"{sharp,throbbing}"`. Если строка — баг pg parser configuration (но обычно node-pg ≥ 8 парсит TEXT[] автоматически). В этом случае добавь явный parse в SELECT:
```sql
pe.pain_character::text[] AS pain_character
```
или в JS:
```javascript
row.pain_character = Array.isArray(row.pain_character)
  ? row.pain_character
  : (row.pain_character ? row.pain_character.slice(1,-1).split(',') : []);
```

#### A.2. Frontend service — добавь метод

**`frontend/src/services/patientApi.js`** в namespace `rehab.painEntries`:

```javascript
// Существующий namespace rehab.painEntries (НЕ создавать новый)
fetchDaily: (date) => api.get('/api/rehab/my/pain-entries/daily', { params: { date } }),
```

#### A.3. Frontend компонент — DailyPainSection pre-load

**`frontend/src/components/DailyPainSection.js`** (точный путь — verify подтвердит):

```javascript
import { useState, useEffect } from 'react';
import patientApi from '../services/patientApi';
import ChipGroup from './ui/ChipGroup';

const PAIN_CHARACTER_OPTIONS = [
  { value: 'aching', label: 'Ноющая' },
  { value: 'sharp', label: 'Острая' },
  { value: 'burning', label: 'Жгучая' },
  { value: 'shooting', label: 'Простреливающая' },
  { value: 'throbbing', label: 'Пульсирующая' },
];

export default function DailyPainSection() {
  const [painCharacter, setPainCharacter] = useState([]);  // array, не string
  const [vas, setVas] = useState(0);
  const [loading, setLoading] = useState(true);

  // ВАЖНО: pre-load on mount — fetch today's daily entry
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    patientApi.rehab.painEntries.fetchDaily(today)
      .then(response => {
        const entry = response.data;  // axios interceptor unwraps {data: payload}
        if (entry) {
          setPainCharacter(entry.pain_character || []);
          setVas(entry.vas_score || 0);
          // ... другие поля
        }
      })
      .catch(err => {
        console.error('Failed to pre-load daily pain entry', err);
        // не показывать toast — silent fail на пустой entry
      })
      .finally(() => setLoading(false));
  }, []);  // mount only

  if (loading) return <Skeleton />;  // если Skeleton есть, иначе null

  return (
    <ChipGroup
      options={PAIN_CHARACTER_OPTIONS}
      selected={painCharacter}     // array — multi-select
      onChange={setPainCharacter}
      multi
    />
    // ... остальной UI
  );
}
```

**Критично:** `selected={painCharacter}` принимает массив (HF#9 v2 закрепил multi). Если ChipGroup до этого ожидал string — это уже исправлено в 2.05 + HF#9, не трогать.

---

### Fix B — ChipGroup selected state inverted

**Причина (вероятная — verify через `grep :focus` подтвердит):**
:focus или :focus-visible правило на `.chip` перекрывает `.chip.selected`. После click chip получает фокус → серый фон. После клика на следующую chip — предыдущая теряет фокус → возвращается к selected зелёному. Новая chip получает focus → серая.

**Решение:**

#### B.1. CSS — `ChipGroup.module.css`

Найди правило вроде:
```css
.chip:focus,
.chip:focus-visible {
  background: var(--color-surface-alt);  /* серый */
  color: white;
  outline: none;
}
```

И поправь — `.selected` должен иметь приоритет:
```css
.chip {
  background: var(--color-surface);
  color: var(--color-text);
  /* ... */
}

.chip.selected {
  background: var(--color-primary);     /* зелёный teal #0D9488 */
  color: white;
}

/* :focus НЕ перебивает .selected — добавляем outline отдельно */
.chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Убрать :focus full-style override если был */
.chip:focus:not(.selected) {
  /* безопасный focus стиль для НЕвыбранных chips */
}
```

**Альтернатива (если :focus стиль нужен по дизайну):** добавь `.chip:active { outline: none }` + `onClick` сразу `event.currentTarget.blur()` чтобы chip не оставался в focus после tap. Но первый вариант чище.

#### B.2. Unit-тест ChipGroup selected состояния

`frontend/src/components/ui/__tests__/ChipGroup.test.js` — добавь:

```javascript
it('selected chip имеет class .selected независимо от focus', () => {
  const { getByText, rerender } = render(
    <ChipGroup
      options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
      selected={['a']}
      onChange={() => {}}
      multi
    />
  );
  const chipA = getByText('A');
  // Имитируем focus
  chipA.focus();
  expect(chipA).toHaveClass('selected');  // .selected осталась после focus

  // Переключаем selected на b
  rerender(<ChipGroup
    options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
    selected={['b']}
    onChange={() => {}}
    multi
  />);
  expect(getByText('B')).toHaveClass('selected');
  expect(getByText('A')).not.toHaveClass('selected');
});
```

**Замечание:** jest CSS Modules мокается через Proxy (memory #20), поэтому реальный визуал не проверишь — но class assertion + manual smoke в браузере покрывают.

---

### Fix C — Toast z-index поверх modal

**Причина:** `.toast` z-index ниже чем `.modal-backdrop` или `.modal-content`.

#### C.1. CSS — поднять Toast z-index

В `Toast.module.css` (или global CSS если toast global-classed):

```css
.toastPortal,
.toast-container {
  position: fixed;
  z-index: 10000;  /* выше стандартного modal (1000-1010) */
  /* ... */
}
```

Если PainEventForm modal имеет z-index 1010 и backdrop 1000 — toast на 10000 гарантированно сверху. Проверь через grep, что нет другого компонента с z-index ≥ 10000 (кроме toast).

#### C.2. Unit-тест Toast portal mount

Если у Toast уже есть тест — расширь:

```javascript
it('toast portal имеет z-index ≥ 10000', () => {
  const { container } = render(<ToastProvider><Toast message="test" /></ToastProvider>);
  const portal = container.querySelector('.toastPortal, .toast-container');
  expect(portal).toBeTruthy();
  // CSS Modules через Proxy mock — проверка через style attribute если inline z-index, иначе skip
});
```

**Manual smoke (см. ниже)** — основной критерий для Fix C.

---

## NOT TOUCH

- ❌ ExerciseRunner v4 (`frontend/src/components/ExerciseRunner.js` + `.pd-runner` scope в global CSS)
- ❌ `backend/database/migrations/` — никаких schema изменений
- ❌ `utils/opsAlert.js`, `services/telegramBot.js` — Wave 1 fix #50 / Wave 2 infrastructure
- ❌ PainEventForm submit логика — починка только z-index у Toast, не самой формы
- ❌ HF#9 v2 frontend changes в PainEventForm + DailyPainSection submit-path

---

## Smoke test (4-card format)

### Сценарий 1 — Fix A pre-load массива

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| `/patient-dashboard` → Дневник | Секция «Боль сегодня» (DailyPainSection) | 1. Submit характер боли: «Ноющая» + «Острая» multi-select. 2. F5 страницы. | После reload обе chips «Ноющая» + «Острая» **уже подсвечены selected (зелёные)**. VAS, локации, заметка — тоже подтянулись. |

### Сценарий 2 — Fix A пустая дата

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| `/patient-dashboard` → Дневник | DailyPainSection | Открыть страницу на дату когда записей нет (test patient без daily entry за сегодня) | Форма пустая, chips НЕ подсвечены. Никаких ошибок в console. Запрос `/api/rehab/my/pain-entries/daily` возвращает `{data: null}` со статусом 200. |

### Сценарий 3 — Fix B selected state корректный

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| PainEventForm (через SOS link) или DailyPainSection | LocationChips / ChipGroup | Кликни chip A → кликни chip B → кликни chip C (multi-select) | **Все три chip зелёные** (selected). Последняя clicked — НЕ серая. Tab navigation: focus outline появляется но цвет фона остаётся зелёным для selected. |

### Сценарий 4 — Fix C toast поверх modal

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| HomeScreen → SOS link → PainEventForm modal | Открытая модалка | DevTools → Network → **Offline**. Заполни валидно. Submit. **Верни Network → No throttling.** | Toast «Не удалось сохранить» / «Ошибка сети» **виден поверх модалки** (полоска сверху или снизу экрана, на фоне формы). |

### Сценарий 5 — Mobile 375px regression

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| DevTools → iPhone SE (375×667) | DiaryScreen + PainEventForm | Прогон Сценариев 1, 3, 4 в mobile viewport | Всё то же: pre-load работает, chips зелёные, toast виден поверх. Нет overflow, нет horizontal scroll. |

---

## Файлы — итоговый чеклист

### Создать
- `backend/tests/__tests__/rehab_pain_daily_get.test.js` (если Fix A.1 добавляет endpoint — иначе пропустить)

### Изменить
- `backend/routes/rehab.js` — добавить GET `/my/pain-entries/daily` (если отсутствует)
- `frontend/src/services/patientApi.js` — добавить `rehab.painEntries.fetchDaily(date)`
- `frontend/src/components/DailyPainSection.js` — useEffect pre-load on mount
- `frontend/src/components/ui/ChipGroup.module.css` — :focus не перекрывает .selected
- `frontend/src/components/ui/__tests__/ChipGroup.test.js` — тест selected + focus
- `frontend/src/components/Toast.module.css` (или global toast styles) — z-index 10000+

### Возможно изменить (по verify)
- Toast.js / ToastContext.js — если portal mount требует explicit z-index inline
- `frontend/src/components/__tests__/DailyPainSection.test.js` — тест pre-load

### НЕ ТРОГАТЬ
- Migrations
- ExerciseRunner
- PainEventForm submit логика
- opsAlert.js / telegramBot.js
- HF#9 v2 frontend submit changes

---

## Текст коммита

```
fix(ui): HF#10 — DailyPainSection pre-load + ChipGroup selected + Toast z-index

Закрывает 2 fail'а из smoke 2.05 + 1 observed CSS bug.

A. DailyPainSection pre-load — fetch on mount возвращает сегодняшнюю
   pain_entry, chips подсвечены как selected после F5. Решает UX-баг:
   пациент видел пустую форму после reload и отправлял дубль.
   - Backend: GET /api/rehab/my/pain-entries/daily?date=YYYY-MM-DD
     (или verify-confirmed existing endpoint правильно отдаёт TEXT[])
   - Frontend: useEffect on mount → patientApi.rehab.painEntries.fetchDaily
   - State pre-fill: pain_character array, vas_score, locations, notes

B. ChipGroup selected state — :focus больше не перекрывает .selected.
   Раньше последняя clicked chip оставалась в focus и красилась серым,
   создавая ложное впечатление "не выбрана". Fix: focus-visible outline
   отдельно от background, .selected специфичность сохранена.

C. Toast z-index 10000 — гарантированно поверх modal backdrop/content
   (стандарт modal: 1000/1010). HF#7 regression закрыт.

Verify-step output (rule #15) — в commit description ниже.

Tests: backend +N (если новый endpoint), frontend +2 (ChipGroup selected,
DailyPainSection pre-load).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Verify-step output как text section после основного коммит-message:**

```
=== VERIFY OUTPUT (rule #15) ===

[вставить полный output всех grep / cat / find команд из секции Verify-step]
```

---

## Definition of Done

- [ ] Verify-step выполнен, output всех команд в commit report текстом
- [ ] Fix A: GET endpoint работает (verify через curl с JWT cookie или Postman)
- [ ] Fix A: DailyPainSection после F5 показывает pre-load'нутый массив (Сценарий 1 smoke)
- [ ] Fix A: пустая дата возвращает `{data: null}` без ошибок (Сценарий 2)
- [ ] Fix B: 3 clicked chips остаются зелёными, последняя не серая (Сценарий 3)
- [ ] Fix C: toast виден поверх modal в offline-сценарии (Сценарий 4)
- [ ] Mobile 375px: всё то же без overflow (Сценарий 5)
- [ ] Backend tests: ≥534 (+N если endpoint новый)
- [ ] Frontend tests: ≥300 (+2 для ChipGroup + DailyPainSection)
- [ ] Все существующие тесты зелёные
- [ ] Коммит с текстом выше + Co-Authored-By trailer
- [ ] Ветка `wave-2/hotfix-10-daily-pain-ui-fixes` создана от `d6a0b36`
- [ ] **`git push` ТОЛЬКО после явного «ок» от Vadim'а**
- [ ] PR ⏸ frozen, стек становится **9 PR**:
      `af313b4 → a6f7980 → 82544c0 → 98ca5f2 → e6f11a9 → 5cb4216 → a2ecad6 → d6a0b36 → [HF#10]`

---

## После HF#10

**Следующий TZ:** `TZ_WAVE_2_06_measurements_backend.md` (Block C старт).

Архитектор пишет 2.06 из:
- Smoke HF#10 result (clean → старт 2.06; failure → HF#11)
- Verify-step output HF#10 (rule #15 — путь к Toast/ChipGroup/patientApi уточнён для 2.06)
- Memory #22 (Block C storage decisions): local disk `/var/www/azarean/uploads/measurements/`, sharp 1200max JPEG q=80, JWT-only access + photo_consent endpoint
- Memory #24 (Block C plan): rom + girth endpoints, multer + sharp infrastructure, POST patient photo-consent

**Backlog (deferred from HF#10):**
- Если verify покажет что pain_character приходит stringified (не TEXT[]) — это отдельный backend deserialization баг, попадёт в HF#11
- Toast keyboard a11y (Esc closes toast) — Wave 3
