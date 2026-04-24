// =====================================================
// TESTS: HomeScreen v12 (hero + PGIC + phase + tip)
// =====================================================

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomeScreen from './HomeScreen';
import { mockDashboardData, mockDashboardDataNoProgram } from '../../../test-utils/mockData';

// Мок usePatientAvatarBlob — в тестах не нужны blob-fetch'и
jest.mock('../hooks/usePatientAvatarBlob', () => ({
  __esModule: true,
  default: () => null,
}));

// api: HomeScreen делает фоновый rehab.createDiaryEntry на pickFeel (PGIC
// auto-persist). Возвращаемый Promise должен иметь .catch — иначе тест
// ломается в pickFeel на undefined.catch().
jest.mock('../../../services/api', () => ({
  rehab: {
    createDiaryEntry: jest.fn(),
  },
  patientAuth: {},
}));

const { rehab: apiRehab } = require('../../../services/api');

beforeEach(() => {
  apiRehab.createDiaryEntry.mockResolvedValue({ data: null });
});

const mockPatient = {
  id: 14,
  full_name: 'Вадим',
  email: 'avi707@mail.ru',
  avatar_url: null,
};

const setup = (overrides = {}) => {
  const props = {
    dashboardData: mockDashboardData,
    goTo: jest.fn(),
    onOpenProfile: jest.fn(),
    patient: mockPatient,
    pgicFeel: null,
    setPgicFeel: jest.fn(),
    ...overrides,
  };
  const utils = render(<HomeScreen {...props} />);
  return { ...utils, props };
};

describe('HomeScreen v12', () => {
  describe('loading state', () => {
    it('renders LoadingSkeleton when dashboardData is null', () => {
      render(<HomeScreen dashboardData={null} goTo={jest.fn()} patient={mockPatient} />);
      const skeletons = document.querySelectorAll('.pd-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('renders "Программа не создана" when program is null', () => {
      setup({ dashboardData: mockDashboardDataNoProgram });
      expect(screen.getByText('Программа не создана')).toBeInTheDocument();
    });

    it('calls goTo(3) — Связь — when "Связаться" button clicked', () => {
      const { props } = setup({ dashboardData: mockDashboardDataNoProgram });
      fireEvent.click(screen.getByText('Связаться'));
      expect(props.goTo).toHaveBeenCalledWith(3);
    });
  });

  describe('greeting row', () => {
    it('renders greeting by time of day + first name', () => {
      setup();
      // mockDashboardData.program.patient_name = "Тест Пациент" → first word
      expect(screen.getByText('Тест')).toBeInTheDocument();
      // Любой из 3 вариантов приветствия
      const hr = new Date().getHours();
      const expected = hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    // Inline Профиль-кнопка в greeting row удалена 2026-04-24 — единый
    // AvatarBtn теперь только в pd-header (PatientDashboard.js), дубль
    // на каждом экране убран. Тест perplexity-on-screen-avatar устарел.
  });

  describe('Hero card — allDone=false branch', () => {
    it('shows «Сегодня» badge + «Начать» button', () => {
      setup({ dashboardData: { ...mockDashboardData, exercisesDoneToday: false } });
      expect(screen.getByText('Сегодня')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Начать/ })).toBeInTheDocument();
    });

    it('clicking «Начать» → goTo(4) (Упражнения)', () => {
      const { props } = setup({ dashboardData: { ...mockDashboardData, exercisesDoneToday: false } });
      fireEvent.click(screen.getByRole('button', { name: /Начать/ }));
      expect(props.goTo).toHaveBeenCalledWith(4);
    });
  });

  describe('Hero card — allDone=true branch', () => {
    it('shows «Готово» badge + «Заполнить дневник» button (exercisesDoneToday)', () => {
      setup({ dashboardData: { ...mockDashboardData, exercisesDoneToday: true } });
      expect(screen.getByText('Готово')).toBeInTheDocument();
      expect(screen.getByText('Комплекс завершён')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Заполнить дневник/ })).toBeInTheDocument();
    });

    it('clicking «Заполнить дневник» → goTo(2) (Дневник)', () => {
      const { props } = setup({ dashboardData: { ...mockDashboardData, exercisesDoneToday: true } });
      fireEvent.click(screen.getByRole('button', { name: /Заполнить дневник/ }));
      expect(props.goTo).toHaveBeenCalledWith(2);
    });

    it('diaryFilledToday alone does NOT flip hero to «Готово»', () => {
      // Семантика: hero-CTA смотрит на упражнения, а не на дневник.
      setup({ dashboardData: { ...mockDashboardData, diaryFilledToday: true, exercisesDoneToday: false } });
      expect(screen.getByRole('button', { name: /Начать/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Заполнить дневник/ })).not.toBeInTheDocument();
    });
  });

  // Specialist chip «Татьяна · куратор» удалён 2026-04-24 — хардкод
  // вводил пациентов в заблуждение (реального куратора в данных нет).
  // Вернуть тест, когда /api/rehab/my/dashboard начнёт отдавать
  // имя реального инструктора.

  describe('Week goal row', () => {
    it('tap on «Цель недели» → goTo(1) (Roadmap)', () => {
      const { props } = setup();
      fireEvent.click(screen.getByText(/Цель недели/).closest('button'));
      expect(props.goTo).toHaveBeenCalledWith(1);
    });
  });

  describe('PGIC card', () => {
    it('renders 3 PGIC options in radiogroup', () => {
      setup();
      const group = screen.getByRole('radiogroup', { name: /Как вы сейчас/ });
      const radios = within(group).getAllByRole('radio');
      expect(radios).toHaveLength(3);
      expect(screen.getByText('Лучше')).toBeInTheDocument();
      expect(screen.getByText('Так же')).toBeInTheDocument();
      expect(screen.getByText('Хуже')).toBeInTheDocument();
    });

    it('tap on «Лучше» calls setPgicFeel("better") and shows saved marker', () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole('radio', { name: /Лучше/ }));
      expect(props.setPgicFeel).toHaveBeenCalledWith('better');
      expect(screen.getByText('Записано')).toBeInTheDocument();
    });

    it('shows «Подробнее» → goTo(2) when pgicFeel set and not just saved', () => {
      const { props } = setup({ pgicFeel: 'same' });
      fireEvent.click(screen.getByRole('button', { name: /Подробнее/ }));
      expect(props.goTo).toHaveBeenCalledWith(2);
    });

    it('active radio reflects pgicFeel prop', () => {
      setup({ pgicFeel: 'worse' });
      const group = screen.getByRole('radiogroup');
      const radios = within(group).getAllByRole('radio');
      // Order: better, same, worse
      expect(radios[0]).toHaveAttribute('aria-checked', 'false');
      expect(radios[1]).toHaveAttribute('aria-checked', 'false');
      expect(radios[2]).toHaveAttribute('aria-checked', 'true');
    });
  });

  describe('Next visit card — graceful hide', () => {
    it('hides when nextVisit is undefined', () => {
      setup();
      expect(screen.queryByText('Следующий визит')).not.toBeInTheDocument();
    });

    it('renders when nextVisit provided', () => {
      setup({
        dashboardData: {
          ...mockDashboardData,
          nextVisit: { when: 'Вт, 22 апреля · 14:00', where: 'Белинского 108, ст. 26' },
        },
      });
      expect(screen.getByText('Следующий визит')).toBeInTheDocument();
      expect(screen.getByText('Вт, 22 апреля · 14:00')).toBeInTheDocument();
      expect(screen.getByText('Белинского 108, ст. 26')).toBeInTheDocument();
    });

    it('tap on next visit card → goTo(3) (Связь)', () => {
      const { props } = setup({
        dashboardData: {
          ...mockDashboardData,
          nextVisit: { when: 'Вт, 22 апреля · 14:00' },
        },
      });
      fireEvent.click(screen.getByText('Следующий визит').closest('[role="button"]'));
      expect(props.goTo).toHaveBeenCalledWith(3);
    });
  });

  describe('Phase progress', () => {
    it('renders phase name + week count', () => {
      setup();
      // Имя фазы встречается и в hero sub-заголовке, и в progress-блоке
      expect(screen.getAllByText('Защита и заживление').length).toBeGreaterThan(0);
      expect(screen.getByText(/Неделя \d+ из 6/)).toBeInTheDocument();
    });

    it('renders 3 stats (Боль, Отёк, Дней)', () => {
      setup();
      expect(screen.getByText('Боль')).toBeInTheDocument();
      expect(screen.getByText('Отёк')).toBeInTheDocument();
      expect(screen.getByText('Дней')).toBeInTheDocument();
    });

    it('tap on stat opens tooltip', () => {
      setup();
      fireEvent.click(screen.getByText('Боль').closest('button'));
      expect(screen.getByText('Средний уровень боли за неделю')).toBeInTheDocument();
    });
  });

  describe('Daily tip', () => {
    it('renders tip text when tip present', () => {
      setup();
      // mockDashboardData.tip.title = "Совет дня"
      expect(screen.getByText('Совет дня')).toBeInTheDocument();
    });

    it('hides tip row when tip is null', () => {
      setup({ dashboardData: { ...mockDashboardData, tip: null } });
      expect(screen.queryByText('Совет дня')).not.toBeInTheDocument();
    });
  });
});
