# TZ Wave 2 · Hot-fix #9 v2 — pain_character VARCHAR → TEXT[] (backend + frontend)

**Дата:** 2026-05-18
**Версия:** v2 — полный rewrite после drift #12 (v1 ассумировала backend уже TEXT[], реальность — VARCHAR(50))
**Тип:** pre-Block-C migration + UX fix
**Цель:** Backend rewrite `pain_entries.pain_character` из VARCHAR(50) → TEXT[]. Backend и frontend поддерживают multi-select для клинической точности. Pre-pilot — БД пустая или минимальная, irreversible migration безопасна.
**Объём:** 1.5-2.5 часа
**Риск:** средний — type conversion column type не реверсируется без backup. **Обязательный pg_dump перед миграцией.**

**Клинически:** pain quality часто комбинированное (sharp + burning при cervical radiculopathy, throbbing + aching при vascular pathology). Single VARCHAR теряет это.

---

## ⚠️ SAFETY FIRST — pg_dump backup ОБЯЗАТЕЛЬНО

Перед запуском миграции:

```bash
mkdir -p /tmp/azarean_backups
pg_dump -U postgres azarean_rehab > /tmp/azarean_backups/pre_hf9_$(date +%Y%m%d_%H%M%S).sql
ls -la /tmp/azarean_backups/
```

**Если миграция упадёт или после неё что-то сломается — restore:**

```bash
dropdb -U postgres azarean_rehab
createdb -U postgres azarean_rehab
psql -U postgres azarean_rehab < /tmp/azarean_backups/pre_hf9_YYYYMMDD_HHMMSS.sql
```

Записать в отчёт path до backup-файла. **Не удалять backup до закрытия Wave 2 batch merge.**

---

## Verify-step с ОБЯЗАТЕЛЬНЫМ output в отчёт (новое правило 2026-05-18)

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) ОБЯЗАТЕЛЬНО — приложить вывод в отчёт архитектору
psql -U postgres -d azarean_rehab -c "\d pain_entries" > /tmp/verify_pain_entries.txt
cat /tmp/verify_pain_entries.txt
# Ожидание: pain_character | character varying(50) | (текущее состояние ДО миграции)

# 2) Точное имя CHECK constraint для pain_character
psql -U postgres -d azarean_rehab -c \
  "SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'pain_entries'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%pain_character%';" > /tmp/verify_constraint.txt
cat /tmp/verify_constraint.txt
# КРИТИЧНО: записать точное имя constraint'а в отчёт.
# Возможные имена: pain_entries_pain_character_check / chk_pain_character / custom.
# Миграция ниже использует это имя через DROP CONSTRAINT IF EXISTS, но если есть NOT NULL
# или другие constraints — учесть.

# 3) Существующие данные — если есть pain entries с pain_character заполненным
psql -U postgres -d azarean_rehab -c \
  "SELECT COUNT(*) AS total,
          COUNT(pain_character) AS with_character
   FROM pain_entries;" > /tmp/verify_data.txt
cat /tmp/verify_data.txt
# Если COUNT > 0 — миграция должна корректно конвертировать single VARCHAR → ARRAY[single]
# Если COUNT = 0 — migration trivial

# 4) Точная сигнатура существующих validation locations в backend
grep -n "PAIN_CHARACTER_VALUES\|pain_character" backend/routes/rehab.js | head -20
# Запиши строки где валидация — мы их перепишем
# Ожидание: 2 endpoint валидации (POST /pain/daily + /pain/event) + triggerRedFlagAlert helper

# 5) Frontend импорты PAIN_CHARACTER_OPTIONS — где используются (для контекста)
grep -rn "PAIN_CHARACTER_OPTIONS\|PainCharacterSelect" frontend/src/pages/PatientDashboard/ | head -10

# 6) Schema constraint name для UNIQUE on pain_entries (на всякий случай — миграция может задеть)
psql -U postgres -d azarean_rehab -c "\d pain_entries" | grep -E "UNIQUE|CHECK|INDEX"

# 7) Проверить что в отчёте архитектору можно приложить полный output \d
echo "=== Pre-migration verify outputs collected:" 
ls -la /tmp/verify_*.txt
```

**В отчёт обязательно вернуть:**
- Содержимое `/tmp/verify_pain_entries.txt` (полный `\d pain_entries`)
- Содержимое `/tmp/verify_constraint.txt` (точное имя CHECK constraint + def)
- Содержимое `/tmp/verify_data.txt` (COUNT строк)
- Path до pg_dump backup

Это новое процессное правило после drift #12 — verify должен **доходить до архитектора в отчёте**, не оставаться в local context Claude Code.

---

## Зависимости

После 2.05 ⏸ (commit a2ecad6). Hot-fix #9 v2 поверх.

**Ветка:** `wave-2/hotfix-09-pain-character-multi` от `wave-2/05-pain-frontend` (a2ecad6).

---

## Параллельная работа — координация

**ТРОГАЕМ:**

| Файл | Что |
|---|---|
| `backend/database/migrations/20260520_pain_character_to_array.sql` | НОВЫЙ — idempotent migration |
| `backend/routes/rehab.js` | EXTEND — 2 endpoint validation + `triggerRedFlagAlert` label loop (~30 строк изменений) |
| `backend/tests/__tests__/rehab.pain.test.js` | UPDATE — pain_character assertions на array + 1 invalid-element test |
| `backend/tests/__tests__/wave2_schema.test.js` | UPDATE — sanity test для TEXT[] column |
| `frontend/src/pages/PatientDashboard/components/PainCharacterSelect.js` | Multi-select: value array, onChange(array) |
| `frontend/src/pages/PatientDashboard/components/PainEventForm.js` | State array + payload array |
| `frontend/src/pages/PatientDashboard/components/DailyPainSection.js` | State array + pre-load array + payload array |
| `frontend/src/pages/PatientDashboard/components/__tests__/PainEventForm.test.js` | UPDATE assertions + 2 multi-toggle tests |
| `frontend/src/pages/PatientDashboard/components/__tests__/DailyPainSection.test.js` | UPDATE assertions |
| `CLAUDE.md` | Migration list + completed fixes |

**НЕ ТРОГАТЬ:**
- Pain endpoints structural logic (только validation block + INSERT param)
- Other Wave 2 backend
- LOCKED-зоны
- Other frontend
- `pain_entries` other columns / constraints

---

## Конкретная реализация

### A) Migration: `backend/database/migrations/20260520_pain_character_to_array.sql`

```sql
-- Wave 2 Hot-fix #9 — pain_character VARCHAR(50) → TEXT[]
-- Идемпотентно — re-run после миграции пропускает.
-- ВАЖНО: точное имя CHECK constraint берётся из verify-step. Если в твоей БД
-- constraint называется иначе чем 'pain_entries_pain_character_check' — адаптируй.

BEGIN;

DO $$
DECLARE
  v_column_type TEXT;
  v_constraint_name TEXT;
BEGIN
  -- 1. Проверить текущий тип колонки
  SELECT data_type INTO v_column_type
  FROM information_schema.columns
  WHERE table_name = 'pain_entries' AND column_name = 'pain_character';

  IF v_column_type = 'character varying' THEN
    -- 2. Найти и удалить старый CHECK constraint (имя может варьироваться)
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'pain_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pain_character%'
    LIMIT 1;

    IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE pain_entries DROP CONSTRAINT %I', v_constraint_name);
      RAISE NOTICE 'Dropped old CHECK constraint: %', v_constraint_name;
    END IF;

    -- 3. Преобразовать column type VARCHAR → TEXT[]
    ALTER TABLE pain_entries
      ALTER COLUMN pain_character TYPE TEXT[]
      USING (
        CASE
          WHEN pain_character IS NULL THEN NULL
          WHEN pain_character::text = '' THEN NULL
          ELSE ARRAY[pain_character::TEXT]
        END
      );

    RAISE NOTICE 'Migrated pain_character VARCHAR(50) → TEXT[]';
  ELSE
    RAISE NOTICE 'pain_character already type %, skipping conversion', v_column_type;
  END IF;
END $$;

-- 4. Добавить новый CHECK constraint поэлементно
-- (idempotent — DROP IF EXISTS перед ADD)
ALTER TABLE pain_entries DROP CONSTRAINT IF EXISTS chk_pain_character_array;
ALTER TABLE pain_entries ADD CONSTRAINT chk_pain_character_array
CHECK (
  pain_character IS NULL OR (
    array_length(pain_character, 1) > 0
    AND pain_character <@ ARRAY['aching', 'sharp', 'burning', 'shooting', 'throbbing', 'other']::TEXT[]
  )
);

COMMIT;

-- Verification queries (run after migration):
-- 1. Тип колонки = ARRAY
--    SELECT data_type FROM information_schema.columns
--    WHERE table_name='pain_entries' AND column_name='pain_character';
--    Ожидание: ARRAY
-- 2. CHECK constraint существует
--    SELECT conname, pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid='pain_entries'::regclass AND contype='c'
--    AND pg_get_constraintdef(oid) LIKE '%pain_character%';
--    Ожидание: chk_pain_character_array с array_length + <@ check
-- 3. Old data preserved as 1-element arrays
--    SELECT id, pain_character FROM pain_entries WHERE pain_character IS NOT NULL LIMIT 5;
```

**Sanity test в `wave2_schema.test.js`:**

```javascript
describe('Wave 2 Hot-fix #9 — pain_character TEXT[] migration', () => {
  it('pain_character — массив TEXT', async () => {
    // Mock: query за data_type
    db.query.mockResolvedValueOnce({ rows: [{ data_type: 'ARRAY' }] });
    // (запрос делает сам тест — Claude Code адаптирует)
  });
  // ... или прямо через psql если интеграционно
});
```

### B) Backend `routes/rehab.js` — validation + INSERT param

**Изменения в POST /my/pain/daily (validation block):**

```javascript
// БЫЛО (single string):
// if (pain_character !== undefined && pain_character !== null) {
//   if (typeof pain_character !== 'string' || !PAIN_CHARACTER_VALUES.includes(pain_character)) {
//     return res.status(400).json({ error: 'ValidationError', message: '...' });
//   }
// }

// СТАЛО (array):
if (pain_character !== undefined && pain_character !== null) {
  if (!Array.isArray(pain_character)) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'pain_character должен быть массивом'
    });
  }
  if (pain_character.length === 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'pain_character пустой массив — передавай null'
    });
  }
  const invalid = pain_character.filter(v => !PAIN_CHARACTER_VALUES.includes(v));
  if (invalid.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: `Неизвестные значения pain_character: ${invalid.join(', ')}`
    });
  }
}
```

**INSERT param** — не меняется текстово, но семантика другая:
```javascript
// INSERT pain_entries ... VALUES (..., $N, ...) [..., pain_character ?? null, ...]
// PostgreSQL node pg драйвер принимает JS Array как TEXT[] напрямую
// pain_character всегда массив или null
```

**То же самое в POST /my/pain/event** — повторить тот же validation block.

**`triggerRedFlagAlert` helper — label loop для Telegram:**

```javascript
// БЫЛО (single):
// const characterLine = pain_entry.pain_character
//   ? `\nХарактер: ${PAIN_CHARACTER_LABELS[pain_entry.pain_character] || pain_entry.pain_character}`
//   : '';

// СТАЛО (array):
const characterLine = (Array.isArray(pain_entry.pain_character) && pain_entry.pain_character.length > 0)
  ? `\nХарактер: ${pain_entry.pain_character.map(c => PAIN_CHARACTER_LABELS[c] || c).join(', ')}`
  : '';
```

(Если `PAIN_CHARACTER_LABELS` нет — Claude Code в verify-step проверит, при необходимости добавит mapping).

### C) Backend tests update

В `rehab.pain.test.js`:

```javascript
// БЫЛО:
// expect(insertCall[1]).toContain('sharp');  // single string
// СТАЛО:
expect(insertCall[1]).toEqual(expect.arrayContaining([
  expect.arrayContaining(['sharp'])  // array of one
]));
// Или проще — найти позицию pain_character в params и проверить что массив:
const insertParams = insertCall[1];
const painCharacterParam = insertParams[<position>];  // позиция = смотреть по INSERT order
expect(painCharacterParam).toEqual(['sharp']);

// НОВЫЕ тесты:
it('POST /pain/daily с pain_character массивом нескольких — OK', async () => {
  mockClient.query.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 100, pain_character: ['sharp', 'burning'] }] })
    .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
  const res = await request(app)
    .post('/api/rehab/my/pain/daily')
    .send({ vas_score: 5, pain_character: ['sharp', 'burning'] });
  expect(res.status).toBe(201);
});

it('POST с pain_character не-массив — 400', async () => {
  const res = await request(app)
    .post('/api/rehab/my/pain/daily')
    .send({ vas_score: 5, pain_character: 'sharp' });  // string, not array
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/должен быть массивом/);
});

it('POST с pain_character содержит невалидное значение — 400', async () => {
  const res = await request(app)
    .post('/api/rehab/my/pain/daily')
    .send({ vas_score: 5, pain_character: ['sharp', 'invalid_value'] });
  expect(res.status).toBe(400);
  expect(res.body.message).toMatch(/invalid_value/);
});

it('POST с pain_character пустым массивом — 400', async () => {
  const res = await request(app)
    .post('/api/rehab/my/pain/daily')
    .send({ vas_score: 5, pain_character: [] });
  expect(res.status).toBe(400);
});

it('Telegram body содержит joined characters при red-flag', async () => {
  mockClient.query.mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ rows: [{ code: 'neck_lateral', label: 'Шея', is_red_flag: true, red_flag_reason: 'радикулопатия' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 200, vas_score: 9, is_event: true,
      pain_character: ['sharp', 'shooting'],
      created_at: new Date()
    }]})
    .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
  db.query.mockResolvedValueOnce({ rows: [{ id: 14, full_name: 'X' }] })
    .mockResolvedValueOnce({ rows: [{ id: 300 }] })
    .mockResolvedValueOnce({ rows: [] });
  await request(app).post('/api/rehab/my/pain/event').send({
    vas_score: 9, location_codes: ['neck_lateral'],
    pain_character: ['sharp', 'shooting']
  });
  const [, body] = sendOpsAlert.mock.calls[0];
  // Проверить что в Telegram строке оба character значения
  expect(body).toMatch(/Острая.*Стреляющая|Стреляющая.*Острая/);
});
```

### D) Frontend `PainCharacterSelect.js` — multi-select

```jsx
import React from 'react';
import { PAIN_CHARACTER_OPTIONS } from '../constants/pain';

/**
 * Wave 2 Hot-fix #9 v2 — multi-select для pain_character.
 * Backend поддерживает TEXT[] после миграции 20260520.
 *
 * Props:
 *   value: string[] — array of selected codes (default [])
 *   onChange: (string[]) => void
 */
export default function PainCharacterSelect({
  value = [],
  onChange,
  label = 'Характер боли (можно несколько)'
}) {
  const toggle = (val) => {
    onChange(value.includes(val) ? value.filter(v => v !== val) : [...value, val]);
  };

  return (
    <div className="pd-pain-character">
      <div className="pd-pain-character__label">{label}</div>
      <div className="pd-pain-character__chips">
        {PAIN_CHARACTER_OPTIONS.map(opt => {
          const isSelected = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={`pd-pain-char-chip ${isSelected ? 'pd-pain-char-chip--selected' : ''}`}
              onClick={() => toggle(opt.value)}
              aria-pressed={isSelected}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### E) `PainEventForm.js` state + payload adaptation

```jsx
// Initial state
const [form, setForm] = useState({
  vas_score: null,
  location_codes: [],
  trigger_type: '',
  pain_character: [],  // ← было '', стало []
  notes: '',
  photo_file: null
});

// Submit payload
const payload = {
  vas_score: form.vas_score,
  location_codes: form.location_codes,
  trigger_type: form.trigger_type,
  pain_character: form.pain_character.length > 0 ? form.pain_character : null,  // ← was: form.pain_character || null
  notes: form.notes || null,
  photo_url
};
```

### F) `DailyPainSection.js` state + pre-load + payload

```jsx
// Initial state
const [form, setForm] = useState({
  vas_score: null,
  location_codes: [],
  notes: '',
  trigger_type: '',
  pain_character: []  // ← []
});

// Pre-load existing today
setForm({
  vas_score: today.vas_score,
  location_codes: today.locations?.map(l => l.code) || [],
  notes: today.notes || '',
  trigger_type: today.trigger_type || '',
  // ← было: today.pain_character || ''
  // ← стало: today.pain_character || []
  // Backend теперь возвращает массив или null
  pain_character: today.pain_character || []
});

// Submit payload
const payload = {
  vas_score: form.vas_score,
  location_codes: form.location_codes.length ? form.location_codes : undefined,
  notes: form.notes || null,
  pain_character: form.pain_character.length > 0 ? form.pain_character : null
};
```

### G) Frontend tests update

В `PainEventForm.test.js`:

```javascript
// БЫЛО:
// expect(createPainEvent).toHaveBeenCalledWith(
//   expect.objectContaining({ pain_character: 'sharp' })
// );
// СТАЛО:
expect(createPainEvent).toHaveBeenCalledWith(
  expect.objectContaining({ pain_character: ['sharp'] })
);

// НОВЫЕ multi-toggle тесты:
it('multi-select pain_character — несколько values отправляются массивом', async () => {
  render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
  await waitFor(() => screen.getByText(/Срочная боль/i));
  
  // Заполнить required
  // ... vas slider, locations chip, trigger radio ...
  
  // Multi character
  fireEvent.click(screen.getByRole('button', { name: /Острая/i }));
  fireEvent.click(screen.getByRole('button', { name: /Жгучая/i }));
  fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));
  
  await waitFor(() => {
    expect(createPainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ pain_character: ['sharp', 'burning'] })
    );
  });
});

it('toggle pain character chip — снимает выбор, не накапливает', () => {
  render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
  const chip = screen.getByRole('button', { name: /Острая/i });
  fireEvent.click(chip);
  expect(chip).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(chip);
  expect(chip).toHaveAttribute('aria-pressed', 'false');
});

it('пустой pain_character → payload null', async () => {
  render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
  // ... заполнить required без pain_character chips ...
  fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));
  await waitFor(() => {
    expect(createPainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ pain_character: null })
    );
  });
});
```

В `DailyPainSection.test.js`:

```javascript
// Pre-load existing с массивом
it('pre-load existing с pain_character массивом', () => {
  getDailyPainToday.mockResolvedValue([{
    id: 100, vas_score: 5,
    pain_character: ['aching', 'throbbing'],  // ← array
    locations: []
  }]);
  render(<DailyPainSection />);
  // ... waitFor ...
  // Проверить что обе chips выделены
  expect(screen.getByRole('button', { name: /Ноющая/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /Пульсирующая/i })).toHaveAttribute('aria-pressed', 'true');
});
```

---

## NOT TOUCH

- Other pain endpoints structural logic (только validation block + INSERT)
- LOCKED-зоны
- pain_locations / ops_alerts / patient_criterion_answers schemas
- Wave 1 endpoints
- Frontend other components (только три pain components)

---

## Smoke test (4-card format)

### Сценарий 0 — Pre-migration backup

```
Шаг 0.1 — pg_dump
├─ Где: терминал в корне репо
├─ Что найти: psql access
├─ Что сделать: pg_dump -U postgres azarean_rehab > /tmp/azarean_backups/pre_hf9_$(date +%Y%m%d_%H%M%S).sql
└─ Что увидеть: файл создан, ls показывает размер > 0, записать path в отчёт
```

### Сценарий 1 — Apply migration

```
Шаг 1.1 — Apply
├─ Где: терминал
├─ Что найти: backend/database/migrations/20260520_pain_character_to_array.sql
├─ Что сделать: psql -U postgres -d azarean_rehab -f <файл>
└─ Что увидеть: BEGIN / NOTICE 'Migrated pain_character ...' / COMMIT без ошибок

Шаг 1.2 — Verify тип колонки
├─ Где: psql
├─ Что найти: \d pain_entries
├─ Что сделать: запустить
└─ Что увидеть: pain_character | text[] | (вместо character varying)

Шаг 1.3 — Verify constraint
├─ Где: psql
├─ Что сделать: SELECT conname, pg_get_constraintdef(oid)
│              FROM pg_constraint
│              WHERE conrelid='pain_entries'::regclass AND contype='c';
└─ Что увидеть: chk_pain_character_array с CHECK (... array_length ... <@ ARRAY[...])

Шаг 1.4 — Idempotency
├─ Что сделать: запустить миграцию ЕЩЁ РАЗ
└─ Что увидеть: NOTICE 'pain_character already type ARRAY, skipping conversion'
                COMMIT, без ошибок
```

### Сценарий 2 — Backend API с array

```
Шаг 2.1 — Login + POST daily с pain_character массивом
├─ Где: терминал curl
├─ Что найти: test patient session
├─ Что сделать:
│  curl -X POST -b /tmp/c.txt -H 'Content-Type: application/json' \
│    -d '{"vas_score": 4, "pain_character": ["sharp", "aching"]}' \
│    http://localhost:5000/api/rehab/my/pain/daily
└─ Что увидеть: 201, data.pain_character: ["sharp", "aching"] (array в response)

Шаг 2.2 — Invalid array element
├─ Что сделать:
│  curl -X POST ... -d '{"vas_score": 4, "pain_character": ["sharp", "totally_invalid"]}' ...
└─ Что увидеть: 400 ValidationError «Неизвестные значения pain_character: totally_invalid»

Шаг 2.3 — Non-array
├─ Что сделать: -d '{"vas_score": 4, "pain_character": "sharp"}'
└─ Что увидеть: 400 «pain_character должен быть массивом»

Шаг 2.4 — Empty array
├─ Что сделать: -d '{"vas_score": 4, "pain_character": []}'
└─ Что увидеть: 400 «pain_character пустой массив — передавай null»

Шаг 2.5 — null OK
├─ Что сделать: -d '{"vas_score": 4, "pain_character": null}'
└─ Что увидеть: 201, data.pain_character: null
```

### Сценарий 3 — **ГЛАВНЫЙ** — Multi-character в Telegram alert

```
Шаг 3.1 — Pain event с red-flag + multi character
├─ Где: терминал
├─ Что сделать:
│  curl -X POST ... -d '{
│    "vas_score": 8, "location_codes": ["calf_posterior"],
│    "trigger_type": "on_walking",
│    "pain_character": ["sharp", "throbbing"]
│  }' /api/rehab/my/pain/event
└─ Что увидеть: 201, data.ops_alert_id число

Шаг 3.2 — Telegram доставка
├─ Где: Telegram app, OPS bot чат
├─ Что найти: новое 🚨 RED FLAG
└─ Что увидеть:
   ...
   VAS: 8/10
   Локации с красным флагом: • Икроножная — ТГВ
   Триггер: on_walking
   Характер: Острая, Пульсирующая    ← оба значения join'ом ", "
   ...

Шаг 3.3 — БД verify
├─ Где: psql
├─ Что сделать: SELECT pain_character FROM pain_entries ORDER BY id DESC LIMIT 1;
└─ Что увидеть: {sharp,throbbing} (PostgreSQL array format)
```

### Сценарий 4 — Frontend multi-select в браузере

```
Шаг 4.1 — PainEventForm multi-select
├─ Где: HomeScreen footer → click SOS link
├─ Что найти: PainCharacterSelect chips
├─ Что сделать: выбрать «Острая» + «Жгучая» + «Пульсирующая»
└─ Что увидеть: все 3 chips выделены (teal), aria-pressed=true

Шаг 4.2 — Submit + Network tab
├─ Где: DevTools Network panel
├─ Что сделать: submit form, посмотреть request body
└─ Что увидеть: POST body содержит "pain_character": ["sharp","burning","throbbing"]

Шаг 4.3 — DiaryScreen pre-load
├─ Где: TabBar → Дневник, после save daily с array
├─ Что сделать: F5 reload
└─ Что увидеть: chips «Острая» + «Жгучая» выделены (оба, не один)

Шаг 4.4 — Toggle off
├─ Что сделать: click на «Острая» (выделенная)
└─ Что увидеть: «Острая» становится нейтральной, «Жгучая» остаётся выделенной
```

### Сценарий 5 — Test suite

```
Шаг 5.1 — Backend
├─ Что сделать: cd backend && npm test
└─ Что увидеть: 526+ passed (учитывая +5 новых тестов на array validation)

Шаг 5.2 — Frontend
├─ Что сделать: cd frontend && CI=true npm test
└─ Что увидеть: 296+ passed (учитывая +3-4 тестов на multi)
```

---

## Файлы — итоговый чеклист

### Создать
- `backend/database/migrations/20260520_pain_character_to_array.sql`

### Изменить
- `backend/routes/rehab.js` (~30 строк изменений в 2 endpoints + helper)
- `backend/tests/__tests__/rehab.pain.test.js` (~5 новых тестов, ~2-3 updates существующих)
- `backend/tests/__tests__/wave2_schema.test.js` (~1 sanity тест для TEXT[] column)
- `frontend/src/pages/PatientDashboard/components/PainCharacterSelect.js`
- `frontend/src/pages/PatientDashboard/components/PainEventForm.js` (state + payload + pre-load)
- `frontend/src/pages/PatientDashboard/components/DailyPainSection.js` (state + pre-load + payload)
- `frontend/src/pages/PatientDashboard/components/__tests__/PainEventForm.test.js` (~3 новых + updates)
- `frontend/src/pages/PatientDashboard/components/__tests__/DailyPainSection.test.js` (~1 новый + updates)
- `CLAUDE.md` (migration list + completed fixes + memory rule про verify output)

### НЕ ТРОГАТЬ
- LOCKED-зоны
- Wave 1 endpoints
- Other Wave 2 components
- pain_locations / ops_alerts / patient_criterion_answers schemas

---

## Текст коммита

```
fix(rehab): Wave 2 Hot-fix #9 — pain_character VARCHAR(50) → TEXT[]

Drift #12 от TZ Hot-fix #9 v1 — архитектор предположил что backend
уже TEXT[], реально был VARCHAR(50). v2 — полный rewrite backend +
frontend.

Backend migration 20260520_pain_character_to_array.sql:
- VARCHAR(50) → TEXT[] через ALTER COLUMN ... USING (array conversion)
- Existing single values preserved as 1-element arrays
- DROP old CHECK constraint (dynamic name lookup для безопасности)
- ADD new CHECK chk_pain_character_array (array_length + <@ enum)
- Идемпотентно: re-run после миграции пропускает (DO block + data_type
  check)

Backend code (routes/rehab.js):
- 2 endpoints (POST /pain/daily + /pain/event) validation:
  Array.isArray check + per-element PAIN_CHARACTER_VALUES check +
  empty array rejection
- triggerRedFlagAlert label loop: array.map(label).join(', ')
  для Telegram «Характер: Острая, Пульсирующая»

Frontend:
- PainCharacterSelect → multi-select chips (value: string[])
- PainEventForm + DailyPainSection: state array, pre-load array,
  submit payload array if non-empty / null if empty

Pre-migration safety:
- pg_dump backup OBLIGATORY перед миграцией
- Backup path в отчёте архитектору

Memory rule (новое):
- Все TZ trogающие schema — verify-step должен ПРИЛОЖИТЬ `\d <table>`
  output в отчёт архитектору (не оставаться в local context).
- Drift incident #12 — корень в архитектурном domysl'e schema без
  чтения. Правило предотвращает повторения.

Tests:
- backend +5 (multi value OK, invalid element, non-array, empty array, Telegram body)
- backend wave2_schema +1 (TEXT[] column sanity)
- frontend +3-4 (multi-toggle PainEventForm + DailyPainSection pre-load array)

Закрывает hot-fix #9 (был cancelled в v1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**CLAUDE.md:**
- «Запуск проекта → PostgreSQL» — добавить миграцию 20260520
- «Завершённые исправления» — запись:
  > **Wave 2 Hot-fix #9 v2** — pain_character VARCHAR(50) → TEXT[]. Backend rewrite + frontend multi adapt. Telegram label join. pg_dump backup before migration.

**Memory:**
- `wave_2_progress.md` — HF#9 ⏸, SHA, backup path
- Создать `memory/architect_premise_drift_2026-05-18.md` — Wave 2 архитектурные drift'ы:
  - #1 audit case (2.02)
  - #2-9 (2.04 v2 — 8 drifts)
  - #10 trigger_type CHECK (2.04 v3)
  - #11-21 (2.05 v1 — 10 mechanical + 1 runtime)
  - #22 pain_character schema (HF#9 v1)
  - Новое правило: verify-step output в отчёт обязательно
- `feedback_smoke_real_browser.md` — расширить новым правилом

---

## Definition of Done

- [ ] **pg_dump backup создан**, path записан в отчёт
- [ ] Verify-step выполнен с ПРИЛОЖЕНИЕМ `\d pain_entries` + constraint dump + data count в отчёт
- [ ] Миграция 20260520 применена, `\d pain_entries` показывает `pain_character | text[]`
- [ ] Idempotency проверена (re-run = NOTICE skip, не error)
- [ ] CHECK constraint `chk_pain_character_array` существует с правильным def
- [ ] Existing data (если была) преобразована в 1-element arrays
- [ ] Backend POST /pain/daily + /event принимают array, отклоняют не-array / empty / invalid elements
- [ ] **Сценарий 3 проигран** — Telegram alert с «Характер: Острая, Пульсирующая» в реальном Telegram
- [ ] БД pain_character хранится как PostgreSQL array (`{sharp,throbbing}` формат в psql)
- [ ] Frontend multi-select работает в PainEventForm + DailyPainSection
- [ ] Pre-load existing с array заполняет несколько chips
- [ ] Toggle off — снимает один, оставляет остальные
- [ ] Empty array → payload `null`, не `[]`
- [ ] Backend tests 526+5 ≈ 531
- [ ] Frontend tests 296+3-4 ≈ 299-300
- [ ] CLAUDE.md обновлён (миграция + правило verify output)
- [ ] memory/architect_premise_drift_2026-05-18.md создан с историей всех Wave 2 drifts
- [ ] Коммит создан с указанным текстом + Co-Authored-By
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR от ветки `wave-2/hotfix-09-pain-character-multi`, висит до batch merge
- [ ] **pg_dump backup НЕ удалён** до конца Wave 2

---

## После Hot-fix #9 v2

**Stack:** 8 PR ⏸:
```
af313b4 → a6f7980 → 82544c0 → 98ca5f2 → e6f11a9 → 5cb4216 → a2ecad6 → <HF9 sha>
[2.01]    [2.02]    [2.03]    [HF7]      [HF8]      [2.04]    [2.05]    [HF9 v2]
```

**Block B finally closed.** Pre-Block-C state:
- Pain tracking — clinically correct (multi-character)
- 0 known regressions
- Backups secured
- Memory rules усилены

**Block C Measurements Tier 1+2** — TZ 2.06 + 2.07 батчем. Жду:
1. Smoke 2.05 + HF#9 результаты
2. Storage decisions для 2.06 (`1A/B 2sharp 3JWT+AI consent` или свой вариант)

---

## Lesson для архитектора (записан в memory)

**Drift #22 — fourth incident from architect side.** Pattern теперь системный, не случайный. Корни:

1. Архитектор работает с информацией asymmetрично — Claude Code видит реальный код, архитектор видит описания + memory
2. Без явных verify outputs архитектор угадывает constraints/types — это и порождает drift'ы
3. **Решение:** verify-step должен возвращать конкретные artifacts (schema dump, constraint defs) В ОТЧЁТЕ. Архитектор пишет следующие TZ ИЗ этого output, не из памяти.

**Применять начиная с Block C (2.06+).** Каждый отчёт по schema-touching commit'у — `\d` output + constraint dump + любые runtime surprises явно в тексте отчёта.
