# TZ Волна 0 · Коммит 06 — простой stuck banner для пациента на RoadmapScreen

**Дата:** 2026-05-08
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #2 (стадия 1, минимальная)
**Цель:** Если пациент находится на фазе дольше чем `duration_weeks × 1.5`, показать ему мягкий info-баннер с CTA «Связаться с куратором». Без чек-листа критериев (это в Волне 2). Без push'а инструктору (это в #04 другого коммита волны или будет добавлено отдельно для инструктора).
**Объём:** 3-4 часа
**Риск:** низкий — backend новый эндпоинт + frontend баннер на RoadmapScreen, ничего не ломает.

---

## Что блокирует

Сейчас пациент, застрявший на фазе 8+ недель при ожидаемых 4, видит на `RoadmapScreen` ту же фазу как ни в чём не бывало. `criteria_next` отображается просто текстовым списком без сверки с реальностью. Дисклеймер «Сроки ориентировочные. Переход по решению специалиста при достижении критериев» — единственное что есть.

**Клиническая проблема:** пациент с реальным застреванием получает молчание системы. Без напоминания «может стоит обсудить прогресс с куратором» — он либо смирится с медленным прогрессом и не обратится к врачу, либо запаникует и сам решит «бросить».

**После этого коммита:** при превышении duration_weeks × 1.5 на RoadmapScreen появляется неагрессивный баннер «Ты на этой фазе уже X недель. Это нормально, у разных людей сроки разные. Если беспокоит — обсуди с куратором». Кнопка ведёт в ContactScreen с пред-заполненным сообщением.

**Что НЕ делается этим коммитом:**
- Чек-лист критериев перехода с автоматической самооценкой (Волна 2)
- Telegram-push куратору при застревании пациента (отдельный коммит после Волны 0 или в Волне 1 вместе с stuck-логикой инструктора)
- Бейдж «застрял» в `Patients.js` для инструктора — то же самое, отдельно
- Cron для weekly-проверки — пока не нужен, статус вычисляется on-the-fly при открытии RoadmapScreen

---

## Параллельная работа — координация

**ТРОГАЕМ (не запускать другие сессии на этих файлах):**
- `backend/routes/rehab.js` — новый эндпоинт `GET /api/rehab/my/stuck-status` (+ уже модифицирован коммитами 01 и 03 — следить за порядком merge)
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js` — добавление баннера
- `frontend/src/services/api.js` — экспорт новой функции `rehab.getStuckStatus()`
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.css` — стили баннера
- `backend/tests/__tests__/rehab.routes.test.js` — новые тесты
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.test.js` — новые тесты

**НЕ ТРОГАТЬ:**
- `services/scheduler.js` — никаких новых cron-задач этим коммитом (они в отдельном коммите для инструкторской стороны, после Волны 0)
- `services/telegramBot.js` — нет push'а
- `frontend/src/pages/Patients.js` — инструкторская сторона в этом коммите не затрагивается
- `rehab_phases` таблица — никаких новых колонок

---

## Backend — новый эндпоинт

### `GET /api/rehab/my/stuck-status`

**Авторизация:** patient JWT (через `authenticatePatient` middleware, как у остальных `/my/*` эндпоинтов).

**Логика:**
1. Найти активную программу пациента (`SELECT * FROM rehab_programs WHERE patient_id = $1 AND status = 'active' AND is_active = true LIMIT 1`)
2. Если программы нет → вернуть `{ data: { is_stuck: false } }`
3. Найти текущую фазу (`SELECT * FROM rehab_phases WHERE program_type = $programType AND phase_number = $currentPhase AND is_active = true`)
4. Если фазы нет в каталоге → `{ data: { is_stuck: false } }` (защита от рассинхрона)
5. Вычислить:
   - `phase_started_at` (из программы; если NULL — берём `created_at` программы как fallback)
   - `expected_end_date = phase_started_at + duration_weeks * 7 days`
   - `actual_weeks = (NOW() - phase_started_at) / 7`
   - `is_stuck = NOW() > phase_started_at + duration_weeks * 7 * 1.5`
6. Вернуть:

```json
{
  "data": {
    "is_stuck": true,
    "current_phase": 3,
    "phase_title": "Восстановление мобильности",
    "actual_weeks": 8.4,
    "expected_weeks": 4,
    "phase_started_at": "2026-03-12"
  }
}
```

или если не застрял:

```json
{
  "data": {
    "is_stuck": false,
    "current_phase": 3,
    "phase_title": "Восстановление мобильности",
    "actual_weeks": 2.1,
    "expected_weeks": 4,
    "phase_started_at": "2026-04-23"
  }
}
```

или если нет программы:

```json
{
  "data": {
    "is_stuck": false
  }
}
```

**Точка вставки в `routes/rehab.js`:** добавить рядом с другими `/my/*` эндпоинтами (например, после `/my/dashboard` и до `/my/diary`). Найти grep'ом блок `router.get('/my/dashboard'` и вставить НИЖЕ него.

### Полный код эндпоинта

```javascript
// GET /api/rehab/my/stuck-status — статус застревания на текущей фазе
// Считается, что пациент "застрял" если он на фазе дольше чем duration_weeks × 1.5
router.get('/my/stuck-status', authenticatePatient, async (req, res, next) => {
  try {
    const patientId = req.patient.id;

    // Активная программа пациента
    const programResult = await query(
      `SELECT id, program_type, current_phase, phase_started_at, created_at
       FROM rehab_programs
       WHERE patient_id = $1 AND status = 'active' AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [patientId]
    );

    if (programResult.rows.length === 0) {
      return res.json({ data: { is_stuck: false } });
    }

    const program = programResult.rows[0];
    const programType = program.program_type || 'acl';

    // Текущая фаза в каталоге
    const phaseResult = await query(
      `SELECT title, duration_weeks
       FROM rehab_phases
       WHERE program_type = $1 AND phase_number = $2 AND is_active = true
       LIMIT 1`,
      [programType, program.current_phase]
    );

    if (phaseResult.rows.length === 0) {
      return res.json({ data: { is_stuck: false } });
    }

    const phase = phaseResult.rows[0];
    const durationWeeks = phase.duration_weeks || 4; // fallback 4 недели если NULL

    // Если phase_started_at NULL — берём created_at программы
    const phaseStartedAt = program.phase_started_at || program.created_at;
    const phaseStartDate = new Date(phaseStartedAt);
    const now = new Date();
    const daysOnPhase = Math.floor((now - phaseStartDate) / (1000 * 60 * 60 * 24));
    const actualWeeks = +(daysOnPhase / 7).toFixed(1);

    // Stuck threshold: 1.5 × duration_weeks
    const stuckThresholdDays = durationWeeks * 7 * 1.5;
    const isStuck = daysOnPhase > stuckThresholdDays;

    return res.json({
      data: {
        is_stuck: isStuck,
        current_phase: program.current_phase,
        phase_title: phase.title,
        actual_weeks: actualWeeks,
        expected_weeks: durationWeeks,
        phase_started_at: phaseStartDate.toISOString().split('T')[0]
      }
    });
  } catch (err) {
    next(err);
  }
});
```

---

## Frontend

### 1. `frontend/src/services/api.js`

Найти существующий объект `rehab` (export rehab — там уже есть `rehab.getPhases()`, `rehab.getMyDashboard()` и др.) и добавить:

```javascript
// rehab.getStuckStatus() — статус застревания пациента на текущей фазе
getStuckStatus: () => patientApi.get('/rehab/my/stuck-status').then(r => r.data),
```

### 2. `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js`

**Что добавить:** `useEffect` который запрашивает stuck-status при монтировании, и условный рендер баннера если `is_stuck = true`.

**Точка вставки 1 — состояние:** найти `useState` объявления в начале компонента (там уже есть `phases`, `loading`, etc.). Добавить:

```javascript
const [stuckStatus, setStuckStatus] = useState(null);
```

**Точка вставки 2 — useEffect:** рядом с существующим `useEffect` на загрузку фаз. Новый эффект:

```javascript
useEffect(() => {
  let cancelled = false;
  rehab.getStuckStatus()
    .then((res) => {
      if (!cancelled) {
        setStuckStatus(res?.data || { is_stuck: false });
      }
    })
    .catch((err) => {
      // Молча игнорируем ошибку — баннер просто не покажется
      console.warn('Failed to load stuck-status:', err);
    });
  return () => { cancelled = true; };
}, []);
```

**Точка вставки 3 — рендер баннера:** в JSX, до текущего рендера фаз. Найти где начинается `<div className="rs-screen">` или эквивалент главного контейнера, и сразу после ScreenHeader / в начале основного контента вставить:

```jsx
{stuckStatus?.is_stuck && (
  <div className="rs-stuck-banner" role="status">
    <div className="rs-stuck-banner__icon" aria-hidden="true">
      <Clock size={20} />
    </div>
    <div className="rs-stuck-banner__content">
      <p className="rs-stuck-banner__title">
        Ты на этой фазе уже {Math.round(stuckStatus.actual_weeks)} недель
      </p>
      <p className="rs-stuck-banner__text">
        Это нормально, у разных людей сроки разные.
        Если беспокоит — обсуди прогресс с куратором.
      </p>
      <button
        type="button"
        className="rs-stuck-banner__cta"
        onClick={handleContactCurator}
      >
        Связаться с куратором
      </button>
    </div>
  </div>
)}
```

**Точка вставки 4 — handler:** до return функции компонента, рядом с другими handlerами:

```javascript
const handleContactCurator = useCallback(() => {
  // Перевод на ContactScreen с пред-заполненным сообщением
  // Используем тот же mechanism что и onTabChange — ищем функцию навигации между screens
  // (в PatientDashboard это передаётся через props.setScreen или onTabChange)
  if (typeof onNavigateToContact === 'function') {
    onNavigateToContact({
      prefilledMessage: `Здравствуйте! Я на фазе ${stuckStatus.current_phase} «${stuckStatus.phase_title}» уже ${Math.round(stuckStatus.actual_weeks)} недель. Хочу обсудить прогресс.`
    });
  }
}, [onNavigateToContact, stuckStatus]);
```

**Точка вставки 5 — props:** добавить `onNavigateToContact` в список props компонента:

```javascript
function RoadmapScreen({ /* ...existing props... */, onNavigateToContact }) {
```

### 3. `frontend/src/pages/PatientDashboard/PatientDashboard.js`

**Что добавить:** прокинуть `onNavigateToContact` в `<RoadmapScreen />`. Это значит создать в `PatientDashboard` функцию которая:
1. Меняет screen на 'contact'
2. Передаёт `prefilledMessage` в ContactScreen

Найти существующее место рендера `<RoadmapScreen />` в `PatientDashboard.js` и расширить:

```jsx
<RoadmapScreen
  /* ...existing props... */
  onNavigateToContact={(payload) => {
    setContactPrefill(payload);
    setScreen('contact');
  }}
/>
```

Добавить в state PatientDashboard:

```javascript
const [contactPrefill, setContactPrefill] = useState(null);
```

И передать в ContactScreen:

```jsx
<ContactScreen
  /* ...existing props... */
  prefilledMessage={contactPrefill?.prefilledMessage}
  onPrefillConsumed={() => setContactPrefill(null)}
/>
```

### 4. `frontend/src/pages/PatientDashboard/components/ContactScreen.js`

**Что добавить:** обработать `prefilledMessage` prop при монтировании — заполнить input/textarea сообщения. После того как пользователь начал редактировать (или после mount + N миллисекунд), вызвать `onPrefillConsumed` чтобы pred-заполнение не повторялось.

**Минимальная правка** (точка вставки — useEffect в начале компонента):

```javascript
useEffect(() => {
  if (prefilledMessage && !messageInput) {
    setMessageInput(prefilledMessage);
    if (typeof onPrefillConsumed === 'function') {
      onPrefillConsumed();
    }
  }
}, [prefilledMessage, messageInput, onPrefillConsumed]);
```

Где `messageInput`/`setMessageInput` — существующее состояние input'а сообщения чату. Найти его grep'ом в файле и использовать.

### 5. `frontend/src/pages/PatientDashboard/components/RoadmapScreen.css`

Добавить стили баннера:

```css
.rs-stuck-banner {
  display: flex;
  gap: 12px;
  padding: 16px;
  margin: 0 0 16px 0;
  border-radius: 12px;
  background: var(--pd-warning-bg, rgba(251, 191, 36, 0.1));
  border: 1px solid var(--pd-warning-border, rgba(251, 191, 36, 0.3));
}

.rs-stuck-banner__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pd-warning, #fbbf24);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pd-bg, #fff);
}

.rs-stuck-banner__content {
  flex: 1;
}

.rs-stuck-banner__title {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--pd-text, #1c1917);
}

.rs-stuck-banner__text {
  margin: 0 0 12px 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--pd-text-muted, #57534e);
}

.rs-stuck-banner__cta {
  background: transparent;
  border: 1px solid var(--pd-primary, #0d9488);
  color: var(--pd-primary, #0d9488);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 36px;
}

.rs-stuck-banner__cta:hover {
  background: var(--pd-primary, #0d9488);
  color: var(--pd-bg, #fff);
}

.rs-stuck-banner__cta:focus-visible {
  outline: 2px solid var(--pd-primary, #0d9488);
  outline-offset: 2px;
}

/* Dark theme */
:root[data-theme='dark'] .rs-stuck-banner {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.4);
}
```

---

## NOT TOUCH (в этом конкретном файле RoadmapScreen.js)

- Логика рендера фаз с акконкордеоном (текущий accordion с phase details)
- `criteria_next` отображение — остаётся как сейчас (плоский список строк, без чекбоксов). Структурирование в Волне 2.
- Регулярные выражения регламента (regex по диагнозу для подбора фазного контента, если есть) — не трогаем здесь
- ROM-блок и его лейблы — не трогаем здесь, в Волне 2 поправим
- Существующий disclaimer про сроки внизу экрана

---

## Тесты

### Backend: новые тесты в `backend/tests/__tests__/rehab.routes.test.js`

Добавить новый describe-блок:

```javascript
describe('GET /api/rehab/my/stuck-status', () => {
  // Подготовка: создать пациента с программой и фазами в beforeEach
  let patient, program, accessToken;

  beforeEach(async () => {
    // Создаём тестового пациента, фазы ACL и программу
    patient = await createTestPatient();
    accessToken = signPatientToken(patient.id);
    await seedAclPhases(); // helper утилита, создаёт 6 фаз с duration_weeks=4 каждая
    program = await createTestProgram({
      patientId: patient.id,
      programType: 'acl',
      currentPhase: 2,
      phaseStartedAt: new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000) // 8 недель назад
    });
  });

  it('возвращает is_stuck=true если пациент на фазе дольше 1.5×duration_weeks', async () => {
    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Cookie', [`patient_access_token=${accessToken}`])
      .expect(200);

    expect(res.body.data.is_stuck).toBe(true);
    expect(res.body.data.current_phase).toBe(2);
    expect(res.body.data.actual_weeks).toBeGreaterThanOrEqual(8);
    expect(res.body.data.expected_weeks).toBe(4);
  });

  it('возвращает is_stuck=false если пациент на фазе в пределах нормы', async () => {
    // Перезаписываем phase_started_at на 2 недели назад
    await query(
      'UPDATE rehab_programs SET phase_started_at = $1 WHERE id = $2',
      [new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000), program.id]
    );

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Cookie', [`patient_access_token=${accessToken}`])
      .expect(200);

    expect(res.body.data.is_stuck).toBe(false);
    expect(res.body.data.actual_weeks).toBeLessThan(4);
  });

  it('возвращает is_stuck=false если у пациента нет активной программы', async () => {
    await query('UPDATE rehab_programs SET is_active = false WHERE id = $1', [program.id]);

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Cookie', [`patient_access_token=${accessToken}`])
      .expect(200);

    expect(res.body.data.is_stuck).toBe(false);
    expect(res.body.data.current_phase).toBeUndefined();
  });

  it('возвращает 401 если пациент не авторизован', async () => {
    await request(app)
      .get('/api/rehab/my/stuck-status')
      .expect(401);
  });

  it('использует created_at программы как fallback если phase_started_at NULL', async () => {
    await query(
      `UPDATE rehab_programs SET phase_started_at = NULL,
                                   created_at = $1
       WHERE id = $2`,
      [new Date(Date.now() - 9 * 7 * 24 * 60 * 60 * 1000), program.id]
    );

    const res = await request(app)
      .get('/api/rehab/my/stuck-status')
      .set('Cookie', [`patient_access_token=${accessToken}`])
      .expect(200);

    expect(res.body.data.is_stuck).toBe(true);
    expect(res.body.data.actual_weeks).toBeGreaterThanOrEqual(9);
  });
});
```

**Команда запуска backend тестов:**
```bash
cd backend && npm test -- --testPathPattern=rehab.routes
```

### Frontend: новые тесты в `frontend/src/pages/PatientDashboard/components/RoadmapScreen.test.js`

```javascript
import { rehab } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  rehab: {
    getPhases: jest.fn(() => Promise.resolve({ data: [] })),
    getStuckStatus: jest.fn(),
  },
}));

describe('RoadmapScreen — stuck banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('показывает баннер если is_stuck=true', async () => {
    rehab.getStuckStatus.mockResolvedValueOnce({
      data: {
        is_stuck: true,
        current_phase: 3,
        phase_title: 'Восстановление мобильности',
        actual_weeks: 8,
        expected_weeks: 4,
        phase_started_at: '2026-03-12'
      }
    });

    render(<RoadmapScreen onNavigateToContact={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/8 недель/i)).toBeInTheDocument();
      expect(screen.getByText(/Это нормально/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Связаться с куратором/i })).toBeInTheDocument();
    });
  });

  it('не показывает баннер если is_stuck=false', async () => {
    rehab.getStuckStatus.mockResolvedValueOnce({
      data: { is_stuck: false }
    });

    render(<RoadmapScreen onNavigateToContact={jest.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/Это нормально/i)).not.toBeInTheDocument();
    });
  });

  it('CTA вызывает onNavigateToContact с prefilledMessage', async () => {
    const onNavigateToContact = jest.fn();
    rehab.getStuckStatus.mockResolvedValueOnce({
      data: {
        is_stuck: true,
        current_phase: 3,
        phase_title: 'Восстановление мобильности',
        actual_weeks: 8,
        expected_weeks: 4,
        phase_started_at: '2026-03-12'
      }
    });

    render(<RoadmapScreen onNavigateToContact={onNavigateToContact} />);

    const cta = await screen.findByRole('button', { name: /Связаться с куратором/i });
    fireEvent.click(cta);

    expect(onNavigateToContact).toHaveBeenCalledWith({
      prefilledMessage: expect.stringContaining('фазе 3')
    });
    expect(onNavigateToContact.mock.calls[0][0].prefilledMessage)
      .toContain('Восстановление мобильности');
  });

  it('не падает если getStuckStatus вернул ошибку', async () => {
    rehab.getStuckStatus.mockRejectedValueOnce(new Error('Network'));
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => {
      render(<RoadmapScreen onNavigateToContact={jest.fn()} />);
    }).not.toThrow();

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    consoleWarnSpy.mockRestore();
  });
});
```

**Команда запуска frontend тестов:**
```bash
cd frontend && npm test -- --testPathPattern=RoadmapScreen --watchAll=false
```

---

## Smoke test (в реальном браузере)

**Подготовка:** Локальный backend + frontend запущены. Тестовый пациент id=14 (`avi707@mail.ru` / `Test1234`). У него должна быть активная программа.

### Сценарий 1 — пациент НЕ застрял (баннер не показывается)

1. Войти как пациент `avi707@mail.ru` / `Test1234`
2. На главном (HomeScreen) тапнуть таб «Путь восстановления» (Roadmap)
3. **Ожидаемо:** баннер «Ты на этой фазе уже X недель» отсутствует
4. В DevTools Network — проверить запрос `GET /api/rehab/my/stuck-status` ответ `{"data":{"is_stuck":false,...}}`

### Сценарий 2 — искусственно застрявший пациент (баннер показывается)

1. В терминале на dev-БД:
   ```bash
   psql -U postgres -d azarean_rehab -c "
     UPDATE rehab_programs
     SET phase_started_at = NOW() - INTERVAL '10 weeks'
     WHERE patient_id = 14 AND status = 'active';
   "
   ```
2. Браузер → Refresh страницы /patient-dashboard → таб Roadmap
3. **Ожидаемо:** баннер появился, текст «Ты на этой фазе уже ~10 недель», иконка часов слева, кнопка «Связаться с куратором»
4. **Визуальная проверка:**
   - Светлая тема: жёлтый фон pale, тёмный текст, читаемый
   - Тёмная тема (toggle на ProfileScreen): фон чуть темнее жёлтого, текст светлый, контраст ОК
5. Тапнуть «Связаться с куратором»
6. **Ожидаемо:** переход на таб Contact, в поле сообщения уже текст «Здравствуйте! Я на фазе X «Y» уже ~10 недель. Хочу обсудить прогресс.»

### Сценарий 3 — отсутствие активной программы

1. В БД:
   ```bash
   psql -U postgres -d azarean_rehab -c "
     UPDATE rehab_programs SET is_active = false WHERE patient_id = 14;
   "
   ```
2. Refresh, открыть Roadmap
3. **Ожидаемо:** баннер не показан. Возможно показано «нет программы» (существующее поведение).
4. Проверить что не упало с ошибкой
5. **Откатить:** восстановить программу:
   ```bash
   psql -U postgres -d azarean_rehab -c "
     UPDATE rehab_programs SET is_active = true WHERE patient_id = 14;
     UPDATE rehab_programs SET phase_started_at = NOW() - INTERVAL '2 weeks' WHERE patient_id = 14;
   "
   ```

### Сценарий 4 — backend недоступен (graceful degradation)

1. Остановить backend (`Ctrl+C` в его терминале)
2. На патиент-дашборде refresh + переключиться на Roadmap
3. **Ожидаемо:** RoadmapScreen рендерится без баннера, без ошибок в консоли (только `console.warn` про fail load stuck-status)
4. Перезапустить backend → refresh → баннер должен снова работать (если пациент застрял)

---

## Файлы — итоговый чеклист

### Создать
- (нет новых файлов в backend)
- (нет новых файлов в frontend)

### Изменить
- `backend/routes/rehab.js` — добавить эндпоинт `GET /my/stuck-status`
- `backend/tests/__tests__/rehab.routes.test.js` — добавить describe-блок
- `frontend/src/services/api.js` — добавить `rehab.getStuckStatus()`
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js` — добавить state + useEffect + баннер JSX + handler
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.css` — добавить классы `.rs-stuck-banner*`
- `frontend/src/pages/PatientDashboard/PatientDashboard.js` — прокинуть `onNavigateToContact` в RoadmapScreen + state `contactPrefill`
- `frontend/src/pages/PatientDashboard/components/ContactScreen.js` — обработать `prefilledMessage` prop
- `frontend/src/pages/PatientDashboard/components/RoadmapScreen.test.js` — добавить describe-блок

### НЕ ТРОГАТЬ
- `services/scheduler.js`
- `services/telegramBot.js`
- `frontend/src/pages/Patients.js`
- `rehab_phases` миграции
- Существующая логика рендера фаз в RoadmapScreen
- `criteria_next` парсинг (это в Волне 2)

---

## Текст коммита

```
feat(roadmap): простой stuck banner для пациента застрявшего на фазе

- Новый endpoint GET /api/rehab/my/stuck-status — вычисляет
  is_stuck = NOW() > phase_started_at + duration_weeks × 1.5
- Баннер на RoadmapScreen с CTA «Связаться с куратором»
- При CTA — переход на ContactScreen с пред-заполненным сообщением
  «Здравствуйте! Я на фазе X "Y" уже Z недель. Хочу обсудить прогресс.»
- Без чек-листа критериев перехода (это в Волне 2)
- Без push'а инструктору (отдельный коммит после Волны 0)

Roadmap: PATIENT_UX_ROADMAP_2026-05-08_v2.md пункт #2 stage 1
Test: backend +5, frontend +4
```

---

## Пост-коммит

### Обновить документацию

**`CLAUDE.md`:**
- Раздел «Открытые баги»: оставить пункт про чек-лист критериев (это для Волны 2), отметить что простой stuck banner закрыт
- Раздел «API endpoints» / «Реабилитация»: добавить строку
  `GET /api/rehab/my/stuck-status — статус застревания пациента на фазе (PatientJWT)`
- Раздел «Завершённые исправления»: добавить запись «Stuck banner для пациента, простая версия — Wave 0 коммит 06»

**`MEMORY.md`:**
- Зафиксировать решение: «Stuck threshold = duration_weeks × 1.5 (минимальный stage). Гибрид yellow 1.3× / red 1.7× для инструкторской стороны — отдельный коммит после Волны 0.»
- Зафиксировать UX: «Пред-заполненное сообщение в ContactScreen — pattern `prefilledMessage` prop через PatientDashboard root state.»

**`wave_0_progress.md`:**
- Строка `06` → `🟡 готов к smoke` (после прохождения локальных тестов)
- После smoke и push в main → `🟢 в main`, SHA, дата

---

## Definition of Done

- [ ] Endpoint `GET /api/rehab/my/stuck-status` отвечает корректно (4 кейса: stuck/not-stuck/no-program/unauthorized + fallback на created_at)
- [ ] RoadmapScreen рендерит баннер при is_stuck=true
- [ ] CTA баннера ведёт на ContactScreen с pre-filled сообщением
- [ ] Все тесты зелёные:
  - backend: rehab.routes.test +5 кейсов
  - frontend: RoadmapScreen.test +4 кейса
- [ ] Smoke сценарии 1-4 пройдены в реальном браузере (Chrome desktop минимум; Safari iOS если возможно)
- [ ] Коммит создан с указанным текстом
- [ ] Документация обновлена (CLAUDE.md + MEMORY.md + wave_0_progress.md)
- [ ] **`git push` только после явного «ок» от Vadim'а**
- [ ] После push в main: ручная проверка на проде — пациент id=6 (Vadim) Roadmap не сломан
- [ ] **Это последний коммит Волны 0** — после его закрытия запросить у Vadim'а финальный smoke на 2-3 пациентах разного состояния и обновить раздел DoD в `TZ_WAVE_0_INDEX.md` («Все 6 коммитов в main»)
