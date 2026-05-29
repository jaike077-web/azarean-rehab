// =====================================================
// TESTS: ExerciseRunner — CP3d skip-rest (узкий unlock rest-фазы)
//
// TZ: в rest-фазе кнопка «Пропустить отдых» (data-testid=skip-rest-btn)
//   onClick → ТА ЖЕ транзишн что авто-конец отдыха (handleRestComplete) →
//   phase=ready(k+1). Ручной skip НЕ играет cue('rest_end') (звук только
//   на досчёте таймера до 0). POST не дёргается. exercise-level POST×1 цел.
//   Rep-only (duration_seconds==null) — гайд+rest НЕ активны, кнопки нет.
//
// Mock-стратегия унаследована от CP3a: useAudioCue замокан, RestTimer/PhaseRing
// заменены на упрощённые мок-компоненты из __mocks__/ui-cp3a.js. Mock RestTimer
// НЕ зовёт cue сам — реальный rest_end в боевом коде живёт ВНУТРИ RestTimer
// setInterval (RestTimer.js:48), который при unmount через смену setPhase
// очищается clearInterval'ом. Тест ловит регрессию если кто-то добавит
// cue('rest_end') в handleRestComplete / onClick skip на ExerciseRunner-уровне.
// =====================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseRunner from './ExerciseRunner';

const mockCue = jest.fn();
const mockProgressCreate = jest.fn(() => Promise.resolve({ data: { id: 1 } }));

jest.mock('../context/AudioContext', () => ({
  __esModule: true,
  useAudioCue: () => ({ cue: mockCue, prime: () => {} }),
  useAudioSettings: () => ({
    cue: mockCue,
    prime: () => {},
    settings: { enabled: true, volume: 0.6 },
    setSettings: () => {},
  }),
  AudioProvider: ({ children }) => children,
  getCueConfig: () => null,
}));

jest.mock('./ui', () => require('./__mocks__/ui-cp3a'));

jest.mock('../../../services/api', () => ({
  progressPatient: {
    create: (...args) => mockProgressCreate(...args),
    getByExercise: () => Promise.resolve({ data: [] }),
  },
}));

jest.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const baseExercise = {
  id: 42,
  title: 'Изометрия квадрицепса',
  video_url: 'https://kinescope.io/embed/xyz',
};

const renderRunner = (ceOverrides = {}, exerciseOverrides = {}) => {
  const ce = {
    id: 100,
    sets: 3,
    duration_seconds: 30,
    rest_seconds: 60,
    auto_complete: true,
    exercise: { ...baseExercise, ...exerciseOverrides },
    ...ceOverrides,
  };
  return render(
    <ExerciseRunner
      complexId={1}
      exercises={[ce]}
      onBack={jest.fn()}
      onComplete={jest.fn()}
    />,
  );
};

const startCurrentSet = () => {
  fireEvent.click(screen.getByTestId('start-set-btn'));
  act(() => { jest.advanceTimersByTime(3000); });
};

const countCueCalls = (name) =>
  mockCue.mock.calls.filter(([n]) => n === name).length;

beforeEach(() => {
  jest.useFakeTimers();
  mockCue.mockReset();
  mockProgressCreate.mockReset();
  mockProgressCreate.mockImplementation(() => Promise.resolve({ data: { id: 1 } }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CP3d — skip-rest', () => {
  it('rest смонтирован после set 1 → tap skip частично (40% rest) → phase=ready подхода k+1, rest-таймер очищен', () => {
    renderRunner({ sets: 3, rest_seconds: 60 });

    // Set 1 → done → авто-rest
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(screen.getByTestId('rest-timer')).toBeInTheDocument();
    expect(screen.getByTestId('skip-rest-btn')).toHaveTextContent(/Пропустить отдых/i);

    // Тикаем 25 сек из 60 (≈42% rest) — таймер ещё не досчитал
    act(() => { jest.advanceTimersByTime(25000); });
    expect(screen.getByTestId('rest-timer')).toBeInTheDocument();
    expect(screen.queryByTestId('ready-state')).not.toBeInTheDocument();

    // Tap skip → переходит в ready подхода k+1
    fireEvent.click(screen.getByTestId('skip-rest-btn'));
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 2 из 3');
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
    expect(screen.getByTestId('start-set-btn')).toHaveTextContent(/Начать подход/i);

    // Rest-таймер очищен — больше не в DOM
    expect(screen.queryByTestId('rest-timer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skip-rest-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auto-rest-block')).not.toBeInTheDocument();
  });

  it('rest_end НЕ вызван на ручной skip (звук только на досчёте до 0)', () => {
    renderRunner({ sets: 2, rest_seconds: 60 });

    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); }); // set 1 done → rest mounted
    expect(countCueCalls('rest_end')).toBe(0);

    // Skip частично — звук НЕ должен сыграть
    act(() => { jest.advanceTimersByTime(10000); });
    fireEvent.click(screen.getByTestId('skip-rest-btn'));
    expect(countCueCalls('rest_end')).toBe(0);

    // И после перехода в ready — тоже 0 (анти-регрессия на handleRestComplete)
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
    expect(countCueCalls('rest_end')).toBe(0);
  });

  it('POST не вызван в rest-фазе после skip; exercise-level POST×1 цел до завершения', async () => {
    renderRunner({ sets: 2, rest_seconds: 60 });

    // Set 1 → rest
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(mockProgressCreate).toHaveBeenCalledTimes(0);

    // Skip rest — POST всё ещё не вызван
    fireEvent.click(screen.getByTestId('skip-rest-btn'));
    expect(mockProgressCreate).toHaveBeenCalledTimes(0);

    // Set 2 → done (последний → ready/done без rest)
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(mockProgressCreate).toHaveBeenCalledTimes(0);

    // Финальный POST через done-btn → ровно 1
    await act(async () => {
      fireEvent.click(screen.getByTestId('done-btn'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockProgressCreate).toHaveBeenCalledTimes(1);
    expect(mockProgressCreate).toHaveBeenCalledWith(
      expect.objectContaining({ complex_id: 1, exercise_id: 42, completed: true }),
    );
  });

  it('Rep-only (duration_seconds=null) 1:1 не задет: skip-rest-btn НЕ рендерится', () => {
    renderRunner({ duration_seconds: null, reps: 10, rest_seconds: 60 });
    // Гайд + auto-rest вообще не активны → кнопки skip-rest нет
    expect(screen.queryByTestId('auto-rest-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skip-rest-btn')).not.toBeInTheDocument();
  });

  it('skip-rest для open-hold mode (auto_complete=false) тоже работает — переход в ready подхода k+1', () => {
    renderRunner({ sets: 2, auto_complete: false, rest_seconds: 60 });

    startCurrentSet();
    // Завершить open-hold подход → rest
    fireEvent.click(screen.getByTestId('finish-set-btn'));
    expect(screen.getByTestId('rest-timer')).toBeInTheDocument();
    expect(screen.getByTestId('skip-rest-btn')).toBeInTheDocument();

    // Tap skip → ready подхода 2 (без cue('rest_end'), без POST)
    fireEvent.click(screen.getByTestId('skip-rest-btn'));
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 2 из 2');
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
    expect(countCueCalls('rest_end')).toBe(0);
    expect(mockProgressCreate).toHaveBeenCalledTimes(0);
  });
});
