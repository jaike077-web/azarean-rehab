import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoadmapScreen from './RoadmapScreen';
import { mockDashboardData, mockPhases } from '../../../test-utils/mockData';

// Mock API
jest.mock('../../../services/api', () => ({
  rehab: {
    getPhases: jest.fn(),
  },
}));

// Mock avatar-blob hook (fetch не ходит в jsdom)
jest.mock('../hooks/usePatientAvatarBlob', () => ({
  __esModule: true,
  default: () => null,
}));

const { rehab } = require('../../../services/api');

const mockPatient = { full_name: 'Тест Пациент', avatar_url: null };

function renderScreen(overrides = {}) {
  const props = {
    dashboardData: mockDashboardData,
    patient: mockPatient,
    onOpenProfile: jest.fn(),
    ...overrides,
  };
  return { ...render(<RoadmapScreen {...props} />), props };
}

describe('RoadmapScreen v12', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getPhases.mockResolvedValue({ data: mockPhases });
  });

  describe('loading state', () => {
    it('renders skeleton while loading phases', () => {
      rehab.getPhases.mockReturnValue(new Promise(() => {})); // never resolves
      renderScreen();
      const skeletons = document.querySelectorAll('.pd-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('header', () => {
    it('renders "Путь восстановления" title', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Путь восстановления')).toBeInTheDocument();
      });
    });

    it('renders subtitle with diagnosis and current week', async () => {
      renderScreen();
      await waitFor(() => {
        const subtitle = document.querySelector('.pd-rm-subtitle-top');
        expect(subtitle).toBeInTheDocument();
        expect(subtitle.textContent).toMatch(/Защита и заживление/);
        expect(subtitle.textContent).toMatch(/\d+-я неделя/);
      });
    });

    it('avatar initial taken from patient.full_name', async () => {
      renderScreen();
      await waitFor(() => {
        const avatar = screen.getByRole('button', { name: 'Профиль' });
        expect(avatar).toBeInTheDocument();
        expect(avatar.textContent).toBe('Т');
      });
    });

    it('clicking avatar opens profile overlay', async () => {
      const onOpenProfile = jest.fn();
      renderScreen({ onOpenProfile });
      await waitFor(() => screen.getByRole('button', { name: 'Профиль' }));
      fireEvent.click(screen.getByRole('button', { name: 'Профиль' }));
      expect(onOpenProfile).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeline rendering', () => {
    it('renders all 6 phases from API', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Защита и заживление')).toBeInTheDocument();
      });
      expect(screen.getByText('Ранняя мобилизация')).toBeInTheDocument();
      expect(screen.getByText('Укрепление')).toBeInTheDocument();
      expect(screen.getByText('Функциональная')).toBeInTheDocument();
      expect(screen.getByText('Продвинутая')).toBeInTheDocument();
      expect(screen.getByText('Поддержание')).toBeInTheDocument();
    });

    it('marks current phase with pulse-dot animation', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Защита и заживление')).toBeInTheDocument();
      });
      const pulseDots = document.querySelectorAll('[data-testid="pd-rm-pulse"]');
      // current_phase = 1 → один pulse-dot
      expect(pulseDots).toHaveLength(1);
    });

    it('shows "Сейчас" badge on current phase', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Сейчас')).toBeInTheDocument();
      });
    });

    it('past phases show checkmark instead of icon', async () => {
      // Пациент на фазе 3 → фазы 1 и 2 past (с checkmark)
      const dashboardDataOnPhase3 = {
        ...mockDashboardData,
        program: { ...mockDashboardData.program, current_phase: 3 },
      };
      renderScreen({ dashboardData: dashboardDataOnPhase3 });
      await waitFor(() => {
        expect(screen.getByText('Укрепление')).toBeInTheDocument();
      });
      const pastCircles = document.querySelectorAll('.pd-rm-circle--past');
      expect(pastCircles).toHaveLength(2);
    });

    it('displays week range subtitle per phase', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText(/Нед\. 1–12/)).toBeInTheDocument();
      });
      expect(screen.getByText(/Нед\. 13–20/)).toBeInTheDocument();
      // Последняя фаза без wEnd → "Нед. 60+"
      expect(screen.getByText(/Нед\. 60\+/)).toBeInTheDocument();
    });
  });

  describe('current phase expanded card', () => {
    it('renders expanded card with description by default', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('pd-rm-current-card')).toBeInTheDocument();
      });
      // Дескрипшен фазы 1
      expect(screen.getByText(/Восстановление после операции/)).toBeInTheDocument();
    });

    it('renders all 4 tab pills (Цели/Нельзя/Можно/Боль)', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Цели')).toBeInTheDocument();
      });
      expect(screen.getByText('Нельзя')).toBeInTheDocument();
      expect(screen.getByText('Можно')).toBeInTheDocument();
      expect(screen.getByText('Боль')).toBeInTheDocument();
    });

    it('shows goals content by default', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Контроль отёка')).toBeInTheDocument();
      });
      // "Защита трансплантата" может быть и в goals и в teaser — обе OK
      expect(screen.getAllByText('Защита трансплантата').length).toBeGreaterThanOrEqual(1);
    });

    it('switches to restrictions tab on click', async () => {
      renderScreen();
      await waitFor(() => screen.getByText('Нельзя'));
      fireEvent.click(screen.getByText('Нельзя'));
      await waitFor(() => {
        expect(screen.getByText('Бег')).toBeInTheDocument();
      });
      expect(screen.getByText('Прыжки')).toBeInTheDocument();
    });

    it('switches to allowed tab on click', async () => {
      renderScreen();
      await waitFor(() => screen.getByText('Можно'));
      fireEvent.click(screen.getByText('Можно'));
      await waitFor(() => {
        expect(screen.getByText('Ходьба с костылями')).toBeInTheDocument();
      });
    });

    it('switches to pain tab and shows warn-style note', async () => {
      renderScreen();
      await waitFor(() => screen.getByText('Боль'));
      fireEvent.click(screen.getByText('Боль'));
      await waitFor(() => {
        const painNote = document.querySelector('.pd-rm-pain-note');
        expect(painNote).toBeInTheDocument();
        expect(painNote.textContent).toMatch(/Лёд/);
      });
    });
  });

  describe('exit-criteria list (Вариант A)', () => {
    it('renders exit criteria as simple list for current phase', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByTestId('pd-rm-criteria')).toBeInTheDocument();
      });
      expect(screen.getByText('Критерии перехода')).toBeInTheDocument();
      expect(screen.getByText('Полное разгибание')).toBeInTheDocument();
      expect(screen.getByText('Сгибание 90°')).toBeInTheDocument();
    });

    it('does NOT render met/cur progress indicators (Вариант A)', async () => {
      renderScreen();
      await waitFor(() => screen.getByTestId('pd-rm-criteria'));
      // В Варианте A нет счётчика "N из M" и нет чекбоксов
      const criteriaHead = document.querySelector('.pd-rm-criteria-head');
      expect(criteriaHead.textContent).not.toMatch(/\d+ из \d+/);
    });
  });

  describe('future phases (collapsed)', () => {
    it('future phases show "Подробнее" button', async () => {
      renderScreen();
      await waitFor(() => {
        const moreButtons = screen.getAllByText('Подробнее');
        // current_phase = 1 → 5 будущих фаз
        expect(moreButtons.length).toBe(5);
      });
    });

    it('tapping "Подробнее" expands future phase teaser', async () => {
      renderScreen();
      await waitFor(() => screen.getAllByText('Подробнее'));
      const moreButtons = screen.getAllByText('Подробнее');
      fireEvent.click(moreButtons[0]); // фаза 2
      await waitFor(() => {
        // После тапа появляется teaser
        expect(screen.getAllByText(/Восстановление подвижности/).length).toBeGreaterThan(0);
      });
    });

    it('tapping "Скрыть" collapses back', async () => {
      renderScreen();
      await waitFor(() => screen.getAllByText('Подробнее'));
      const moreButtons = screen.getAllByText('Подробнее');
      fireEvent.click(moreButtons[0]);
      await waitFor(() => screen.getByText('Скрыть'));
      fireEvent.click(screen.getByText('Скрыть'));
      await waitFor(() => {
        expect(screen.queryByText('Скрыть')).not.toBeInTheDocument();
      });
    });
  });

  describe('info note', () => {
    it('renders info about approximate timelines', async () => {
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText(/Сроки ориентировочные/)).toBeInTheDocument();
      });
    });
  });

  describe('API error handling', () => {
    it('renders without crash when API fails', async () => {
      rehab.getPhases.mockRejectedValue(new Error('API Error'));
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText('Путь восстановления')).toBeInTheDocument();
      });
      expect(screen.getByText('Фазы реабилитации недоступны')).toBeInTheDocument();
    });
  });
});
