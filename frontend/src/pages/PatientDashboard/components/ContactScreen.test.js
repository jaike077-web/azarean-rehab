// =====================================================
// TESTS: ContactScreen v12 (feedback + studio + emergency + quick + Zari)
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactScreen from './ContactScreen';

jest.mock('../hooks/usePatientAvatarBlob', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../../services/api', () => ({
  rehab: {
    getMyMessages: jest.fn(() => Promise.resolve({ data: [] })),
    getTelegramStatus: jest.fn(() => Promise.resolve({ data: { connected: false } })),
  },
  patientAuth: {},
}));

const { rehab } = require('../../../services/api');

const mockPatient = {
  id: 14,
  full_name: 'Вадим',
  email: 'avi707@mail.ru',
  avatar_url: null,
  preferred_messenger: 'telegram',
};

const mockDashboardData = {
  program: { id: 7, diagnosis: 'Разрыв ПКС', current_phase: 1 },
};

const setup = (overrides = {}) => {
  const props = {
    patient: mockPatient,
    dashboardData: mockDashboardData,
    onOpenProfile: jest.fn(),
    ...overrides,
  };
  const utils = render(<ContactScreen {...props} />);
  return { ...utils, props };
};

describe('ContactScreen v12', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getMyMessages.mockResolvedValue({ data: [] });
    rehab.getTelegramStatus.mockResolvedValue({ data: { connected: false } });
  });

  // -----------------------------
  // Header
  // -----------------------------
  describe('Header', () => {
    it('renders «Связь» title', async () => {
      setup();
      expect(screen.getByRole('heading', { name: 'Связь' })).toBeInTheDocument();
    });

    it('AvatarBtn opens Profile', async () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole('button', { name: /Профиль/ }));
      expect(props.onOpenProfile).toHaveBeenCalled();
    });
  });

  // -----------------------------
  // Feedback card — empty state
  // -----------------------------
  describe('Feedback card — empty', () => {
    it('renders empty placeholder when no messages', async () => {
      setup();
      await waitFor(() => {
        expect(screen.getByText('Пока нет сообщений')).toBeInTheDocument();
      });
    });

    it('renders MessengerCTA «Написать» for empty state', async () => {
      setup();
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Написать · Telegram/ })).toBeInTheDocument();
      });
    });
  });

  // -----------------------------
  // Feedback card — with instructor message
  // -----------------------------
  describe('Feedback card — with message', () => {
    it('renders latest instructor message', async () => {
      rehab.getMyMessages.mockResolvedValue({
        data: [
          {
            id: 1,
            sender_type: 'instructor',
            sender_id: 1,
            body: 'ROM растёт стабильно, отлично!',
            created_at: '2026-04-21T14:20:00.000Z',
            is_read: false,
            linked_diary_id: null,
            linked_diary_date: null,
          },
        ],
      });

      setup();
      await waitFor(() => {
        expect(screen.getByText('ROM растёт стабильно, отлично!')).toBeInTheDocument();
      });
      expect(screen.getByText('Татьяна')).toBeInTheDocument();
      expect(screen.getByText('куратор программы')).toBeInTheDocument();
    });

    it('renders unread badge when unread messages exist', async () => {
      rehab.getMyMessages.mockResolvedValue({
        data: [
          {
            id: 1, sender_type: 'instructor', sender_id: 1,
            body: 'msg 1', created_at: '2026-04-21T14:00:00Z', is_read: false,
          },
          {
            id: 2, sender_type: 'instructor', sender_id: 1,
            body: 'msg 2', created_at: '2026-04-20T14:00:00Z', is_read: false,
          },
        ],
      });

      setup();
      await waitFor(() => {
        expect(screen.getByLabelText(/2 непрочитанных/)).toHaveTextContent('2');
      });
    });

    it('renders «К записи N апреля» chip when linked_diary_date present', async () => {
      rehab.getMyMessages.mockResolvedValue({
        data: [
          {
            id: 1, sender_type: 'instructor', sender_id: 1,
            body: 'Ответ на ваш дневник', created_at: '2026-04-21T14:00:00Z',
            is_read: true, linked_diary_id: 42, linked_diary_date: '2026-04-11',
          },
        ],
      });

      setup();
      await waitFor(() => {
        expect(screen.getByText(/К записи 11 апреля/)).toBeInTheDocument();
      });
    });

    it('renders MessengerCTA «Ответить» with preferred_messenger', async () => {
      rehab.getMyMessages.mockResolvedValue({
        data: [{
          id: 1, sender_type: 'instructor', sender_id: 1,
          body: 'привет', created_at: '2026-04-21T14:00:00Z', is_read: true,
        }],
      });

      setup({ patient: { ...mockPatient, preferred_messenger: 'whatsapp' } });
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Ответить · WhatsApp/ })).toBeInTheDocument();
      });
    });

    it('filters out patient-sent messages — only instructor counted', async () => {
      rehab.getMyMessages.mockResolvedValue({
        data: [
          { id: 5, sender_type: 'patient', sender_id: 14, body: 'my msg', created_at: '2026-04-21T14:10:00Z', is_read: true },
          { id: 4, sender_type: 'instructor', sender_id: 1, body: 'instructor msg', created_at: '2026-04-21T13:00:00Z', is_read: true },
        ],
      });
      setup();
      await waitFor(() => {
        expect(screen.getByText('instructor msg')).toBeInTheDocument();
      });
      expect(screen.queryByText('my msg')).not.toBeInTheDocument();
    });
  });

  // -----------------------------
  // Studio location
  // -----------------------------
  describe('Studio location', () => {
    it('renders Azarean address', async () => {
      setup();
      expect(screen.getByText('Azarean Network')).toBeInTheDocument();
      expect(screen.getByText(/Белинского 108, ст\. 26/)).toBeInTheDocument();
    });
  });

  // -----------------------------
  // Emergency
  // -----------------------------
  describe('Emergency block', () => {
    it('renders 103 link with correct tel: URL', async () => {
      setup();
      const link103 = screen.getByRole('link', { name: /103/ });
      expect(link103).toHaveAttribute('href', 'tel:103');
    });

    it('renders Azarean tel link with +79089049130', async () => {
      setup();
      const azareanBtn = screen.getByRole('link', { name: /Azarean/ });
      expect(azareanBtn).toHaveAttribute('href', 'tel:+79089049130');
    });
  });

  // -----------------------------
  // Quick actions
  // -----------------------------
  describe('Quick actions', () => {
    it('renders 4 quick action rows', async () => {
      setup();
      expect(screen.getByText('Задать вопрос')).toBeInTheDocument();
      expect(screen.getByText('Боль усилилась')).toBeInTheDocument();
      expect(screen.getByText('Записаться')).toBeInTheDocument();
      expect(screen.getByText('Отправить фото')).toBeInTheDocument();
    });
  });

  // -----------------------------
  // Zari widget (read-only)
  // -----------------------------
  describe('Zari widget', () => {
    it('renders 4 schedule rows', async () => {
      setup();
      expect(screen.getByText('Утро')).toBeInTheDocument();
      expect(screen.getByText('Вечер')).toBeInTheDocument();
      expect(screen.getByText('Совет дня')).toBeInTheDocument();
      expect(screen.getByText('Смена фазы')).toBeInTheDocument();
    });

    it('shows «Не подключён» badge when Telegram not linked', async () => {
      rehab.getTelegramStatus.mockResolvedValue({ data: { connected: false } });
      setup();
      await waitFor(() => {
        expect(screen.getByText('Не подключён')).toBeInTheDocument();
      });
    });

    it('shows «Telegram» badge when linked', async () => {
      rehab.getTelegramStatus.mockResolvedValue({ data: { connected: true } });
      setup();
      await waitFor(() => {
        expect(screen.getByText('Telegram')).toBeInTheDocument();
      });
    });

    it('«Управление — в Профиле» link opens Profile', async () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole('button', { name: /Управление — в Профиле/ }));
      expect(props.onOpenProfile).toHaveBeenCalled();
    });

    it('tap on schedule row → opens Profile (read-only semantic)', async () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole('button', { name: /Настроить «Утро» в Профиле/ }));
      expect(props.onOpenProfile).toHaveBeenCalled();
    });
  });
});
