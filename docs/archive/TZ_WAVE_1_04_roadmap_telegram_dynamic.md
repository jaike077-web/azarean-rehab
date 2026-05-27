# TZ Wave 1 · Коммит 1.04 — RoadmapScreen + Telegram bot: динамический program_type

**Дата:** 2026-05-12
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #1
**Цель:** убрать последние два места хардкода `'acl'`:
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js:344` — `?type=acl` дефолт
- `services/telegramBot.js:170` — `WHERE program_type = 'acl'`

После этого коммита Bug #12 закрыт полностью.
**Объём:** 2-3 часа
**Риск:** низкий — точечные правки, чёткая семантика

---

## Зависимость

После коммитов 1.01-1.03. Ветка строится от `wave-1/03-home-label-full-replacement`.

---

## Что блокирует

После Wave 0 коммитов и Wave 1 коммитов 1.01-1.03 остаются два жёстких ACL-хардкода:

1. **RoadmapScreen.js строка ~344:** при запросе фаз делается `rehab.getPhases('acl')` или `?type=acl` — независимо от того, какая программа у пациента. Результат: пациент с `program_type='shoulder_general'` увидит фазы ACL вместо плечевых.

2. **services/telegramBot.js строка ~170:** при формировании напоминаний / советов Telegram-бот выбирает фазы запросом `WHERE program_type = 'acl'`. Не-ACL пациентам шлются неподходящие тексты.

**После этого коммита:** оба места используют `program_type` из активной программы пациента. Bug #12 закрыт полностью.

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js` — заменить хардкод `'acl'` на динамический program_type из dashboardData
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.test.js` — обновить моки (program_type теперь приходит из props/state)
- `backend/services/telegramBot.js` — SQL запрос с параметром program_type из patient'а
- `backend/tests/__tests__/telegramBot.test.js` — добавить тест для не-ACL пациента

**НЕ ТРОГАТЬ:**
- HomeScreen.js (1.03 закрыт)
- Backend `/api/rehab/phases/:type` — endpoint уже параметризован, не меняем
- AdminContent (1.05)
- LOCKED-зоны

---

## Frontend — RoadmapScreen

### Шаг 1 — найти место

Grep `'acl'` или `getPhases` или `?type=acl` в `RoadmapScreen.js`. Должно быть что-то такое (примерно строки 340-350):

```javascript
useEffect(() => {
  rehab.getPhases('acl').then(...)
  // или
  rehab.getPhases({ type: 'acl' }).then(...)
}, []);
```

И похожее место для tips, если используются.

### Шаг 2 — получить program_type

RoadmapScreen рендерится внутри PatientDashboard. PatientDashboard уже загружает `dashboardData` (через `rehab.getMyDashboard()`). Нужно прокинуть program_type или весь program-объект в RoadmapScreen props.

**Вариант A — прокинуть из родителя:**

В `PatientDashboard.js`:
```javascript
<RoadmapScreen
  /* existing props */
  programType={dashboardData?.program?.program_type}
/>
```

В `RoadmapScreen.js`:
```javascript
function RoadmapScreen({ /* existing props */, programType }) {
  useEffect(() => {
    if (!programType) return; // нет программы — пусто, не запрашиваем фазы
    rehab.getPhases(programType).then(setPhases);
  }, [programType]);
  // ...
}
```

**Вариант B — RoadmapScreen сам делает дополнительный запрос dashboard:**

Хуже, потому что:
- Дублирует запрос (dashboard уже грузит родитель)
- Нет реактивности на изменение программы

**Решение: Вариант A.**

### Шаг 3 — добавить guard на отсутствие programType

Если пациент без программы — `programType = null/undefined`. Тогда:
- Не запрашивать `getPhases()`
- Отрендерить специальный empty-state: «У вас пока нет программы реабилитации. Куратор скоро составит её для вас.»

Это уже есть для случая «нет программы» в Roadmap'е (если был), либо добавить минимально:

```javascript
if (!programType) {
  return (
    <div className="rs-screen rs-empty">
      <p className="rs-empty__text">
        У вас пока нет активной программы реабилитации. Куратор скоро составит её для вас.
      </p>
    </div>
  );
}
```

### Шаг 4 — getPhases подпись

Проверить что `rehab.getPhases(type)` в `services/api.js` уже корректно проксирует параметр — это не наш код менять, но проверить что вызов работает.

---

## Backend — services/telegramBot.js

### Шаг 1 — найти место

Grep `'acl'` в `services/telegramBot.js`. Должно быть запрос фаз/советов в районе строки 170:

```javascript
const phases = await query(
  "SELECT * FROM rehab_phases WHERE program_type = 'acl' ORDER BY phase_number"
);
```

Или похожее для tips.

### Шаг 2 — выяснить контекст вызова

Telegram-бот шлёт напоминания/советы конкретному пациенту. Должна быть переменная типа `patient` или `chatId → patient` lookup. Найти источник `patient` и взять у него `program_type`.

Если запрос делается из контекста с уже доступным `patient.id`:

```javascript
// До
const phases = await query(
  "SELECT * FROM rehab_phases WHERE program_type = 'acl' ORDER BY phase_number"
);

// После
const program = await query(
  `SELECT program_type FROM rehab_programs
   WHERE patient_id = $1 AND status = 'active' AND is_active = true
   ORDER BY created_at DESC LIMIT 1`,
  [patient.id]
);

const programType = program.rows[0]?.program_type;
if (!programType) {
  // У пациента нет активной программы — не шлём фазное напоминание/совет
  return;
}

const phases = await query(
  'SELECT * FROM rehab_phases WHERE program_type = $1 ORDER BY phase_number',
  [programType]
);
```

### Шаг 3 — graceful degradation

Если по программе нет фаз в `rehab_phases` для данного program_type (например, для `shoulder_general` фаз ещё не залили) — пропускать напоминание, не падать с ошибкой.

```javascript
if (phases.rows.length === 0) {
  console.warn(`No phases found for program_type=${programType}, patient=${patient.id}`);
  return;
}
```

---

## Тесты

### Frontend: `RoadmapScreen.test.js`

Обновить существующие тесты — теперь компонент принимает `programType` prop:

```javascript
import { rehab } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  rehab: {
    getPhases: jest.fn(() => Promise.resolve({ data: [] })),
    getStuckStatus: jest.fn(() => Promise.resolve({ data: { is_stuck: false } })),
  },
}));

describe('RoadmapScreen — динамический program_type', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('запрашивает фазы по acl если programType=acl', async () => {
    render(<RoadmapScreen programType="acl" onNavigateToContact={jest.fn()} />);
    await waitFor(() => {
      expect(rehab.getPhases).toHaveBeenCalledWith('acl');
    });
  });

  it('запрашивает фазы по shoulder_general если programType=shoulder_general', async () => {
    render(<RoadmapScreen programType="shoulder_general" onNavigateToContact={jest.fn()} />);
    await waitFor(() => {
      expect(rehab.getPhases).toHaveBeenCalledWith('shoulder_general');
    });
  });

  it('показывает empty state если programType отсутствует', async () => {
    render(<RoadmapScreen programType={null} onNavigateToContact={jest.fn()} />);
    expect(screen.getByText(/нет активной программы/i)).toBeInTheDocument();
    expect(rehab.getPhases).not.toHaveBeenCalled();
  });

  it('перезапрашивает фазы при смене programType', async () => {
    const { rerender } = render(<RoadmapScreen programType="acl" onNavigateToContact={jest.fn()} />);
    await waitFor(() => {
      expect(rehab.getPhases).toHaveBeenCalledWith('acl');
    });

    rerender(<RoadmapScreen programType="shoulder_general" onNavigateToContact={jest.fn()} />);
    await waitFor(() => {
      expect(rehab.getPhases).toHaveBeenCalledWith('shoulder_general');
    });
  });
});
```

### Backend: `telegramBot.test.js`

Добавить тест для не-ACL пациента:

```javascript
describe('Telegram bot — динамический program_type', () => {
  it('запрашивает фазы по программе пациента, не хардкоду acl', async () => {
    const patient = await createTestPatient();
    await query(
      `INSERT INTO rehab_programs (patient_id, program_type, current_phase, status, is_active)
       VALUES ($1, 'shoulder_general', 1, 'active', true)`,
      [patient.id]
    );
    // Залить минимальную фазу для shoulder_general в этом тесте
    await query(
      `INSERT INTO rehab_phases (program_type, phase_number, title, duration_weeks)
       VALUES ('shoulder_general', 1, 'Test shoulder phase', 4)
       ON CONFLICT (program_type, phase_number) DO NOTHING`
    );

    // Вызов внутренней функции из telegramBot, которая использует program_type
    const result = await sendDailyTipToPatient(patient.id);
    // Проверяем что не упало и использовалась shoulder фаза
    expect(result).toBeDefined();
    // ... конкретные expects зависят от структуры функции
  });

  it('пропускает напоминание если у пациента нет активной программы', async () => {
    const patient = await createTestPatient();
    const result = await sendDailyTipToPatient(patient.id);
    // Не упал, не отправил ничего
    expect(result).toBeUndefined();
  });

  it('пропускает напоминание если для program_type нет фаз в БД', async () => {
    const patient = await createTestPatient();
    await query(
      `INSERT INTO rehab_programs (patient_id, program_type, current_phase, status, is_active)
       VALUES ($1, 'knee_general', 1, 'active', true)`,
      [patient.id]
    );
    // knee_general фаз нет (минимальный seed только справочник, не сами фазы)

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await sendDailyTipToPatient(patient.id);
    expect(result).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
```

**Команда запуска:**
```bash
cd backend && npm test -- --testPathPattern=telegramBot
cd frontend && npm test -- --testPathPattern=RoadmapScreen --watchAll=false
```

---

## NOT TOUCH

- Backend `/api/rehab/phases/:type` endpoint — он уже параметризован, не меняем
- HomeScreen.js (1.03 закрыт)
- AdminContent (1.05)
- LOCKED ExerciseRunner

---

## Smoke test (в реальном браузере)

### Сценарий 1 — ACL пациент видит ACL-фазы

1. Войти как пациент avi707@mail.ru
2. Roadmap таб
3. **Ожидание:** 6 фаз ACL (Защита → Ранняя мобильность → … → Поддержание)

### Сценарий 2 — Shoulder пациент видит empty state или shoulder фазы (если залиты)

1. В dev-БД временно изменить `UPDATE rehab_programs SET program_type = 'shoulder_general' WHERE patient_id = (SELECT id FROM patients WHERE email = 'avi707@mail.ru')`
2. Войти как пациент → Roadmap
3. **Ожидание:** показан empty-state «Фазы для этой программы ещё не подготовлены» или фактический контент если в dev есть скелеты shoulder фаз (обычно в Wave 1A нет — будут в Wave 1B AdminContent)
4. Откатить: `UPDATE ... SET program_type = 'acl'`

### Сценарий 3 — пациент без программы

1. Деактивировать программу: `UPDATE rehab_programs SET is_active = false WHERE patient_id = $id`
2. Войти, открыть Roadmap
3. **Ожидание:** empty state «У вас пока нет активной программы»
4. Откатить

### Сценарий 4 — Telegram bot шлёт правильный совет (опционально, требует прод-токена)

В dev, если есть `TELEGRAM_BOT_TOKEN` и привязанный chat_id:
1. Запустить scheduler с тестовым запуском (можно вручную вызвать функцию `sendDailyTip(patient.id)` через node REPL)
2. Проверить в Telegram что пришёл совет, соответствующий program_type пациента

В dev обычно `TELEGRAM_BOT_TOKEN` не настроен — сценарий пропустить, положиться на unit-тесты.

---

## Файлы — итоговый чеклист

### Создать
- (ничего)

### Изменить
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js` — динамический programType prop
- `frontend/src/pages/PatientDashboard/PatientDashboard.js` — прокинуть programType в `<RoadmapScreen />`
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.test.js` — 4 теста
- `backend/services/telegramBot.js` — параметризовать SQL по program_type из patient'а
- `backend/tests/__tests__/telegramBot.test.js` — 3 теста
- `CLAUDE.md` — Bug #12 → полностью закрыт

### НЕ ТРОГАТЬ
- Backend endpoints `/api/rehab/*` (уже параметризованы)
- HomeScreen.js
- AdminContent
- LOCKED-зоны

---

## Текст коммита

```
feat(roadmap, telegram): убрать хардкод 'acl' — динамический program_type

Wave 1 коммит 1.04 — закрытие Bug #12 полностью.

- RoadmapScreen принимает programType prop из PatientDashboard,
  запрашивает фазы по нему вместо хардкода 'acl'
- Empty state для пациентов без активной программы
- Telegram bot: SQL фаз/советов параметризован program_type
  из активной программы пациента, graceful skip если фаз нет
  для данного program_type

Closes Bug #12 полностью. Multi-protocol foundation готов.

Test: frontend +4, backend +3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Пост-коммит

**`CLAUDE.md`:**
- Секция «Открытые баги» Bug #12 → вычеркнуть полностью
- Секция «Завершённые исправления» — запись про коммит 1.04 (закрытие Bug #12)

**Memory:**
- `wave_1_progress.md` — 1.04 → `⏸ заморожен`
- (опционально) `memory/wave_1_multi_protocol_foundation_done.md` — короткая запись что Bug #12 полностью закрыт после 1.04, фундамент multi-protocol заложен

---

## Definition of Done

- [ ] `RoadmapScreen.js` принимает `programType` prop
- [ ] `PatientDashboard.js` прокидывает `programType` из `dashboardData`
- [ ] Empty state работает для отсутствующей программы
- [ ] `services/telegramBot.js` параметризует SQL по `program_type`
- [ ] Graceful skip если фаз для programType нет
- [ ] 4 frontend теста зелёные
- [ ] 3 backend теста зелёные
- [ ] Smoke сценарии 1-3 пройдены в браузере
- [ ] CLAUDE.md обновлён (Bug #12 closed)
- [ ] Коммит создан + Co-Authored-By
- [ ] `wave_1_progress.md` обновлён: 1.04 → `⏸ заморожен`
- [ ] **Push только по «ок» от Vadim'а**
