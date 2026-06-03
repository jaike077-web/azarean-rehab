import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// =====================================================
// Mocks
// =====================================================
// rehab — публичный API для wizard'а (templates, types).
// rehabPrograms — CRUD программы.
// complexes — список комплексов пациента (с derived_title из 1.08a).
jest.mock('../services/api', () => ({
  rehab: {
    getProgramTemplates: jest.fn(),
    getProgramTypes: jest.fn(),
    getProgramTemplatePhases: jest.fn(),
    getPhases: jest.fn(),
  },
  rehabPrograms: {
    getByPatient: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    // AC3: BlockEditor (внутри EditForm) дёргает эти при монтировании/правках.
    getProgramBlocks: jest.fn(),
    createBlock: jest.fn(),
    updateBlock: jest.fn(),
    deleteBlock: jest.fn(),
  },
  complexes: {
    getByPatient: jest.fn(),
  },
}));

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
jest.mock('../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

jest.mock('./ConfirmModal', () => ({
  __esModule: true,
  default: ({ isOpen, onConfirm, onClose, title }) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        <p>{title}</p>
        <button onClick={() => { onConfirm(); onClose(); }}>Confirm</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

// CSS Module mock (Proxy возвращает имя класса как строку — see Wave 0 smoke pattern)
jest.mock('./RehabProgramModal/RehabProgramModal.module.css', () =>
  new Proxy({}, { get: (_, prop) => String(prop) })
);

const { rehab, rehabPrograms, complexes } = require('../services/api');
import RehabProgramModal from './RehabProgramModal';

const PATIENT = { id: 14, full_name: 'Тестовый Пациент', diagnosis: 'ACL right' };

// SAMPLE_COMPLEXES имитируют ответ /api/complexes/patient/:id после 1.08a:
// есть title=null + derived_title (computed field), есть с title.
const SAMPLE_COMPLEXES = [
  { id: 1, title: null, derived_title: 'Приседания · Подъём ноги' },
  { id: 2, title: 'Утренний комплекс', derived_title: 'Утренний комплекс' },
  { id: 3, title: null, derived_title: null }, // worst-case: fallback на «Комплекс #N»
];

const SAMPLE_PROGRAM = {
  id: 7,
  patient_id: 14,
  complex_id: 1,
  title: 'Реабилитация ACL',
  diagnosis: 'ACL right knee',
  surgery_date: '2026-03-15',
  current_phase: 2,
  status: 'active',
  notes: 'Без impact-нагрузки',
  created_at: '2026-04-10T10:00:00Z',
  phase_started_at: '2026-04-20',
  program_template_id: null,
};

const SAMPLE_TEMPLATES = [
  { id: 11, code: 'acl_bptb', program_type: 'acl', program_type_label: 'ПКС реабилитация', title: 'ПКС BPTB-графт', description: 'для пациентов после пластики ПКС', surgery_required: true },
  { id: 12, code: 'shoulder_cuff', program_type: 'shoulder_general', program_type_label: 'Реабилитация плеча', title: 'Манжета ротаторов', surgery_required: false },
];

const SAMPLE_PROGRAM_TYPES = [
  { code: 'acl', label: 'ПКС реабилитация', joint: 'knee', surgery_required: true },
  { code: 'knee_general', label: 'Реабилитация колена', joint: 'knee', surgery_required: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  // AC3: EditForm монтирует BlockEditor → грузит блоки. Дефолт — пусто.
  rehabPrograms.getProgramBlocks.mockResolvedValue({ data: [] });
  // CreateWizard при выборе шаблона грузит превью фаз протокола. Дефолт — пусто
  // (без resolved-значения .then упал бы на undefined и шаг 2 не открылся бы).
  rehab.getProgramTemplatePhases.mockResolvedValue({ data: { template: {}, phases: [] } });
  // Динамический дропдаун «Текущая фаза» в ручном режиме тянет фазы по program_type.
  rehab.getPhases.mockResolvedValue({ data: [] });
});

const flushAsync = () => new Promise((r) => setTimeout(r, 0));

const renderModal = ({ onClose = jest.fn(), onSaved = jest.fn() } = {}) => {
  const result = render(
    <RehabProgramModal patient={PATIENT} onClose={onClose} onSaved={onSaved} />
  );
  return { ...result, onClose, onSaved };
};

// =====================================================
// Mode routing (dispatch на CreateWizard / EditForm)
// =====================================================

describe('RehabProgramModal — mode routing', () => {
  test('Create mode (программы нет) → рендерит CreateWizard Step 1 со списком шаблонов', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehab.getProgramTemplates.mockResolvedValueOnce({ data: SAMPLE_TEMPLATES });
    rehab.getProgramTypes.mockResolvedValueOnce({ data: SAMPLE_PROGRAM_TYPES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    expect(screen.getByText(/Выберите шаблон программы/i)).toBeInTheDocument();
    // Группировка по program_type_label
    expect(screen.getByText('ПКС BPTB-графт')).toBeInTheDocument();
    expect(screen.getByText('Манжета ротаторов')).toBeInTheDocument();
    // Кнопка пропустить
    expect(screen.getByRole('button', { name: /Пропустить/i })).toBeInTheDocument();
  });

  test('Edit mode (программа есть) → рендерит EditForm с pre-filled полями + кнопкой Удалить', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    // Wizard НЕ рендерится
    expect(screen.queryByText(/Выберите шаблон программы/i)).not.toBeInTheDocument();
    // EditForm pre-filled
    expect(screen.getByLabelText(/Название программы/).value).toBe('Реабилитация ACL');
    expect(screen.getByLabelText(/Текущая фаза/).value).toBe('2');
    // Delete + Save кнопки
    expect(screen.getByRole('button', { name: /Удалить программу/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Сохранить$/ })).toBeInTheDocument();
  });
});

// =====================================================
// Create wizard navigation + create
// =====================================================

describe('CreateWizard — Step1 → Step2 → Step3 + POST с program_template_id', () => {
  beforeEach(() => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehab.getProgramTemplates.mockResolvedValueOnce({ data: SAMPLE_TEMPLATES });
    rehab.getProgramTypes.mockResolvedValueOnce({ data: SAMPLE_PROGRAM_TYPES });
  });

  test('Step1 «Пропустить» → Step2 без template, program_type select виден', async () => {
    await act(async () => {
      renderModal();
      await flushAsync();
    });

    fireEvent.click(screen.getByRole('button', { name: /Пропустить/i }));
    await waitFor(() => expect(screen.getByText(/Детали программы/i)).toBeInTheDocument());

    expect(screen.getByLabelText(/Тип программы/i)).toBeInTheDocument();
    // surgery_date visible by default when no template
    expect(screen.getByLabelText(/Дата операции/i)).toBeInTheDocument();
  });

  test('Step1 → выбор template с surgery_required=true → Step2 показывает Дата операции', async () => {
    await act(async () => {
      renderModal();
      await flushAsync();
    });

    fireEvent.click(screen.getByText('ПКС BPTB-графт'));
    await waitFor(() => expect(screen.getByText(/Детали программы/i)).toBeInTheDocument());

    expect(screen.getByLabelText(/Дата операции/i)).toBeInTheDocument();
    // template badge
    expect(screen.getByText(/Шаблон:/)).toBeInTheDocument();
    expect(screen.getAllByText(/ПКС BPTB-графт/).length).toBeGreaterThan(0);
    // program_type не показывается когда template выбран
    expect(screen.queryByLabelText(/Тип программы/i)).not.toBeInTheDocument();
  });

  test('Wizard full create flow: template → Step2 → Step3 → POST с program_template_id', async () => {
    rehabPrograms.create.mockResolvedValueOnce({ data: { id: 99 } });
    const onSaved = jest.fn();

    await act(async () => {
      renderModal({ onSaved });
      await flushAsync();
    });

    // Step 1: выбрать template
    fireEvent.click(screen.getByText('ПКС BPTB-графт'));
    await waitFor(() => expect(screen.getByText(/Детали программы/i)).toBeInTheDocument());

    // Step 2: ввести title + complex
    fireEvent.change(screen.getByLabelText(/Название программы/i), { target: { value: 'Программа ПКС Тест' } });
    fireEvent.change(screen.getByLabelText(/Комплекс упражнений/i), { target: { value: '2' } });

    // → Step 3
    fireEvent.click(screen.getByRole('button', { name: /^Далее$/ }));
    await waitFor(() => expect(screen.getByText(/Проверьте данные/i)).toBeInTheDocument());

    // Create
    fireEvent.click(screen.getByRole('button', { name: /Создать программу/i }));

    await waitFor(() => expect(rehabPrograms.create).toHaveBeenCalled());
    const payload = rehabPrograms.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      patient_id: 14,
      title: 'Программа ПКС Тест',
      complex_id: 2,
      program_template_id: 11,
      program_type: 'acl',
    });
    expect(onSaved).toHaveBeenCalled();
  });

  test('Wizard skip template → POST с program_template_id=null', async () => {
    rehabPrograms.create.mockResolvedValueOnce({ data: { id: 100 } });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    fireEvent.click(screen.getByRole('button', { name: /Пропустить/i }));
    await waitFor(() => expect(screen.getByText(/Детали программы/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Название программы/i), { target: { value: 'Manual program' } });
    fireEvent.change(screen.getByLabelText(/Комплекс упражнений/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /^Далее$/ }));

    await waitFor(() => expect(screen.getByText(/Проверьте данные/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Создать программу/i }));

    await waitFor(() => expect(rehabPrograms.create).toHaveBeenCalled());
    const payload = rehabPrograms.create.mock.calls[0][0];
    expect(payload.program_template_id).toBeNull();
  });

  test('Empty templates: показывается empty state, но «Пропустить» работает', async () => {
    // resetAllMocks очищает и mock.calls и mock queue от beforeEach
    jest.resetAllMocks();
    rehabPrograms.getByPatient.mockResolvedValue({ data: [] });
    rehabPrograms.getProgramBlocks.mockResolvedValue({ data: [] }); // AC3: BlockEditor mount
    complexes.getByPatient.mockResolvedValue({ data: SAMPLE_COMPLEXES });
    rehab.getProgramTemplates.mockResolvedValue({ data: [] });
    rehab.getProgramTypes.mockResolvedValue({ data: SAMPLE_PROGRAM_TYPES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    await waitFor(() => expect(screen.getByText(/Нет доступных шаблонов/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Пропустить/i })).toBeInTheDocument();
  });
});

// =====================================================
// Bug #13: ComplexSelector использует derived_title
// =====================================================

describe('Bug #13 (Wave 1 #1.08a + #1.08b) — ComplexSelector использует derived_title', () => {
  test('Create wizard: derived_title в селекторе комплекса (Step 2)', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehab.getProgramTemplates.mockResolvedValueOnce({ data: SAMPLE_TEMPLATES });
    rehab.getProgramTypes.mockResolvedValueOnce({ data: SAMPLE_PROGRAM_TYPES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    fireEvent.click(screen.getByRole('button', { name: /Пропустить/i }));
    await waitFor(() => expect(screen.getByText(/Детали программы/i)).toBeInTheDocument());

    // Опции селектора показывают derived_title (не «Комплекс #1»)
    const select = screen.getByLabelText(/Комплекс упражнений/i);
    expect(select.innerHTML).toContain('Приседания · Подъём ноги'); // id=1, derived
    expect(select.innerHTML).toContain('Утренний комплекс');         // id=2, title
    expect(select.innerHTML).toContain('Комплекс #3');               // id=3, fallback
  });

  test('Edit form: derived_title в селекторе комплекса', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    const select = screen.getByLabelText(/Комплекс упражнений/i);
    expect(select.innerHTML).toContain('Приседания · Подъём ноги');
    expect(select.innerHTML).toContain('Утренний комплекс');
    expect(select.innerHTML).toContain('Комплекс #3');
  });
});

// =====================================================
// Edit flow + program_template_id badge
// =====================================================

describe('EditForm — update + delete + template badge', () => {
  test('Сохранение: PUT вызван с правильными полями', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehabPrograms.update.mockResolvedValueOnce({ data: SAMPLE_PROGRAM });

    const onSaved = jest.fn();
    await act(async () => {
      renderModal({ onSaved });
      await flushAsync();
    });

    fireEvent.change(screen.getByLabelText(/Текущая фаза/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Сохранить$/ }));

    await waitFor(() => expect(rehabPrograms.update).toHaveBeenCalled());
    const [id, payload] = rehabPrograms.update.mock.calls[0];
    expect(id).toBe(7);
    expect(payload.current_phase).toBe(3);
    expect(payload.title).toBe('Реабилитация ACL');
    expect(onSaved).toHaveBeenCalled();
  });

  test('Удаление через ConfirmModal → DELETE → onDeleted', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehabPrograms.delete.mockResolvedValueOnce({});

    const onSaved = jest.fn();
    await act(async () => {
      renderModal({ onSaved });
      await flushAsync();
    });

    fireEvent.click(screen.getByRole('button', { name: /Удалить программу/i }));
    // ConfirmModal mock рендерится
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => expect(rehabPrograms.delete).toHaveBeenCalledWith(7));
    expect(onSaved).toHaveBeenCalled();
  });

  test('Программа с program_template_id показывает info-бейдж шаблона', async () => {
    const programWithTemplate = { ...SAMPLE_PROGRAM, program_template_id: 11 };
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [programWithTemplate] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehab.getProgramTemplates.mockResolvedValueOnce({ data: SAMPLE_TEMPLATES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    await waitFor(() => expect(screen.getByText(/Создано из шаблона/i)).toBeInTheDocument());
    expect(screen.getByText('ПКС BPTB-графт')).toBeInTheDocument();
  });

  test('Программа без program_template_id не показывает бейдж', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] }); // template_id=null
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    expect(screen.queryByText(/Создано из шаблона/i)).not.toBeInTheDocument();
    expect(rehab.getProgramTemplates).not.toHaveBeenCalled(); // в EditForm не дёргается без template_id
  });
});
