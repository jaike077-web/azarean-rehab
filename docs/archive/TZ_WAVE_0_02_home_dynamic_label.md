# TZ Волна 0 · Коммит 02 — убрать литерал «ПКС» из HomeScreen

**Дата:** 2026-05-08
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #1 (минимальный фикс в Волне 0)
**Цель:** Убрать жёсткий литерал «ПКС Фаза N» из hero-карточки HomeScreen. Для не-ACL пациентов показывать нейтральное название из их diagnosis или просто «Фаза N» без префикса.
**Объём:** 1-2 часа
**Риск:** низкий — изолированная UI-правка + минимальное расширение одного backend endpoint.

---

## Что блокирует

`HomeScreen.js:7` (строка может отличаться на момент работы — найти grep'ом по `'ПКС Фаза'` или `"ПКС"`) содержит жёсткий литерал. Любой пациент с диагнозом «грыжа поясничная», «эндопротез колена», «травма плеча» — на главном экране видит «Сегодня · ПКС Фаза 3».

Это **самая видимая поломка позиционирования продукта** для не-ACL пациентов. Чинится одной строкой бизнес-логики в backend + правкой компонента.

**Архитектурное замечание.** Полное решение (поле `rehab_programs.program_type` с справочником `program_types`) делается в Волне 1. В Волне 0 — минимальный фикс через существующее поле `rehab_programs.diagnosis` с маппингом в человекочитаемый label. Это **временное решение**, помечается TODO в коде.

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `backend/routes/rehab.js` — handler `GET /my/dashboard`
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js`
- `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js`
- `backend/tests/__tests__/rehab.routes.test.js`

**НЕ ТРОГАТЬ:**
- `backend/database/migrations/` — никаких миграций в этом коммите
- `backend/database/schema.sql`
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js` — отдельная правка в Волне 1, здесь не трогаем
- `backend/services/telegramBot.js` — литерал `'acl'` в строке ~170 остаётся до Волны 1

---

## Backend — контракты

### Endpoint `GET /api/rehab/my/dashboard`

Существующий endpoint. Не меняется сигнатура. **Расширяется response** одним полем `program_label`.

Текущий формат (упрощённо, проверить актуальную структуру):

```json
{
  "data": {
    "program": {
      "id": 1,
      "current_phase": 3,
      "diagnosis": "ПКС реконструкция, BPTB",
      "surgery_date": "2026-01-15",
      "phase_started_at": "2026-04-01"
    },
    "phase": { ... },
    "complex": { ... },
    "todayDone": false,
    "streak": { ... }
  }
}
```

Новый формат — добавляется `program.program_label`:

```json
{
  "data": {
    "program": {
      "id": 1,
      "current_phase": 3,
      "diagnosis": "ПКС реконструкция, BPTB",
      "program_label": "ПКС",
      "surgery_date": "2026-01-15",
      "phase_started_at": "2026-04-01"
    },
    ...
  }
}
```

**Логика вычисления `program_label` на backend:**

```javascript
function deriveProgramLabel(diagnosis) {
  if (!diagnosis) return null;
  const d = diagnosis.toLowerCase();
  // Маппинг по ключевым словам в diagnosis (временный, до Волны 1)
  if (/пкс|acl|крестообразн/i.test(d)) return 'ПКС';
  if (/мениск/i.test(d)) return 'Мениск';
  if (/протез|эндопротез|tka|tha/i.test(d)) return 'Протез сустава';
  if (/грыж/i.test(d)) return 'Грыжа диска';
  if (/плеч|shoulder|манжет/i.test(d)) return 'Плечо';
  if (/тбс|тазобедр|hip/i.test(d)) return 'ТБС';
  if (/голеностоп|ankle/i.test(d)) return 'Голеностоп';
  if (/колен|knee/i.test(d)) return 'Колено';
  return null; // не определено — frontend покажет «Фаза N» без префикса
}
```

Это hardcoded маппинг — намеренно. **TODO-комментарий в коде:** `// TODO Wave 1: replace with program_types lookup`

---

## Шаг 1 — добавить функцию `deriveProgramLabel` в backend

**Файл:** `backend/routes/rehab.js`
**Точка вставки:** в начале файла, после импортов, перед первым `router.METHOD`. Если уже есть блок helper-функций — туда.

Альтернатива (рекомендуется): вынести в `backend/utils/programLabels.js`:

```javascript
// backend/utils/programLabels.js
// TODO Wave 1: заменить на lookup из таблицы program_types

function deriveProgramLabel(diagnosis) {
  if (!diagnosis) return null;
  const d = diagnosis.toLowerCase();

  if (/пкс|acl|крестообразн/i.test(d)) return 'ПКС';
  if (/мениск/i.test(d)) return 'Мениск';
  if (/протез|эндопротез|tka|tha/i.test(d)) return 'Протез сустава';
  if (/грыж/i.test(d)) return 'Грыжа диска';
  if (/плеч|shoulder|манжет/i.test(d)) return 'Плечо';
  if (/тбс|тазобедр|hip/i.test(d)) return 'ТБС';
  if (/голеностоп|ankle/i.test(d)) return 'Голеностоп';
  if (/колен|knee/i.test(d)) return 'Колено';

  return null;
}

module.exports = { deriveProgramLabel };
```

---

## Шаг 2 — расширить response `GET /my/dashboard`

**Файл:** `backend/routes/rehab.js`
**Точка вставки:** в handler `GET /my/dashboard`, в месте формирования response.

Найти SQL-запрос который выбирает программу пациента:

```javascript
const programResult = await query(
  `SELECT id, current_phase, diagnosis, surgery_date, phase_started_at, complex_id, status
   FROM rehab_programs
   WHERE patient_id = $1 AND status = 'active'
   LIMIT 1`,
  [patientId]
);
```

После этого запроса (но перед формированием response) добавить:

```javascript
const { deriveProgramLabel } = require('../utils/programLabels');

const program = programResult.rows[0] || null;
if (program) {
  program.program_label = deriveProgramLabel(program.diagnosis);
}

// ... далее существующий код формирования response
```

Включить `program` (с уже добавленным `program_label`) в response data.

---

## Шаг 3 — обновить HomeScreen.js

**Файл:** `frontend/src/pages/PatientDashboard/components/HomeScreen.js`
**Точка вставки:** найти строку с литералом `'ПКС'` или `'ПКС Фаза'` (grep `ПКС`).

Текущий код (примерно):

```jsx
<div className="pd-hero-meta">
  Сегодня · ПКС Фаза {program.current_phase}
</div>
```

Новый код:

```jsx
<div className="pd-hero-meta">
  Сегодня
  {program?.program_label && (
    <> · {program.program_label}</>
  )}
  {program?.current_phase && (
    <> · Фаза {program.current_phase}</>
  )}
</div>
```

**Поведение:**
- Если `program_label = "ПКС"` и `current_phase = 3` → «Сегодня · ПКС · Фаза 3»
- Если `program_label = null` (диагноз не определён маппингом) и `current_phase = 3` → «Сегодня · Фаза 3»
- Если программы нет вообще → просто «Сегодня»

**Style:** не менять CSS, использовать существующий класс `pd-hero-meta`. Разделители ` · ` — внутри JSX как fragment.

---

## Шаг 4 — обновить тесты HomeScreen

**Файл:** `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js`

Если тесты hardcode'ят «ПКС» в проверках — обновить mock dashboard data. Добавить новый тест:

```javascript
describe('HomeScreen — program label', () => {
  test('показывает program_label из dashboard data', () => {
    const dashboard = {
      program: { id: 1, current_phase: 3, program_label: 'Плечо' },
      phase: { ... },
      complex: { ... },
      todayDone: false,
      streak: { current_streak: 0 }
    };
    render(<HomeScreen dashboardData={dashboard} ... />);
    expect(screen.getByText(/Сегодня.*Плечо.*Фаза 3/)).toBeInTheDocument();
    expect(screen.queryByText(/ПКС/)).not.toBeInTheDocument();
  });

  test('не показывает label если program_label=null', () => {
    const dashboard = {
      program: { id: 1, current_phase: 2, program_label: null, diagnosis: 'неопределённый' },
      phase: { ... },
      complex: { ... },
      todayDone: false,
      streak: { current_streak: 0 }
    };
    render(<HomeScreen dashboardData={dashboard} ... />);
    expect(screen.getByText(/Сегодня.*Фаза 2/)).toBeInTheDocument();
    expect(screen.queryByText(/ПКС/)).not.toBeInTheDocument();
  });

  test('не показывает фазу если current_phase=null', () => {
    const dashboard = {
      program: null,
      todayDone: false,
      streak: { current_streak: 0 }
    };
    render(<HomeScreen dashboardData={dashboard} ... />);
    expect(screen.getByText(/Сегодня/)).toBeInTheDocument();
    expect(screen.queryByText(/Фаза/)).not.toBeInTheDocument();
  });
});
```

### Backend test

**Файл:** `backend/tests/__tests__/programLabels.test.js` (новый)

```javascript
const { deriveProgramLabel } = require('../../utils/programLabels');

describe('deriveProgramLabel', () => {
  test.each([
    ['ПКС реконструкция BPTB', 'ПКС'],
    ['ACL repair', 'ПКС'],
    ['разрыв передней крестообразной связки', 'ПКС'],
    ['частичная меннисэктомия медиального мениска', 'Мениск'],
    ['эндопротез коленного сустава', 'Протез сустава'],
    ['TKA', 'Протез сустава'],
    ['грыжа L4-L5', 'Грыжа диска'],
    ['разрыв надостной мышцы', 'Плечо'],
    ['shoulder impingement', 'Плечо'],
    ['артрит ТБС', 'ТБС'],
    ['растяжение связок голеностопа', 'Голеностоп'],
    ['артроскопия колена', 'Колено'],
    ['неизвестный диагноз', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('deriveProgramLabel(%j) === %j', (input, expected) => {
    expect(deriveProgramLabel(input)).toBe(expected);
  });
});
```

### Команды запуска

```bash
cd backend && npm test -- --testPathPattern=programLabels
cd frontend && npm test -- --testPathPattern=HomeScreen --watchAll=false
```

---

## NOT TOUCH

В этом коммите **НЕ трогать**:

- `RoadmapScreen.js` — литерал `?type=acl` остаётся, правится в Волне 1
- `services/telegramBot.js:170` — `WHERE program_type = 'acl'` остаётся, правится в Волне 1
- `DiaryScreen.js` regex по diagnosis для ROM — остаётся
- Любые другие места с литералом «ПКС» вне HomeScreen — список этих мест пишется в follow-up для Волны 1

Это намеренно. Точечный фикс HomeScreen, не миграция всего проекта.

---

## ⛔ STOP — smoke в реальном браузере

### Сценарий 1: ACL пациент видит «ПКС · Фаза N»

1. Залогиниться пациентом id=14 `avi707@mail.ru` / `Test1234`
2. Проверить что у него `diagnosis` содержит «ПКС» или «ACL» (если нет — обновить через psql или через инструкторскую сторону на dev)
3. На HomeScreen в hero увидеть «Сегодня · ПКС · Фаза N» (с тремя сегментами разделёнными ` · `)

### Сценарий 2: не-ACL пациент НЕ видит «ПКС»

1. Создать тестового пациента (или взять существующего с не-ACL diagnosis)
2. Через psql: `UPDATE rehab_programs SET diagnosis = 'разрыв надостной мышцы' WHERE patient_id = <test_id>;`
3. Залогиниться этим пациентом
4. На HomeScreen увидеть «Сегодня · Плечо · Фаза N»
5. **НЕ должно быть** «ПКС» нигде

### Сценарий 3: Неизвестный диагноз — без префикса

1. `UPDATE rehab_programs SET diagnosis = 'нечто экзотическое' WHERE patient_id = <test_id>;`
2. Залогиниться, открыть HomeScreen
3. Увидеть «Сегодня · Фаза N» (без program_label сегмента)
4. **НЕ должно быть** «ПКС» нигде

### Сценарий 4: Нет программы

1. `UPDATE rehab_programs SET status = 'paused' WHERE patient_id = <test_id>;` (или DELETE для теста)
2. Залогиниться, открыть HomeScreen
3. Увидеть «Сегодня» (без сегментов label / Фаза)
4. Не должно быть JS-ошибок в консоли

⛔ **Если в консоли ошибки или хоть один сценарий проваливается — НЕ коммитить.**

---

## Файлы

**Создать:**
- `backend/utils/programLabels.js`
- `backend/tests/__tests__/programLabels.test.js`

**Изменить:**
- `backend/routes/rehab.js` (handler `GET /my/dashboard`, добавить расчёт program_label)
- `frontend/src/pages/PatientDashboard/components/HomeScreen.js` — убрать литерал
- `frontend/src/pages/PatientDashboard/components/HomeScreen.test.js` — обновить mock'и + новые тесты

**НЕ ТРОГАТЬ:**
- `RoadmapScreen.js`, `DiaryScreen.js`
- `services/telegramBot.js`
- `database/schema.sql` или migrations

---

## Коммит

**Текст:**

```
feat(home): убрать литерал «ПКС» из hero, динамический program_label

Минимальный фикс #1 из Patient UX Roadmap v2 (Волна 0):
- HomeScreen больше не хардкодит «ПКС Фаза N» — берёт program_label
  из dashboard endpoint
- program_label вычисляется regex-маппингом по diagnosis (временное
  решение до Волны 1, где появится поле rehab_programs.program_type
  с справочником program_types)
- Не-ACL пациенты теперь видят корректное название («Плечо», «Колено»,
  «Грыжа диска» и т.п.) или просто «Фаза N» если диагноз не распознан

Изменения:
- utils/programLabels.js (deriveProgramLabel) — hardcoded mapping с TODO
- /api/rehab/my/dashboard возвращает program.program_label
- HomeScreen рендерит сегменты Сегодня · {label} · Фаза {N} условно

Тесты: 16 backend + 3 frontend.
Roadmap: PATIENT_UX_ROADMAP_2026-05-08_v2.md #1 (минимальный фикс)
TODO: Wave 1 заменит на program_types lookup
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Раздел «Известные ограничения»: добавить запись «HomeScreen.program_label — regex-маппинг по diagnosis, временно. Замена в Волне 1»

**`MEMORY.md` или `memory/wave_0_program_labels.md`:**
- Зафиксировать: «`programLabels.js` — намеренно hardcoded в Волне 0. В Волне 1 заменяется на справочник program_types с фолбэком на этот файл, потом удаляется через 1-2 спринта»

**`wave_0_progress.md`:**
- Строка `02` → `✅ done`, SHA, дата

---

## Definition of Done

- [ ] `deriveProgramLabel` покрывает все ключевые диагнозы (16 кейсов в тесте)
- [ ] HomeScreen рендерит правильно для всех 4 smoke-сценариев
- [ ] Нет литерала «ПКС» в HomeScreen.js
- [ ] Backend и frontend тесты зелёные
- [ ] Smoke 1-4 пройдены в реальном браузере
- [ ] TODO-комментарии расставлены (`utils/programLabels.js`, response handler)
- [ ] Документация обновлена
- [ ] **Push после явного «ок»**
