import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomeScreen from './HomeScreen';
import { mockDashboardData, mockDashboardDataNoProgram } from '../../../test-utils/mockData';

jest.mock('../../../services/api', () => ({
  rehab: { getMyExercises: jest.fn() },
}));

const { rehab } = require('../../../services/api');

describe('HomeScreen', () => {
  const mockGoTo = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getMyExercises.mockResolvedValue({ data: null });
  });

  describe('loading state', () => {
    it('renders LoadingSkeleton when dashboardData is null', () => {
      render(<HomeScreen dashboardData={null} goTo={mockGoTo} />);
      const skeletons = document.querySelectorAll('.pd-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('renders "Программа не создана" when program is null', () => {
      render(<HomeScreen dashboardData={mockDashboardDataNoProgram} goTo={mockGoTo} />);
      expect(screen.getByText('Программа не создана')).toBeInTheDocument();
    });

    it('calls goTo(3) when "Связаться" button clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardDataNoProgram} goTo={mockGoTo} />);
      fireEvent.click(screen.getByText('Связаться'));
      expect(mockGoTo).toHaveBeenCalledWith(3);
    });
  });

  describe('normal state', () => {
    it('renders greeting with patient name', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      expect(screen.getByText('Тест Пациент')).toBeInTheDocument();
    });

    it('renders ProgressRing', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      // ProgressRing renders inside a .pd-progress-ring container
      const ring = document.querySelector('.pd-progress-ring');
      expect(ring).toBeInTheDocument();
    });

    it('renders TipCard', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      expect(screen.getByText('Совет дня')).toBeInTheDocument();
    });

    it('renders quick nav pills', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      expect(screen.getByText('Дневник')).toBeInTheDocument();
      expect(screen.getByText('Путь')).toBeInTheDocument();
      expect(screen.getByText('Связь')).toBeInTheDocument();
    });

    it('shows checkmark on Дневник pill when diaryFilledToday', () => {
      const data = { ...mockDashboardData, diaryFilledToday: true };
      render(<HomeScreen dashboardData={data} goTo={mockGoTo} />);
      expect(screen.getByText('✓')).toBeInTheDocument();
    });

    it('calls goTo(2) when Дневник pill clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      fireEvent.click(screen.getByText('Дневник'));
      expect(mockGoTo).toHaveBeenCalledWith(2);
    });

    it('calls goTo(1) when Путь pill clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      fireEvent.click(screen.getByText('Путь'));
      expect(mockGoTo).toHaveBeenCalledWith(1);
    });

    it('calls goTo(3) when Связь pill clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      fireEvent.click(screen.getByText('Связь'));
      expect(mockGoTo).toHaveBeenCalledWith(3);
    });

    it('renders emergency strip', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      expect(screen.getByText('Экстренная связь')).toBeInTheDocument();
    });

    it('calls goTo(3) when emergency strip clicked', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      fireEvent.click(screen.getByText('Экстренная связь'));
      expect(mockGoTo).toHaveBeenCalledWith(3);
    });

    it('renders phase info', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      expect(screen.getByText('Защита и заживление')).toBeInTheDocument();
    });

    it('renders videos section when phase has videos', () => {
      render(<HomeScreen dashboardData={mockDashboardData} goTo={mockGoTo} />);
      expect(screen.getByText('Видео для вас')).toBeInTheDocument();
    });
  });
});
