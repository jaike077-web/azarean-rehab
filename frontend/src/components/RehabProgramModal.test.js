import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

jest.mock('../services/api', () => ({
  rehabPrograms: {
    getByPatient: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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

jest.mock('./RehabProgramModal.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

const { rehabPrograms, complexes } = require('../services/api');
import RehabProgramModal from './RehabProgramModal';

const PATIENT = { id: 14, full_name: 'Тестовый Пациент' };

const SAMPLE_COMPLEXES = [
  { id: 1, title: 'Комплекс A' },
  { id: 2, title: 'Комплекс B' },
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
};

beforeEach(() => {
  jest.clearAllMocks();
});

const flushAsync = () => new Promise((r) => setTimeout(r, 0));

const renderModal = ({ onClose = jest.fn(), onSaved = jest.fn() } = {}) => {
  const result = render(
    <RehabProgramModal patient={PATIENT} onClose={onClose} onSaved={onSaved} />
  );
  return { ...result, onClose, onSaved };
};

describe('RehabProgramModal', () => {
  test('Render — пациент без программы → create-mode, форма пустая', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    expect(screen.getByText(/Программа реабилитации/i)).toBeInTheDocument();
    expect(screen.getByText(/Тестовый Пациент/)).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/Название программы/);
    expect(titleInput.value).toBe('Реабилитация'); // default

    expect(screen.getByRole('button', { name: /Создать программу/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Удалить программу/i })).not.toBeInTheDocument();
  });

  test('Render — пациент с программой → edit-mode, форма заполнена', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    expect(screen.getByLabelText(/Название программы/).value).toBe('Реабилитация ACL');
    expect(screen.getByLabelText(/Комплекс упражнений/).value).toBe('1');
    expect(screen.getByLabelText(/Диагноз/).value).toBe('ACL right knee');
    expect(screen.getByLabelText(/Текущая фаза/).value).toBe('2');
    expect(screen.getByLabelText(/Статус/).value).toBe('active');

    expect(screen.getByRole('button', { name: /Удалить программу/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Сохранить$/ })).toBeInTheDocument();
  });

  test('Validation — submit disabled пока title и complex_id не заданы', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    const submitBtn = screen.getByRole('button', { name: /Создать программу/i });
    // По дефолту title='Реабилитация', complex_id='' → disabled
    expect(submitBtn).toBeDisabled();

    // Очищаем title — всё ещё disabled
    fireEvent.change(screen.getByLabelText(/Название программы/), {
      target: { value: '' },
    });
    expect(submitBtn).toBeDisabled();

    // Заполняем title но без complex_id — disabled
    fireEvent.change(screen.getByLabelText(/Название программы/), {
      target: { value: 'Test' },
    });
    expect(submitBtn).toBeDisabled();

    // Выбираем комплекс — становится enabled
    fireEvent.change(screen.getByLabelText(/Комплекс упражнений/), {
      target: { value: '1' },
    });
    expect(submitBtn).not.toBeDisabled();
  });

  test('Submit create → POST вызван с правильными данными → onSaved', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehabPrograms.create.mockResolvedValueOnce({ data: { id: 99 } });

    const onSaved = jest.fn();
    await act(async () => {
      renderModal({ onSaved });
      await flushAsync();
    });

    fireEvent.change(screen.getByLabelText(/Название программы/), {
      target: { value: 'Новая программа' },
    });
    fireEvent.change(screen.getByLabelText(/Комплекс упражнений/), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/Диагноз/), {
      target: { value: 'Knee' },
    });
    fireEvent.change(screen.getByLabelText(/Текущая фаза/), {
      target: { value: '3' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать программу/i }));
      await flushAsync();
    });

    expect(rehabPrograms.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: 14,
        title: 'Новая программа',
        complex_id: 2,
        diagnosis: 'Knee',
        current_phase: 3,
      })
    );
    expect(onSaved).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Программа создана');
  });

  test('Submit edit → PUT вызван → onSaved', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehabPrograms.update.mockResolvedValueOnce({ data: { id: 7 } });

    const onSaved = jest.fn();
    await act(async () => {
      renderModal({ onSaved });
      await flushAsync();
    });

    fireEvent.change(screen.getByLabelText(/Текущая фаза/), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText(/Статус/), {
      target: { value: 'paused' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Сохранить$/ }));
      await flushAsync();
    });

    expect(rehabPrograms.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        current_phase: 4,
        status: 'paused',
      })
    );
    expect(onSaved).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Программа обновлена');
  });

  test('Empty complexes — warning + submit disabled', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [] });
    complexes.getByPatient.mockResolvedValueOnce({ data: [] });

    await act(async () => {
      renderModal();
      await flushAsync();
    });

    expect(screen.getByText(/нет ни одного комплекса/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Создать программу/i });
    expect(submitBtn).toBeDisabled();

    const select = screen.getByLabelText(/Комплекс упражнений/);
    expect(select).toBeDisabled();
  });

  test('Delete flow — confirm → DELETE → onSaved', async () => {
    rehabPrograms.getByPatient.mockResolvedValueOnce({ data: [SAMPLE_PROGRAM] });
    complexes.getByPatient.mockResolvedValueOnce({ data: SAMPLE_COMPLEXES });
    rehabPrograms.delete.mockResolvedValueOnce({ data: {} });

    const onSaved = jest.fn();
    await act(async () => {
      renderModal({ onSaved });
      await flushAsync();
    });

    fireEvent.click(screen.getByRole('button', { name: /Удалить программу/i }));

    // Открылась confirm-модалка
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await flushAsync();
    });

    expect(rehabPrograms.delete).toHaveBeenCalledWith(7);
    expect(onSaved).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Программа удалена');
  });
});
