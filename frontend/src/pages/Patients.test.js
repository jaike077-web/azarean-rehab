import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
// react-router-dom мокается глобально в src/__mocks__/react-router-dom.js
// (useNavigate возвращает jest.fn). MemoryRouter недоступен — не используем.

// =====================================================
// Wave 1 #1.09 — stuck-badge в карточке пациента
// =====================================================
// Покрываем conditional рендер бейджа «застрял на фазе» по `is_stuck_on_phase`.

jest.mock('../services/api', () => ({
  patients: {
    getAll: jest.fn(),
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

jest.mock('../components/ConfirmModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/InviteCodeModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/RehabProgramModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/Skeleton', () => ({
  PatientsPageSkeleton: () => <div data-testid="skeleton">loading</div>,
}));

jest.mock('../components/BackButton', () => ({
  __esModule: true,
  default: ({ label }) => <button>{label || 'Назад'}</button>,
}));

jest.mock('../components/Breadcrumbs', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../hooks/useConfirm', () => ({
  __esModule: true,
  default: () => ({
    confirmState: { isOpen: false },
    confirm: jest.fn(),
    closeConfirm: jest.fn(),
  }),
}));

// CSS Module: имя класса = строка
jest.mock('./Patients.module.css', () =>
  new Proxy({}, { get: (_, prop) => String(prop) })
);

const { patients } = require('../services/api');
import Patients from './Patients';

const BASE_PATIENT = {
  id: 1,
  full_name: 'Иван Тест',
  email: null,
  phone: null,
  birth_date: null,
  diagnosis: null,
  notes: null,
  is_active: true,
  avatar_url: null,
  last_login_at: null,
  telegram_chat_id: null,
  created_at: '2026-05-01',
  updated_at: '2026-05-01',
  is_registered: true,
  complexes_count: 0,
};

const renderPatients = () => render(<Patients />);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Patients — stuck-on-phase badge', () => {
  it('показывает badge «застрял на фазе» если is_stuck_on_phase=true', async () => {
    patients.getAll.mockResolvedValue({
      data: [{ ...BASE_PATIENT, is_stuck_on_phase: true }],
    });

    renderPatients();

    await waitFor(() => expect(patients.getAll).toHaveBeenCalled());
    expect(await screen.findByText(/застрял на фазе/i)).toBeInTheDocument();
  });

  it('НЕ показывает badge если is_stuck_on_phase=false', async () => {
    patients.getAll.mockResolvedValue({
      data: [{ ...BASE_PATIENT, is_stuck_on_phase: false }],
    });

    renderPatients();

    await waitFor(() => expect(patients.getAll).toHaveBeenCalled());
    // Пациент отрендерен — но без badge
    expect(await screen.findByText(/Иван Тест/i)).toBeInTheDocument();
    expect(screen.queryByText(/застрял на фазе/i)).not.toBeInTheDocument();
  });

  it('НЕ показывает badge если поле is_stuck_on_phase отсутствует (старые respons-payload\'ы)', async () => {
    const { is_stuck_on_phase: _omit, ...patientWithoutFlag } = { ...BASE_PATIENT, is_stuck_on_phase: false };
    patients.getAll.mockResolvedValue({
      data: [patientWithoutFlag],
    });

    renderPatients();

    await waitFor(() => expect(patients.getAll).toHaveBeenCalled());
    expect(await screen.findByText(/Иван Тест/i)).toBeInTheDocument();
    expect(screen.queryByText(/застрял на фазе/i)).not.toBeInTheDocument();
  });
});
