// =====================================================
// TESTS: ProfileScreen v12 (overlay)
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileScreen from './ProfileScreen';

// Mock api
jest.mock('../../../services/api', () => ({
  patientAuth: {
    getMe: jest.fn(),
    updateMe: jest.fn(),
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn(),
    fetchAvatarBlob: jest.fn(() => Promise.resolve({ data: new Blob(['x'], { type: 'image/jpeg' }) })),
    changePassword: jest.fn(),
  },
  rehab: {
    getTelegramStatus: jest.fn(() => Promise.resolve({ data: { linked: false } })),
    generateTelegramCode: jest.fn(),
    unlinkTelegram: jest.fn(),
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

// Mock PatientAuthContext — overlay читает patient оттуда
const mockRefresh = jest.fn();
const mockUpdatePatient = jest.fn();
const mockPatient = {
  id: 14,
  email: 'avi707@mail.ru',
  full_name: 'Вадим',
  phone: '+7 999 123 4567',
  birth_date: '1990-05-15T00:00:00.000Z',
  diagnosis: 'ПКС · Левое колено',
  avatar_url: null,
  email_verified: false,
  auth_provider: 'local',
  preferred_messenger: 'telegram',
  last_login_at: '2026-02-11T10:00:00.000Z',
  created_at: '2026-02-10T08:00:00.000Z',
};

jest.mock('../../../context/PatientAuthContext', () => ({
  usePatientAuth: () => ({
    patient: mockPatient,
    loading: false,
    login: jest.fn(),
    logout: jest.fn(),
    refresh: mockRefresh,
    updatePatient: mockUpdatePatient,
  }),
}));

const { patientAuth, rehab } = require('../../../services/api');

const setup = (overrides = {}) => {
  const props = {
    onClose: jest.fn(),
    handleLogout: jest.fn(),
    goTo: jest.fn(),
    ...overrides,
  };
  const utils = render(<ProfileScreen {...props} />);
  return { ...utils, props };
};

describe('ProfileScreen overlay (v12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getTelegramStatus.mockResolvedValue({ data: { linked: false } });
    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = jest.fn();
    }
  });

  // -----------------------------
  // Identity
  // -----------------------------
  describe('Identity block', () => {
    it('renders title "Профиль"', () => {
      setup();
      expect(screen.getByRole('heading', { name: 'Профиль', level: 1 })).toBeInTheDocument();
    });

    it('renders patient name in identity block', () => {
      const { container } = setup();
      const identity = container.querySelector('.pd-profile-identity-name');
      expect(identity).toHaveTextContent('Вадим');
    });

    it('renders patient email in identity block', () => {
      const { container } = setup();
      const emailEl = container.querySelector('.pd-profile-identity-email');
      expect(emailEl).toHaveTextContent('avi707@mail.ru');
    });

    it('renders initial "В" inside avatar circle', () => {
      const { container } = setup();
      const initialEl = container.querySelector('.pd-profile-identity-avatar--initial');
      expect(initialEl).toBeInTheDocument();
      expect(initialEl).toHaveTextContent('В');
    });

    it('renders diagnosis chip in identity block', () => {
      const { container } = setup();
      const chip = container.querySelector('.pd-profile-identity-chip');
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveTextContent('ПКС · Левое колено');
    });
  });

  // -----------------------------
  // Read-only fields
  // -----------------------------
  describe('Read-only fields (no inputs)', () => {
    it('does NOT render email as <input>', () => {
      setup();
      expect(screen.queryByDisplayValue('avi707@mail.ru')).not.toBeInTheDocument();
      // А email-row — есть, как display row
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('does NOT render diagnosis as <input>', () => {
      setup();
      expect(screen.queryByDisplayValue('ПКС · Левое колено')).not.toBeInTheDocument();
    });

    it('does NOT render birth_date as editable input (no date input)', () => {
      const { container } = setup();
      expect(container.querySelector('input[type="date"]')).not.toBeInTheDocument();
    });
  });

  // -----------------------------
  // Edit modal — name
  // -----------------------------
  describe('Edit modal: name', () => {
    it('opens edit modal on name SettingsRow tap', () => {
      setup();
      // Имя в Личное → клик на «Имя»
      fireEvent.click(screen.getByRole('button', { name: /^Имя/ }));
      // Edit sheet появился
      expect(screen.getByRole('dialog', { name: /Редактировать Имя/ })).toBeInTheDocument();
      // input предзаполнен текущим именем
      expect(screen.getByDisplayValue('Вадим')).toBeInTheDocument();
    });

    it('saves name via PUT /me with new value', async () => {
      patientAuth.updateMe.mockResolvedValue({ data: { ...mockPatient, full_name: 'Вадим Иванов' } });

      setup();
      fireEvent.click(screen.getByRole('button', { name: /^Имя/ }));

      const input = screen.getByDisplayValue('Вадим');
      fireEvent.change(input, { target: { value: 'Вадим Иванов' } });
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => {
        expect(patientAuth.updateMe).toHaveBeenCalledWith({ full_name: 'Вадим Иванов' });
      });
    });

    it('triggers refresh() on PatientAuthContext after successful save', async () => {
      patientAuth.updateMe.mockResolvedValue({ data: { ...mockPatient, full_name: 'Новое' } });

      setup();
      fireEvent.click(screen.getByRole('button', { name: /^Имя/ }));
      fireEvent.change(screen.getByDisplayValue('Вадим'), { target: { value: 'Новое' } });
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    });

    it('cancels edit on Отмена click — no API call', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /^Имя/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
      expect(patientAuth.updateMe).not.toHaveBeenCalled();
    });

    it('closes edit modal on backdrop click', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /^Имя/ }));
      const backdrop = screen.getByRole('dialog', { name: /Редактировать Имя/ });
      fireEvent.click(backdrop);
      expect(screen.queryByRole('dialog', { name: /Редактировать Имя/ })).not.toBeInTheDocument();
    });
  });

  // -----------------------------
  // Edit modal — phone
  // -----------------------------
  describe('Edit modal: phone', () => {
    it('opens edit modal on phone SettingsRow tap', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /^Телефон/ }));
      expect(screen.getByRole('dialog', { name: /Редактировать Телефон/ })).toBeInTheDocument();
    });

    it('saves phone via PUT /me', async () => {
      patientAuth.updateMe.mockResolvedValue({ data: { ...mockPatient, phone: '+79991234567' } });

      setup();
      fireEvent.click(screen.getByRole('button', { name: /^Телефон/ }));

      const input = screen.getByDisplayValue('+7 999 123 4567');
      fireEvent.change(input, { target: { value: '+79991234567' } });
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => {
        expect(patientAuth.updateMe).toHaveBeenCalledWith({ phone: '+79991234567' });
      });
    });
  });

  // -----------------------------
  // Curator → Contact tab
  // -----------------------------
  describe('Curator action', () => {
    it('clicking Куратор calls goTo(3) (Contact tab)', () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole('button', { name: /^Куратор/ }));
      expect(props.goTo).toHaveBeenCalledWith(3);
    });
  });

  // -----------------------------
  // Sections
  // -----------------------------
  describe('Section labels', () => {
    it('renders «Личное» section', () => {
      setup();
      expect(screen.getByText('Личное')).toBeInTheDocument();
    });

    it('renders «Реабилитация» section', () => {
      setup();
      expect(screen.getByText('Реабилитация')).toBeInTheDocument();
    });

    it('renders «Связь» section with active messenger picker', () => {
      setup();
      expect(screen.getByText('Связь')).toBeInTheDocument();
      expect(screen.getByText('Основной канал связи')).toBeInTheDocument();
      // Placeholder «Скоро» больше не должен рендериться — picker активен (Checkpoint 3)
      expect(screen.queryByText(/Скоро/)).not.toBeInTheDocument();
    });

    it('renders «Безопасность» section with «Сменить пароль»', () => {
      setup();
      expect(screen.getByText('Безопасность')).toBeInTheDocument();
      expect(screen.getByText('Сменить пароль')).toBeInTheDocument();
    });

    it('renders «Прочее» section with logout', () => {
      setup();
      expect(screen.getByText('Прочее')).toBeInTheDocument();
      expect(screen.getByText('Выйти из аккаунта')).toBeInTheDocument();
    });
  });

  // -----------------------------
  // Password change collapse
  // -----------------------------
  describe('Password change', () => {
    it('password inputs hidden by default', () => {
      setup();
      expect(screen.queryByPlaceholderText('Текущий пароль')).not.toBeInTheDocument();
    });

    it('expands password inputs on Сменить пароль tap', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /Сменить пароль/ }));
      expect(screen.getByPlaceholderText('Текущий пароль')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Новый пароль (мин. 8 символов)')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Повторите новый пароль')).toBeInTheDocument();
    });
  });

  // -----------------------------
  // Logout
  // -----------------------------
  describe('Logout', () => {
    it('clicking «Выйти из аккаунта» calls handleLogout', () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole('button', { name: /Выйти из аккаунта/ }));
      expect(props.handleLogout).toHaveBeenCalled();
    });
  });

  // -----------------------------
  // Close overlay
  // -----------------------------
  describe('Close overlay', () => {
    it('back button calls onClose', () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
      expect(props.onClose).toHaveBeenCalled();
    });
  });

  // -----------------------------
  // Avatar
  // -----------------------------
  describe('Avatar', () => {
    it('renders hidden avatar file input', () => {
      setup();
      const input = screen.getByTestId('avatar-file-input');
      expect(input).toHaveAttribute('type', 'file');
    });

    it('camera button is enabled when not uploading', () => {
      setup();
      const cameraBtn = screen.getByRole('button', { name: /Изменить фото/i });
      expect(cameraBtn).not.toBeDisabled();
    });
  });

  // -----------------------------
  // Messenger picker (Checkpoint 3)
  // -----------------------------
  describe('Messenger picker', () => {
    it('renders current preferred_messenger (Telegram) as default row value', () => {
      setup();
      // SettingsRow «Основной канал связи» имеет value=«Telegram»
      const row = screen.getByRole('button', { name: 'Основной канал связи' });
      expect(row).toHaveTextContent('Telegram');
    });

    it('picker hidden by default (3 radio options not rendered)', () => {
      setup();
      expect(screen.queryByRole('radiogroup', { name: /Выбор канала связи/ })).not.toBeInTheDocument();
    });

    it('opens picker accordion on tap → 3 radio options', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Основной канал связи' }));
      const group = screen.getByRole('radiogroup', { name: /Выбор канала связи/ });
      expect(group).toBeInTheDocument();
      const radios = within(group).getAllByRole('radio');
      expect(radios).toHaveLength(3);
    });

    it('active radio corresponds to current preferred_messenger', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Основной канал связи' }));
      const group = screen.getByRole('radiogroup');
      const radios = within(group).getAllByRole('radio');
      // telegram — первый в MESSENGER_KEYS
      expect(radios[0]).toHaveAttribute('aria-checked', 'true');
      expect(radios[1]).toHaveAttribute('aria-checked', 'false');
      expect(radios[2]).toHaveAttribute('aria-checked', 'false');
    });

    it('tap on current messenger is no-op (no API call)', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Основной канал связи' }));
      const group = screen.getByRole('radiogroup');
      const activeRadio = within(group).getAllByRole('radio')[0];
      fireEvent.click(activeRadio);
      expect(mockUpdatePatient).not.toHaveBeenCalled();
    });

    it('changes messenger optimistically + calls updatePatient API', async () => {
      mockUpdatePatient.mockResolvedValue({ ...mockPatient, preferred_messenger: 'whatsapp' });

      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Основной канал связи' }));
      const group = screen.getByRole('radiogroup');
      const waRadio = within(group).getAllByRole('radio')[1]; // WhatsApp
      fireEvent.click(waRadio);

      await waitFor(() => {
        expect(mockUpdatePatient).toHaveBeenCalledWith({ preferred_messenger: 'whatsapp' });
      });
    });

    it('rolls back UI state + no persistent change on API failure', async () => {
      mockUpdatePatient.mockRejectedValue({
        response: { data: { message: 'Server error' } },
      });

      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Основной канал связи' }));
      const initialRadios = within(screen.getByRole('radiogroup')).getAllByRole('radio');
      fireEvent.click(initialRadios[2]); // MAX

      // API-вызов был сделан
      await waitFor(() => {
        expect(mockUpdatePatient).toHaveBeenCalledWith({ preferred_messenger: 'max' });
      });

      // Финальное состояние — rollback на telegram (0-й radio снова active).
      // Промежуточное optimistic-состояние в jsdom/React18 batch не всегда
      // фиксируется, поэтому проверяем только конечный rollback.
      await waitFor(() => {
        const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio');
        expect(radios[0]).toHaveAttribute('aria-checked', 'true');
        expect(radios[2]).toHaveAttribute('aria-checked', 'false');
      });
    });
  });

  // -----------------------------
  // MessengerCTA демо-блок в Profile
  // -----------------------------
  describe('MessengerCTA in Profile', () => {
    it('renders MessengerCTA with primary=preferred_messenger', () => {
      setup();
      // Telegram т.к. mockPatient.preferred_messenger='telegram'
      const cta = screen.getByRole('link', { name: /Связаться с куратором · Telegram/ });
      expect(cta).toBeInTheDocument();
      expect(cta).toHaveAttribute('href', expect.stringContaining('t.me'));
    });
  });
});
