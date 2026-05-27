# TZ Wave 2 · Hot-fix #9 — PainCharacterSelect: single → multi

**Дата:** 2026-05-18
**Версия:** v1
**Тип:** pre-Block-C UX fix (между 2.05 и 2.06)
**Цель:** Вернуть `PainCharacterSelect` к multi-select поведению (TZ 2.05 v1 заложил multi, Claude Code адаптировал к single в drift #9 — Vadim требует multi).
**Объём:** 20-40 минут
**Риск:** низкий — узкий frontend fix, backend уже принимает array (`pain_character TEXT[]`).

**Клинически:** sharp + burning одновременно встречается при cervical radiculopathy, neuropathic pain, complex regional pain syndrome — single-select исключает эти комбинации. Backend схема `pain_character TEXT[]` поддерживает массив изначально.

---

## Verify-step

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab

# 1) Stack
git log --oneline | head -8
# Ожидание: a2ecad6 → edd9e06 → ... (7 PR ⏸)

# 2) PainCharacterSelect текущая реализация
cat frontend/src/pages/PatientDashboard/components/PainCharacterSelect.js
# Ожидание: видно что value — string (single), onChange принимает string
# Адаптировать к: value — string[] (array), onChange принимает array

# 3) Где используется PainCharacterSelect — для контекста state
grep -rn "PainCharacterSelect\|pain_character" frontend/src/pages/PatientDashboard/ | head -10
# Ожидание: PainEventForm + DailyPainSection — оба передают pain_character в state

# 4) Backend подтверждение что массив принимается
psql -U postgres -d azarean_rehab -c "\d pain_entries" | grep pain_character
# Ожидание: pain_character TEXT[] (или с CHECK constraint на элементы массива)

# 5) Существующие тесты PainCharacterSelect (если есть)
grep -rn "PainCharacterSelect" frontend/src/**/__tests__/ 2>/dev/null
# Если тесты используют value=string — обновить на array

# 6) Backend CHECK constraint на pain_character
psql -U postgres -d azarean_rehab -c \
  "SELECT pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'pain_entries'::regclass
     AND contype = 'c'
     AND conname LIKE '%character%';"
# Узнать формат CHECK — поэлементный ('value' = ANY (ARRAY[...])) или весь массив
# Чтобы знать как валидировать на frontend перед submit
```

---

## Зависимости

После 2.05 ⏸ (commit a2ecad6). Hot-fix #9 поверх него.

**Ветка:** `wave-2/hotfix-09-pain-character-multi` от `wave-2/05-pain-frontend` (a2ecad6).

---

## Параллельная работа — координация

**ТРОГАЕМ:**

| Файл | Что |
|---|---|
| `frontend/src/pages/PatientDashboard/components/PainCharacterSelect.js` | Multi-select: value: string[], onChange(array) |
| `frontend/src/pages/PatientDashboard/components/PainEventForm.js` | State `pain_character: []` (array вместо null), submit payload без `.length ? : null` адаптации (массив пустой → null/undefined) |
| `frontend/src/pages/PatientDashboard/components/DailyPainSection.js` | То же — state и payload |
| `frontend/src/pages/PatientDashboard/components/__tests__/PainEventForm.test.js` | Обновить mock значения с string на array |
| `frontend/src/pages/PatientDashboard/components/__tests__/DailyPainSection.test.js` | То же |

**НЕ ТРОГАТЬ:**
- Backend (он принимает массив)
- Other components
- LOCKED-зоны
- Other pain UI flows

---

## Конкретная реализация

### A) `PainCharacterSelect.js` — multi-select chips

```jsx
import React from 'react';
import { PAIN_CHARACTER_OPTIONS } from '../constants/pain';

/**
 * Wave 2 hot-fix #9 — multi-select для pain_character.
 * Vadim's выбор: pain в реальности может иметь несколько характеристик одновременно
 * (sharp + burning при cervical radiculopathy и т.п.).
 *
 * Props:
 *   value: string[] — array of selected character codes (default [])
 *   onChange: (string[]) => void — receives new array on toggle
 */
export default function PainCharacterSelect({ value = [], onChange, label = 'Характер боли (можно несколько)' }) {
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

### B) `PainEventForm.js` — state adaptation

Найти state declaration:

```jsx
// Было (single):
// pain_character: ''
// Стало (multi):
pain_character: []
```

Найти submit payload:

```jsx
// Было:
// pain_character: form.pain_character || null
// Стало:
pain_character: form.pain_character.length > 0 ? form.pain_character : null
```

### C) `DailyPainSection.js` — state adaptation

То же самое:

```jsx
// Initial state
pain_character: []  // (was '')

// Pre-load existing
pain_character: today.pain_character || []  // (was today.pain_character || '')

// Submit payload
pain_character: form.pain_character.length > 0 ? form.pain_character : null
```

### D) Tests update

В `PainEventForm.test.js` и `DailyPainSection.test.js`:

```javascript
// Было:
// expect(createPainEvent).toHaveBeenCalledWith(
//   expect.objectContaining({ pain_character: 'sharp' })
// );
// Стало:
expect(createPainEvent).toHaveBeenCalledWith(
  expect.objectContaining({ pain_character: ['sharp'] })
);

// Добавить тест на multi-select:
it('multi-select pain_character — несколько values', () => {
  render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
  // ... заполнить required fields ...
  fireEvent.click(screen.getByRole('button', { name: /Острая/i }));
  fireEvent.click(screen.getByRole('button', { name: /Жгучая/i }));
  fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));
  expect(createPainEvent).toHaveBeenCalledWith(
    expect.objectContaining({ pain_character: ['sharp', 'burning'] })
  );
});

it('toggle pain_character chip — снимает выбор', () => {
  render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
  const chip = screen.getByRole('button', { name: /Острая/i });
  fireEvent.click(chip);  // select
  expect(chip).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(chip);  // deselect
  expect(chip).toHaveAttribute('aria-pressed', 'false');
});
```

---

## NOT TOUCH

- Backend (принимает массив, изменений 0)
- PainCharacterSelect.module.css (если есть) — стили те же, добавить ничего
- Other pain components
- LOCKED-зоны

---

## Smoke test (4-card format)

### Сценарий 1 — Multi-select в PainEventForm

```
Шаг 1.1 — Open PainEventForm
├─ Где: http://localhost:3001/patient-dashboard → HomeScreen
├─ Что найти: footer link «Записать pain event»
├─ Что сделать: click → modal opens
└─ Что увидеть: «Характер боли (можно несколько)» секция со всеми chips нейтральными

Шаг 1.2 — Выбрать несколько characters
├─ Где: PainCharacterSelect chips
├─ Что найти: chips «Острая», «Жгучая», «Пульсирующая»
├─ Что сделать: click на каждый по очереди
└─ Что увидеть: все 3 chips выделены (teal background), aria-pressed=true

Шаг 1.3 — Снять выбор
├─ Что сделать: click на «Жгучая» ещё раз
└─ Что увидеть: «Жгучая» снова нейтральная, «Острая» + «Пульсирующая» остались
                выделенными

Шаг 1.4 — Submit + verify payload
├─ Где: form (заполнить required vas + locations + trigger)
├─ Что сделать: submit, открыть DevTools Network
└─ Что увидеть: POST /api/rehab/my/pain/event body содержит
                "pain_character": ["sharp", "throbbing"] (массив, не строка)
```

### Сценарий 2 — Multi-select в DiaryScreen DailyPainSection

```
Шаг 2.1 — Open DiaryScreen
├─ Где: TabBar → Дневник
├─ Что найти: pain секция, PainCharacterSelect
├─ Что сделать: выбрать «Тупая» + «Ноющая»
└─ Что увидеть: оба chips выделены

Шаг 2.2 — Submit daily
├─ Что сделать: заполнить vas + submit
└─ Что увидеть: POST /api/rehab/my/pain/daily body с pain_character: ["dull", "aching"]
```

### Сценарий 3 — Pre-load existing с multi values

```
Шаг 3.1 — После сценария 2.2, F5 reload DiaryScreen
├─ Где: тот же экран
├─ Что увидеть:
│  ✓ Banner «Сегодняшняя запись от HH:MM»
│  ✓ Form pre-filled: «Тупая» + «Ноющая» chips выделены (оба, не один)

Шаг 3.2 — Изменить selection
├─ Что сделать: убрать «Тупая», добавить «Жгучая»
├─ Click «Обновить»
└─ Что увидеть: toast «Сегодняшняя запись обновлена», payload pain_character:
                ["aching", "burning"]
```

### Сценарий 4 — Pустой массив = null в payload

```
Шаг 4.1 — Submit без pain_character
├─ Где: PainEventForm или DailyPainSection
├─ Что найти: заполнить VAS + required, но НЕ трогать pain_character chips
├─ Что сделать: submit
└─ Что увидеть: payload pain_character: null (не [] — backend ожидает null если empty)
```

### Сценарий 5 — Tests pass

```
Шаг 5.1 — Frontend test suite
├─ Где: терминал, frontend/
├─ Что сделать: CI=true npm test
└─ Что увидеть: 296+ passed (всё ещё, ИЛИ +2-3 если добавили multi-toggle тесты)
```

---

## Файлы — итоговый чеклист

### Изменить

- `frontend/src/pages/PatientDashboard/components/PainCharacterSelect.js`
- `frontend/src/pages/PatientDashboard/components/PainEventForm.js` (state + payload)
- `frontend/src/pages/PatientDashboard/components/DailyPainSection.js` (state + payload)
- `frontend/src/pages/PatientDashboard/components/__tests__/PainEventForm.test.js` (+1-2 теста на multi)
- `frontend/src/pages/PatientDashboard/components/__tests__/DailyPainSection.test.js` (+1 тест)
- `CLAUDE.md` (короткая запись)

### НЕ ТРОГАТЬ

- Backend
- LOCKED-зоны
- Other pain components
- constants/pain.js (PAIN_CHARACTER_OPTIONS уже список — сам компонент меняется)

---

## Текст коммита

```
fix(patient): Wave 2 hot-fix #9 — PainCharacterSelect single → multi

В TZ 2.05 v1 закладывался multi-select для pain_character.
Claude Code адаптировал к single в drift #9 (judgment call,
не архитектурный).

Vadim's выбор: multi нужен клинически — pain в реальности часто
имеет несколько характеристик одновременно (sharp + burning при
cervical radiculopathy, throbbing + aching при vascular, etc).

Backend pain_entries.pain_character TEXT[] поддерживает массив
изначально. Изменения только frontend:
- PainCharacterSelect: value: string[], onChange(array)
- PainEventForm + DailyPainSection: state array
- Submit payload: empty array → null (backend ожидает null если no
  characters)

Tests:
- updated existing pain_character assertions: 'sharp' → ['sharp']
- added 2 multi-toggle тестa (select multiple, deselect)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Definition of Done

- [ ] Verify-step выполнен — backend подтверждено array, CHECK constraint format понятен
- [ ] PainCharacterSelect: multi-select работает (click toggles + aria-pressed)
- [ ] PainEventForm: state array, payload array if non-empty, null if empty
- [ ] DailyPainSection: state array, payload array, pre-load из existing array
- [ ] Tests updated — старые assertions с array values
- [ ] +2 multi-toggle теста добавлены (PainEventForm + DailyPainSection или общий)
- [ ] Frontend test suite 296+ зелёные (≥ 298)
- [ ] **Smoke сценарий 1** ✅ multi-select в PainEventForm + payload array
- [ ] **Smoke сценарий 3** ✅ pre-load после save восстанавливает все selected
- [ ] CLAUDE.md обновлён
- [ ] Коммит создан с указанным текстом + Co-Authored-By
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] PR от ветки `wave-2/hotfix-09-pain-character-multi`, висит до batch merge

---

## После hot-fix #9

**Stack:** `... → a2ecad6 → <#9 sha>` (8 PR'ов ⏸)

Block B + hot-fix #9 закрыты. Block C Measurements Tier 1+2 — следующий (2.06 + 2.07 батчем когда Vadim даст storage decisions).

**Записать в memory правило:**
> Для всех будущих pain/symptom UI — multi-select по умолчанию для character/quality fields. Single только если врач явно скажет. Реальная клиническая практика — одновременные характеристики боли (sharp + burning, throbbing + aching) встречаются часто.
