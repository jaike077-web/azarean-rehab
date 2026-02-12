// =====================================================
// TESTS: ProfileScreen component
// Sprint 2 — Профиль пациента
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileScreen from './ProfileScreen';

// Mock api
jest.mock('../../../services/api', () => ({
  patientAuth: {
    getMe: jest.fn(),
    updateMe: jest.fn(),
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn(),
    changePassword: jest.fn(),
  },
}));

// Mock toast
jest.mock('../../../context/ToastContext', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const { patientAuth } = require('../../../services/api');

const mockPatient = {
  id: 14,
  email: 'avi707@mail.ru',
  full_name: 'Вадим',
  phone: '+7 999 123 4567',
  birth_date: '1990-05-15T00:00:00.000Z',
  avatar_url: null,
  email_verified: false,
  auth_provider: 'local',
  last_login_at: '2026-02-11T10:00:00.000Z',
  created_at: '2026-02-10T08:00:00.000Z',
};

describe('ProfileScreen', () => {
  const mockHandleLogout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    patientAuth.getMe.mockResolvedValue({
      data: { success: true, patient: mockPatient },
    });
  });

  describe('Loading state', () => {
    it('renders skeleton while loading', () => {
      // Don't resolve the promise yet
      patientAuth.getMe.mockReturnValue(new Promise(() => {}));

      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      // Should show skeletons
      const skeletons = document.querySelectorAll('.pd-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Profile data display', () => {
    it('renders patient name after loading', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Вадим')).toBeInTheDocument();
      });
    });

    it('renders patient email', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('avi707@mail.ru')).toBeInTheDocument();
      });
    });

    it('renders page title "Профиль"', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Профиль')).toBeInTheDocument();
      });
    });

    it('renders initials when no avatar', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('В')).toBeInTheDocument();
      });
    });

    it('renders form fields with correct values', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        const nameInput = screen.getByDisplayValue('Вадим');
        expect(nameInput).toBeInTheDocument();

        const phoneInput = screen.getByDisplayValue('+7 999 123 4567');
        expect(phoneInput).toBeInTheDocument();
      });
    });

    it('renders email as readonly', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        const emailInput = screen.getByDisplayValue('avi707@mail.ru');
        expect(emailInput).toHaveAttribute('readOnly');
      });
    });

    it('renders auth provider info', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Email/пароль')).toBeInTheDocument();
      });
    });
  });

  describe('Save profile', () => {
    it('calls updateMe on save button click', async () => {
      patientAuth.updateMe.mockResolvedValue({
        data: { success: true, patient: mockPatient },
      });

      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Вадим')).toBeInTheDocument();
      });

      const saveBtn = screen.getByText('Сохранить изменения');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(patientAuth.updateMe).toHaveBeenCalledWith({
          full_name: 'Вадим',
          phone: '+7 999 123 4567',
          birth_date: '1990-05-15',
        });
      });
    });
  });

  describe('Password change', () => {
    it('shows password section when collapse button clicked', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      // Wait for profile data to load
      await waitFor(() => {
        expect(screen.getByText('Личные данные')).toBeInTheDocument();
      });

      const collapseBtn = screen.getByText('Сменить пароль');
      fireEvent.click(collapseBtn);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Введите текущий пароль')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Минимум 8 символов')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Повторите новый пароль')).toBeInTheDocument();
      });
    });

    it('password section is hidden by default', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      // Wait for profile data to load
      await waitFor(() => {
        expect(screen.getByText('Личные данные')).toBeInTheDocument();
      });

      // Password fields should not be visible initially
      expect(screen.queryByPlaceholderText('Введите текущий пароль')).not.toBeInTheDocument();
    });
  });

  describe('Avatar', () => {
    it('renders hidden file input', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Вадим')).toBeInTheDocument();
      });

      const fileInput = screen.getByTestId('avatar-file-input');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveStyle({ display: 'none' });
    });

    it('renders "Изменить фото" button', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Изменить фото')).toBeInTheDocument();
      });
    });

    it('does not render "Удалить" button when no avatar', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Вадим')).toBeInTheDocument();
      });

      expect(screen.queryByText('Удалить')).not.toBeInTheDocument();
    });

    it('renders "Удалить" button when avatar exists', async () => {
      patientAuth.getMe.mockResolvedValue({
        data: {
          success: true,
          patient: { ...mockPatient, avatar_url: '/uploads/avatars/test.jpg' },
        },
      });

      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Удалить')).toBeInTheDocument();
      });
    });
  });

  describe('Logout', () => {
    it('renders logout button', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Выйти из аккаунта')).toBeInTheDocument();
      });
    });

    it('calls handleLogout when logout button clicked', async () => {
      render(<ProfileScreen handleLogout={mockHandleLogout} />);

      await waitFor(() => {
        expect(screen.getByText('Выйти из аккаунта')).toBeInTheDocument();
      });

      const logoutBtn = screen.getByText('Выйти из аккаунта');
      fireEvent.click(logoutBtn);

      expect(mockHandleLogout).toHaveBeenCalledTimes(1);
    });
  });
});
