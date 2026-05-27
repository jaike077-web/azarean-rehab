# TZ Wave 2 · Коммит 2.05 — Frontend DiaryScreen pain section + Pain Event SOS + History

**Дата:** 2026-05-18
**Версия:** v1
**Roadmap:** Wave 2 Block B Pain Tracking — фронтенд-половина
**Цель:** Patient-facing UI для structured pain tracking:
- **DiaryScreen** — расширить pain-секцией с UPSERT и pre-load существующей записи за сегодня (UX option C)
- **HomeScreen** — добавить footer link «Записать срочную боль» (UX option 2B — не FAB, не attention-grabbing)
- **PainEventForm** — modal для event SOS с dedup-aware UX
- **PainHistoryView** — фильтруемая история (daily/event/all)
- **Backend addition** — `GET /my/ops-alerts/recent` для frontend dedup detection

**Объём:** 6-8 часов
**Риск:** средний — много новых компонентов, UPSERT pre-load logic, дедуп UI, photo upload через `<input accept="image/*">` (camera+gallery).

**Применённые правила:**
- ✅ Аudit verbs UPPERCASE (если будут endpoints с audit)
- ✅ Lucide-react icons (НЕ emoji в UI)
- ✅ pd-* prefix для PatientDashboard (global CSS, legitimate — НЕ orphan)
- ✅ Atomic smoke (4-card format)
- ✅ Verify-step с **полным CHECK constraint dump** (правило после drift #9 в 2.04)

---

## Главные UX решения (зафиксированы от Vadim'а 2026-05-18)

| # | Что | Решение |
|---|---|---|
| 1 | Locations multi-select UI | A — chips с tap (текстовые). Body diagram (A+B hybrid) в Wave 3 backlog. |
| 2 | Pain Event SOS placement | B — footer link на HomeScreen (текстовая, не FAB), не attention-grabbing, чтобы не накапливать тревожность. |
| 3 | Trigger + pain_character | A — две **раздельные** секции, обе всегда видны (и в DiaryScreen daily, и в PainEventForm). |
| 4 | Photo upload | C — стандартный `<input accept="image/*">` (camera + gallery). |
| 5 | DiaryScreen UPSERT visualization | C — pre-load existing values если запись за сегодня уже есть, banner «📝 Сегодняшняя запись от HH:MM — обновите если изменилось». |
| Dedup UX | Honest UX | Да — backend endpoint `/my/ops-alerts/recent`, если за час был red-flag → banner в PainEventForm «⚠ Куратор уже уведомлён за последний час. Если боль усиливается — позвоните по [номер] напрямую». |

---

## Verify-step (с CHECK constraint dump — обязательно после drift #9)

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) Stack после 2.04
git log --oneline | head -7
# Ожидание: 5cb4216 → e6f11a9 → 98ca5f2 → 82544c0 → a6f7980 → af313b4 → main

# 2) ОБЯЗАТЕЛЬНЫЙ дамп ВСЕХ CHECK constraints на pain_entries
psql -U postgres -d azarean_rehab -c \
  "SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'pain_entries'::regclass AND contype = 'c';"
# Ожидание: vas_score CHECK 0..10, trigger_type CHECK IN (...8 значений), 
# pain_character array CHECK, возможно другие. Записать ВСЕ для frontend валидации.

# 3) Тот же дамп для ops_alerts
psql -U postgres -d azarean_rehab -c \
  "SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'ops_alerts'::regclass AND contype = 'c';"

# 4) Существующие PatientDashboard компоненты — переиспользуем
ls frontend/src/pages/PatientDashboard/components/
# Ожидание (из memory): AnimatedCheckmark, Card, CelebrationOverlay, ChipGroup,
#                       DifficultyScale, PainScale, ProgressRing, RestTimer, TabBar

# 5) PainScale — точный API (важно для DVPRS 2.0)
cat frontend/src/pages/PatientDashboard/components/PainScale.js | head -60
# Записать: какие props (value, onChange, min/max, etc.), есть ли labels/tooltips

# 6) ChipGroup — для multi-select
cat frontend/src/pages/PatientDashboard/components/ChipGroup.js | head -40
# Записать: props (options, value, onChange, multi/single), стили

# 7) DiaryScreen текущая структура
find frontend/src/pages/PatientDashboard -name "DiaryScreen*"
wc -l frontend/src/pages/PatientDashboard/screens/DiaryScreen.js 2>/dev/null
grep -n "useState\|useEffect" frontend/src/pages/PatientDashboard/screens/DiaryScreen.js | head -10
# Ожидание: видим текущую структуру. Расширяем pain-секцию НЕ ломая existing.

# 8) HomeScreen структура — куда добавлять footer link
find frontend/src/pages/PatientDashboard -name "HomeScreen*"
grep -n "function HomeScreen\|render\|return (" frontend/src/pages/PatientDashboard/screens/HomeScreen.js | head -10

# 9) Модалки — паттерн (если есть BaseModal или подобный)
grep -rn "function.*Modal\|class.*Modal" frontend/src/pages/PatientDashboard/components/ 2>/dev/null
ls frontend/src/components/*Modal* 2>/dev/null
# Ожидание: видим reusable modal pattern или нужно создать локальную

# 10) Photo upload — existing pattern?
grep -rn "input.*accept=\"image\|FormData\|multer" frontend/src/ 2>/dev/null | head -5
# Возможно есть существующий photo upload — переиспользуем pattern.
# Если нет — пишем новый, но в TZ 2.05 photo upload опционален (Vadim ответ С — гибрид)

# 11) Patient API client
grep -n "export const get\|export const create" frontend/src/services/api.js | head -20
# Узнать pattern naming — для consistency новых helpers

# 12) Существующий формат date display
grep -rn "toLocaleString\|date-fns\|moment" frontend/src/pages/PatientDashboard/ 2>/dev/null | head -5
# Ожидание: какой формат "HH:MM" использует проект

# 13) ВНИМАНИЕ pd-* prefix — legitimate global CSS
grep -rn "className=\"pd-" frontend/src/pages/PatientDashboard/screens/DiaryScreen.js | head -5
# Подтверждение: pd-* в PatientDashboard — НЕ orphan, а намеренный паттерн
```

**Если grep покажет:**
- `PainScale` не принимает `disabled` prop — добавь его (нужно для read-only режима если запись в будущем)
- `ChipGroup` поддерживает только single-select — нужен extension prop `multi: true`
- DiaryScreen уже большой — секционировать осторожно, не ломая existing UX
- Существующего Modal паттерна нет — создать локальную обёртку в `components/PatientModal.js`

---

## Зависимости

- 2.04 ⏸ (backend pain endpoints + ops_alerts) — обязательно
- Existing PatientDashboard components (PainScale, ChipGroup, Card) — переиспользуем
- Hot-fix #7 (toast position) — критично работает поверх PainEventForm modal

**Ветка:** `wave-2/05-pain-frontend` от `wave-2/04-pain-backend` (5cb4216)

---

## Что блокирует

- Block B полное закрытие (после 2.05 ⏸ Block B done)
- Pilot launch — без UI пациент не может пользоваться pain tracking'ом

---

## ❌ НЕ СОЗДАЁМ — переиспользуем existing!

| Артефакт | Используем существующий |
|---|---|
| ❌ `PainScale` | ✅ `frontend/src/pages/PatientDashboard/components/PainScale.js` (DVPRS 2.0) |
| ❌ `ChipGroup` | ✅ existing (с `multi: true` prop если нужен) |
| ❌ `Card` | ✅ existing |
| ❌ Toast | ✅ existing ToastContext (после hot-fix #7 работает поверх modal'ов) |

## ✅ СОЗДАЁМ

| Файл | Назначение |
|---|---|
| `frontend/src/pages/PatientDashboard/components/LocationsMultiSelect.js` | Wrapper над ChipGroup для locations (с red-flag иконкой) |
| `frontend/src/pages/PatientDashboard/components/TriggerSelect.js` | Single-select для trigger_type из 8 enum |
| `frontend/src/pages/PatientDashboard/components/PainCharacterSelect.js` | Multi-select для pain_character (ChipGroup wrapper) |
| `frontend/src/pages/PatientDashboard/components/PatientModal.js` | Reusable modal обёртка (если не нашли existing pattern) |
| `frontend/src/pages/PatientDashboard/components/PainEventForm.js` | Modal для srochnyj event entry |
| `frontend/src/pages/PatientDashboard/components/DailyPainSection.js` | Pain-секция inside DiaryScreen |
| `frontend/src/pages/PatientDashboard/components/PainHistoryView.js` | История с фильтром type |
| `frontend/src/pages/PatientDashboard/components/RecentRedFlagBanner.js` | Warning banner если dedup active |

## EXTEND

| Файл | Что |
|---|---|
| `backend/routes/rehab.js` | Добавить GET /my/ops-alerts/recent (~30 строк) |
| `backend/tests/__tests__/rehab.pain.test.js` | +3 теста для нового endpoint'а |
| `frontend/src/services/api.js` | +6 helpers (плоский pattern) |
| `frontend/src/pages/PatientDashboard/screens/DiaryScreen.js` | Интегрировать DailyPainSection |
| `frontend/src/pages/PatientDashboard/screens/HomeScreen.js` | Добавить footer link «Срочная боль» |
| `CLAUDE.md` | Обновить |

---

## Параллельная работа — координация

**ТРОГАЕМ:** см. выше

**НЕ ТРОГАТЬ:**
- ExerciseRunner v4 (LOCKED)
- Backend pain endpoints из 2.04 (только добавляем 1 новый /recent)
- Telegram alert flow (готов, не трогаем)
- Существующие PainScale/ChipGroup/Card компоненты (только wrappers)
- pd-* стили — добавляем новые pd-pain-* классы, существующие не трогаем

---

## Конкретная реализация

### A) Backend addition: `GET /api/rehab/my/ops-alerts/recent`

В `backend/routes/rehab.js` рядом с pain endpoints из 2.04:

```javascript
/**
 * GET /api/rehab/my/ops-alerts/recent
 * Wave 2 коммит 2.05 — для frontend dedup UX detection.
 * Возвращает recent red-flag alerts пациента за последний N часов (default 1).
 *
 * Frontend использует это перед открытием PainEventForm — если есть recent alert,
 * показывает banner «Куратор уже уведомлён за последний час».
 */
router.get('/my/ops-alerts/recent', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    let hours = parseInt(req.query.hours, 10);
    if (isNaN(hours) || hours < 1 || hours > 24) hours = 1;

    const { rows } = await query(
      `SELECT id, alert_type, severity, source_entity_id,
              telegram_attempted_at, created_at
       FROM ops_alerts
       WHERE patient_id = $1
         AND alert_type = 'red_flag_pain'
         AND created_at > NOW() - ($2 || ' hours')::INTERVAL
       ORDER BY created_at DESC`,
      [patientId, hours]
    );
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('GET /rehab/my/ops-alerts/recent error:', err);
    return res.status(500).json({ error: 'ServerError', message: 'Не удалось получить' });
  }
});
```

**Тесты** (extend `rehab.pain.test.js`):

```javascript
describe('GET /rehab/my/ops-alerts/recent (Wave 2 коммит 2.05)', () => {
  it('возвращает recent red-flag alerts за час по умолчанию', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 1, alert_type: 'red_flag_pain', severity: 'high', source_entity_id: 50, created_at: new Date() }
    ]});
    const res = await request(app).get('/api/rehab/my/ops-alerts/recent');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // Проверить что INTERVAL = 1 hour по умолчанию
    expect(db.query.mock.calls[0][1]).toContain(1);
  });

  it('hours param custom', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/rehab/my/ops-alerts/recent?hours=3');
    expect(db.query.mock.calls[0][1]).toContain(3);
  });

  it('hours param clamping (0 → 1, 99 → 24)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/rehab/my/ops-alerts/recent?hours=99');
    expect(db.query.mock.calls[0][1]).toContain(1);  // clamp вниз до default
    // (либо до 24 если clamp-up — Claude Code определит)
  });
});
```

### B) Frontend `services/api.js` — extensions

```javascript
// Wave 2 коммит 2.05 — pain client helpers (flat pattern, как existing)

export const getPainLocations = () =>
  api.get('/rehab/my/pain-locations');

export const getDailyPainToday = () =>
  api.get('/rehab/my/pain?type=daily&limit=1');  // pre-load existing

export const createDailyPain = (data) =>
  api.post('/rehab/my/pain/daily', data);

export const createPainEvent = (data) =>
  api.post('/rehab/my/pain/event', data);

export const getPainHistory = (params = {}) =>
  api.get('/rehab/my/pain', { params });

export const getRecentRedFlagAlerts = (hours = 1) =>
  api.get('/rehab/my/ops-alerts/recent', { params: { hours } });
```

### C) Constants для frontend (whitelist'ы)

В `frontend/src/pages/PatientDashboard/constants/pain.js` (НОВЫЙ файл):

```javascript
// Wave 2 коммит 2.05 — pain whitelist'ы (зеркало backend CHECK constraints)
// ВНИМАНИЕ: если backend изменит CHECK enum — здесь тоже обновить!
// VERIFY-STEP подтвердил эти значения 2026-05-18 для текущего schema.

export const TRIGGER_TYPE_OPTIONS = [
  { value: 'at_rest',         label: 'В покое' },
  { value: 'on_flexion',      label: 'При сгибании' },
  { value: 'on_extension',    label: 'При разгибании' },
  { value: 'on_walking',      label: 'При ходьбе' },
  { value: 'at_night',        label: 'Ночью' },
  { value: 'after_exercise',  label: 'После упражнений' },
  { value: 'on_lifting',      label: 'При подъёме тяжестей' },
  { value: 'other',           label: 'Другое' }
];

// PAIN_CHARACTER_OPTIONS — verify-step подтвердит точные значения backend whitelist
// Шаблон (Claude Code адаптирует под фактический):
export const PAIN_CHARACTER_OPTIONS = [
  { value: 'sharp',      label: 'Острая' },
  { value: 'dull',       label: 'Тупая' },
  { value: 'burning',    label: 'Жгучая' },
  { value: 'throbbing',  label: 'Пульсирующая' },
  { value: 'aching',     label: 'Ноющая' },
  { value: 'stabbing',   label: 'Колющая' },
  { value: 'tingling',   label: 'Покалывание' },
  { value: 'numb',       label: 'Онемение' }
];

export const VAS_MIN = 0;
export const VAS_MAX = 10;
export const NOTES_MAX_LEN = 1000;
export const TRIGGER_FREE_TEXT_MAX = 100;
export const MAX_LOCATIONS_PER_ENTRY = 16;
export const PHOTO_MAX_SIZE_MB = 5;
```

### D) Component: `LocationsMultiSelect.js`

```jsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';
// Wrapper над existing ChipGroup. Highlights red-flag locations иконкой.

export default function LocationsMultiSelect({ locations, value, onChange, error }) {
  // locations: [{ code, label, is_red_flag }]
  // value: array of codes
  // onChange: (newCodes[]) => void

  const toggle = (code) => {
    const newValue = value.includes(code)
      ? value.filter(c => c !== code)
      : [...value, code];
    onChange(newValue);
  };

  return (
    <div className="pd-pain-locations">
      <div className="pd-pain-locations__chips">
        {locations.map(loc => {
          const isSelected = value.includes(loc.code);
          return (
            <button
              key={loc.code}
              type="button"
              className={`pd-pain-loc-chip ${isSelected ? 'pd-pain-loc-chip--selected' : ''} ${loc.is_red_flag ? 'pd-pain-loc-chip--redflag' : ''}`}
              onClick={() => toggle(loc.code)}
              aria-pressed={isSelected}
            >
              {loc.is_red_flag && <AlertTriangle size={14} aria-label="Red flag локация" />}
              <span>{loc.label}</span>
            </button>
          );
        })}
      </div>
      {error && <div className="pd-pain-locations__error">{error}</div>}
    </div>
  );
}
```

**CSS (pd-* global):**
```css
.pd-pain-locations { /* container */ }
.pd-pain-locations__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pd-pain-loc-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 8px 14px; border-radius: 20px;
  background: var(--pd-surface-2); border: 1px solid var(--pd-border);
  cursor: pointer; font-size: 14px;
  transition: all 0.15s;
}
.pd-pain-loc-chip--selected {
  background: var(--pd-accent-teal); color: white; border-color: var(--pd-accent-teal);
}
.pd-pain-loc-chip--redflag {
  border-color: var(--pd-accent-coral);  /* coral border для red-flag, тонкий cue */
}
.pd-pain-loc-chip--redflag.pd-pain-loc-chip--selected {
  background: var(--pd-accent-coral); border-color: var(--pd-accent-coral);
}
```

### E) Component: `TriggerSelect.js` (single-select radio)

```jsx
import React from 'react';
import { TRIGGER_TYPE_OPTIONS } from '../constants/pain';

export default function TriggerSelect({ value, onChange, required = true, error }) {
  return (
    <fieldset className="pd-pain-trigger">
      <legend className="pd-pain-trigger__legend">
        Когда возникает? {required && <span className="pd-required">*</span>}
      </legend>
      <div className="pd-pain-trigger__options">
        {TRIGGER_TYPE_OPTIONS.map(opt => (
          <label key={opt.value} className="pd-pain-trigger__option">
            <input
              type="radio"
              name="trigger_type"
              value={opt.value}
              checked={value === opt.value}
              onChange={(e) => onChange(e.target.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {error && <div className="pd-pain-trigger__error">{error}</div>}
    </fieldset>
  );
}
```

### F) Component: `PainCharacterSelect.js` (multi-select)

```jsx
import React from 'react';
import { PAIN_CHARACTER_OPTIONS } from '../constants/pain';

export default function PainCharacterSelect({ value = [], onChange }) {
  const toggle = (val) => {
    onChange(value.includes(val) ? value.filter(v => v !== val) : [...value, val]);
  };
  return (
    <div className="pd-pain-character">
      <div className="pd-pain-character__label">Характер боли (можно несколько)</div>
      <div className="pd-pain-character__chips">
        {PAIN_CHARACTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`pd-pain-char-chip ${value.includes(opt.value) ? 'pd-pain-char-chip--selected' : ''}`}
            onClick={() => toggle(opt.value)}
            aria-pressed={value.includes(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### G) Component: `RecentRedFlagBanner.js`

```jsx
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { CURATOR_PHONE } from '../constants/pain';  // или из env

export default function RecentRedFlagBanner({ recentAlertsCount, lastAlertAt }) {
  if (recentAlertsCount === 0) return null;

  const minutesAgo = lastAlertAt
    ? Math.floor((Date.now() - new Date(lastAlertAt).getTime()) / 60000)
    : null;

  return (
    <div className="pd-pain-banner pd-pain-banner--warning" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>Куратор уже уведомлён{minutesAgo !== null ? ` ${minutesAgo} мин назад` : ''}.</strong>
        <p>
          Если ваше состояние ухудшается или появились новые симптомы — позвоните напрямую:
          <a href={`tel:${CURATOR_PHONE}`}>{CURATOR_PHONE}</a>
        </p>
      </div>
    </div>
  );
}
```

> **Замечание для Vadim'а:** `CURATOR_PHONE` — нужен реальный номер для пилота. Положи в `.env` как `REACT_APP_CURATOR_PHONE=+7900...` и читай через `process.env.REACT_APP_CURATOR_PHONE`.

### H) Component: `PainEventForm.js` (modal)

```jsx
import React, { useState, useEffect } from 'react';
import PatientModal from './PatientModal';
import PainScale from './PainScale';
import LocationsMultiSelect from './LocationsMultiSelect';
import TriggerSelect from './TriggerSelect';
import PainCharacterSelect from './PainCharacterSelect';
import RecentRedFlagBanner from './RecentRedFlagBanner';
import { Camera, Send } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import {
  getPainLocations, createPainEvent, getRecentRedFlagAlerts
} from '../../../services/api';
import { NOTES_MAX_LEN, TRIGGER_FREE_TEXT_MAX, PHOTO_MAX_SIZE_MB } from '../constants/pain';

export default function PainEventForm({ isOpen, onClose, onSubmitted }) {
  const [locations, setLocations] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState({ count: 0, lastAt: null });
  const [form, setForm] = useState({
    vas_score: null,
    location_codes: [],
    trigger_type: '',
    pain_character: [],
    notes: '',
    photo_file: null
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!isOpen) return;
    getPainLocations().then(setLocations).catch(() => toast.error('Не удалось загрузить локации'));
    getRecentRedFlagAlerts(1).then(data => {
      setRecentAlerts({
        count: data.length,
        lastAt: data[0]?.created_at || null
      });
    }).catch(() => { /* silent — это не блокер */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const validate = () => {
    const e = {};
    if (form.vas_score == null) e.vas_score = 'Укажите уровень боли';
    if (!form.location_codes.length) e.location_codes = 'Укажите хотя бы одну локацию';
    if (!form.trigger_type) e.trigger_type = 'Когда возникает боль?';
    if (form.notes.length > NOTES_MAX_LEN) e.notes = `≤ ${NOTES_MAX_LEN} символов`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // TODO: photo upload — если есть file, сначала POST на /uploads, получаем URL, потом передаём
      // Простой вариант для MVP — если photo_file есть, дёргаем helper uploadPhoto(photo_file) → url
      let photo_url = null;
      if (form.photo_file) {
        // Заглушка — реальная upload-логика в verify-step (или MVP без photo)
        // photo_url = await uploadPhoto(form.photo_file);
      }

      const payload = {
        vas_score: form.vas_score,
        location_codes: form.location_codes,
        trigger_type: form.trigger_type,
        pain_character: form.pain_character.length ? form.pain_character : null,
        notes: form.notes || null,
        photo_url
      };
      const result = await createPainEvent(payload);

      const isRedFlag = !!result.ops_alert_id;
      const dedupActive = recentAlerts.count > 0;

      if (isRedFlag && dedupActive) {
        toast.success('Запись о боли сохранена. Куратор уже был уведомлён за последний час.');
      } else if (isRedFlag) {
        toast.success('Запись о боли сохранена. Куратор получит срочное уведомление.');
      } else {
        toast.success('Запись о боли сохранена');
      }
      onSubmitted?.(result);
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PatientModal isOpen={isOpen} onClose={onClose} title="Срочная боль">
      <RecentRedFlagBanner recentAlertsCount={recentAlerts.count} lastAlertAt={recentAlerts.lastAt} />

      <div className="pd-pain-event-form">
        {/* VAS */}
        <div className="pd-pain-event-form__group">
          <label>Уровень боли (0-10) <span className="pd-required">*</span></label>
          <PainScale value={form.vas_score} onChange={(v) => setForm({ ...form, vas_score: v })} />
          {errors.vas_score && <div className="pd-error">{errors.vas_score}</div>}
        </div>

        {/* Locations */}
        <div className="pd-pain-event-form__group">
          <label>Где болит? <span className="pd-required">*</span></label>
          <LocationsMultiSelect
            locations={locations}
            value={form.location_codes}
            onChange={(codes) => setForm({ ...form, location_codes: codes })}
            error={errors.location_codes}
          />
        </div>

        {/* Trigger (single) */}
        <TriggerSelect
          value={form.trigger_type}
          onChange={(v) => setForm({ ...form, trigger_type: v })}
          error={errors.trigger_type}
        />

        {/* Pain character (multi) */}
        <PainCharacterSelect
          value={form.pain_character}
          onChange={(arr) => setForm({ ...form, pain_character: arr })}
        />

        {/* Notes */}
        <div className="pd-pain-event-form__group">
          <label>Заметка (опционально)</label>
          <textarea
            className="pd-pain-event-form__textarea"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            maxLength={NOTES_MAX_LEN}
            rows={3}
            placeholder="Опишите подробнее (опционально)"
          />
          {errors.notes && <div className="pd-error">{errors.notes}</div>}
        </div>

        {/* Photo */}
        <div className="pd-pain-event-form__group">
          <label htmlFor="pain-photo">
            <Camera size={16} /> Фото (опционально)
          </label>
          <input
            id="pain-photo"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > PHOTO_MAX_SIZE_MB * 1024 * 1024) {
                toast.error(`Фото больше ${PHOTO_MAX_SIZE_MB} MB`);
                return;
              }
              setForm({ ...form, photo_file: file });
            }}
          />
          {form.photo_file && (
            <div className="pd-pain-event-form__photo-name">{form.photo_file.name}</div>
          )}
        </div>

        {/* Actions */}
        <div className="pd-pain-event-form__actions">
          <button type="button" className="pd-btn pd-btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="pd-btn pd-btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Send size={16} /> {submitting ? 'Сохранение…' : 'Отправить'}
          </button>
        </div>
      </div>
    </PatientModal>
  );
}
```

### I) Component: `DailyPainSection.js` (внутри DiaryScreen)

```jsx
import React, { useState, useEffect } from 'react';
import PainScale from './PainScale';
import LocationsMultiSelect from './LocationsMultiSelect';
import TriggerSelect from './TriggerSelect';
import PainCharacterSelect from './PainCharacterSelect';
import { Edit3, Check } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { getPainLocations, getDailyPainToday, createDailyPain } from '../../../services/api';

export default function DailyPainSection() {
  const [locations, setLocations] = useState([]);
  const [existing, setExisting] = useState(null);  // pre-loaded today's entry
  const [form, setForm] = useState({
    vas_score: null, location_codes: [], notes: '',
    trigger_type: '', pain_character: []
  });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    getPainLocations().then(setLocations).catch(() => {});
    getDailyPainToday().then(data => {
      const today = data[0];
      if (today) {
        setExisting(today);
        // Pre-load form values (UX option C — Vadim's choice)
        setForm({
          vas_score: today.vas_score,
          location_codes: today.locations?.map(l => l.code) || [],
          notes: today.notes || '',
          trigger_type: today.trigger_type || '',
          pain_character: today.pain_character || []
        });
      }
    }).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (form.vas_score == null) {
      toast.error('Укажите уровень боли');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        vas_score: form.vas_score,
        location_codes: form.location_codes.length ? form.location_codes : undefined,
        notes: form.notes || null,
        pain_character: form.pain_character.length ? form.pain_character : null
        // Note: trigger_type не в daily, или в daily? Решить — пока опускаю в daily.
        // Если daily использует trigger тоже — добавить в payload.
      };
      const result = await createDailyPain(payload);
      setExisting(result);
      toast.success(existing ? 'Сегодняшняя запись обновлена' : 'Запись сохранена');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Не удалось сохранить');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="pd-daily-pain">
      <h2 className="pd-daily-pain__heading">Боль сегодня</h2>

      {existing && (
        <div className="pd-daily-pain__existing-banner">
          <Edit3 size={16} />
          <span>
            Сегодняшняя запись от {new Date(existing.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} —
            обновите если изменилось
          </span>
        </div>
      )}

      <div className="pd-daily-pain__form">
        <PainScale value={form.vas_score} onChange={(v) => setForm({ ...form, vas_score: v })} />
        <LocationsMultiSelect
          locations={locations}
          value={form.location_codes}
          onChange={(c) => setForm({ ...form, location_codes: c })}
        />
        <TriggerSelect
          value={form.trigger_type}
          onChange={(v) => setForm({ ...form, trigger_type: v })}
          required={false}  // в daily опциональный
        />
        <PainCharacterSelect
          value={form.pain_character}
          onChange={(arr) => setForm({ ...form, pain_character: arr })}
        />
        <textarea
          className="pd-daily-pain__notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Заметка (опционально)"
          rows={2}
        />
        <button
          className="pd-btn pd-btn--primary pd-daily-pain__submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          <Check size={16} />
          {submitting ? 'Сохранение…' : (existing ? 'Обновить' : 'Сохранить')}
        </button>
      </div>

      <a
        href="#pain-event"
        className="pd-daily-pain__sos-link"
        onClick={(e) => {
          e.preventDefault();
          // Триггерим открытие PainEventForm — координация через context или prop
          window.dispatchEvent(new CustomEvent('openPainEvent'));
        }}
      >
        Срочная боль прямо сейчас? Использовать форму срочной боли →
      </a>
    </section>
  );
}
```

### J) HomeScreen footer link (UX 2B)

В `frontend/src/pages/PatientDashboard/screens/HomeScreen.js` добавить в самый низ render'а (после основных карточек):

```jsx
{/* Wave 2 коммит 2.05 — Pain Event SOS footer link (UX option 2B) */}
<footer className="pd-home__pain-sos-footer">
  <button
    type="button"
    className="pd-home__pain-sos-link"
    onClick={() => setIsPainEventOpen(true)}
  >
    У вас резкая боль и нужна срочная связь с куратором? <span>Записать pain event →</span>
  </button>
</footer>

<PainEventForm
  isOpen={isPainEventOpen}
  onClose={() => setIsPainEventOpen(false)}
  onSubmitted={() => { /* можно обновить historyView если нужно */ }}
/>
```

CSS (deliberate "не attention-grabbing"):
```css
.pd-home__pain-sos-footer {
  margin-top: 40px;
  padding: 20px;
  text-align: center;
  border-top: 1px solid var(--pd-border-soft);
}
.pd-home__pain-sos-link {
  background: transparent;
  border: none;
  color: var(--pd-text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 8px 12px;
}
.pd-home__pain-sos-link span {
  color: var(--pd-accent-teal);  /* акцент только на действии */
  font-weight: 500;
}
.pd-home__pain-sos-link:hover {
  background: var(--pd-surface-hover);
  border-radius: 8px;
}
```

### K) DiaryScreen integration

В `frontend/src/pages/PatientDashboard/screens/DiaryScreen.js`:

```jsx
import DailyPainSection from '../components/DailyPainSection';
import PainHistoryView from '../components/PainHistoryView';
import { useState } from 'react';

// ... existing DiaryScreen content ...

return (
  <div className="pd-diary">
    {/* existing DiaryScreen content — НЕ ТРОГАТЬ */}

    {/* Wave 2 коммит 2.05 — Pain section */}
    <DailyPainSection />

    {/* History toggle */}
    <details className="pd-diary__pain-history-toggle">
      <summary>История боли</summary>
      <PainHistoryView />
    </details>
  </div>
);
```

### L) PainHistoryView (минимум для MVP)

```jsx
import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getPainHistory } from '../../../services/api';

export default function PainHistoryView() {
  const [type, setType] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPainHistory({ type, limit: 30 })
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [type]);

  return (
    <div className="pd-pain-history">
      <div className="pd-pain-history__filter">
        {[['all', 'Все'], ['daily', 'Дневник'], ['event', 'Срочные']].map(([v, l]) => (
          <button
            key={v}
            type="button"
            className={`pd-pain-history__filter-btn ${type === v ? 'pd-pain-history__filter-btn--active' : ''}`}
            onClick={() => setType(v)}
          >
            {l}
          </button>
        ))}
      </div>

      {loading && <div className="pd-pain-history__loading">Загрузка…</div>}
      {!loading && entries.length === 0 && (
        <div className="pd-pain-history__empty">Пока нет записей</div>
      )}

      <ul className="pd-pain-history__list">
        {entries.map(e => (
          <li key={e.id} className="pd-pain-history__item">
            <div className="pd-pain-history__date">
              {new Date(e.created_at).toLocaleString('ru-RU')}
              {e.is_event && <span className="pd-badge pd-badge--event">Событие</span>}
              {e.red_flag_triggered && <AlertTriangle size={14} className="pd-pain-history__redflag" />}
            </div>
            <div className="pd-pain-history__vas">ВАШ: {e.vas_score}/10</div>
            {e.locations?.length > 0 && (
              <div className="pd-pain-history__locations">
                {e.locations.map(l => l.label).join(', ')}
              </div>
            )}
            {e.notes && <div className="pd-pain-history__notes">{e.notes}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Mock-based тесты

### `frontend/src/pages/PatientDashboard/components/__tests__/PainEventForm.test.js` (НОВЫЙ)

~8-10 тестов: render, validation errors, locations multi-select, trigger required, photo upload, submit success (no red-flag), submit success (red-flag with banner), submit success (red-flag + dedup active → другой toast text), submit error.

### `DailyPainSection.test.js` (НОВЫЙ)

~6-8 тестов: empty render, pre-load existing entry с banner, submit creates, submit updates existing.

### `PainHistoryView.test.js` (НОВЫЙ)

~4 теста: render with entries, filter type=daily, filter type=event, empty state.

### Backend `rehab.pain.test.js` extend

+3 теста для GET /my/ops-alerts/recent (см. секция A выше).

**Итого +21-25 frontend тестов + 3 backend.**

---

## NOT TOUCH

- ExerciseRunner v4 (LOCKED)
- Existing PainScale, ChipGroup, Card компоненты
- Backend pain endpoints из 2.04 (только дoбавляем 1 endpoint /recent)
- TabBar
- pd-* существующие классы (только добавляем pd-pain-* и pd-daily-pain__*)
- ToastContext (после hot-fix #7 уже работает поверх modal'ов)

---

## Smoke test (4-card format)

### Сценарий 1 — DiaryScreen empty + создание daily

```
Шаг 1.1 — Open DiaryScreen без существующей записи
├─ Где: http://localhost:3001/login → patient avi707@mail.ru/Test1234
├─ Что найти: TabBar → Дневник
├─ Что сделать: открыть, посмотреть Pain section
└─ Что увидеть: empty form, без banner, кнопка «Сохранить» (не «Обновить»)

Шаг 1.2 — Заполнить и сохранить
├─ Где: pain секция DiaryScreen
├─ Что найти: VAS slider, locations chips, trigger radio, character chips, notes
├─ Что сделать: VAS=4, выбрать knee_anterior, trigger=after_exercise, notes="нормально"
└─ Что увидеть: после save — toast «Запись сохранена», форма НЕ сбрасывается,
                появился banner «Сегодняшняя запись от HH:MM», кнопка теперь «Обновить»
```

### Сценарий 2 — DiaryScreen pre-load + UPSERT

```
Шаг 2.1 — Reload страницы
├─ Где: DiaryScreen после 1.2
├─ Что сделать: F5 reload
└─ Что увидеть: банер «Сегодняшняя запись от HH:MM» сразу, форма pre-filled
                со значениями из 1.2 (VAS=4, knee_anterior selected, и т.д.)

Шаг 2.2 — Изменить и submit (UPSERT)
├─ Где: pain section
├─ Что сделать: изменить VAS на 6, notes на "ухудшилось", click «Обновить»
└─ Что увидеть: toast «Сегодняшняя запись обновлена», banner timestamp не меняется
                (created_at прежний), форма с новыми значениями
```

### Сценарий 3 — **ГЛАВНЫЙ** — Pain Event SOS с red-flag + Telegram

```
Шаг 3.1 — Открыть HomeScreen, найти SOS link
├─ Где: TabBar → Главная
├─ Что найти: scroll вниз, footer link «У вас резкая боль...»
├─ Что сделать: проверить что link НЕ кричащий (не FAB, не красный, не top-of-screen)
└─ Что увидеть: маленькая текстовая ссылка внизу страницы, "Записать pain event" с
                акцентом (teal цвет), но без attention-grabbing visual

Шаг 3.2 — Открыть PainEventForm
├─ Где: HomeScreen footer
├─ Что сделать: click на link
└─ Что увидеть: modal открыт, заголовок «Срочная боль», нет recent red-flag banner
                (первый раз)

Шаг 3.3 — Заполнить с red-flag locations
├─ Где: PainEventForm
├─ Что найти: VAS slider, locations, trigger, character, notes, photo
├─ Что сделать: VAS=8, выбрать calf_posterior (red-flag), trigger=on_walking,
│              pain_character=[sharp, throbbing], notes="икра болит и отёк"
└─ Что увидеть: calf_posterior chip с AlertTriangle иконкой и coral border,
                все поля заполнены, validation green

Шаг 3.4 — Submit + Telegram
├─ Где: PainEventForm
├─ Что сделать: click «Отправить»
└─ Что увидеть:
   ✓ Loading state на кнопке
   ✓ Через 1-2 сек — toast «Запись о боли сохранена. Куратор получит срочное уведомление.»
   ✓ Toast виден ПОВЕРХ модалки (hot-fix #7 работает)
   ✓ Modal закрылся
   ✓ В Telegram пришло 🚨 RED FLAG сообщение
```

### Сценарий 4 — **ГЛАВНЫЙ DEDUP UX** — повторный red-flag с banner

```
Шаг 4.1 — В течение часа после 3.4, открыть PainEventForm заново
├─ Где: HomeScreen → footer link
├─ Что сделать: click → modal opens
└─ Что увидеть:
   ⚠ В верху модалки виден WARNING BANNER:
     «Куратор уже уведомлён N мин назад. Если состояние ухудшается —
      позвоните напрямую: +7XXXXXX»
   ✓ Форма НЕ заблокирована — можно отправить ещё одну запись

Шаг 4.2 — Submit повторный red-flag entry
├─ Где: PainEventForm с banner'ом
├─ Что сделать: повторить заполнение с calf_posterior + submit
└─ Что увидеть:
   ✓ Toast с ДРУГИМ текстом: «Запись о боли сохранена. Куратор уже был уведомлён
     за последний час.» (НЕ «получит срочное уведомление»)
   ✓ В Telegram НЕ приходит повторное сообщение (dedup в utils/opsAlert.js)
   ✓ В psql: pain_entries.id новый, ops_alerts новый, но Telegram silent
```

### Сценарий 5 — Photo upload (camera + gallery)

```
Шаг 5.1 — Mobile (DevTools 375px)
├─ Где: DevTools Device Toolbar, iPhone SE
├─ Что найти: PainEventForm open, поле "Фото"
├─ Что сделать: tap на input file
└─ Что увидеть: native iOS-style prompt: Camera / Photo Library / Browse
                (на реальном устройстве; в DevTools — file picker)

Шаг 5.2 — Desktop
├─ Где: тот же form на desktop
├─ Что сделать: click на input file
└─ Что увидеть: file picker → выбрать файл < 5MB
                после выбора — имя файла отображается под input'ом

Шаг 5.3 — Файл > 5MB
├─ Что сделать: выбрать большой файл
└─ Что увидеть: toast «Фото больше 5 MB», файл не принят
```

### Сценарий 6 — History view с filter

```
Шаг 6.1 — Open history
├─ Где: DiaryScreen, scroll до «История боли», click expand
├─ Что увидеть: list of entries (все типы), бейджи «Событие» на is_event=true,
                AlertTriangle иконка на red_flag_triggered=true

Шаг 6.2 — Filter daily
├─ Что сделать: click кнопка «Дневник» в filter
└─ Что увидеть: только записи без «Событие» бейджа

Шаг 6.3 — Filter event
├─ Что сделать: click «Срочные»
└─ Что увидеть: только записи с «Событие» бейджем
```

### Сценарий 7 — Toast viewable поверх PainEventForm (hot-fix #7 regression check)

```
Шаг 7.1 — Trigger toast в открытой modal
├─ Где: PainEventForm с заполнением
├─ Что сделать: submit без vas_score (validation error)
└─ Что увидеть: toast «Укажите уровень боли» (или error в форме) виден
                ПОВЕРХ модалки, не за ней. Этот шаг — sanity check что hot-fix #7
                продолжает работать после добавления новых modal'ов.
```

---

## Файлы — итоговый чеклист

### Создать (8 frontend + 0 backend новых файлов)

**Frontend:**
- `frontend/src/pages/PatientDashboard/constants/pain.js`
- `frontend/src/pages/PatientDashboard/components/LocationsMultiSelect.js`
- `frontend/src/pages/PatientDashboard/components/TriggerSelect.js`
- `frontend/src/pages/PatientDashboard/components/PainCharacterSelect.js`
- `frontend/src/pages/PatientDashboard/components/PatientModal.js` (если existing нет)
- `frontend/src/pages/PatientDashboard/components/PainEventForm.js`
- `frontend/src/pages/PatientDashboard/components/DailyPainSection.js`
- `frontend/src/pages/PatientDashboard/components/RecentRedFlagBanner.js`
- `frontend/src/pages/PatientDashboard/components/PainHistoryView.js`
- `frontend/src/pages/PatientDashboard/components/__tests__/PainEventForm.test.js`
- `frontend/src/pages/PatientDashboard/components/__tests__/DailyPainSection.test.js`
- `frontend/src/pages/PatientDashboard/components/__tests__/PainHistoryView.test.js`

### Изменить

- `backend/routes/rehab.js` (+~30 строк GET /my/ops-alerts/recent)
- `backend/tests/__tests__/rehab.pain.test.js` (+3 теста)
- `frontend/src/services/api.js` (+6 helpers)
- `frontend/src/pages/PatientDashboard/screens/DiaryScreen.js` (integrate DailyPainSection)
- `frontend/src/pages/PatientDashboard/screens/HomeScreen.js` (add SOS footer link)
- `frontend/src/pages/PatientDashboard/styles.css` (или соответствующий — добавить pd-pain-* + pd-daily-pain__* классы)
- `frontend/.env.example` (+ `REACT_APP_CURATOR_PHONE`)
- `CLAUDE.md`

### НЕ ТРОГАТЬ

- ExerciseRunner v4
- Existing PainScale, ChipGroup, Card
- Backend pain endpoints из 2.04
- TabBar
- pd-* existing классы

---

## Текст коммита

```
feat(patient): Wave 2 — DiaryScreen pain section + Pain Event SOS + History

Wave 2 коммит 2.05 — Block B Pain Tracking frontend (closing Block B).

UX решения (от Vadim'a):
- Locations multi-select: chips (A). Body diagram — Wave 3 backlog.
- Pain Event SOS: footer link на HomeScreen (B), не FAB, не attention-grabbing.
- Trigger + pain_character: two separate sections, always visible (A).
- Photo upload: <input accept="image/*"> (C — camera + gallery).
- DiaryScreen UPSERT: pre-load existing today entry с banner.
- Dedup honest UX: warning banner если за последний час был red-flag.

Backend:
- routes/rehab.js +GET /my/ops-alerts/recent — для frontend dedup detection.

Frontend (новые components):
- DailyPainSection — pain секция inside DiaryScreen с pre-load + UPSERT
- PainEventForm — modal для event SOS с RecentRedFlagBanner
- LocationsMultiSelect — chips с AlertTriangle для red-flag локаций
- TriggerSelect — radio single-select (8 enum values)
- PainCharacterSelect — multi-select chips (8 enum values)
- RecentRedFlagBanner — warning если recent alert exists
- PainHistoryView — фильтруемая история (all/daily/event)
- PatientModal — reusable обёртка (если existing pattern не нашлось)

Frontend (extensions):
- DiaryScreen — DailyPainSection + PainHistoryView toggle
- HomeScreen — footer SOS link
- services/api.js +6 helpers
- constants/pain.js — TRIGGER_TYPE_OPTIONS, PAIN_CHARACTER_OPTIONS (mirror
  backend CHECK constraints — verify-step подтверждены)

Переиспользует existing components:
- PainScale (DVPRS 2.0)
- ChipGroup
- Card
- ToastContext (после hot-fix #7 работает поверх modal'ов)

Tests: +3 backend (recent alerts) + 18-25 frontend (PainEventForm/
DailyPainSection/PainHistoryView)

Закрывает Block B Pain Tracking. Stack теперь 7 PR'ов готовы к batch merge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**CLAUDE.md:**
- «Запуск проекта → .env (frontend)» — добавить `REACT_APP_CURATOR_PHONE`
- «API endpoints → Rehab» — строка GET /my/ops-alerts/recent
- «PatientDashboard → components» — список новых компонентов
- «Завершённые исправления» — запись:
  > **Wave 2 коммит 2.05** — Pain frontend. DailyPainSection UPSERT + PainEventForm SOS modal + dedup-aware UX. Closes Block B.

**Memory:**
- `wave_2_progress.md` — 2.05 ⏸, SHA, метрики, smoke результат
- Backlog добавление: «Body diagram locations selection (Wave 3 — A+B hybrid)»

---

## Definition of Done

- [ ] Verify-step выполнен с **полным CHECK constraint dump** (pain_entries + ops_alerts) — все enum values записаны
- [ ] Existing PainScale + ChipGroup + Card переиспользуются (НЕ дублированы)
- [ ] 8 новых компонентов созданы
- [ ] Backend GET /my/ops-alerts/recent работает (smoke + 3 теста)
- [ ] frontend/.env.example содержит REACT_APP_CURATOR_PHONE placeholder
- [ ] DiaryScreen: empty render → save → банner pre-load
- [ ] DiaryScreen: F5 reload → pre-load работает (form pre-filled)
- [ ] DiaryScreen UPSERT: повторный submit обновляет тот же id, banner timestamp не меняется
- [ ] HomeScreen footer SOS link: НЕ attention-grabbing (не красный, не FAB, в самом низу)
- [ ] PainEventForm: validation errors показываются, locations с red-flag индикатор
- [ ] **Главный**: PainEventForm с calf_posterior → реальный Telegram alert получен + dedup-NOT-active toast («Куратор получит срочное уведомление»)
- [ ] **Главный dedup UX**: повторный red-flag → RecentRedFlagBanner показан в form + toast другой («Куратор уже был уведомлён за последний час»)
- [ ] Telegram НЕ дублируется при повторе (dedup в utils/opsAlert.js)
- [ ] Photo upload: < 5MB OK, > 5MB → error toast
- [ ] PainHistoryView: фильтр all/daily/event работает, бейдж «Событие» на is_event=true, AlertTriangle на red_flag_triggered=true
- [ ] Toast виден поверх PainEventForm modal (hot-fix #7 regression check)
- [ ] Light + dark тема — все компоненты читаются (regression)
- [ ] Mobile 375px — формы помещаются, нет horizontal scroll
- [ ] Все ~21-25 frontend тестов + 3 backend зелёные
- [ ] Existing тесты не сломаны (backend после 2.04+2.05: ~525, frontend после 2.05: ~290-295)
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан с указанным текстом + Co-Authored-By
- [ ] `wave_2_progress.md` — 2.05 ⏸, **Block B closed**
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR от ветки `wave-2/05-pain-frontend`, висит до batch merge

---

## После 2.05

**Block B Pain Tracking закрыт.** Stack:
```
af313b4 → a6f7980 → 82544c0 → 98ca5f2 → e6f11a9 → 5cb4216 → <2.05 sha>
[2.01]    [2.02]    [2.03]    [HF7]      [HF8]      [2.04]     [2.05]
```

**Block C Measurements Tier 1+2** — следующий:
- 2.06 — Backend measurements endpoints + photo upload infrastructure
- 2.07 — Frontend Tier 1 (numeric inputs + reference photos + bilateral flow)
- 2.08 — Tier 2 canvas markup UI

**Backlog от 2.05:**
- Body diagram locations selection (A+B hybrid) — Wave 3
- DB-level dedup для ops_alerts (helper bedside)
- Admin UI для ops_alerts triage (если поток алертов на пилоте окажется большой)
- pain_character / trigger_type справочные таблицы с multi-locale labels — Wave 3
