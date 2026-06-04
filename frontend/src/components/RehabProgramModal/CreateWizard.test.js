// =====================================================
// TEST: CreateWizard — группировка карточек по суставу + превью фаз протокола.
// Каркас по BlockEditor.test.js: CSS Modules Proxy-мок, namespace-мок api,
// useToast мок, RTL + data-testid. Pure-хелперы тестируются напрямую.
// =====================================================

import React from 'react';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';

jest.mock('./RehabProgramModal.module.css', () => new Proxy({}, { get: (_, p) => String(p) }));

jest.mock('../../services/api', () => ({
  rehab: {
    getProgramTemplates: jest.fn(),
    getProgramTypes: jest.fn(),
    getProgramTemplatePhases: jest.fn(),
    getPhases: jest.fn(),
  },
  rehabPrograms: {
    create: jest.fn(),
  },
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));

// ComplexSelector мокаем — его внутренности не относятся к тесту визарда.
jest.mock('./ComplexSelector', () => (props) => (
  <select
    data-testid="complex-selector"
    value={props.value || ''}
    onChange={(e) => props.onChange(e.target.value)}
  >
    <option value="">—</option>
    <option value="9">C9</option>
  </select>
));

const { rehab, rehabPrograms } = require('../../services/api');
import CreateWizard, { groupTemplatesByJoint, pluralPhases, buildPhaseChoices, phaseFromForm } from './CreateWizard';

const TEMPLATES = [
  { id: 1, code: 'tpl_acl', program_type: 'acl', program_type_label: 'ПКС реабилитация', program_joint: 'knee', title: 'ПКС', surgery_required: true },
  { id: 2, code: 'tpl_knee_oa', program_type: 'knee_oa', program_type_label: 'Гонартроз', program_joint: 'knee', title: 'Гонартроз', surgery_required: false },
  { id: 3, code: 'tpl_sh', program_type: 'shoulder_general', program_type_label: 'Плечо общее', program_joint: 'shoulder', title: 'Плечо', surgery_required: false },
];

const PHASES = [
  { phase_number: 0, title: 'Подготовка к операции', subtitle: 'До операции', recommended_complex: null },
  { phase_number: 1, title: 'Ранний период', subtitle: 'Недели 1–2', recommended_complex: null },
];

// ACL-подобный набор 0..6 для проверки динамического дропдауна фаз.
const PHASES_ACL = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ phase_number: n, title: `Этап ${n}`, recommended_complex: null }));

describe('groupTemplatesByJoint (pure)', () => {
  it('сводит все колено под один заголовок «Колено», порядок сохраняется', () => {
    const groups = groupTemplatesByJoint(TEMPLATES);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Колено');
    expect(groups[0].templates.map((t) => t.id)).toEqual([1, 2]);
    expect(groups[1].label).toBe('Плечо');
    expect(groups[1].templates.map((t) => t.id)).toEqual([3]);
  });

  it('fallback на program_type_label если у типа нет joint', () => {
    const groups = groupTemplatesByJoint([
      { id: 9, program_type: 'mystery', program_type_label: 'Загадка', program_joint: null, title: 'X' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Загадка');
  });

  it('пустой вход → пустой массив групп', () => {
    expect(groupTemplatesByJoint([])).toEqual([]);
  });
});

describe('pluralPhases (pure)', () => {
  it.each([
    [1, '1 фаза'],
    [2, '2 фазы'],
    [3, '3 фазы'],
    [4, '4 фазы'],
    [5, '5 фаз'],
    [7, '7 фаз'],
    [11, '11 фаз'],
    [21, '21 фаза'],
    [22, '22 фазы'],
  ])('%i → %s', (n, expected) => {
    expect(pluralPhases(n)).toBe(expected);
  });
});

describe('buildPhaseChoices (pure)', () => {
  it('включает phase 0 (prehab), формирует label «N — title», сохраняет порядок (D3)', () => {
    const choices = buildPhaseChoices([
      { phase_number: 0, title: 'Prehab' },
      { phase_number: 1, title: 'A' },
      { phase_number: 2, title: 'B' },
    ]);
    expect(choices).toEqual([
      { number: 0, label: '0 — Prehab' },
      { number: 1, label: '1 — A' },
      { number: 2, label: '2 — B' },
    ]);
  });

  it('пусто / null → дженерик-фолбэк 1..6 (без phase 0 в фолбэке)', () => {
    expect(buildPhaseChoices([]).map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(buildPhaseChoices(null).map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('только phase 0 → дропдаун из одной опции [0] (не фолбэк)', () => {
    expect(buildPhaseChoices([{ phase_number: 0, title: 'Prehab' }])).toEqual([
      { number: 0, label: '0 — Prehab' },
    ]);
  });

  it('7-фазный протокол (0..6) → 7 опций (0..6), phase 0 включён (D3)', () => {
    const choices = buildPhaseChoices([0, 1, 2, 3, 4, 5, 6].map((n) => ({ phase_number: n, title: `Этап ${n}` })));
    expect(choices.map((c) => c.number)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('отбрасывает нечисловые/отрицательные phase_number, фолбэк при пустом результате', () => {
    const choices = buildPhaseChoices([
      { phase_number: -1, title: 'bad' },
      { phase_number: 'x', title: 'bad' },
      { phase_number: 2, title: 'B' },
    ]);
    expect(choices).toEqual([{ number: 2, label: '2 — B' }]);
  });
});

describe('phaseFromForm (pure)', () => {
  it('сохраняет phase 0 (prehab) — число и строка', () => {
    expect(phaseFromForm(0)).toBe(0);
    expect(phaseFromForm('0')).toBe(0);
  });

  it('пропускает обычные фазы', () => {
    expect(phaseFromForm(3)).toBe(3);
    expect(phaseFromForm('5')).toBe(5);
  });

  it('пусто / undefined / NaN / мусор → дефолт 1', () => {
    expect(phaseFromForm('')).toBe(1);
    expect(phaseFromForm(undefined)).toBe(1);
    expect(phaseFromForm(NaN)).toBe(1);
    expect(phaseFromForm('abc')).toBe(1);
  });
});

describe('CreateWizard — шаг 1 (группировка) + превью фаз', () => {
  const patient = { id: 5, full_name: 'Тест', diagnosis: '' };
  const complexes = [{ id: 9, title: 'C9', derived_title: 'C9' }];

  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getProgramTemplates.mockResolvedValue({ data: TEMPLATES });
    rehab.getProgramTypes.mockResolvedValue({ data: [] });
    rehab.getProgramTemplatePhases.mockResolvedValue({ data: { template: TEMPLATES[0], phases: PHASES } });
    rehab.getPhases.mockResolvedValue({ data: [] });
  });

  it('группирует шаблоны: «Колено» (2 карточки) + «Плечо» (1 карточка)', async () => {
    render(<CreateWizard patient={patient} complexes={complexes} onCreated={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('template-group-label').length).toBe(2));
    const labels = screen.getAllByTestId('template-group-label').map((e) => e.textContent);
    expect(labels).toEqual(['Колено', 'Плечо']);
    expect(screen.getAllByTestId('template-card')).toHaveLength(3);
  });

  it('выбор шаблона грузит и показывает превью фаз протокола', async () => {
    render(<CreateWizard patient={patient} complexes={complexes} onCreated={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('template-card').length).toBe(3));

    fireEvent.click(screen.getAllByTestId('template-card')[0]); // ПКС (id=1)

    await waitFor(() => expect(rehab.getProgramTemplatePhases).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByTestId('phase-preview')).toBeInTheDocument());
    expect(screen.getAllByTestId('phase-item')).toHaveLength(2);
    expect(screen.getByText('Что войдёт в программу: 2 фазы')).toBeInTheDocument();
    // recommended_complex=null → честная пометка
    expect(screen.getAllByText('комплекс назначается вручную')).toHaveLength(2);
  });

  it('превью не падает, если фазы не загрузились (catch → пусто)', async () => {
    rehab.getProgramTemplatePhases.mockRejectedValue(new Error('network'));
    render(<CreateWizard patient={patient} complexes={complexes} onCreated={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('template-card').length).toBe(3));

    fireEvent.click(screen.getAllByTestId('template-card')[1]); // Гонартроз (id=2)

    await waitFor(() => expect(rehab.getProgramTemplatePhases).toHaveBeenCalledWith(2));
    // Дошли до шага 2 без краша; превью отсутствует (фазы пустые)
    await waitFor(() => expect(screen.getByTestId('complex-selector')).toBeInTheDocument());
    expect(screen.queryByTestId('phase-preview')).not.toBeInTheDocument();
  });

  it('гонка: устаревший ответ A не перезаписывает превью выбранного позже B', async () => {
    let resolveA;
    let resolveB;
    const pA = new Promise((r) => { resolveA = r; });
    const pB = new Promise((r) => { resolveB = r; });
    rehab.getProgramTemplatePhases.mockImplementation((id) => (id === 1 ? pA : pB));

    render(<CreateWizard patient={patient} complexes={complexes} onCreated={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('template-card').length).toBe(3));

    // Выбираем A (id=1) — ответ ещё висит
    fireEvent.click(screen.getAllByTestId('template-card')[0]);
    await waitFor(() => expect(rehab.getProgramTemplatePhases).toHaveBeenCalledWith(1));

    // Назад → шаг 1 → выбираем B (id=2)
    fireEvent.click(screen.getByText('Назад'));
    await waitFor(() => expect(screen.getAllByTestId('template-card').length).toBe(3));
    fireEvent.click(screen.getAllByTestId('template-card')[1]);
    await waitFor(() => expect(rehab.getProgramTemplatePhases).toHaveBeenCalledWith(2));

    // B отвечает первым → его фазы показаны
    await act(async () => {
      resolveB({ data: { template: {}, phases: [{ phase_number: 1, title: 'B-фаза', recommended_complex: null }] } });
    });
    await waitFor(() => expect(screen.getByText('B-фаза')).toBeInTheDocument());

    // A отвечает позже → гард по reqId игнорирует устаревший ответ
    await act(async () => {
      resolveA({ data: { template: {}, phases: [{ phase_number: 9, title: 'A-фаза', recommended_complex: null }] } });
    });
    expect(screen.queryByText('A-фаза')).not.toBeInTheDocument();
    expect(screen.getByText('B-фаза')).toBeInTheDocument();
  });

  it('дропдаун «Текущая фаза» динамичен из фаз протокола (0..6), phase 0 включён (D3), не обрезан до 4', async () => {
    rehab.getProgramTemplatePhases.mockResolvedValue({ data: { template: {}, phases: PHASES_ACL } });
    render(<CreateWizard patient={patient} complexes={complexes} onCreated={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('template-card').length).toBe(3));

    fireEvent.click(screen.getAllByTestId('template-card')[0]); // ПКС-подобный, фазы 0..6

    const sel = await screen.findByTestId('current-phase-select');
    // ждём реальные фазы (а не дженерик-фолбэк «Фаза N»), включая prehab 0
    await waitFor(() => expect(within(sel).getByRole('option', { name: '0 — Этап 0' })).toBeInTheDocument());
    const labels = within(sel).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['0 — Этап 0', '1 — Этап 1', '2 — Этап 2', '3 — Этап 3', '4 — Этап 4', '5 — Этап 5', '6 — Этап 6']);
    // фазы 5/6 присутствуют (не обрезано до 4)
    expect(within(sel).getByRole('option', { name: '6 — Этап 6' })).toBeInTheDocument();
  });

  it('выбор фазы 0 (prehab) долетает в payload POST как current_phase: 0 (D3)', async () => {
    rehab.getProgramTemplatePhases.mockResolvedValue({ data: { template: {}, phases: PHASES_ACL } });
    rehabPrograms.create.mockResolvedValue({ data: { id: 1 } });
    render(<CreateWizard patient={patient} complexes={complexes} onCreated={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('template-card').length).toBe(3));

    fireEvent.click(screen.getAllByTestId('template-card')[0]); // фазы 0..6

    const sel = await screen.findByTestId('current-phase-select');
    await waitFor(() => expect(within(sel).getByRole('option', { name: '0 — Этап 0' })).toBeInTheDocument());

    // выбираем комплекс (required для isValid) + стартовую фазу 0
    fireEvent.change(screen.getByTestId('complex-selector'), { target: { value: '9' } });
    fireEvent.change(sel, { target: { value: '0' } });

    fireEvent.click(screen.getByText('Далее'));
    fireEvent.click(await screen.findByText('Создать программу'));

    await waitFor(() => expect(rehabPrograms.create).toHaveBeenCalledTimes(1));
    expect(rehabPrograms.create.mock.calls[0][0]).toMatchObject({ current_phase: 0 });
  });

  it('ручной режим: дропдаун фаз тянется по выбранному program_type', async () => {
    rehab.getProgramTypes.mockResolvedValue({ data: [{ code: 'knee_oa', label: 'Гонартроз' }] });
    rehab.getPhases.mockResolvedValue({ data: [
      { phase_number: 1, title: 'Острая' },
      { phase_number: 2, title: 'Подострая' },
      { phase_number: 3, title: 'Возврат к нагрузке' },
    ] });
    render(<CreateWizard patient={patient} complexes={complexes} onCreated={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('template-card').length).toBe(3));

    fireEvent.click(screen.getByText('Пропустить (создать вручную)'));
    const ptSelect = await screen.findByLabelText('Тип программы');
    fireEvent.change(ptSelect, { target: { value: 'knee_oa' } });

    await waitFor(() => expect(rehab.getPhases).toHaveBeenCalledWith('knee_oa'));
    const sel = screen.getByTestId('current-phase-select');
    await waitFor(() => expect(within(sel).getByRole('option', { name: '1 — Острая' })).toBeInTheDocument());
    expect(within(sel).getAllByRole('option')).toHaveLength(3);
  });
});
