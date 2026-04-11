// =====================================================
// TESTS: ExercisesScreen v2 (гибридная модель + подэкраны)
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExercisesScreen from './ExercisesScreen';

jest.mock('../../../services/api', () => ({
  rehab: {
    getMyExercises: jest.fn(),
  },
  patientAuth: {
    getMyComplexes: jest.fn(),
    getMyComplex: jest.fn(),
  },
  progressPatient: {
    create: jest.fn(),
    getByExercise: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

jest.mock('../../../context/ToastContext', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const { rehab, patientAuth, progressPatient } = require('../../../services/api');

const mockExercise = {
  id: 1,
  order_number: 1,
  sets: 3,
  reps: 10,
  duration_seconds: null,
  rest_seconds: 30,
  notes: null,
  exercise: {
    id: 100,
    title: 'Разгибание колена',
    description: 'Базовое упражнение',
    kinescope_id: 'xyz123',
    video_url: null,
    thumbnail_url: null,
    instructions: null,
    contraindications: null,
  },
};

describe('ExercisesScreen v2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // ExerciseRunner вызывает getByExercise при mount — нужен мок после clearAllMocks
    progressPatient.getByExercise.mockResolvedValue({ data: [] });
  });

  describe('State A — активная программа + доп. комплексы', () => {
    it('показывает карточку "Ваш комплекс на сегодня"', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: {
          program_id: 1,
          complex_id: 10,
          complex_title: 'Утренний комплекс',
          exercise_count: 5,
          exercises: [mockExercise],
        },
      });
      patientAuth.getMyComplexes.mockResolvedValue({
        data: [{ id: 10, diagnosis_name: 'ПКС', exercises_count: 5, instructor_name: 'Вадим' }],
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByText('Ваш комплекс на сегодня')).toBeInTheDocument();
      });
      expect(screen.getByTestId('start-today-btn')).toBeInTheDocument();
    });

    it('показывает "Другие комплексы" только для не-сегодняшних', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: { program_id: 1, complex_id: 10, complex_title: 'Сегодня', exercise_count: 3 },
      });
      patientAuth.getMyComplexes.mockResolvedValue({
        data: [
          { id: 10, diagnosis_name: 'Сегодня', exercises_count: 3 }, // исключается
          { id: 20, diagnosis_name: 'Плечо', exercises_count: 7, instructor_name: 'Вадим' },
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
      rehab.getMyExercises.mockRejectedValue({ response: { status: 404 } });
      patientAuth.getMyComplexes.mockResolvedValue({
        data: [
          { id: 1, diagnosis_name: 'Плечо', exercises_count: 5, instructor_name: 'Вадим' },
          { id: 2, diagnosis_name: 'Колено', exercises_count: 3, instructor_name: 'Вадим' },
        ],
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByText('Мои комплексы')).toBeInTheDocument();
      });
      expect(screen.queryByText('Ваш комплекс на сегодня')).not.toBeInTheDocument();
      expect(screen.getByTestId('complex-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('complex-card-2')).toBeInTheDocument();
    });
  });

  describe('State C — пусто', () => {
    it('показывает empty state', async () => {
      rehab.getMyExercises.mockRejectedValue({ response: { status: 404 } });
      patientAuth.getMyComplexes.mockResolvedValue({
        data: [],
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByText('Комплекс не назначен')).toBeInTheDocument();
      });
      expect(screen.getByText(/Инструктор ещё не назначил/)).toBeInTheDocument();
    });
  });

  describe('Навигация list → complex → runner', () => {
    it('click на "Начать тренировку" открывает ComplexDetailView', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: { program_id: 1, complex_id: 10, complex_title: 'Сегодня', exercise_count: 1 },
      });
      patientAuth.getMyComplexes.mockResolvedValue({ data: [] });
      patientAuth.getMyComplex.mockResolvedValue({
        data: {
          id: 10,
          title: 'Сегодня',
          diagnosis_name: 'ПКС',
          diagnosis_note: null,
          recommendations: null,
          warnings: null,
          instructor_name: 'Вадим',
          exercises: [mockExercise],
        },
      });

      render(<ExercisesScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('start-today-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('start-today-btn'));

      await waitFor(() => {
        expect(patientAuth.getMyComplex).toHaveBeenCalledWith(10);
      });
      await waitFor(() => {
        expect(screen.getByText('Упражнения (1)')).toBeInTheDocument();
      });
    });

    it('click на упражнение открывает ExerciseRunner', async () => {
      rehab.getMyExercises.mockResolvedValue({
        data: { program_id: 1, complex_id: 10, complex_title: 'Сегодня' },
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
      await waitFor(() => screen.getByTestId('start-today-btn'));
      fireEvent.click(screen.getByTestId('start-today-btn'));

      await waitFor(() => screen.getByTestId(`exercise-card-100`));
      fireEvent.click(screen.getByTestId(`exercise-card-100`));

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
      await waitFor(() => screen.getByTestId('exercise-card-100'));
      fireEvent.click(screen.getByTestId('exercise-card-100'));
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
