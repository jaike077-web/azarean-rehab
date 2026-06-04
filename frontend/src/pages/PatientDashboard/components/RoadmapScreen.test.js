import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoadmapScreen from './RoadmapScreen';
import { mockDashboardData, mockPhases } from '../../../test-utils/mockData';

// Mock API
jest.mock('../../../services/api', () => ({
  rehab: {
    getPhases: jest.fn(),
    getStuckStatus: jest.fn(),
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
    // Default: не застрял (большинство тестов).
    rehab.getStuckStatus.mockResolvedValue({ data: { is_stuck: false } });
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

    // Inline Профиль-кнопка удалена 2026-04-24 (дубль с pd-header сверху).
    // AvatarBtn теперь только в PatientDashboard.js → тесты per-screen аватара
    // удалены, относительное поведение проверяется в PatientDashboard.test.js.
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

  describe('future phases (collapsed by default, full content on expand)', () => {
    it('future phases show "План этой фазы" button', async () => {
      renderScreen();
      await waitFor(() => {
        const moreButtons = screen.getAllByText('План этой фазы');
        // current_phase = 1 → 5 будущих фаз
        expect(moreButtons.length).toBe(5);
      });
    });

    it('tapping shows full phase card with 4 tabs + description', async () => {
      renderScreen();
      await waitFor(() => screen.getAllByText('План этой фазы'));
      const moreButtons = screen.getAllByText('План этой фазы');
      fireEvent.click(moreButtons[0]); // фаза 2
      await waitFor(() => {
        expect(screen.getByTestId('pd-rm-future-card-2')).toBeInTheDocument();
      });
      // описание фазы 2
      expect(screen.getAllByText(/Восстановление ROM/).length).toBeGreaterThan(0);
      // во future-card тоже 4 pill-таба (+ 4 в current = 8 всего)
      expect(screen.getAllByText('Цели').length).toBe(2);
      expect(screen.getAllByText('Нельзя').length).toBe(2);
    });

    it('future-card has its own tab state (independent from current)', async () => {
      renderScreen();
      await waitFor(() => screen.getAllByText('План этой фазы'));
      fireEvent.click(screen.getAllByText('План этой фазы')[0]);
      await waitFor(() => screen.getByTestId('pd-rm-future-card-2'));
      const futureCard = screen.getByTestId('pd-rm-future-card-2');
      // В future-card кликаем «Нельзя» — не должен переключиться таб current
      const futureRestrictionsPill = Array.from(
        futureCard.querySelectorAll('.pd-rm-pill')
      ).find((b) => b.textContent === 'Нельзя');
      fireEvent.click(futureRestrictionsPill);
      // В future-card теперь видим «Бег» (restrictions фазы 2)
      await waitFor(() => {
        expect(futureCard.textContent).toMatch(/Бег/);
      });
      // Current-card — activeTab всё ещё goals (видим «Контроль отёка»)
      const currentCard = screen.getByTestId('pd-rm-current-card');
      expect(currentCard.textContent).toMatch(/Контроль отёка/);
    });

    it('future-card shows exit-criteria list too', async () => {
      renderScreen();
      await waitFor(() => screen.getAllByText('План этой фазы'));
      fireEvent.click(screen.getAllByText('План этой фазы')[0]);
      await waitFor(() => screen.getByTestId('pd-rm-future-card-2'));
      // Критерии перехода есть и у future (в шапке list)
      expect(screen.getAllByText('Критерии перехода').length).toBe(2);
      expect(screen.getByText('Полный ROM')).toBeInTheDocument();
    });

    it('tapping "Скрыть план" collapses back', async () => {
      renderScreen();
      await waitFor(() => screen.getAllByText('План этой фазы'));
      fireEvent.click(screen.getAllByText('План этой фазы')[0]);
      await waitFor(() => screen.getByText('Скрыть план'));
      fireEvent.click(screen.getByText('Скрыть план'));
      await waitFor(() => {
        expect(screen.queryByText('Скрыть план')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('pd-rm-future-card-2')).not.toBeInTheDocument();
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
      expect(screen.getByText('Фазы восстановления недоступны')).toBeInTheDocument();
    });
  });

  // Wave 0 commit 06 — stuck banner.
  describe('Stuck banner', () => {
    it('не показывает баннер если is_stuck=false (default)', async () => {
      renderScreen();
      await waitFor(() => screen.getByText('Путь восстановления'));
      expect(screen.queryByText(/Ты на этой фазе/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Связаться с куратором/i })).not.toBeInTheDocument();
    });

    it('показывает баннер с числом недель если is_stuck=true', async () => {
      rehab.getStuckStatus.mockResolvedValue({
        data: {
          is_stuck: true,
          current_phase: 3,
          phase_title: 'Восстановление мобильности',
          actual_weeks: 8.4,
          expected_weeks: 4,
          phase_started_at: '2026-03-12',
        },
      });
      renderScreen();
      await waitFor(() => {
        expect(screen.getByText(/Ты на этой фазе уже 8 недель/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /Связаться с куратором/i })).toBeInTheDocument();
    });

    it('CTA вызывает goTo(3) с pre-filled сообщением', async () => {
      rehab.getStuckStatus.mockResolvedValue({
        data: {
          is_stuck: true,
          current_phase: 3,
          phase_title: 'Восстановление мобильности',
          actual_weeks: 8,
          expected_weeks: 4,
          phase_started_at: '2026-03-12',
        },
      });
      const goToMock = jest.fn();
      renderScreen({ goTo: goToMock });

      const cta = await screen.findByRole('button', { name: /Связаться с куратором/i });
      fireEvent.click(cta);

      expect(goToMock).toHaveBeenCalledTimes(1);
      const [tabId, params] = goToMock.mock.calls[0];
      expect(tabId).toBe(3);
      expect(params.prefilledMessage).toContain('фазе 3');
      expect(params.prefilledMessage).toContain('Восстановление мобильности');
      expect(params.prefilledMessage).toContain('8 недель');
    });

    it('graceful: при ошибке getStuckStatus экран не падает, баннер не рендерится', async () => {
      rehab.getStuckStatus.mockRejectedValue(new Error('Network down'));
      renderScreen();
      await waitFor(() => screen.getByText('Путь восстановления'));
      expect(screen.queryByText(/Ты на этой фазе/i)).not.toBeInTheDocument();
    });
  });

  // Wave 1 #1.04 — динамический program_type вместо хардкода 'acl'.
  describe('Multi-protocol (program_type)', () => {
    it('запрашивает фазы по program_type из dashboardData (acl)', async () => {
      renderScreen();
      await waitFor(() => {
        expect(rehab.getPhases).toHaveBeenCalledWith('acl');
      });
    });

    it('запрашивает фазы по shoulder_general если такой program_type у пациента', async () => {
      renderScreen({
        dashboardData: {
          ...mockDashboardData,
          program: { ...mockDashboardData.program, program_type: 'shoulder_general' },
        },
      });
      await waitFor(() => {
        expect(rehab.getPhases).toHaveBeenCalledWith('shoulder_general');
      });
    });

    it('показывает empty state и не запрашивает фазы если program=null', async () => {
      renderScreen({
        dashboardData: { ...mockDashboardData, program: null },
      });
      await waitFor(() => {
        expect(screen.getByText(/нет активной программы/i)).toBeInTheDocument();
      });
      expect(rehab.getPhases).not.toHaveBeenCalled();
    });

    it('показывает empty state если program_type отсутствует у программы', async () => {
      renderScreen({
        dashboardData: {
          ...mockDashboardData,
          program: { ...mockDashboardData.program, program_type: null },
        },
      });
      await waitFor(() => {
        expect(screen.getByText(/нет активной программы/i)).toBeInTheDocument();
      });
      expect(rehab.getPhases).not.toHaveBeenCalled();
    });
  });

  // D3 — prehab phase 0 как стартовая/текущая фаза.
  describe('D3 — prehab phase 0 как текущая', () => {
    const phase0 = {
      id: 0, phase_number: 0, name: 'Подготовка к операции', icon: 'shield',
      color: '#0D9488', color_bg: '#ECFEFF', teaser: 'Предоперационная подготовка',
      duration_weeks: 2, week_start: 0, week_end: 2,
      description: 'Подготовка к операции, укрепление перед вмешательством',
      goals: ['Укрепление квадрицепса'], restrictions: [], allowed: ['Лёгкие упражнения'],
      pain: [], daily: [], red_flags: [], criteria_next: ['Дата операции назначена'], faq: [],
    };

    it('current_phase=0 (prehab) → фаза 0 текущая, не коэрсится в 1 (D3)', async () => {
      rehab.getPhases.mockResolvedValue({ data: [phase0, ...mockPhases] });
      renderScreen({
        dashboardData: { ...mockDashboardData, program: { ...mockDashboardData.program, current_phase: 0 } },
      });
      await waitFor(() => expect(screen.getByTestId('pd-rm-current-card')).toBeInTheDocument());
      // current card = фаза 0 (описание prehab), а не фаза 1
      expect(screen.getByTestId('pd-rm-current-card').textContent).toMatch(/укрепление перед вмешательством/);
      // ровно один pulse-dot (текущая фаза одна)
      expect(document.querySelectorAll('[data-testid="pd-rm-pulse"]')).toHaveLength(1);
      // фаза 0 — самая ранняя → нет прошедших (при коэрсинге в 1 фаза 0 стала бы past)
      expect(document.querySelectorAll('.pd-rm-circle--past')).toHaveLength(0);
      // фазы 1..6 будущие → 6 кнопок «План этой фазы» (при коэрсинге было бы 5)
      expect(screen.getAllByText('План этой фазы')).toHaveLength(6);
    });
  });
});
