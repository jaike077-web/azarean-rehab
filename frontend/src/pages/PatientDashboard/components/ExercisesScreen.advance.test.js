// =====================================================
// TEST: ARC-CYCLE AC5 — advance тренировочного дня на границе завершения раннера.
// ExerciseRunner ЗАМОКАН стабом (он LOCKED; здесь проверяем ТОЛЬКО проводку
// ExercisesScreen.handleComplete → rehab.advanceTraining → рефетч). Стаб выставляет
// кнопку, дёргающую props.onComplete — эквивалент celebration→onComplete реального
// раннера, без зависимости от его внутренностей.
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Мок раннера ДО импорта ExercisesScreen. require('react') внутри — jest.mock hoisted.
jest.mock('./ExerciseRunner', () => {
  const R = require('react');
  return function MockRunner(props) {
    return R.createElement(
      'button',
      { 'data-testid': 'mock-complete', onClick: props.onComplete },
      'complete'
    );
  };
});

import ExercisesScreen from './ExercisesScreen';
import { rehab, patientAuth, progressPatient } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

jest.mock('../../../services/api', () => ({
  rehab: { getMyExercises: jest.fn(), advanceTraining: jest.fn() },
  patientAuth: { getMyComplexes: jest.fn(), getMyComplex: jest.fn() },
  progressPatient: { create: jest.fn(), getByExercise: jest.fn() },
}));

jest.mock('../../../context/ToastContext', () => ({
  useToast: jest.fn(() => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() })),
}));

// Ответ blocks-режима: гимнастика (компл 63) + тренировка (компл 64, блок 11).
const blocksResp = (currentDay = 1) => ({
  data: {
    mode: 'blocks',
    program_id: 7,
    gymnastics: {
      block_id: 10, target: { min: null, max: null, unit: null },
      complexes: [{ complex_id: 63, complex_title: 'Зарядка', exercise_count: 1 }],
    },
    training: {
      block_id: 11, target: { min: 2, max: 3, unit: 'week' },
      current_day_index: currentDay, num_days: 3, day_label: 'День А',
      complexes: [{ complex_id: 64, complex_title: 'Силовая', exercise_count: 1 }],
    },
    legacy: null,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  useToast.mockReturnValue({ success: jest.fn(), error: jest.fn(), info: jest.fn() });
  patientAuth.getMyComplexes.mockResolvedValue({ data: [] });
  // openComplex(id) → getMyComplex(id); нужны exercises чтобы перейти в runner-вид.
  patientAuth.getMyComplex.mockResolvedValue({
    data: { id: 64, exercises: [{ id: 1, exercise: { id: 100, title: 'X' } }] },
  });
  progressPatient.getByExercise.mockResolvedValue({ data: [] });
  rehab.advanceTraining.mockResolvedValue({ data: { advanced: true, current_day_index: 2 } });
});

describe('ARC-CYCLE AC5 — advance on training completion', () => {
  it('закрытие тренировочного комплекса → advanceTraining(block_id, session_id) + рефетч', async () => {
    rehab.getMyExercises.mockResolvedValue(blocksResp(1));
    render(<ExercisesScreen />);

    await waitFor(() => expect(screen.getByTestId('training-complex-64')).toBeInTheDocument());
    const callsBefore = rehab.getMyExercises.mock.calls.length;

    fireEvent.click(screen.getByTestId('training-complex-64')); // openComplex(64)
    await waitFor(() => expect(screen.getByTestId('mock-complete')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('mock-complete')); // onComplete → handleComplete

    await waitFor(() => expect(rehab.advanceTraining).toHaveBeenCalledTimes(1));
    expect(rehab.advanceTraining).toHaveBeenCalledWith(
      expect.objectContaining({ block_id: 11, session_id: expect.any(Number) })
    );
    // рефетч после завершения (loadAll)
    await waitFor(() =>
      expect(rehab.getMyExercises.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  it('закрытие гимнастического комплекса → advanceTraining НЕ вызывается', async () => {
    rehab.getMyExercises.mockResolvedValue(blocksResp(1));
    render(<ExercisesScreen />);

    await waitFor(() => expect(screen.getByTestId('gym-complex-63')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('gym-complex-63')); // openComplex(63)
    await waitFor(() => expect(screen.getByTestId('mock-complete')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('mock-complete'));

    // рефетч произошёл, но advance — нет (компл 63 не в текущем тренировочном дне)
    await waitFor(() => expect(rehab.getMyExercises.mock.calls.length).toBeGreaterThan(1));
    expect(rehab.advanceTraining).not.toHaveBeenCalled();
  });

  it('M1 multi-blocks: закрытие тренировочного комплекса зоны 2 → advance с block_id ЭТОЙ зоны', async () => {
    // Две зоны: зона 1 training block 11 (компл 64), зона 2 training block 21 (компл 84).
    // Закрываем компл 84 → advance должен уйти на block 21 (не 11).
    rehab.getMyExercises.mockResolvedValue({
      data: {
        mode: 'multi-blocks',
        programs: [
          { program_id: 7, program_label: 'Колено', program_joint: 'knee',
            gymnastics: null,
            training: { block_id: 11, target: { min: 2, max: 3, unit: 'week' },
              current_day_index: 1, num_days: 2, day_label: 'День А',
              complexes: [{ complex_id: 64, complex_title: 'Колено-силовая', exercise_count: 1 }] },
            legacy: null, block_complex_ids: [64] },
          { program_id: 9, program_label: 'Плечо', program_joint: 'shoulder',
            gymnastics: null,
            training: { block_id: 21, target: { min: 1, max: 2, unit: 'week' },
              current_day_index: 1, num_days: 2, day_label: 'День А',
              complexes: [{ complex_id: 84, complex_title: 'Плечо-силовая', exercise_count: 1 }] },
            legacy: null, block_complex_ids: [84] },
        ],
        block_complex_ids: [64, 84],
      },
    });
    patientAuth.getMyComplex.mockResolvedValue({
      data: { id: 84, exercises: [{ id: 1, exercise: { id: 200, title: 'Y' } }] },
    });
    render(<ExercisesScreen />);

    await waitFor(() => expect(screen.getByTestId('training-complex-84')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('training-complex-84')); // openComplex(84)
    await waitFor(() => expect(screen.getByTestId('mock-complete')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-complete'));

    await waitFor(() => expect(rehab.advanceTraining).toHaveBeenCalledTimes(1));
    expect(rehab.advanceTraining).toHaveBeenCalledWith(
      expect.objectContaining({ block_id: 21, session_id: expect.any(Number) })
    );
  });

  it('legacy (без блоков) → advanceTraining НЕ вызывается', async () => {
    rehab.getMyExercises.mockResolvedValue({
      data: {
        mode: 'legacy', gymnastics: null, training: null,
        legacy: { complex_id: 9 }, complex_id: 9, complex_title: 'C', exercise_count: 1,
      },
    });
    render(<ExercisesScreen />);

    await waitFor(() => expect(screen.getByTestId('start-today-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('start-today-btn')); // openComplex(9)
    await waitFor(() => expect(screen.getByTestId('mock-complete')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('mock-complete'));

    await waitFor(() => expect(rehab.getMyExercises.mock.calls.length).toBeGreaterThan(1));
    expect(rehab.advanceTraining).not.toHaveBeenCalled();
  });
});
