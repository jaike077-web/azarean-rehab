# TZ Wave 1 · Коммит 1.08b — RehabProgramModal: переписка в 3-step wizard

**Дата:** 2026-05-13
**Roadmap:** `PATIENT_UX_ROADMAP_2026-05-08_v2.md` пункт #3
**Цель:** переписать `RehabProgramModal.js` (одна форма) в 3-step wizard: ProgramTemplateSelector → Details → Review. Использует `derived_title` из 1.08a (Bug #13 fix).
**Объём:** 4-5 часов
**Риск:** средний — критический UI инструктора, переписка большого компонента

---

## Verify-step перед стартом (правило 2026-05-13)

**Обязательно сделай grep до начала кода:**

```bash
cd c:/Users/Вадим/Desktop/Azarean_rehab
grep -rn "RehabProgramModal" frontend/src/
ls -la frontend/src/components/RehabProgramModal*
cat frontend/src/components/RehabProgramModal.js | head -50
grep -n "selectedPatient\|onCreated\|onClose" frontend/src/components/RehabProgramModal.js
grep -rn "RehabProgramModal" frontend/src/pages/Patients.js
grep -rn "RehabProgramModal" frontend/src/pages/PatientDashboard
```

**Зачем:**
- Подтвердить что `RehabProgramModal.js` существует одним файлом (создавался `e1fbaae`)
- Проверить какие props принимает (`selectedPatient` подтверждён в твоём отчёте после 1.07 — но проверь полный список)
- Подтвердить что **`PatientDashboard.js` его НЕ импортирует** (PatientDashboard — пациентский, не инструкторский). Это критично — если касается, dirty файл становится блокером.
- Подтвердить место импорта в `Patients.js` (инструкторская страница)
- Проверить структуру `frontend/src/components/RehabProgramModal.module.css` если есть (для переноса стилей)
- Найти где сейчас `Комплекс #` fallback живёт — это будет заменено на `derived_title` из 1.08a

**Если grep покажет что:**
- PatientDashboard.js импортирует RehabProgramModal → **СТОП**, обсудим как изолировать (это не должно быть так)
- RehabProgramModal уже частично в директории → адаптируй scope
- Bug #13 fallback не в `RehabProgramModal.js` а где-то ещё (например, в `ComplexSelector.js` отдельно) → адаптируй замену

---

## Зависимость

После 1.08a. Ветка `wave-1/08b-wizard-ui` от `wave-1/08a-wizard-backend-prep`.

---

## Что блокирует

Текущий `RehabProgramModal.js`:
- Одна форма со всеми полями вперемешку (диагноз, complex_id, surgery_date, current_phase)
- Селектор complex_id показывает `Комплекс #${id}` fallback (Bug #13 — backend готов в 1.08a, фронт пока не использует)
- Не использует `program_template_id` (есть в БД с 1.06, есть endpoints `/program-templates`, нет UI)
- При большом количестве шаблонов программ инструктор не сможет нормально выбрать — нужен structured selector

**После коммита:**
- Wizard 3 шага: Шаблон программы (опционально) → Детали → Review
- Step 1 показывает карточки `/api/rehab/program-templates` с группировкой по program_type. Кнопка «Пропустить (создать вручную)»
- Step 2: если шаблон выбран — pre-fill program_type, surgery_date поле visible если template.surgery_required, recommended complex_template pre-selected (если есть на фазе 1)
- Step 3: review + POST `/api/rehab/programs` с `program_template_id`
- ComplexSelector использует `complex.derived_title` из 1.08a (Bug #13 closed)
- Старый монолитный файл заменён директорией `RehabProgramModal/`, внешние импорты не ломаются

---

## Параллельная работа — координация

**ТРОГАЕМ:**
- `frontend/src/components/RehabProgramModal.js` (удаление) → `frontend/src/components/RehabProgramModal/` (новая директория)
  - `index.js` — re-export default
  - `RehabProgramModal.js` — state-машина wizard'а
  - `RehabProgramModal.module.css` — общие стили (CSS Module, **camelCase classes!** — правило с `c8834b5`)
  - `Step1Template.js` — карточки шаблонов
  - `Step2Details.js` — форма деталей
  - `Step3Review.js` — сводка + create
  - `ComplexSelector.js` — селектор complex с derived_title
- `frontend/src/components/RehabProgramModal.test.js` — переписать под wizard
- `frontend/src/services/api.js` — возможно `rehab.getProgramTemplatePhases(id)` helper если ещё нет (после 1.06 должен быть)
- (возможно) `frontend/src/pages/Patients.js` — если импорт-сайт меняется (директория exports default через `index.js`, имя то же → не должен)

**НЕ ТРОГАТЬ:**
- Backend полностью (всё готово в 1.06 + 1.08a)
- `PatientDashboard.js` (dirty файл, не пересекается)
- AdminContent (1.07 закрыт)
- LOCKED-зоны
- `Patients.js` если grep'нул и подтверждает что импорт работает через `index.js` без изменений

---

## Frontend — структура

```
frontend/src/components/RehabProgramModal/
├── index.js                         # export { default } from './RehabProgramModal'
├── RehabProgramModal.js             # state-машина
├── RehabProgramModal.module.css     # стили wizard + Steps (camelCase!)
├── Step1Template.js                 # карточки шаблонов с группировкой
├── Step2Details.js                  # форма деталей
├── Step3Review.js                   # сводка + create
└── ComplexSelector.js               # select complex с derived_title
```

### State-машина (`RehabProgramModal.js`)

```javascript
import React, { useState, useCallback } from 'react';
import { rehab } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import styles from './RehabProgramModal.module.css';
import Step1Template from './Step1Template';
import Step2Details from './Step2Details';
import Step3Review from './Step3Review';

function RehabProgramModal({ selectedPatient, onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null); // null = manual mode
  const [details, setDetails] = useState({
    diagnosis: selectedPatient?.diagnosis || '',
    side: null,
    surgery_date: null,
    program_type: null,
    current_phase: 1,
    complex_id: null,
  });
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const handleTemplateSelect = useCallback(async (template) => {
    setSelectedTemplate(template);
    let recommendedComplexId = null;
    if (template) {
      try {
        const phasesRes = await rehab.getProgramTemplatePhases(template.id);
        const phase1 = phasesRes?.data?.phases?.find(p => p.phase_number === 1);
        if (phase1?.recommended_complex?.template_id) {
          // recommended_complex это шаблон комплекса (templates table), не сам complex
          // Сразу попробовать найти complex созданный из этого template
          // На MVP — просто сохраняем referenceID для подсказки в Step2
          recommendedComplexId = null; // user сам выберет из списка complexes
        }
      } catch (err) {
        console.warn('Failed to load template phases:', err);
      }
    }
    setDetails(prev => ({
      ...prev,
      program_type: template?.program_type || null,
    }));
    setStep(2);
  }, []);

  const handleSkip = useCallback(() => {
    setSelectedTemplate(null);
    setStep(2);
  }, []);

  const handleBackToStep1 = useCallback(() => setStep(1), []);
  const handleGoToReview = useCallback(() => setStep(3), []);
  const handleBackToStep2 = useCallback(() => setStep(2), []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const payload = {
        patient_id: selectedPatient.id,
        program_template_id: selectedTemplate?.id || null,
        ...details,
      };
      const result = await rehab.createProgram(payload);
      toast.success('Программа создана');
      onCreated?.(result.data);
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Ошибка создания программы');
    } finally {
      setCreating(false);
    }
  }, [selectedPatient, selectedTemplate, details, onCreated, onClose, toast]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2>Программа реабилитации — {selectedPatient.full_name}</h2>
          <button className={styles.close} onClick={onClose}>×</button>
        </header>

        <div className={styles.stepIndicator}>
          <span className={step === 1 ? styles.stepActive : styles.step}>1. Шаблон</span>
          <span className={styles.stepDivider}>›</span>
          <span className={step === 2 ? styles.stepActive : styles.step}>2. Детали</span>
          <span className={styles.stepDivider}>›</span>
          <span className={step === 3 ? styles.stepActive : styles.step}>3. Подтверждение</span>
        </div>

        <div className={styles.body}>
          {step === 1 && (
            <Step1Template
              onSelect={handleTemplateSelect}
              onSkip={handleSkip}
            />
          )}
          {step === 2 && (
            <Step2Details
              patient={selectedPatient}
              template={selectedTemplate}
              details={details}
              setDetails={setDetails}
              onBack={handleBackToStep1}
              onNext={handleGoToReview}
            />
          )}
          {step === 3 && (
            <Step3Review
              patient={selectedPatient}
              template={selectedTemplate}
              details={details}
              onBack={handleBackToStep2}
              onCreate={handleCreate}
              creating={creating}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default RehabProgramModal;
```

### `index.js`

```javascript
export { default } from './RehabProgramModal';
```

### `Step1Template.js`

```javascript
import React, { useEffect, useState } from 'react';
import { rehab } from '../../services/api';
import styles from './RehabProgramModal.module.css';

function Step1Template({ onSelect, onSkip }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rehab.getProgramTemplates()
      .then(res => setTemplates(res?.data || []))
      .catch(err => console.error('Failed to load templates:', err))
      .finally(() => setLoading(false));
  }, []);

  // Группировка по program_type_label
  const grouped = templates.reduce((acc, t) => {
    const key = t.program_type_label || t.program_type || 'Прочее';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  if (loading) return <p>Загрузка шаблонов…</p>;

  return (
    <div>
      <h3>Выберите шаблон программы</h3>
      <p className={styles.hint}>Шаблон задаст тип программы и предложит рекомендованные комплексы на каждую фазу. Можно пропустить и настроить вручную.</p>

      {Object.keys(grouped).length === 0 ? (
        <p className={styles.empty}>Нет доступных шаблонов. Создайте их в админ-панели или продолжите вручную.</p>
      ) : (
        Object.entries(grouped).map(([groupLabel, items]) => (
          <div key={groupLabel} className={styles.templateGroup}>
            <h4>{groupLabel}</h4>
            <div className={styles.templateCards}>
              {items.map(t => (
                <button
                  key={t.id}
                  className={styles.templateCard}
                  onClick={() => onSelect(t)}
                >
                  <strong>{t.title}</strong>
                  {t.description && <p>{t.description}</p>}
                  {t.surgery_required && <span className={styles.badgeSurgery}>с операцией</span>}
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      <div className={styles.footer}>
        <button className={styles.btnSecondary} onClick={onSkip}>
          Пропустить (создать вручную)
        </button>
      </div>
    </div>
  );
}

export default Step1Template;
```

### `Step2Details.js`

```javascript
import React from 'react';
import { rehab, programTypesApi } from '../../services/api'; // адаптируй под реальную структуру api
import ComplexSelector from './ComplexSelector';
import styles from './RehabProgramModal.module.css';

function Step2Details({ patient, template, details, setDetails, onBack, onNext }) {
  const updateField = (field, value) => setDetails(prev => ({ ...prev, [field]: value }));

  const surgeryRequired = template?.surgery_required;
  const programType = template?.program_type || details.program_type;

  return (
    <div>
      <h3>Детали программы</h3>

      <label>
        Диагноз
        <textarea
          value={details.diagnosis}
          onChange={(e) => updateField('diagnosis', e.target.value)}
          rows={2}
        />
      </label>

      {surgeryRequired && (
        <label>
          Дата операции
          <input
            type="date"
            value={details.surgery_date || ''}
            onChange={(e) => updateField('surgery_date', e.target.value || null)}
          />
        </label>
      )}

      {template?.body_side_relevant !== false && (
        <label>
          Сторона
          <select
            value={details.side || ''}
            onChange={(e) => updateField('side', e.target.value || null)}
          >
            <option value="">не указано</option>
            <option value="L">Левая</option>
            <option value="R">Правая</option>
            <option value="bilateral">Билатерально</option>
          </select>
        </label>
      )}

      {!template && (
        <label>
          Тип программы
          <select
            value={details.program_type || ''}
            onChange={(e) => updateField('program_type', e.target.value || null)}
          >
            {/* подгружается из /api/rehab/program-types */}
          </select>
        </label>
      )}

      <label>
        Текущая фаза
        <input
          type="number" min={1} max={6}
          value={details.current_phase}
          onChange={(e) => updateField('current_phase', parseInt(e.target.value) || 1)}
        />
      </label>

      <ComplexSelector
        patientId={patient.id}
        value={details.complex_id}
        onChange={(id) => updateField('complex_id', id)}
      />

      <div className={styles.footer}>
        <button className={styles.btnSecondary} onClick={onBack}>Назад</button>
        <button className={styles.btnPrimary} onClick={onNext}>Далее</button>
      </div>
    </div>
  );
}

export default Step2Details;
```

### `ComplexSelector.js` — **с использованием derived_title из 1.08a**

```javascript
import React, { useEffect, useState } from 'react';
import { complexesApi } from '../../services/api'; // адаптируй
import styles from './RehabProgramModal.module.css';

function ComplexSelector({ patientId, value, onChange }) {
  const [complexes, setComplexes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Если backend поддерживает ?patient_id (1.08a опциональный фильтр) — используем
    // Иначе — грузим все и фильтруем на клиенте
    complexesApi.list({ patient_id: patientId })
      .then(res => setComplexes(res?.data || []))
      .catch(err => console.error('Failed to load complexes:', err))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <p>Загрузка комплексов…</p>;

  return (
    <label>
      Комплекс упражнений
      <select value={value || ''} onChange={(e) => onChange(parseInt(e.target.value) || null)}>
        <option value="">Не привязывать сейчас</option>
        {complexes.map(c => (
          <option key={c.id} value={c.id}>
            {/* Bug #13 fix: derived_title из 1.08a */}
            {c.derived_title || `Комплекс #${c.id}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export default ComplexSelector;
```

### `Step3Review.js`

```javascript
import React from 'react';
import styles from './RehabProgramModal.module.css';

function Step3Review({ patient, template, details, onBack, onCreate, creating }) {
  return (
    <div>
      <h3>Проверьте данные</h3>
      <dl className={styles.reviewList}>
        <dt>Пациент</dt><dd>{patient.full_name}</dd>
        {template ? <><dt>Шаблон</dt><dd>{template.title}</dd></> : <><dt>Шаблон</dt><dd>— (ручное создание)</dd></>}
        {details.program_type && <><dt>Тип</dt><dd>{details.program_type}</dd></>}
        {details.diagnosis && <><dt>Диагноз</dt><dd>{details.diagnosis}</dd></>}
        {details.side && <><dt>Сторона</dt><dd>{details.side}</dd></>}
        {details.surgery_date && <><dt>Дата операции</dt><dd>{details.surgery_date}</dd></>}
        <dt>Текущая фаза</dt><dd>{details.current_phase}</dd>
        {details.complex_id && <><dt>Комплекс</dt><dd>#{details.complex_id}</dd></>}
      </dl>

      <div className={styles.footer}>
        <button className={styles.btnSecondary} onClick={onBack}>Назад</button>
        <button className={styles.btnPrimary} onClick={onCreate} disabled={creating}>
          {creating ? 'Создание…' : 'Создать программу'}
        </button>
      </div>
    </div>
  );
}

export default Step3Review;
```

### CSS Module — **camelCase classes!**

`RehabProgramModal.module.css`:

```css
.overlay { /* full screen backdrop */ }
.modal { /* centered card */ }
.header { /* title + close */ }
.close { /* × button */ }
.stepIndicator { display: flex; gap: 8px; }
.step { color: var(--color-text-muted); }
.stepActive { color: var(--color-primary); font-weight: 600; }
.stepDivider { color: var(--color-text-muted); }
.body { padding: 16px 0; }
.footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.btnPrimary, .btnSecondary { /* кнопки */ }
.hint { font-size: 13px; color: var(--color-text-muted); margin-bottom: 12px; }
.empty { font-style: italic; }
.templateGroup { margin-bottom: 16px; }
.templateCards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.templateCard { /* кнопка-карточка */ }
.badgeSurgery { background: var(--color-warning-bg); padding: 2px 6px; border-radius: 4px; }
.reviewList { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
```

**Все классы camelCase** (правило `c8834b5`). НЕ `step-active`, НЕ `btn-primary`, а `stepActive`, `btnPrimary`.

---

## Тесты

`frontend/src/components/RehabProgramModal.test.js` (переписать):

```javascript
import { rehab, complexesApi } from '../services/api'; // адаптируй
jest.mock('../services/api', () => ({
  rehab: {
    getProgramTemplates: jest.fn(),
    getProgramTemplatePhases: jest.fn(),
    createProgram: jest.fn(),
  },
  complexesApi: {
    list: jest.fn(),
  },
}));

describe('RehabProgramModal wizard', () => {
  const mockPatient = { id: 1, full_name: 'Тестовый Пациент', diagnosis: '' };

  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getProgramTemplates.mockResolvedValue({ data: [
      { id: 1, code: 'acl_bptb', program_type: 'acl', program_type_label: 'ПКС', title: 'ПКС BPTB', surgery_required: true },
      { id: 2, code: 'shoulder', program_type: 'shoulder_general', program_type_label: 'Плечо', title: 'Манжета', surgery_required: false },
    ] });
    rehab.getProgramTemplatePhases.mockResolvedValue({ data: { template: {}, phases: [] } });
    rehab.createProgram.mockResolvedValue({ data: { id: 99 } });
    complexesApi.list.mockResolvedValue({ data: [] });
  });

  it('Step1: рендерит карточки шаблонов с группировкой', async () => {
    render(<RehabProgramModal selectedPatient={mockPatient} onClose={jest.fn()} />);
    expect(await screen.findByText('ПКС BPTB')).toBeInTheDocument();
    expect(screen.getByText('Манжета')).toBeInTheDocument();
    expect(screen.getByText('ПКС')).toBeInTheDocument(); // groupLabel
  });

  it('Step1 «Пропустить» → Step2 manual mode', async () => {
    render(<RehabProgramModal selectedPatient={mockPatient} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByText(/Пропустить/i));
    expect(await screen.findByText(/Детали программы/i)).toBeInTheDocument();
  });

  it('Step1 → Step2 с template: pre-fill program_type и surgery_date поле', async () => {
    render(<RehabProgramModal selectedPatient={mockPatient} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByText('ПКС BPTB'));
    expect(await screen.findByText(/Дата операции/i)).toBeInTheDocument();
  });

  it('создание программы вызывает POST с program_template_id', async () => {
    const onCreated = jest.fn();
    const onClose = jest.fn();
    render(<RehabProgramModal selectedPatient={mockPatient} onClose={onClose} onCreated={onCreated} />);
    fireEvent.click(await screen.findByText('ПКС BPTB'));
    fireEvent.click(await screen.findByText(/Далее/i));
    fireEvent.click(await screen.findByText(/Создать программу/i));

    await waitFor(() => {
      expect(rehab.createProgram).toHaveBeenCalledWith(expect.objectContaining({
        patient_id: 1,
        program_template_id: 1,
      }));
    });
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Bug #13: ComplexSelector использует derived_title', async () => {
    complexesApi.list.mockResolvedValueOnce({ data: [
      { id: 5, title: null, derived_title: 'Приседания · Подъём ноги' },
      { id: 7, title: 'Утренний комплекс', derived_title: 'Утренний комплекс' },
      { id: 9, title: null, derived_title: null },
    ] });
    render(<RehabProgramModal selectedPatient={mockPatient} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByText(/Пропустить/i));
    await screen.findByText(/Детали программы/i);
    // Раскрыть селектор
    expect(screen.getByText('Приседания · Подъём ноги')).toBeInTheDocument();
    expect(screen.getByText('Утренний комплекс')).toBeInTheDocument();
    expect(screen.getByText('Комплекс #9')).toBeInTheDocument(); // fallback когда derived_title NULL
  });
});
```

---

## NOT TOUCH

- Backend (всё готово в 1.06, 1.07, 1.08a)
- `PatientDashboard.js` — критично, dirty файл
- AdminContent
- LOCKED-зоны

---

## Smoke test (в реальном браузере)

### Сценарий 1 — Step1 рендерится с шаблонами из 1.07

1. Войти как инструктор, открыть страницу с RehabProgramModal (карточка пациента)
2. **Ожидание:** Step1 — карточки шаблонов сгруппированные по program_type. Если в БД нет шаблонов — empty state.

### Сценарий 2 — «Пропустить» → manual mode

1. Step1 → «Пропустить»
2. **Ожидание:** Step2 без pre-filled, есть select типа программы

### Сценарий 3 — Создать программу с шаблоном

1. В AdminContent создай шаблон acl_bptb (если ещё нет)
2. Открой RehabProgramModal для пациента
3. Step1 → card «ПКС BPTB-графт»
4. Step2 — program_type=acl, surgery_date field visible
5. Заполнить → Далее → Step3 — сводка
6. Создать
7. **Ожидание:** toast success, модалка закрывается, в БД `rehab_programs.program_template_id` = id шаблона

### Сценарий 4 — Bug #13 fix

1. В БД создай комплекс без title с 2 упражнениями (см. 1.08a smoke)
2. Открой wizard для соответствующего пациента → Step2 → раскрой селектор комплекса
3. **Ожидание:** видишь «Название упр1 · Название упр2» вместо «Комплекс #99»
4. Cleanup

### Сценарий 5 — Mobile + dark theme

1. DevTools mobile viewport
2. Wizard рендерится, кнопки тапаются, поля helpfully sized
3. Toggle dark theme — стили camelCase подхватываются

### Сценарий 6 — Cancel cleanup

1. Открыть wizard, заполнить пол-Step2, нажать × close
2. Открыть снова → пустое состояние (не помнит предыдущее)

---

## Файлы — итоговый чеклист

### Создать
- `frontend/src/components/RehabProgramModal/index.js`
- `frontend/src/components/RehabProgramModal/RehabProgramModal.js`
- `frontend/src/components/RehabProgramModal/RehabProgramModal.module.css`
- `frontend/src/components/RehabProgramModal/Step1Template.js`
- `frontend/src/components/RehabProgramModal/Step2Details.js`
- `frontend/src/components/RehabProgramModal/Step3Review.js`
- `frontend/src/components/RehabProgramModal/ComplexSelector.js`

### Удалить
- `frontend/src/components/RehabProgramModal.js` (заменён директорией)
- `frontend/src/components/RehabProgramModal.module.css` если был отдельным файлом (перенесён в директорию)

### Изменить
- `frontend/src/components/RehabProgramModal.test.js` — переписать под wizard (mock-based)
- (возможно) `frontend/src/services/api.js` — `rehab.getProgramTemplatePhases(id)` если ещё нет
- `CLAUDE.md` — Bug #13 → вычеркнуть из «Открытые баги»

### НЕ ТРОГАТЬ
- Backend
- `PatientDashboard.js`
- AdminContent
- LOCKED

---

## Текст коммита

```
feat(rehab-program-modal): 3-step wizard + закрытие Bug #13

Wave 1 коммит 1.08b — UI часть split'а 1.08.

- RehabProgramModal.js → директория с подкомпонентами:
  - Step1Template: карточки program_templates с группировкой
  - Step2Details: pre-fill из template, ComplexSelector
  - Step3Review: сводка + POST с program_template_id
- ComplexSelector использует complex.derived_title (Bug #13 closed)
- CSS Module с camelCase классами (правило c8834b5)
- «Пропустить» → manual mode без template

Closes Bug #13. Использует backend prep из 1.08a.

Test: frontend +5 (mock-based)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Definition of Done

- [ ] Verify-step выполнен (grep + проверка PatientDashboard.js не задействован)
- [ ] Директория `RehabProgramModal/` с 7 файлами создана
- [ ] Старый `RehabProgramModal.js` удалён, импорты не сломаны (через index.js re-export)
- [ ] Step1 → Step2 → Step3 переходы работают
- [ ] CSS Module camelCase везде (грep по `.module.css` — нет kebab-case в classnames)
- [ ] Pre-fill program_type/surgery_date из template
- [ ] ComplexSelector использует derived_title
- [ ] 5 frontend тестов зелёные
- [ ] Smoke сценарии 1-6 в браузере (Vadim)
- [ ] Mobile + dark theme ОК
- [ ] PatientDashboard.js не тронут (grep'ом проверь до push)
- [ ] CLAUDE.md: Bug #13 вычеркнут
- [ ] Коммит + Co-Authored-By
- [ ] `wave_1_progress.md` → 1.08b ⏸
- [ ] **Push только по «ок»**
