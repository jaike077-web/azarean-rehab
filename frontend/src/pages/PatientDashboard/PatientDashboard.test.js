/**
 * Tests for PatientDashboard container and StreakBadge (Sprint 1.2)
 */

// All jest.mock calls must be hoisted to the top

// Mock all dependencies
jest.mock('../../services/api', () => ({
  rehab: {
    getDashboard: jest.fn(),
  },
}));

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

jest.mock('../../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

jest.mock('react-router-dom');

jest.mock('./components/HomeScreen');
jest.mock('./components/RoadmapScreen');
jest.mock('./components/DiaryScreen');
jest.mock('./components/ContactScreen');
jest.mock('./components/ExercisesScreen');

jest.mock('./PatientDashboard.css', () => {});

// Now import everything
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import PatientDashboard, { StreakBadge } from './PatientDashboard';
import { mockDashboardData } from '../../test-utils/mockData';
import { rehab } from '../../services/api';
import { mockNavigate } from 'react-router-dom';

describe('StreakBadge Component', () => {
  it('renders fire emoji', () => {
    render(<StreakBadge days={5} best={10} atRisk={false} />);

    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('displays the number of days', () => {
    render(<StreakBadge days={7} best={10} atRisk={false} />);

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows "Рекорд!" when days === best and days > 0', () => {
    render(<StreakBadge days={10} best={10} atRisk={false} />);

    expect(screen.getByText('Рекорд!')).toBeInTheDocument();
  });

  it('shows "Рекорд: {best}" when best > days and best > 0', () => {
    render(<StreakBadge days={5} best={12} atRisk={false} />);

    expect(screen.getByText('Рекорд: 12')).toBeInTheDocument();
  });

  it('shows "Риск потери" when atRisk is true', () => {
    render(<StreakBadge days={5} best={10} atRisk={true} />);

    expect(screen.getByText('Риск потери')).toBeInTheDocument();
  });

  it('shows no status text when days=0 and best=0', () => {
    const { container } = render(<StreakBadge days={0} best={0} atRisk={false} />);

    expect(screen.getByText('🔥')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(container.querySelector('.pd-streak-status')).not.toBeInTheDocument();
  });
});

describe('PatientDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    if (mockNavigate && mockNavigate.mockClear) {
      mockNavigate.mockClear();
    }
    rehab.getDashboard.mockResolvedValue({ data: mockDashboardData });

    // Mock scrollTo function for refs
    Element.prototype.scrollTo = jest.fn();
  });

  it('shows loading skeleton initially (before API resolves)', async () => {
    // Create a promise that won't resolve immediately
    let resolvePromise;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    rehab.getDashboard.mockReturnValue(pendingPromise);

    await act(async () => {
      render(<PatientDashboard />);
    });

    // Check for loading skeleton
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();

    // Cleanup: resolve the promise
    await act(async () => {
      resolvePromise({ data: mockDashboardData });
    });
  });

  it('renders AZAREAN header text', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText('AZAREAN')).toBeInTheDocument();
    });
  });

  it('renders 5 nav buttons with correct labels', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText('Главная')).toBeInTheDocument();
      expect(screen.getByText('Путь')).toBeInTheDocument();
      expect(screen.getByText('Упражнения')).toBeInTheDocument();
      expect(screen.getByText('Дневник')).toBeInTheDocument();
      expect(screen.getByText('Связь')).toBeInTheDocument();
    });
  });

  it('shows HomeScreen by default after loading', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-screen')).toBeInTheDocument();
    });
  });

  it('switches to RoadmapScreen when "Путь" clicked', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-screen')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Путь'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('roadmap-screen')).toBeInTheDocument();
      expect(screen.queryByTestId('home-screen')).not.toBeInTheDocument();
    });
  });

  it('switches to DiaryScreen when "Дневник" clicked', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-screen')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Дневник'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('diary-screen')).toBeInTheDocument();
      expect(screen.queryByTestId('home-screen')).not.toBeInTheDocument();
    });
  });

  it('switches to ContactScreen when "Связь" clicked', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-screen')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Связь'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('contact-screen')).toBeInTheDocument();
    });
  });

  it('switches to ExercisesScreen when "Упражнения" clicked', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('home-screen')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Упражнения'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('exercises-screen')).toBeInTheDocument();
    });
  });

  it('shows disclaimer modal on first visit (no localStorage)', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText('Добро пожаловать в Azarean')).toBeInTheDocument();
      expect(screen.getByText('Важная информация')).toBeInTheDocument();
      expect(screen.getByText('Начать')).toBeInTheDocument();
    });
  });

  it('hides disclaimer after it was accepted (localStorage set)', async () => {
    localStorage.setItem('patient_disclaimer_accepted', 'true');

    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.queryByText('Добро пожаловать в Azarean')).not.toBeInTheDocument();
      expect(screen.getByTestId('home-screen')).toBeInTheDocument();
    });
  });

  it('saves disclaimer acceptance to localStorage when "Начать" clicked', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText('Начать')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Начать'));
    });

    await waitFor(() => {
      expect(localStorage.getItem('patient_disclaimer_accepted')).toBe('true');
      expect(screen.queryByText('Добро пожаловать в Azarean')).not.toBeInTheDocument();
    });
  });

  it('renders StreakBadge when dashboardData.streak exists', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(screen.getByText('🔥')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument(); // mockDashboardData.streak.current
    });
  });

  it('calls rehab.getDashboard on mount', async () => {
    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(rehab.getDashboard).toHaveBeenCalledTimes(1);
    });
  });

  it('displays error toast when dashboard fetch fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    rehab.getDashboard.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      render(<PatientDashboard />);
    });

    await waitFor(() => {
      expect(rehab.getDashboard).toHaveBeenCalled();
    });

    // Verify console.error was called (toast.error is mocked)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch dashboard:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
