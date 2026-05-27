# TZ Wave 2 · Коммит 2.08 — Frontend Tier 1 measurements UI (base)

**Дата:** 2026-05-19
**Базовая ветка:** `d55203c` (2.07 photo+consent backend)
**Новая ветка:** `wave-2/2.08-measurements-frontend-base`
**Roadmap:** Wave 2 Block C frontend старт. **Split:** 2.08 = base UI, 2.09 = photo+consent flow, 2.10 = Tier 2 markup.
**Цель:** функциональный Tier 1 UI для пациента — выбрать тип, ввести значение (с bilateral L/R toggle), submit, увидеть в истории. БЕЗ photo upload, БЕЗ consent dialog (это 2.09).
**Объём:** 4-5 часов
**Риск:** средний — много UI deciisions (placement screen, picker UX, bilateral toggle), но без photo сложность управляема. Mitigates: split scope, copy DiaryScreen + DailyPainSection patterns.

---

## Verify-step перед стартом (правило #15 — output в commit report)

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1. PatientDashboard screens structure
ls frontend/src/pages/PatientDashboard/
ls frontend/src/pages/PatientDashboard/screens/ 2>/dev/null
ls frontend/src/pages/PatientDashboard/components/

# 2. Точная структура TabBar — куда добавить новый pункт?
grep -rn "TabBar\|tabbar" frontend/src/pages/PatientDashboard/ | head -10
cat frontend/src/pages/PatientDashboard/components/TabBar.js 2>/dev/null || \
  cat frontend/src/pages/PatientDashboard/components/ui/TabBar.js 2>/dev/null

# 3. Router config (если screens через React Router) или conditional rendering
grep -rn "Routes\|Route path\|activeTab\|currentScreen" frontend/src/pages/PatientDashboard/ | head -15

# 4. ChipGroup точный API (для re-use в type picker, side selector, HBB picker)
cat frontend/src/pages/PatientDashboard/components/ui/ChipGroup.js 2>/dev/null || \
  find frontend/src -name "ChipGroup*"

# 5. patientApi.rehab existing namespace — добавляем measurements туда
grep -nE "rehab:|rehab = \{|measurements" frontend/src/services/patientApi.js | head -20

# 6. DiaryScreen structure (для копирования form pattern)
cat frontend/src/pages/PatientDashboard/screens/DiaryScreen.js 2>/dev/null || \
  cat frontend/src/pages/PatientDashboard/components/DiaryScreen.js 2>/dev/null | head -80

# 7. Skeleton component для loading
find frontend/src -name "Skeleton*" -not -path "*/node_modules/*"

# 8. Toast usage pattern
grep -rn "toast\.success\|toast\.error\|useToast" frontend/src/pages/PatientDashboard/ | head -5

# 9. Card / form компоненты что переиспользуем
find frontend/src/pages/PatientDashboard/components/ui -name "*.js"

# 10. PatientAuthContext — есть ли photo_consent_at в patient объекте?
grep -rn "photo_consent_at\|consent_version" frontend/src/ | head -10
```

**Output ВСЕХ команд → в commit report текстом** (rule #15).

**Stop-условия:**
- Если в TabBar НЕТ room для нового tab (5+ items maxed UX) → сообщи в чат, решим вместе про placement (sub-section ProfileScreen vs RoadmapScreen vs новый tab)
- Если ChipGroup отсутствует в `components/ui/` → critical drift, не должно быть (HF#9 v2 точно создавал/использовал)
- Если `patientApi.rehab` namespace другой структуры чем ожидаемая (`rehab.painEntries.*` style) — адаптируй measurements под существующий стиль

---

## Зависимости

Ветка `wave-2/2.08-measurements-frontend-base` от `d55203c` (2.07).
После DoD ⏸ frozen. Стек становится **13 PR**.

---

## Что блокирует

**Блокирует:** TZ 2.09 photo capture (frontend нужен фрейм для photo upload UI).
**НЕ блокирует:** ничего другого.

---

## ❌ НЕ создавать / ❌ НЕ трогать

- ❌ Photo capture UI — TZ 2.09
- ❌ Consent dialog modal — TZ 2.09
- ❌ Reference photo display (`patients.measurement_reference_photo_url`) — TZ 2.10 или Wave 3
- ❌ Tier 2 markup canvas — TZ 2.10
- ❌ Edit / Delete measurement UI — Wave 3 (MVP: create-only + view history)
- ❌ Backend endpoints — все три на месте из 2.06+2.07 (POST rom, POST girth, GET measurements)
- ❌ Reference photo для инструктора (upload by instructor) — отдельный flow
- ❌ ExerciseRunner v4, PainEventForm, DailyPainSection — LOCKED
- ❌ MeasurementsScreen в DiaryScreen — отдельный screen, не nesting

---

## ✅ Переиспользуем (existing)

- `components/ui/ChipGroup.js` — type picker, side selector, HBB picker, bilateral toggle
- `components/ui/Card.js` — history items + form sections
- `components/ui/Skeleton.js` — loading placeholder
- `context/ToastContext.js` — `toast.success` / `toast.error`
- `services/patientApi.js` — добавить namespace `rehab.measurements.*`
- `pd-*` global CSS prefix (memory #20 — PatientDashboard global CSS legitimate)
- Pattern из `DiaryScreen.js` / `DailyPainSection.js` для form structure
- Memory #28 — `:hover:not(:disabled):not(.--selected)` для всех новых chip variants

---

## Реализация

### Phase 1 — patientApi additions (STOP CHECKPOINT после)

В `frontend/src/services/patientApi.js`, добавить в namespace `rehab.*` (точная вложенность подсмотри по verify — может быть `rehab.measurements.*` или плоский `rehab.measurementsList()`):

```javascript
// === Measurements (2.08) ===
measurements: {
  // POST /api/rehab/my/measurements/rom
  postRom: (payload) => api.post('/api/rehab/my/measurements/rom', payload),

  // POST /api/rehab/my/measurements/girth
  postGirth: (payload) => api.post('/api/rehab/my/measurements/girth', payload),

  // GET /api/rehab/my/measurements?type=...&program_id=...&since=...&limit=...
  fetchAll: (params = {}) => api.get('/api/rehab/my/measurements', { params }),
},
```

**Замечание:** payload для bilateral submission — frontend генерирует ОДИН `measurement_session_id = Date.now()` (BIGINT millis, memory #30) и шлёт TWO POSTs с этим id (один с side='L', другой 'R'). НЕ генерируй два разных session_id для bilateral pair — это сломает grouping.

⏸ **CHECKPOINT 1** — патент verify: `import { api } from './patientApi'` работает, методы существуют, ESLint clean.

---

### Phase 2 — MeasurementsScreen новый экран (STOP CHECKPOINT после)

**Placement decision (зависит от verify TabBar output):**
- Если TabBar имеет ≤5 items + room → добавить 6-7-й item «Замеры» с lucide-react иконкой `Ruler` или `Activity`
- Если TabBar maxed — создать MeasurementsScreen и сделать **section внутри RoadmapScreen** (с кнопкой «Открыть замеры» → modal-overlay через ProgressDashboard pattern)

Default решение в TZ — **новый tab «Замеры»** (минимум disruption к existing screens). Если пути не находишь — fallback к RoadmapScreen sub-section.

**File:** `frontend/src/pages/PatientDashboard/screens/MeasurementsScreen.js` (или `components/MeasurementsScreen.js` — путь как у DiaryScreen).

**Layout — три секции внутри `pd-screen` контейнера:**

```jsx
import { useState, useEffect } from 'react';
import { Ruler } from 'lucide-react';
import patientApi from '../../../services/patientApi';
import { useToast } from '../../../context/ToastContext';
import Card from '../components/ui/Card';
import Skeleton from '../components/ui/Skeleton';
import NumericInputForm from '../components/NumericInputForm';
import MeasurementHistoryList from '../components/MeasurementHistoryList';

export default function MeasurementsScreen() {
  const [history, setHistory] = useState({ rom: [], girth: [] });
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const reloadHistory = async () => {
    try {
      const res = await patientApi.rehab.measurements.fetchAll({ type: 'all', limit: 20 });
      setHistory(res.data || { rom: [], girth: [] });
    } catch (err) {
      toast.error('Не удалось загрузить историю замеров');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reloadHistory(); }, []);  // mount only

  const handleMeasurementSaved = () => {
    toast.success('Замер сохранён');
    reloadHistory();
  };

  return (
    <div className="pd-screen pd-measurements-screen">
      <header className="pd-screen-header">
        <Ruler size={24} aria-hidden="true" />
        <h1>Замеры</h1>
      </header>

      <section className="pd-measurements-form-section">
        <Card>
          <h2>Новый замер</h2>
          <NumericInputForm onSaved={handleMeasurementSaved} />
        </Card>
      </section>

      <section className="pd-measurements-history-section">
        <h2>История</h2>
        {loading ? <Skeleton lines={5} /> : <MeasurementHistoryList items={history} />}
      </section>
    </div>
  );
}
```

CSS файл `MeasurementsScreen.css` с pd-prefix классами. Tokens из existing `tokens.css` (teal primary).

⏸ **CHECKPOINT 2** — экран открывается, layout рендерится, history loads (пустой массив если нет measurements), Skeleton показывается во время fetch.

---

### Phase 3 — NumericInputForm component (STOP CHECKPOINT после)

**File:** `frontend/src/pages/PatientDashboard/components/NumericInputForm.js` + `.css`

**Cyrillic labels — точный mapping** (НЕ изобретать):

```javascript
const ROM_TYPES = [
  { value: 'shoulder_forward_flexion_degrees', label: 'Плечо: сгибание вперёд', unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_abduction_degrees',       label: 'Плечо: отведение',         unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_er_0_degrees',            label: 'Плечо: наружная ротация (0°)', unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_ir_90_abd_degrees',       label: 'Плечо: внутренняя ротация (90° отв.)', unit: '°', valueKind: 'degrees' },
  { value: 'shoulder_hbb_categorical',         label: 'Плечо: рука за спину (HBB)', unit: '', valueKind: 'categorical' },
  { value: 'knee_flexion_degrees',             label: 'Колено: сгибание',         unit: '°', valueKind: 'degrees' },
  { value: 'knee_extension_degrees',           label: 'Колено: разгибание',        unit: '°', valueKind: 'degrees' },
  { value: 'knee_flexion_hbd_cm',              label: 'Колено: пятка до ягодицы', unit: 'см', valueKind: 'cm' },
];

const GIRTH_TYPES = [
  { value: 'shoulder_mid_deltoid_cm',     label: 'Окружность плеча (ср. дельтовидная)', unit: 'см' },
  { value: 'shoulder_mid_biceps_cm',      label: 'Окружность плеча (ср. бицепс)',       unit: 'см' },
  { value: 'knee_joint_line_cm',          label: 'Окружность колена (суставная линия)', unit: 'см' },
  { value: 'knee_suprapatellar_5cm_cm',   label: 'Окружность 5 см над надколенником',   unit: 'см' },
  { value: 'knee_suprapatellar_10cm_cm',  label: 'Окружность 10 см над надколенником',  unit: 'см' },
  { value: 'knee_suprapatellar_15cm_cm',  label: 'Окружность 15 см над надколенником',  unit: 'см' },
  { value: 'knee_calf_max_cm',            label: 'Окружность икры (максимум)',          unit: 'см' },
];

const HBB_VERTEBRAE = [
  { value: 'T1', label: 'T1' }, { value: 'T2', label: 'T2' }, { value: 'T3', label: 'T3' },
  { value: 'T4', label: 'T4' }, { value: 'T5', label: 'T5' }, { value: 'T6', label: 'T6' },
  { value: 'T7', label: 'T7' }, { value: 'T8', label: 'T8' }, { value: 'T9', label: 'T9' },
  { value: 'T10', label: 'T10' }, { value: 'T11', label: 'T11' }, { value: 'T12', label: 'T12' },
  { value: 'L1', label: 'L1' }, { value: 'L2', label: 'L2' }, { value: 'L3', label: 'L3' },
  { value: 'L4', label: 'L4' }, { value: 'L5', label: 'L5' },
  { value: 'sacrum', label: 'Крестец' },
  { value: 'great_trochanter', label: 'Большой вертел' },
];
```

**Form state machine:**

```
1. category: 'rom' | 'girth'           — chip switcher (2 options)
2. measurement_type: ''                  — dropdown / chip group из ROM_TYPES или GIRTH_TYPES
3. bilateral: boolean (default false)    — toggle "Замерить обе стороны (L+R)"
4. side: 'L' | 'R' (если bilateral=false) — ChipGroup
5. value:
   - если valueKind === 'degrees' или 'cm' → numeric input
   - если valueKind === 'categorical' (HBB) → ChipGroup из HBB_VERTEBRAE
   - если bilateral=true → две input'а (L value + R value)
6. notes: textarea (optional, max 1000)
7. submit
```

**Submit логика:**

```javascript
async function handleSubmit() {
  const isRom = category === 'rom';
  const endpoint = isRom ? 'postRom' : 'postGirth';

  if (bilateral) {
    // Один session_id для пары (BIGINT millis, memory #30)
    const sessionId = Date.now();

    const payloadL = isRom
      ? { measurement_type, side: 'L', value: valueL, measurement_session_id: sessionId, notes }
      : { measurement_type, side: 'L', value_cm: parseFloat(valueL), measurement_session_id: sessionId, notes };
    const payloadR = isRom
      ? { measurement_type, side: 'R', value: valueR, measurement_session_id: sessionId, notes }
      : { measurement_type, side: 'R', value_cm: parseFloat(valueR), measurement_session_id: sessionId, notes };

    // Sequential — frontend ждёт оба ack перед toast.success
    try {
      await patientApi.rehab.measurements[endpoint](payloadL);
      await patientApi.rehab.measurements[endpoint](payloadR);
      onSaved();
      resetForm();
    } catch (err) {
      // Если первый submit прошёл а второй упал — оставляем half-pair в БД (acceptable for MVP)
      // History отобразит только L; пациент сможет вручную добавить R
      toast.error(err?.response?.data?.message || 'Ошибка сохранения');
    }
  } else {
    const payload = isRom
      ? { measurement_type, side, value, notes }
      : { measurement_type, side, value_cm: parseFloat(value), notes };
    try {
      await patientApi.rehab.measurements[endpoint](payload);
      onSaved();
      resetForm();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Ошибка сохранения');
    }
  }
}
```

**Frontend validation** (mirror backend, fail fast):
- degrees: `value >= 0 && value <= 360`
- cm: `value > 0 && value < 200`
- categorical: value ∈ HBB_VERTEBRAE
- side: 'L' or 'R'
- На invalid → toast.error + НЕ submit

**Chip variant CSS (memory #28):**
```css
.pd-measurement-type-chip:hover:not(:disabled):not(.--selected) {
  /* hover style только для не-выбранных */
}
```

⏸ **CHECKPOINT 3** — форма submit'ит valid payload, bilateral создаёт два entries с одним session_id (verify в DevTools Network + history reload), invalid values отлавливаются на frontend.

---

### Phase 4 — MeasurementHistoryList component

**File:** `frontend/src/pages/PatientDashboard/components/MeasurementHistoryList.js` + `.css`

```jsx
import Card from './ui/Card';
import { ROM_TYPES, GIRTH_TYPES } from './NumericInputForm';  // export labels из NumericInputForm

// label maps для отображения
const ROM_LABEL_MAP = Object.fromEntries(ROM_TYPES.map(t => [t.value, t.label]));
const GIRTH_LABEL_MAP = Object.fromEntries(GIRTH_TYPES.map(t => [t.value, t.label]));
const HBB_LABEL_MAP = Object.fromEntries(HBB_VERTEBRAE.map(v => [v.value, v.label]));

function formatValue(m, isRom) {
  if (isRom) {
    if (m.value_degrees != null) return `${m.value_degrees}°`;
    if (m.value_cm != null) return `${m.value_cm} см`;
    if (m.value_categorical) return HBB_LABEL_MAP[m.value_categorical] || m.value_categorical;
    return '—';
  }
  return `${m.value_cm} см`;
}

function MeasurementCard({ m, isRom }) {
  const labelMap = isRom ? ROM_LABEL_MAP : GIRTH_LABEL_MAP;
  return (
    <Card className="pd-measurement-history-card">
      <div className="pd-measurement-card-header">
        <span className="pd-measurement-date">{m.measured_at}</span>  {/* YYYY-MM-DD строка из backend, timezone rule #27 */}
        <span className="pd-measurement-side">{m.side === 'L' ? 'Левая' : 'Правая'}</span>
      </div>
      <div className="pd-measurement-card-body">
        <div className="pd-measurement-type">{labelMap[m.measurement_type] || m.measurement_type}</div>
        <div className="pd-measurement-value">{formatValue(m, isRom)}</div>
      </div>
      {m.notes && <div className="pd-measurement-notes">{m.notes}</div>}
    </Card>
  );
}

export default function MeasurementHistoryList({ items }) {
  const { rom = [], girth = [] } = items;

  // Сортируем по measured_at DESC + id DESC (backend уже сортирует, но frontend защита)
  const all = [
    ...rom.map(m => ({ ...m, _isRom: true })),
    ...girth.map(m => ({ ...m, _isRom: false })),
  ].sort((a, b) => {
    if (a.measured_at !== b.measured_at) return b.measured_at.localeCompare(a.measured_at);
    return b.id - a.id;
  });

  if (all.length === 0) {
    return <div className="pd-measurement-history-empty">Пока нет замеров. Добавьте первый через форму выше.</div>;
  }

  // Группируем по session_id для bilateral pair display (опционально — улучшение UX)
  // MVP — просто список карточек

  return (
    <div className="pd-measurement-history-list">
      {all.map(m => (
        <MeasurementCard key={`${m._isRom ? 'rom' : 'girth'}-${m.id}`} m={m} isRom={m._isRom} />
      ))}
    </div>
  );
}
```

**Bilateral pair grouping (опционально — если время позволяет):** sortировка по `measurement_session_id` где не null, две карточки рядом с visual indicator «L+R пара». Если scope tight — пропусти, отдельный backlog.

---

## Tests — frontend

**File:** `frontend/src/pages/PatientDashboard/components/__tests__/NumericInputForm.test.js` (~10 тестов)

1. **Render** — форма показывает category switcher (rom/girth)
2. **category=rom** → measurement_type list = ROM_TYPES (8 items)
3. **category=girth** → measurement_type list = GIRTH_TYPES (7 items)
4. **measurement_type=shoulder_hbb_categorical** → value input заменяется на HBB ChipGroup
5. **measurement_type=knee_flexion_degrees** + value=120 + side=L → submit вызывает `patientApi.rehab.measurements.postRom` с правильным payload
6. **bilateral=true** → 2 input поля + одинаковый session_id в обоих POST (mock `Date.now()`)
7. **bilateral=true** → два POST с side=L и side=R (verify mock calls in order)
8. **Invalid value (degrees > 360)** → НЕ вызывает API, показывает toast.error
9. **Invalid value (cm < 0 или > 200)** → НЕ вызывает API
10. **Submit success** → `onSaved` callback called, форма reset'ится

**File:** `frontend/src/pages/PatientDashboard/components/__tests__/MeasurementHistoryList.test.js` (~5 тестов)

11. **Empty state** — пустой массив → текст «Пока нет замеров»
12. **ROM entry с value_degrees** → отображает «120°»
13. **ROM entry с value_categorical=L3** → отображает «L3»
14. **Girth entry** → отображает «42.5 см»
15. **Sort by measured_at DESC** — два entries, более новая сверху

**File:** `frontend/src/pages/PatientDashboard/screens/__tests__/MeasurementsScreen.test.js` (~3 теста)

16. **Mount** → loading skeleton показан
17. **fetch success** → history компонент рендерит entries
18. **handleMeasurementSaved** callback вызывает `reloadHistory` (mock API)

---

## NOT TOUCH

- ❌ Backend (всё на месте из 2.06+2.07)
- ❌ Migrations
- ❌ Существующие 6 screens (HomeScreen, ExercisesScreen, DiaryScreen, RoadmapScreen, ProfileScreen, ContactScreen) — добавляем 7-й или sub-section, не модифицируем
- ❌ ExerciseRunner v4, PainEventForm, DailyPainSection — LOCKED
- ❌ ChipGroup внутренняя логика — переиспользуем как есть
- ❌ ToastContext, AuthContext — переиспользуем
- ❌ TabBar внутренняя структура — добавить новый item конвенциональным способом, не рефакторить
- ❌ Photo upload UI — TZ 2.09
- ❌ Consent dialog — TZ 2.09

---

## Smoke test (5 cards)

### Сценарий 1 — Open MeasurementsScreen

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| `/patient-dashboard` | Новый tab «Замеры» в TabBar (или sub-section RoadmapScreen) | Click | Screen открывается. Header «Замеры». Card «Новый замер» с формой. Section «История». Если test patient id=14 имеет existing measurements из 2.06 backend smoke — отображаются; иначе empty state. |

### Сценарий 2 — POST ROM single side

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| MeasurementsScreen | Форма «Новый замер» | category=ROM, type=knee_flexion_degrees, side=L, value=125, notes="После разминки", submit | Toast «Замер сохранён». History обновился (новая карточка сверху: «2026-05-19», «Левая», «Колено: сгибание», «125°»). |

### Сценарий 3 — POST bilateral pair

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| MeasurementsScreen | Форма + toggle «Замерить обе стороны» | toggle ON, type=knee_flexion_degrees, value L=125, R=120, submit | Toast. History обновился ДВУМЯ записями (L и R). Network tab: два POST'а с одинаковым `measurement_session_id` (DevTools verify — millis = Date.now()). |

### Сценарий 4 — POST HBB categorical

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| MeasurementsScreen | type=shoulder_hbb_categorical | Numeric input исчезает, появляется ChipGroup из 19 позвонков. Выбрать «L3» + side=L, submit | History: «Плечо: рука за спину (HBB)» «L3» «Левая». |

### Сценарий 5 — Frontend validation

| Где | Что найти | Что сделать | Что увидеть |
|-----|-----------|-------------|-------------|
| MeasurementsScreen | Форма | type=knee_flexion_degrees, value=500 (> 360), submit | Toast.error «Значение должно быть в диапазоне 0..360». API НЕ вызывается (Network tab пустой). Форма остаётся открытой с введёнными данными. |

---

## Файлы — итоговый чеклист

### Создать
- `frontend/src/pages/PatientDashboard/screens/MeasurementsScreen.js` (+ `.css`)
- `frontend/src/pages/PatientDashboard/components/NumericInputForm.js` (+ `.css`)
- `frontend/src/pages/PatientDashboard/components/MeasurementHistoryList.js` (+ `.css`)
- `frontend/src/pages/PatientDashboard/components/__tests__/NumericInputForm.test.js`
- `frontend/src/pages/PatientDashboard/components/__tests__/MeasurementHistoryList.test.js`
- `frontend/src/pages/PatientDashboard/screens/__tests__/MeasurementsScreen.test.js`

### Изменить
- `frontend/src/services/patientApi.js` — добавить `rehab.measurements.{postRom, postGirth, fetchAll}`
- `frontend/src/pages/PatientDashboard/components/TabBar.js` (или router config) — добавить «Замеры» tab
- `frontend/src/pages/PatientDashboard/PatientDashboard.js` (или main router) — добавить case для MeasurementsScreen
- `frontend/src/styles/tokens.css` (если нужны новые tokens) — добавить только новые, existing НЕ трогать

### НЕ ТРОГАТЬ
- Backend всё
- Existing screens / components — только ADD
- LOCKED zones (ExerciseRunner, PainEventForm, DailyPainSection)
- ToastContext, AuthContext, PatientAuthContext

---

## Текст коммита

```
feat(ui): Wave 2 коммит 2.08 — frontend Tier 1 measurements UI (base)

Новый MeasurementsScreen в PatientDashboard + три компонента:

- MeasurementsScreen — header + новая форма + история (Card-based layout)
- NumericInputForm — category switcher (ROM/girth), type picker
  (8 ROM + 7 girth с Cyrillic labels), side selector, bilateral
  toggle, value input (numeric для degrees/cm, ChipGroup для HBB
  categorical 19 позвонков), notes textarea, submit
- MeasurementHistoryList — chronologically sorted cards с Cyrillic
  type labels, side, value+unit, notes

Bilateral submit: один measurement_session_id (BIGINT Date.now()
millis) для пары, два sequential POST'а.

Frontend validation mirrors backend (degrees 0..360, cm > 0 < 200,
HBB whitelist) — toast.error без API call на invalid.

Timezone rule #27: measured_at отображается как 'YYYY-MM-DD' string
из backend (не toISOString preprocessing).

CSS specificity rule #28: chip variants используют
:hover:not(:disabled):not(.--selected).

НЕ затронуты: photo upload (TZ 2.09), consent dialog (TZ 2.09),
Tier 2 markup (TZ 2.10), reference photos (Wave 3).

Verify-step output (rule #15) — в commit description ниже.

Tests: frontend +~18 (NumericInputForm + MeasurementHistoryList +
MeasurementsScreen suites).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Verify output как section после message.

---

## Definition of Done

- [ ] Verify-step выполнен, output 10 команд в commit report
- [ ] `patientApi.rehab.measurements.{postRom, postGirth, fetchAll}` методы есть и работают
- [ ] MeasurementsScreen открывается через TabBar или sub-section RoadmapScreen
- [ ] NumericInputForm:
  - Category switcher rom/girth
  - 8 ROM types + 7 girth types с правильными Cyrillic labels
  - Side selector L/R
  - Bilateral toggle создаёт payload с одинаковым session_id (verify в Network DevTools)
  - HBB categorical picker (19 позвонков) для `shoulder_hbb_categorical`
  - Frontend validation отлавливает invalid values без API call
  - Submit success вызывает onSaved + reset формы
- [ ] MeasurementHistoryList:
  - Empty state при отсутствии данных
  - Sort by measured_at DESC
  - Корректное форматирование значений (degrees, cm, HBB label)
  - measured_at отображается как `'YYYY-MM-DD'` string (НЕ ISO, timezone rule #27)
- [ ] Chip variants используют `:hover:not(:disabled):not(.--selected)` (rule #28)
- [ ] **Сценарий 1, 2, 3 smoke прошли** (open, single POST, bilateral)
- [ ] **Сценарий 4, 5 smoke прошли** (HBB + frontend validation)
- [ ] ~18 jest тестов зелёные
- [ ] **Frontend tests ≥322** (304 после 2.07 + ~18 новых)
- [ ] Backend tests 592 (без изменений)
- [ ] CSS — никаких CSS Modules orphans (memory #20: PatientDashboard pd-* global = legitimate)
- [ ] Mobile 375px — форма и history layout без overflow / horizontal scroll
- [ ] Коммит с текстом + Co-Authored-By trailer
- [ ] Ветка `wave-2/2.08-measurements-frontend-base` от `d55203c`
- [ ] **`git push` ТОЛЬКО после явного «ок» от Vadim'а**
- [ ] PR ⏸ frozen, стек становится **13 PR**:
      `... → d55203c(2.07) → [2.08]`

---

## После 2.08

**Следующий TZ:** `TZ_WAVE_2_09_photo_capture_consent.md`

Архитектор пишет 2.09 из:
- Verify-step output 2.08 (rule #15) — actual file paths, ChipGroup API, MeasurementsScreen структура
- Memory #24 (mount paths: `/api/patient-auth/photo-consent`, `/api/rehab/my/rom/:id/photo` GET+POST, id-based ownership)
- Drift #26 lesson: copy existing photo flow pattern если он есть в DiaryScreen, не изобретать

Scope 2.09:
- Photo capture button в MeasurementHistoryList (для каждого rom-entry с photo_url null — кнопка «Добавить фото»)
- File picker (`<input type="file" accept="image/*">`) + preview thumbnail
- ConsentDialog modal — legal text + «Принимаю» button → POST `/api/patient-auth/photo-consent`
- Если patient.photo_consent_at === null → consent dialog ПЕРЕД photo upload; иначе сразу upload
- POST photo → success → display thumbnail в карточке
- GET photo для просмотра (full-size modal) — click thumbnail
- Tests

**Backlog (deferred):**
- Bilateral pair visual grouping в history (карточки L+R рядом) — Wave 3 если UX request
- DELETE measurement UI — Wave 3
- Edit measurement UI — Wave 3
- Reference photos display from instructor — TZ 2.10 или Wave 3
- Tier 2 canvas markup UI (для AI-assisted) — TZ 2.10
- Patient progress charts (degrees over time) — Wave 3
- Export measurements to PDF/CSV — Wave 3
