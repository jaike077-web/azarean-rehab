import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomeScreen from './HomeScreen';
import { mockDashboardData, mockDashboardDataNoProgram } from '../../../test-utils/mockData';

describe('HomeScreen', () => {
  const mockGoTo = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('renders LoadingSkeleton when dashboardData is null', () => {
      render(<HomeScreen dashboardData={null} goTo={mockGoTo} />);

      // Check for skeleton elements with pd-skeleton class
      const skeletons = document.querySelectorAll('.pd-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('renders "Программа не создана" when program is null', () => {
      render(<HomeScreen dashboardData={mockDashboardDataNoProgram} goTo={mockGoTo} />);

      expect(screen.getByText('Программа не создана')).toBeInTheDocument();
      expect(screen.getByText(/Ваш инструктор ещё не создал программу реабилитации/)).toBeInTheDocument();
    });

    it('calls goTo(3) when "Связаться" button clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardDataNoProgram} goTo={mockGoTo} />);

      const contactButton = screen.getByText('Связаться');
      fireEvent.click(contactButton);

      expect(mockGoTo).toHaveBeenCalledWith(3);
      expect(mockGoTo).toHaveBeenCalledTimes(1);
    });
  });

  describe('normal state', () => {
    it('renders greeting with patient name', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      expect(screen.getByText(/Добрый день,/)).toBeInTheDocument();
      expect(screen.getByText('Тест Пациент')).toBeInTheDocument();
    });

    it('renders ProgressArc', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      // Check for progress arc container
      const progressArc = document.querySelector('.pd-progress-arc');
      expect(progressArc).toBeInTheDocument();

      // Check for SVG element
      const svg = progressArc.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders TipCard with tip title', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      // "Совет дня" appears twice: as TipCard label and as the tip title from mockData
      const tipElements = screen.getAllByText('Совет дня');
      expect(tipElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders 3 quick action buttons', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      // Check for buttons using aria-label
      expect(screen.getByLabelText('Упражнения')).toBeInTheDocument();
      expect(screen.getByLabelText('Дневник')).toBeInTheDocument();
      expect(screen.getByLabelText('Дорожная карта')).toBeInTheDocument();
    });

    it('shows checkmark when diaryFilledToday is true', () => {
      const dataWithDiary = {
        ...mockDashboardData,
        diaryFilledToday: true,
      };

      render(<HomeScreen dashboardData={dataWithDiary} goTo={mockGoTo} />);

      // Check for checkmark badge
      const badge = document.querySelector('.pd-quick-action-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('✓');
    });

    it('does not show checkmark when diaryFilledToday is false', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      // Check that badge is not present
      const badge = document.querySelector('.pd-quick-action-badge');
      expect(badge).not.toBeInTheDocument();
    });

    it('calls goTo(4) when Упражнения quick action clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      const exercisesButton = screen.getByLabelText('Упражнения');
      fireEvent.click(exercisesButton);

      expect(mockGoTo).toHaveBeenCalledWith(4);
    });

    it('calls goTo(2) when Дневник quick action clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      const diaryButton = screen.getByLabelText('Дневник');
      fireEvent.click(diaryButton);

      expect(mockGoTo).toHaveBeenCalledWith(2);
    });

    it('calls goTo(1) when Дорожная карта quick action clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      const roadmapButton = screen.getByLabelText('Дорожная карта');
      fireEvent.click(roadmapButton);

      expect(mockGoTo).toHaveBeenCalledWith(1);
    });

    it('renders emergency button', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      expect(screen.getByText('Экстренная связь')).toBeInTheDocument();
    });

    it('calls goTo(3) when emergency button clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      const emergencyButton = screen.getByText('Экстренная связь');
      fireEvent.click(emergencyButton);

      expect(mockGoTo).toHaveBeenCalledWith(3);
    });

    it('renders StatusCard with phase information', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      expect(screen.getByText('Защита и заживление')).toBeInTheDocument();
      expect(screen.getByText('Фокус на защите трансплантата')).toBeInTheDocument();
    });

    it('renders videos section when phase has videos', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);

      expect(screen.getByText('Видео для вас')).toBeInTheDocument();
      expect(screen.getByText('Разминка')).toBeInTheDocument();
    });
  });
});
