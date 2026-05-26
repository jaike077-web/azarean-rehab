// =====================================================
// TEST: InstructorModal (Wave 3 C5.4)
// Критично проверить: NO modal-on-modal (кебаб/форма inline, нет 2-го
// .instructorModalOverlay), inline-форма дёргает getUsers лениво и
// исключает текущего инструктора, submit вызывает assignInstructor
// с правильными аргументами.
// =====================================================

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

jest.mock('../../services/api', () => ({
  admin: {
    commandCenter: {
      getAttention: jest.fn(),
    },
    getUsers: jest.fn(),
  },
  patients: {
    assignInstructor: jest.fn(),
  },
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('../../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('./CommandCenter.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

import InstructorModal from './InstructorModal';
import { admin, patients } from '../../services/api';

const row = {
  instructor_id: 1, instructor_name: 'Администратор', role: 'admin',
  caseload: 4, no_program: 1, active: 2, at_risk: 1, dormant: 0, churned: 0,
  unanswered: 1, red_flags: 2, stuck: 1,
};

const mockItems = [
  {
    kind: 'pain_red_flag', patient_id: 14, patient_name: 'Вадим',
    instructor_id: 1, instructor_name: 'Администратор',
    severity: 'high', summary: 'Резкая боль (VAS 8)',
    created_at: '2026-05-19T06:00:00Z',
  },
];

const mockUsers = [
  { id: 1, full_name: 'Администратор',    role: 'admin',      is_active: true },
  { id: 5, full_name: 'Татьяна Иванова',  role: 'instructor', is_active: true },
  { id: 8, full_name: 'Алёна Петрова',    role: 'instructor', is_active: true },
  { id: 9, full_name: 'Уволенный',        role: 'instructor', is_active: false },
  { id: 11,full_name: 'Не-инструктор',    role: 'patient',    is_active: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  admin.commandCenter.getAttention.mockResolvedValue({
    data: { items: mockItems, total: 1 },
  });
  admin.getUsers.mockResolvedValue({ data: mockUsers });
});

describe('InstructorModal — Wave 3 C5.4', () => {
  test('шапка с именем + роль + метрики из row (activePct корректный)', async () => {
    await act(async () => {
      render(<InstructorModal row={row} onClose={() => {}} onReassigned={() => {}} />);
    });

    expect(screen.getByText('Администратор')).toBeInTheDocument();
    expect(screen.getByText('Админ')).toBeInTheDocument();

    // denom = 4 - 1 = 3; active = 2 → activePct = round(100*2/3) = 67%
    expect(screen.getByText(/2 \(67%\)/)).toBeInTheDocument();
    // Под риском 1, Без ответа 1, Red flags 2
    expect(screen.getByText('Red flags')).toBeInTheDocument();
  });

  test('activePct guard: denom = 0 → 0%, не NaN', async () => {
    const zeroRow = { ...row, caseload: 0, no_program: 0, active: 0 };
    await act(async () => {
      render(<InstructorModal row={zeroRow} onClose={() => {}} onReassigned={() => {}} />);
    });

    // 0 (0%) — guard сработал
    expect(screen.getByText(/0 \(0%\)/)).toBeInTheDocument();
  });

  test('fetch /attention?instructor_id на mount, рендерит сигналы', async () => {
    await act(async () => {
      render(<InstructorModal row={row} onClose={() => {}} onReassigned={() => {}} />);
    });

    await waitFor(() => {
      expect(admin.commandCenter.getAttention).toHaveBeenCalledWith({
        instructor_id: 1, limit: 50,
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Резкая боль (VAS 8)')).toBeInTheDocument();
    });
  });

  test('пустой список сигналов', async () => {
    admin.commandCenter.getAttention.mockResolvedValueOnce({
      data: { items: [], total: 0 },
    });
    await act(async () => {
      render(<InstructorModal row={row} onClose={() => {}} onReassigned={() => {}} />);
    });

    await waitFor(() => {
      expect(
        screen.getByText('У этого инструктора нет открытых сигналов')
      ).toBeInTheDocument();
    });
  });

  test('кебаб открывает inline-меню — НЕТ второй .instructorModalOverlay (NO modal-on-modal)', async () => {
    await act(async () => {
      render(<InstructorModal row={row} onClose={() => {}} onReassigned={() => {}} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Резкая боль (VAS 8)')).toBeInTheDocument();
    });

    // До клика — один overlay
    const overlaysBefore = screen.getAllByTestId('instructor-modal-overlay');
    expect(overlaysBefore).toHaveLength(1);

    const kebab = screen.getByLabelText('Действия');
    await act(async () => { fireEvent.click(kebab); });

    // Inline-меню видно
    expect(screen.getByText('Переназначить куратора')).toBeInTheDocument();

    // КРИТИЧНО: второй overlay не появился (NO modal-on-modal).
    // role=dialog тоже остался в единственном числе — кебаб/форма НЕ создают
    // вложенный dialog.
    const overlaysAfter = screen.getAllByTestId('instructor-modal-overlay');
    expect(overlaysAfter).toHaveLength(1);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  test('inline-форма переназначения: getUsers лениво, текущий исключён, success', async () => {
    const onReassigned = jest.fn();
    const onClose = jest.fn();
    patients.assignInstructor.mockResolvedValue({
      data: { id: 14, assigned_instructor_id: 5 },
      meta: { message: 'Инструктор назначен' },
    });

    await act(async () => {
      render(<InstructorModal row={row} onClose={onClose} onReassigned={onReassigned} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Резкая боль (VAS 8)')).toBeInTheDocument();
    });

    // getUsers ещё НЕ вызван (lazy)
    expect(admin.getUsers).not.toHaveBeenCalled();

    // Открыть кебаб → меню → клик «Переназначить куратора»
    await act(async () => { fireEvent.click(screen.getByLabelText('Действия')); });
    await act(async () => { fireEvent.click(screen.getByText('Переназначить куратора')); });

    // Теперь getUsers вызван
    await waitFor(() => {
      expect(admin.getUsers).toHaveBeenCalledTimes(1);
    });

    // Форма видна
    expect(screen.getByText(/Новый куратор для/)).toBeInTheDocument();

    // Select исключает текущего (id=1) и неактивных + не-инструкторов
    await waitFor(() => {
      expect(screen.getByText('Татьяна Иванова')).toBeInTheDocument();
    });
    expect(screen.getByText('Алёна Петрова')).toBeInTheDocument();
    // Уволенный (is_active=false) НЕ должен быть option
    expect(screen.queryByRole('option', { name: 'Уволенный' })).not.toBeInTheDocument();
    // Не-инструктор НЕ должен быть option
    expect(screen.queryByRole('option', { name: 'Не-инструктор' })).not.toBeInTheDocument();
    // Текущий админ (id=1) исключён
    const adminOptions = screen.queryAllByRole('option', { name: 'Администратор' });
    expect(adminOptions).toHaveLength(0);

    // Выбираем Татьяну (id=5), причина, submit
    const select = screen.getByRole('combobox');
    await act(async () => { fireEvent.change(select, { target: { value: '5' } }); });
    const reasonInput = screen.getByPlaceholderText(/Причина/i);
    await act(async () => { fireEvent.change(reasonInput, { target: { value: 'переезд' } }); });

    await act(async () => {
      fireEvent.click(screen.getByText('Переназначить'));
    });

    // PATCH вызван с правильными аргументами
    await waitFor(() => {
      expect(patients.assignInstructor).toHaveBeenCalledWith(14, {
        instructor_id: 5, reason: 'переезд',
      });
    });
    // toast + onReassigned
    expect(mockToast.success).toHaveBeenCalledWith('Инструктор назначен');
    expect(onReassigned).toHaveBeenCalled();
    // /attention рефетчится (был вызван 2 раза: mount + после reassign)
    expect(admin.commandCenter.getAttention).toHaveBeenCalledTimes(2);
  });

  test('клик по имени пациента → navigate("/patients") + onClose', async () => {
    const onClose = jest.fn();
    await act(async () => {
      render(<InstructorModal row={row} onClose={onClose} onReassigned={() => {}} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Резкая боль (VAS 8)')).toBeInTheDocument();
    });

    const summary = screen.getByText('Резкая боль (VAS 8)');
    const patientButton = summary.closest('button');
    await act(async () => { fireEvent.click(patientButton); });

    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/patients');
  });

  test('row=null → ничего не рендерим (hook вызывается выше early return)', () => {
    // Это проверка что Rules of Hooks не сломаны: компонент должен корректно
    // обработать row=null без throw'а (hook'и стабильны).
    const { container } = render(
      <InstructorModal row={null} onClose={() => {}} onReassigned={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
});
