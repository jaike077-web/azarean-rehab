import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoadmapScreen from './RoadmapScreen';
import { mockDashboardData, mockPhases } from '../../../test-utils/mockData';

// Mock API
jest.mock('../../../services/api', () => ({
  rehab: {
    getDashboard: jest.fn(),
    getPhases: jest.fn(),
    getDiaryEntries: jest.fn(),
    getDiaryEntry: jest.fn(),
    createDiaryEntry: jest.fn(),
    getMyExercises: jest.fn(),
    sendMessage: jest.fn(),
    getNotifications: jest.fn(),
    updateNotifications: jest.fn(),
  },
}));

// Mock toast
jest.mock('../../../context/ToastContext', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

const { rehab } = require('../../../services/api');

describe('RoadmapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getPhases.mockResolvedValue({ data: { phases: mockPhases } });
  });

  describe('loading state', () => {
    it('renders skeleton while loading phases', () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      // Check for skeleton elements before API resolves
      const skeletons = document.querySelectorAll('.pd-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('loaded state', () => {
    it('renders "Дорожная карта" title', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Дорожная карта')).toBeInTheDocument();
      });
    });

    it('renders phase stepper with phase names', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Защита и заживление')).toBeInTheDocument();
        expect(screen.getByText('Ранняя мобилизация')).toBeInTheDocument();
      });
    });

    it('renders phase week ranges in stepper', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Недели 0-2')).toBeInTheDocument();
        expect(screen.getByText('Недели 2-6')).toBeInTheDocument();
      });
    });

    it('renders all 8 tab buttons', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Цели')).toBeInTheDocument();
        expect(screen.getByText('Нельзя')).toBeInTheDocument();
        expect(screen.getByText('Можно')).toBeInTheDocument();
        expect(screen.getByText('Боль')).toBeInTheDocument();
        expect(screen.getByText('Быт')).toBeInTheDocument();
        expect(screen.getByText('Врач')).toBeInTheDocument();
        expect(screen.getByText('Переход')).toBeInTheDocument();
        expect(screen.getByText('FAQ')).toBeInTheDocument();
      });
    });

    it('shows goals content by default', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        // The current phase is 1, goals are ["Контроль отёка", "Защита трансплантата"]
        // "Защита трансплантата" may appear in both stepper teaser and goals BulletList
        expect(screen.getByText('Контроль отёка')).toBeInTheDocument();
        expect(screen.getAllByText('Защита трансплантата').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('switches to restrictions tab on click', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Нельзя')).toBeInTheDocument();
      });

      const restrictionsTab = screen.getByText('Нельзя');
      fireEvent.click(restrictionsTab);

      await waitFor(() => {
        // Check for restrictions content
        expect(screen.getByText('Бег')).toBeInTheDocument();
        expect(screen.getByText('Прыжки')).toBeInTheDocument();
      });
    });

    it('switches to allowed tab on click', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Можно')).toBeInTheDocument();
      });

      const allowedTab = screen.getByText('Можно');
      fireEvent.click(allowedTab);

      await waitFor(() => {
        expect(screen.getByText('Ходьба с костылями')).toBeInTheDocument();
      });
    });

    it('switches to pain tab on click', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Боль')).toBeInTheDocument();
      });

      const painTab = screen.getByText('Боль');
      fireEvent.click(painTab);

      await waitFor(() => {
        expect(screen.getByText('Лёд 3-4 раза в день')).toBeInTheDocument();
      });
    });

    it('switches to daily tab on click', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Быт')).toBeInTheDocument();
      });

      const dailyTab = screen.getByText('Быт');
      fireEvent.click(dailyTab);

      await waitFor(() => {
        expect(screen.getByText('Не стоять более 15 минут')).toBeInTheDocument();
      });
    });

    it('switches to red flags tab on click', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Врач')).toBeInTheDocument();
      });

      const redFlagsTab = screen.getByText('Врач');
      fireEvent.click(redFlagsTab);

      await waitFor(() => {
        expect(screen.getByText('Температура > 38°')).toBeInTheDocument();
      });
    });

    it('switches to criteria tab on click', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Переход')).toBeInTheDocument();
      });

      const criteriaTab = screen.getByText('Переход');
      fireEvent.click(criteriaTab);

      await waitFor(() => {
        expect(screen.getByText('Полное разгибание')).toBeInTheDocument();
        expect(screen.getByText('Сгибание 90°')).toBeInTheDocument();
      });
    });

    it('switches to FAQ tab on click', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('FAQ')).toBeInTheDocument();
      });

      const faqTab = screen.getByText('FAQ');
      fireEvent.click(faqTab);

      await waitFor(() => {
        expect(screen.getByText('Когда можно ходить?')).toBeInTheDocument();
      });
    });

    it('renders info note about timelines', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText(/Сроки фаз ориентировочные/)).toBeInTheDocument();
      });
    });

    it('renders progress arc', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        const progressArc = document.querySelector('.pd-progress-arc');
        expect(progressArc).toBeInTheDocument();
      });
    });
  });

  describe('FAQ accordion functionality', () => {
    it('expands FAQ item when clicked', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('FAQ')).toBeInTheDocument();
      });

      const faqTab = screen.getByText('FAQ');
      fireEvent.click(faqTab);

      await waitFor(() => {
        expect(screen.getByText('Когда можно ходить?')).toBeInTheDocument();
      });

      const question = screen.getByText('Когда можно ходить?');
      fireEvent.click(question);

      await waitFor(() => {
        expect(screen.getByText('По рекомендации врача')).toBeInTheDocument();
      });
    });
  });

  describe('criteria checklist functionality', () => {
    it('allows checking criteria items', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Переход')).toBeInTheDocument();
      });

      const criteriaTab = screen.getByText('Переход');
      fireEvent.click(criteriaTab);

      await waitFor(() => {
        expect(screen.getByText('Полное разгибание')).toBeInTheDocument();
      });

      const criteriaItem = screen.getByText('Полное разгибание');
      fireEvent.click(criteriaItem);

      await waitFor(() => {
        const checkbox = criteriaItem.previousSibling;
        expect(checkbox).toHaveClass('pd-criteria-check--checked');
      });
    });

    it('shows progress percentage for criteria', async () => {
      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        expect(screen.getByText('Переход')).toBeInTheDocument();
      });

      const criteriaTab = screen.getByText('Переход');
      fireEvent.click(criteriaTab);

      await waitFor(() => {
        // Default is 0%
        expect(screen.getByText('0%')).toBeInTheDocument();
      });
    });
  });

  describe('API error handling', () => {
    it('handles API error gracefully', async () => {
      rehab.getPhases.mockRejectedValue(new Error('API Error'));

      render(<RoadmapScreen dashboardData={mockDashboardData} />);

      await waitFor(() => {
        // Should still render title even on error
        expect(screen.getByText('Дорожная карта')).toBeInTheDocument();
      });
    });
  });
});
