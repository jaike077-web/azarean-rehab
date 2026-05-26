// =====================================================
// TEST: InstructorsPanel (Wave 3 C5.4)
// =====================================================

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

jest.mock('../../services/api', () => ({
  admin: {
    commandCenter: {
      getInstructors: jest.fn(),
      getAttention: jest.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
    },
    getUsers: jest.fn().mockResolvedValue({ data: [] }),
  },
  patients: { assignInstructor: jest.fn() },
}));

jest.mock('../../context/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('./CommandCenter.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

import InstructorsPanel from './InstructorsPanel';
import { admin } from '../../services/api';

beforeEach(() => {
  jest.clearAllMocks();
});

const mockInstructors = [
  {
    instructor_id: 1, instructor_name: 'Администратор', role: 'admin',
    caseload: 3, no_program: 0, active: 1, at_risk: 1, dormant: 1, churned: 0,
    unanswered: 1, red_flags: 2, stuck: 1,
  },
  {
    instructor_id: 5, instructor_name: 'Татьяна Иванова', role: 'instructor',
    caseload: 2, no_program: 1, active: 1, at_risk: 0, dormant: 0, churned: 0,
    unanswered: 0, red_flags: 0, stuck: 0,
  },
];

describe('InstructorsPanel — Wave 3 C5.4', () => {
  test('рендерит строки с колонками и значениями', async () => {
    admin.commandCenter.getInstructors.mockResolvedValue({
      data: { period: '30d', adherence_window_days: 30, instructors: mockInstructors },
    });

    await act(async () => { render(<InstructorsPanel />); });

    await waitFor(() => {
      expect(screen.getByText('Срез по инструкторам')).toBeInTheDocument();
    });
    expect(screen.getByText('Администратор')).toBeInTheDocument();
    expect(screen.getByText('Татьяна Иванова')).toBeInTheDocument();
    // Заголовки колонок
    expect(screen.getByText('Пациентов')).toBeInTheDocument();
    expect(screen.getByText('Без прогр.')).toBeInTheDocument();
    expect(screen.getByText('Без ответа')).toBeInTheDocument();
    expect(screen.getByText('Flags')).toBeInTheDocument();
    // caseload админа = 3
    const cells = screen.getAllByRole('cell');
    const caseloadCells = cells.filter((c) => c.textContent === '3');
    expect(caseloadCells.length).toBeGreaterThanOrEqual(1);
  });

  test('пустое состояние при instructors:[]', async () => {
    admin.commandCenter.getInstructors.mockResolvedValue({
      data: { period: '30d', adherence_window_days: 30, instructors: [] },
    });

    await act(async () => { render(<InstructorsPanel />); });

    await waitFor(() => {
      expect(
        screen.getByText('Нет инструкторов с привязанными пациентами')
      ).toBeInTheDocument();
    });
  });

  test('клик по строке открывает модалку (role=dialog появляется)', async () => {
    admin.commandCenter.getInstructors.mockResolvedValue({
      data: { instructors: mockInstructors },
    });

    await act(async () => { render(<InstructorsPanel />); });

    await waitFor(() => {
      expect(screen.getByText('Администратор')).toBeInTheDocument();
    });

    // До клика модалки нет
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const row = screen.getByText('Администратор').closest('tr');
    await act(async () => { fireEvent.click(row); });

    // Модалка появилась
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  test('error state с retry', async () => {
    admin.commandCenter.getInstructors.mockRejectedValueOnce({
      response: { data: { message: 'Backend упал' } },
    });

    await act(async () => { render(<InstructorsPanel />); });

    await waitFor(() => {
      expect(screen.getByText('Backend упал')).toBeInTheDocument();
    });
    expect(screen.getByText('Повторить')).toBeInTheDocument();

    admin.commandCenter.getInstructors.mockResolvedValueOnce({
      data: { instructors: mockInstructors },
    });
    await act(async () => { fireEvent.click(screen.getByText('Повторить')); });

    await waitFor(() => {
      expect(screen.getByText('Татьяна Иванова')).toBeInTheDocument();
    });
  });
});
