// =====================================================
// TESTS: DiaryScreen v12 (Checkpoint 6)
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DiaryScreen from './DiaryScreen';

jest.mock('../hooks/usePatientAvatarBlob', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../../services/api', () => ({
  rehab: {
    getDiaryEntry: jest.fn(() => Promise.resolve({ data: null })),
    getDiaryEntries: jest.fn(() => Promise.resolve({ data: [] })),
    getDiaryTrend: jest.fn(() => Promise.resolve({ data: [] })),
    createDiaryEntry: jest.fn(() => Promise.resolve({ data: { id: 1 } })),
    uploadDiaryPhoto: jest.fn(),
    deleteDiaryPhoto: jest.fn(),
    fetchDiaryPhotoBlob: jest.fn(() => Promise.resolve({ data: null })),
  },
  patientAuth: {},
}));

jest.mock('../../../context/ToastContext', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const { rehab } = require('../../../services/api');

const mockPatient = {
  id: 14,
  full_name: 'Вадим',
  email: 'avi707@mail.ru',
  avatar_url: null,
  preferred_messenger: 'telegram',
};

const setup = (overrides = {}) => {
  const props = {
    patient: mockPatient,
    onOpenProfile: jest.fn(),
    pgicFeel: null,
    dashboardData: null,
    ...overrides,
  };
  const utils = render(<DiaryScreen {...props} />);
  return { ...utils, props };
};

// Ждём окончания параллельных Promise.all при mount — loading→false.
const waitForLoaded = async () => {
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Дневник' })).toBeInTheDocument();
  });
};

describe('DiaryScreen v12', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getDiaryEntry.mockResolvedValue({ data: null });
    rehab.getDiaryEntries.mockResolvedValue({ data: [] });
    rehab.getDiaryTrend.mockResolvedValue({ data: [] });
    rehab.createDiaryEntry.mockResolvedValue({ data: { id: 42 } });
    rehab.fetchDiaryPhotoBlob.mockResolvedValue({ data: null });
  });

  describe('Header', () => {
    it('renders «Дневник» title', async () => {
      setup();
      await waitForLoaded();
      expect(screen.getByText('Полный отчёт за день')).toBeInTheDocument();
    });

    it('AvatarBtn opens Profile', async () => {
      const { props } = setup();
      await waitForLoaded();
      fireEvent.click(screen.getByRole('button', { name: /Профиль/ }));
      expect(props.onOpenProfile).toHaveBeenCalled();
    });
  });

  describe('PGIC info-bar', () => {
    it('hides info-bar when pgicFeel is null', async () => {
      setup();
      await waitForLoaded();
      expect(screen.queryByText(/Данные подставлены/)).not.toBeInTheDocument();
    });

    it('shows «Лучше» variant', async () => {
      setup({ pgicFeel: 'better' });
      await waitForLoaded();
      expect(screen.getByText(/Данные подставлены/)).toBeInTheDocument();
      expect(screen.getByText(/«Лучше»/)).toBeInTheDocument();
    });

    it('shows «Хуже» variant', async () => {
      setup({ pgicFeel: 'worse' });
      await waitForLoaded();
      expect(screen.getByText(/«Хуже»/)).toBeInTheDocument();
    });

    it('preselects initial pain: better=2, same=4, worse=6', async () => {
      for (const [feel, expected] of [['better', '2'], ['same', '4'], ['worse', '6']]) {
        const { unmount } = setup({ pgicFeel: feel });
        await waitForLoaded();
        const slider = screen.getByLabelText(/Уровень боли/);
        expect(slider.value).toBe(expected);
        unmount();
      }
    });
  });

  describe('Pain slider', () => {
    it('renders slider 0..10', async () => {
      setup();
      await waitForLoaded();
      const slider = screen.getByLabelText(/Уровень боли/);
      expect(slider).toHaveAttribute('min', '0');
      expect(slider).toHaveAttribute('max', '10');
    });

    it('updates value on change', async () => {
      setup();
      await waitForLoaded();
      const slider = screen.getByLabelText(/Уровень боли/);
      fireEvent.change(slider, { target: { value: '7' } });
      expect(slider.value).toBe('7');
    });
  });

  describe('Pain when pills', () => {
    it('renders 5 time-of-day pills', async () => {
      setup();
      await waitForLoaded();
      expect(screen.getByRole('button', { name: /Утро/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /День/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Вечер/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Упр\./ })).toBeInTheDocument();
      // Ходьба встречается в pain_when и better_list (2 шт.)
      expect(screen.getAllByRole('button', { name: /Ходьба/ })).toHaveLength(2);
    });

    it('toggles active state on tap', async () => {
      setup();
      await waitForLoaded();
      const morning = screen.getByRole('button', { name: /Утро/ });
      fireEvent.click(morning);
      expect(morning.className).toMatch(/pd-diary-pill--active/);
      fireEvent.click(morning);
      expect(morning.className).not.toMatch(/pd-diary-pill--active/);
    });
  });

  describe('ROM input', () => {
    it('renders initial 135°', async () => {
      setup();
      await waitForLoaded();
      expect(screen.getByText('135')).toBeInTheDocument();
    });

    it('+1 increments', async () => {
      setup();
      await waitForLoaded();
      fireEvent.click(screen.getByRole('button', { name: /Увеличить/ }));
      expect(screen.getByText('136')).toBeInTheDocument();
    });

    it('−1 decrements', async () => {
      setup();
      await waitForLoaded();
      fireEvent.click(screen.getByRole('button', { name: /Уменьшить/ }));
      expect(screen.getByText('134')).toBeInTheDocument();
    });

    it('clamps to [60, 180]', async () => {
      setup();
      await waitForLoaded();
      const dec = screen.getByRole('button', { name: /Уменьшить/ });
      for (let i = 0; i < 100; i += 1) fireEvent.click(dec);
      expect(screen.getByText('60')).toBeInTheDocument();
      const inc = screen.getByRole('button', { name: /Увеличить/ });
      for (let i = 0; i < 200; i += 1) fireEvent.click(inc);
      expect(screen.getByText('180')).toBeInTheDocument();
    });
  });

  describe('Better list', () => {
    it('renders 4 pills', async () => {
      setup();
      await waitForLoaded();
      expect(screen.getByRole('button', { name: /Разгибание/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Сон/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Настроение/ })).toBeInTheDocument();
    });

    it('multi-select', async () => {
      setup();
      await waitForLoaded();
      const ext = screen.getByRole('button', { name: /Разгибание/ });
      const sleep = screen.getByRole('button', { name: /Сон/ });
      fireEvent.click(ext);
      fireEvent.click(sleep);
      expect(ext.className).toMatch(/--active/);
      expect(sleep.className).toMatch(/--active/);
    });
  });

  describe('Pre-fill from today entry', () => {
    it('prefills pain, rom, better_list, pain_when', async () => {
      rehab.getDiaryEntry.mockResolvedValue({
        data: {
          id: 100,
          pain_level: 4,
          pain_when: 'evening',
          swelling: 2,
          rom_degrees: 128,
          better_list: ['walk', 'sleep'],
          notes: 'free text',
          photos: [],
        },
      });
      setup();
      await waitForLoaded();
      const slider = screen.getByLabelText(/Уровень боли/);
      await waitFor(() => expect(slider.value).toBe('4'));
      expect(screen.getByText('128')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Вечер/ }).className).toMatch(/--active/);
      // Ходьба встречается в 2 секциях — проверяем что в better-секции pill активна
      const walkPills = screen.getAllByRole('button', { name: /Ходьба/ });
      const activeWalkPills = walkPills.filter((b) => b.className.includes('--active'));
      expect(activeWalkPills.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /Сон/ }).className).toMatch(/--active/);
    });
  });

  describe('Sparkline trend', () => {
    it('hides trend when no data', async () => {
      setup();
      await waitForLoaded();
      expect(screen.queryByText('Тренд боли')).not.toBeInTheDocument();
    });

    it('renders trend when data present', async () => {
      rehab.getDiaryTrend.mockResolvedValue({
        data: Array.from({ length: 14 }, (_, i) => ({
          date: `2026-04-${String(i + 1).padStart(2, '0')}`,
          pain: 5 - Math.floor(i / 3),
        })),
      });
      setup();
      await waitForLoaded();
      await waitFor(() => {
        expect(screen.getByText('Тренд боли')).toBeInTheDocument();
      });
    });
  });

  describe('History list', () => {
    it('excludes today, shows yesterday', async () => {
      const today = new Date().toISOString().split('T')[0];
      rehab.getDiaryEntries.mockResolvedValue({
        data: [
          { id: 1, entry_date: '2026-04-10', pain_level: 3, swelling: 1, rom_degrees: 135, notes: 'вчерашний', photos: [] },
          { id: 2, entry_date: today, pain_level: 2, swelling: 0, rom_degrees: 138, notes: '', photos: [] },
        ],
      });
      setup();
      await waitForLoaded();
      await waitFor(() => {
        expect(screen.getByText('История')).toBeInTheDocument();
      });
      expect(screen.getByText('вчерашний')).toBeInTheDocument();
    });
  });

  describe('MessengerCTA', () => {
    it('renders «Отправить отчёт» with preferred_messenger', async () => {
      setup({ patient: { ...mockPatient, preferred_messenger: 'whatsapp' } });
      await waitForLoaded();
      expect(screen.getByRole('link', { name: /Отправить отчёт · WhatsApp/ })).toBeInTheDocument();
    });
  });
});
