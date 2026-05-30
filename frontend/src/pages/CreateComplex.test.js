// =====================================================
// TESTS: CreateComplex — AA4 секция «Звуки комплекса» → cue_sounds в payload.
// Rule #37: data-testid, мок services/api (axios-ESM). Гейт по admin-роли.
// =====================================================

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../services/api', () => ({
  patients: { getAll: jest.fn(() => Promise.resolve({ data: [{ id: 14, full_name: 'Вадим Тест', phone: '+70000000000', is_registered: true }] })) },
  diagnoses: { getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  exercises: { getAll: jest.fn(() => Promise.resolve({ data: [{ id: 1, title: 'Присед', body_region: 'knee' }] })) },
  complexes: { create: jest.fn(() => Promise.resolve({ data: { id: 99 } })) },
  templates: { getById: jest.fn(), getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  admin: {
    getAudioPresets: jest.fn(() => Promise.resolve({ data: [{ id: 1, name: 'Гонг', is_active: true }] })),
    getAudioCueDefaults: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../context/ToastContext', () => ({ useToast: () => mockToast }));

let mockUser = { id: 1, role: 'admin' };
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

// TemplateSelector тянет лишние зависимости — заглушаем (не под тестом).
jest.mock('../components/TemplateSelector', () => () => null);

const { patients, diagnoses, exercises, complexes, admin } = require('../services/api');
const CreateComplex = require('./CreateComplex').default;

describe('CreateComplex — AA4 cue_sounds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 1, role: 'admin' };
    // react-scripts ставит resetMocks:true (внутренний CRA-дефолт) → реализации фабрики
    // стираются перед каждым тестом, поэтому ре-арм всех нужных моков здесь.
    patients.getAll.mockResolvedValue({ data: [{ id: 14, full_name: 'Вадим Тест', phone: '+70000000000', is_registered: true }] });
    diagnoses.getAll.mockResolvedValue({ data: [] });
    exercises.getAll.mockResolvedValue({ data: [{ id: 1, title: 'Присед', body_region: 'knee' }] });
    admin.getAudioPresets.mockResolvedValue({ data: [{ id: 1, name: 'Гонг', is_active: true }] });
    admin.getAudioCueDefaults.mockResolvedValue({ data: [] });
    complexes.create.mockResolvedValue({ data: { id: 99 } });
  });

  it('admin: выбор пресета на set_start → cue_sounds в payload complexes.create', async () => {
    await act(async () => { render(<CreateComplex />); });
    // дождаться загрузки пациентов + пресетов (mount-эффекты)
    await waitFor(() => expect(screen.getByText('Вадим Тест')).toBeInTheDocument());
    await waitFor(() => expect(admin.getAudioPresets).toHaveBeenCalled());

    // Шаг 1 → выбрать пациента → Далее
    await act(async () => { fireEvent.click(screen.getByText('Вадим Тест')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Далее/i })); });

    // Шаг 2 → секция «Звуки комплекса» (admin) → выбрать пресет на set_start
    await waitFor(() => expect(screen.getByTestId('cue-sound-select-set_start')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cue-sound-select-set_start'), { target: { value: '1' } });
    });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Далее/i })); });

    // Шаг 3 → добавить упражнение → создать
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Добавить/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Создать комплекс/i })); });

    await waitFor(() => expect(complexes.create).toHaveBeenCalledTimes(1));
    const payload = complexes.create.mock.calls[0][0];
    expect(payload.cue_sounds).toEqual([
      { cue_name: 'set_start', preset_id: 1, is_locked: false },
    ]);
    expect(payload.exercises).toHaveLength(1);
  });

  it('не-admin: секция скрыта, cue_sounds не отправляется', async () => {
    mockUser = { id: 2, role: 'instructor' };
    await act(async () => { render(<CreateComplex />); });
    await waitFor(() => expect(screen.getByText('Вадим Тест')).toBeInTheDocument());

    await act(async () => { fireEvent.click(screen.getByText('Вадим Тест')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Далее/i })); });

    // секция отсутствует
    expect(screen.queryByTestId('cue-sound-select-set_start')).not.toBeInTheDocument();
    // пресеты не запрашивались (admin-only)
    expect(admin.getAudioPresets).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Далее/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Добавить/i })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Создать комплекс/i })); });

    await waitFor(() => expect(complexes.create).toHaveBeenCalledTimes(1));
    const payload = complexes.create.mock.calls[0][0];
    expect(payload).not.toHaveProperty('cue_sounds');
  });
});
