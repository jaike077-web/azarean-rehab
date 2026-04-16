import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExercisesScreen from './ExercisesScreen';
import { rehab, patientAuth, progressPatient } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

jest.mock('../../../services/api', () => ({
  rehab: { getMyExercises: jest.fn() },
  patientAuth: { getMyComplexes: jest.fn(), getMyComplex: jest.fn() },
  progressPatient: { create: jest.fn(), getByExercise: jest.fn() },
}));

jest.mock('../../../context/ToastContext', () => ({
  useToast: jest.fn(() => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  })),
}));

const mockExercise = {
  id: 1,
  exercise_id: 100,
  order_number: 1,
  sets: 3,
  reps: 10,
  rest_seconds: 60,
  exercise: {
    id: 100,
    title: 'Приседания',
    description: 'Базовое упражнение',
    video_url: null,
    kinescope_id: null,
  },
};

describe('ExercisesScreen v2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useToast.mockReturnValue({ success: jest.fn(), error: jest.fn(), info: jest.fn() });
    progressPatient.getByExercise.mockResolvedValue({ data: [] });
  });

  describe('State A — активная программа + доп. комплексы', () => {
    it('показывает карточку "Ваш комплекс на сегодня"', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: { program_id: 1, complex_id: 10, complex_title: 'Сегодня', exercise_count: 3 },
      });
      patientAuth.getMyComplexes.mockResolvedValue({
        data: [
          { id: 10, diagnosis_name: 'ПКС', exercises_count: 3 },
          { id: 20, diagnosis_name: 'Плечо', exercises_count: 5 },
        ],
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('start-today-btn')).toBeInTheDocument();
      });
      expect(screen.getByText('Ваш комплекс на сегодня')).toBeInTheDocument();
    });

    it('показывает "Другие комплексы" только для не-сегодняшних', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: { program_id: 1, complex_id: 10, complex_title: 'Сегодня' },
      });
      patientAuth.getMyComplexes.mockResolvedValue({
        data: [
          { id: 10, diagnosis_name: 'ПКС', exercises_count: 3 },
          { id: 20, diagnosis_name: 'Плечо', exercises_count: 5, instructor_name: 'Иван' },
        ],
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByText('Другие комплексы')).toBeInTheDocument();
      });
      expect(screen.getByTestId('complex-card-20')).toBeInTheDocument();
      expect(screen.queryByTestId('complex-card-10')).not.toBeInTheDocument();
    });
  });

  describe('State B — нет программы, есть my-complexes', () => {
    it('показывает список "Мои комплексы"', async () => {
      rehab.getMyExercises.mockResolvedValue({ data: null });
      patientAuth.getMyComplexes.mockResolvedValue({
        data: [{ id: 30, diagnosis_name: 'Колено', exercises_count: 2 }],
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByText('Мои комплексы')).toBeInTheDocument();
      });
    });
  });

  describe('State C — пусто', () => {
    it('показывает empty state', async () => {
      rehab.getMyExercises.mockResolvedValue({ data: null });
      patientAuth.getMyComplexes.mockResolvedValue({ data: [] });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByText('Комплекс не назначен')).toBeInTheDocument();
      });
    });
  });

  describe('Навигация list → runner (без ComplexDetailView)', () => {
    it('click на "Начать тренировку" открывает ExerciseRunner напрямую', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: { program_id: 1, complex_id: 10, complex_title: 'Сегодня', exercise_count: 1 },
      });
      patientAuth.getMyComplexes.mockResolvedValue({ data: [] });
      patientAuth.getMyComplex.mockResolvedValue({
        data: {
          id: 10,
          title: 'Сегодня',
          diagnosis_name: 'ПКС',
          instructor_name: 'Вадим',
          exercises: [mockExercise],
        },
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('start-today-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('start-today-btn'));

      // Сразу Runner, без ComplexDetailView
      await waitFor(() => {
        expect(screen.getByTestId('done-btn')).toBeInTheDocument();
      });
      expect(screen.getByTestId('pain-slider')).toBeInTheDocument();
      expect(screen.getByTestId('difficulty-slider')).toBeInTheDocument();
    });

    it('кнопка "Выполнено" вызывает progressPatient.create', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: { program_id: 1, complex_id: 10, complex_title: 'Сегодня' },
      });
      patientAuth.getMyComplexes.mockResolvedValue({ data: [] });
      patientAuth.getMyComplex.mockResolvedValue({
        data: { id: 10, diagnosis_name: 'ПКС', instructor_name: 'Вадим', exercises: [mockExercise] },
      });
      progressPatient.create.mockResolvedValue({ data: { progress: { id: 1 } } });

      render(<ExercisesScreen />);
      await waitFor(() => screen.getByTestId('start-today-btn'));
      fireEvent.click(screen.getByTestId('start-today-btn'));
      await waitFor(() => screen.getByTestId('done-btn'));

      fireEvent.click(screen.getByTestId('done-btn'));

      await waitFor(() => {
        expect(progressPatient.create).toHaveBeenCalledWith(
          expect.objectContaining({
            complex_id: 10,
            exercise_id: 100,
            completed: true,
          })
        );
      });
    });
  });
});
