// =====================================================
// TEST: EditForm — динамический дропдаун «Текущая фаза» (D3 prehab-as-start).
// Каркас по CreateWizard.test.js: CSS Modules Proxy-мок, namespace-мок api,
// useToast/useConfirm моки, RTL + data-testid.
// Проверяем: фаза 0 не коэрсится в 1 (init + submit), дропдаун = реальные фазы
// протокола (getPhases), а не хардкод 1–4.
// =====================================================

import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

jest.mock('./RehabProgramModal.module.css', () => new Proxy({}, { get: (_, p) => String(p) }));

jest.mock('../../services/api', () => ({
  rehab: {
    getProgramTemplates: jest.fn(),
    getPhases: jest.fn(),
  },
  rehabPrograms: {
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));

// useConfirm/ConfirmModal/BlockEditor — не относятся к тесту фаз, мокаем нейтрально.
jest.mock('../../hooks/useConfirm', () => () => ({
  confirmState: { isOpen: false },
  confirm: jest.fn(),
  closeConfirm: jest.fn(),
}));
jest.mock('../ConfirmModal', () => () => null);
jest.mock('./BlockEditor', () => () => <div data-testid="block-editor" />);
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
import EditForm from './EditForm';

const patient = { id: 5, full_name: 'Тест' };
const complexes = [{ id: 9, title: 'C9', derived_title: 'C9' }];
const PHASES_ACL = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ phase_number: n, title: `Этап ${n}` }));

const baseProgram = {
  id: 7,
  title: 'P',
  complex_id: 9,
  diagnosis: '',
  surgery_date: null,
  current_phase: 0,
  notes: '',
  status: 'active',
  program_type: 'acl',
  created_at: '2026-06-01',
};

beforeEach(() => {
  jest.clearAllMocks();
  rehab.getProgramTemplates.mockResolvedValue({ data: [] });
  rehab.getPhases.mockResolvedValue({ data: PHASES_ACL });
});

describe('EditForm — динамический дропдаун фаз (D3)', () => {
  it('программа с фазой 0 (prehab): дропдаун = реальные фазы вкл. 0, значение 0 не коэрсится в 1', async () => {
    render(<EditForm patient={patient} program={baseProgram} complexes={complexes} onSaved={jest.fn()} onDeleted={jest.fn()} onClose={jest.fn()} />);

    await waitFor(() => expect(rehab.getPhases).toHaveBeenCalledWith('acl'));
    const sel = await screen.findByTestId('edit-phase-select');
    await waitFor(() => expect(within(sel).getByRole('option', { name: '0 — Этап 0' })).toBeInTheDocument());
    expect(sel.value).toBe('0'); // фаза 0 выбрана, не подменена на 1
    expect(within(sel).getAllByRole('option')).toHaveLength(7);
  });

  it('сохранение без касания дропдауна сохраняет фазу 0 (PUT current_phase: 0, не 1)', async () => {
    rehabPrograms.update.mockResolvedValue({ data: { id: 7 } });
    render(<EditForm patient={patient} program={baseProgram} complexes={complexes} onSaved={jest.fn()} onDeleted={jest.fn()} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getPhases).toHaveBeenCalledWith('acl'));

    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(rehabPrograms.update).toHaveBeenCalledTimes(1));
    expect(rehabPrograms.update.mock.calls[0][1]).toMatchObject({ current_phase: 0 });
  });

  it('дропдаун не хардкод 1–4: knee_oa → 3 реальные фазы протокола', async () => {
    rehab.getPhases.mockResolvedValue({ data: [
      { phase_number: 1, title: 'Острая' },
      { phase_number: 2, title: 'Подострая' },
      { phase_number: 3, title: 'Возврат к нагрузке' },
    ] });
    const program = { ...baseProgram, id: 8, current_phase: 2, program_type: 'knee_oa' };
    render(<EditForm patient={patient} program={program} complexes={complexes} onSaved={jest.fn()} onDeleted={jest.fn()} onClose={jest.fn()} />);

    await waitFor(() => expect(rehab.getPhases).toHaveBeenCalledWith('knee_oa'));
    const sel = await screen.findByTestId('edit-phase-select');
    await waitFor(() => expect(within(sel).getByRole('option', { name: '1 — Острая' })).toBeInTheDocument());
    expect(within(sel).getAllByRole('option')).toHaveLength(3);
    expect(within(sel).queryByRole('option', { name: '4 — Фаза 4' })).not.toBeInTheDocument();
  });
});
