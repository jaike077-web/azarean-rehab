import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DiaryScreen from './DiaryScreen';
import { mockDashboardData, mockDiaryEntries } from '../../../test-utils/mockData';

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

describe('DiaryScreen', () => {
  const mockOnDiarySaved = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    rehab.getDiaryEntries.mockResolvedValue({ data: mockDiaryEntries });
    rehab.getDiaryEntry.mockRejectedValue(new Error('Not found'));
  });

  describe('loading state', () => {
    it('renders skeleton while loading', () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      // Check for skeleton elements before API resolves
      const skeletons = document.querySelectorAll('.pd-skeleton--card');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('loaded state', () => {
    it('renders "Дневник" title', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Дневник')).toBeInTheDocument();
      });
    });

    it('renders subtitle "Как вы сегодня?"', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Как вы сегодня?')).toBeInTheDocument();
      });
    });

    it('renders PainSlider with default value', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        const rangeInput = screen.getByRole('slider');
        expect(rangeInput).toBeInTheDocument();
        expect(rangeInput).toHaveValue('3');
      });
    });

    it('renders pain emoji for default level', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        // Pain level 3 corresponds to 😐 emoji
        expect(screen.getByText('😐')).toBeInTheDocument();
      });
    });

    it('updates pain emoji when slider changes', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        const rangeInput = screen.getByRole('slider');
        fireEvent.change(rangeInput, { target: { value: '8' } });
        expect(screen.getByText('😖')).toBeInTheDocument();
      });
    });

    it('renders all pain time chips', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText(/Утро/)).toBeInTheDocument();
        expect(screen.getByText(/День/)).toBeInTheDocument();
        expect(screen.getByText(/Вечер/)).toBeInTheDocument();
        expect(screen.getByText(/При упражнениях/)).toBeInTheDocument();
        expect(screen.getByText(/При ходьбе/)).toBeInTheDocument();
      });
    });

    it('renders swelling options', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Нет')).toBeInTheDocument();
        expect(screen.getByText('Меньше')).toBeInTheDocument();
        expect(screen.getByText('Так же')).toBeInTheDocument();
        expect(screen.getByText('Больше')).toBeInTheDocument();
      });
    });

    it('renders exercise options', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('1 раз')).toBeInTheDocument();
        expect(screen.getByText('2 раза')).toBeInTheDocument();
        expect(screen.getByText('3+ раз')).toBeInTheDocument();
        expect(screen.getByText('Не делал(а)')).toBeInTheDocument();
      });
    });

    it('renders ROM section with extension options', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Объём движений')).toBeInTheDocument();
        expect(screen.getByText('Разгибание')).toBeInTheDocument();
        expect(screen.getByText('Полное')).toBeInTheDocument();
        expect(screen.getByText('Почти')).toBeInTheDocument();
        expect(screen.getByText('Ограничено')).toBeInTheDocument();
      });
    });

    it('renders ROM section with flexion options', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Сгибание')).toBeInTheDocument();
        expect(screen.getByText('До 60°')).toBeInTheDocument();
        expect(screen.getByText('До 90°')).toBeInTheDocument();
        expect(screen.getByText('До 120°')).toBeInTheDocument();
        expect(screen.getByText('Больше 120°')).toBeInTheDocument();
      });
    });

    it('renders improvements section', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Что стало лучше?')).toBeInTheDocument();
        // "Разгибание" appears in both ROM section and improvements, use getAllByText
        expect(screen.getAllByText(/Разгибание/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Ходьба/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Меньше боли/)).toBeInTheDocument();
        expect(screen.getByText(/Лучше сплю/)).toBeInTheDocument();
        expect(screen.getByText(/Настроение/)).toBeInTheDocument();
      });
    });

    it('renders notes textarea', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText('Заметки (необязательно)');
        expect(textarea).toBeInTheDocument();
      });
    });

    it('renders save button with correct text', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Сохранить отчёт')).toBeInTheDocument();
      });
    });
  });

  describe('form submission', () => {
    it('calls rehab.createDiaryEntry on save button click', async () => {
      rehab.createDiaryEntry.mockResolvedValue({ data: { success: true } });

      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Сохранить отчёт')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Сохранить отчёт');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(rehab.createDiaryEntry).toHaveBeenCalledTimes(1);
        expect(rehab.createDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            pain_level: 3,
            entry_date: expect.any(String),
          })
        );
      });
    });

    it('shows "Сохранение..." while saving', async () => {
      let resolveCreateEntry;
      const createEntryPromise = new Promise((resolve) => {
        resolveCreateEntry = resolve;
      });
      rehab.createDiaryEntry.mockReturnValue(createEntryPromise);

      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Сохранить отчёт')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Сохранить отчёт');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Сохранение...')).toBeInTheDocument();
      });

      // Resolve the promise to clean up
      resolveCreateEntry({ data: { success: true } });
    });

    it('calls onDiarySaved callback after successful save', async () => {
      rehab.createDiaryEntry.mockResolvedValue({ data: { success: true } });

      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Сохранить отчёт')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Сохранить отчёт');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnDiarySaved).toHaveBeenCalledTimes(1);
      });
    });

    it('shows success banner after save', async () => {
      rehab.createDiaryEntry.mockResolvedValue({ data: { success: true } });

      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('Сохранить отчёт')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Сохранить отчёт');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/Отлично! Запись сохранена/)).toBeInTheDocument();
      });
    });

    it('includes selected options in API call', async () => {
      rehab.createDiaryEntry.mockResolvedValue({ data: { success: true } });

      render(
        <DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />
      );

      // Wait for the save button to confirm form is rendered
      await waitFor(() => {
        expect(screen.getByText('Сохранить отчёт')).toBeInTheDocument();
      });

      // Use findByText for subsequent elements to handle any async re-renders
      const morningChip = await screen.findByText(/Утро/);
      fireEvent.click(morningChip);

      const swellingBtn = await screen.findByText('Нет');
      fireEvent.click(swellingBtn);

      const exerciseBtn = await screen.findByText('2 раза');
      fireEvent.click(exerciseBtn);

      const saveBtn = await screen.findByText('Сохранить отчёт');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(rehab.createDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            pain_level: 3,
            swelling: expect.any(Number),
            exercises_done: true,
          })
        );
      });
    });
  });

  describe('diary history', () => {
    it('renders history section when entries exist', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        expect(screen.getByText('История')).toBeInTheDocument();
      });
    });

    it('displays past diary entries', async () => {
      render(<DiaryScreen dashboardData={mockDashboardData} onDiarySaved={mockOnDiarySaved} />);

      await waitFor(() => {
        // Check for pain level display
        expect(screen.getByText('3/10')).toBeInTheDocument();
        expect(screen.getByText('5/10')).toBeInTheDocument();
      });
    });
  });
});
