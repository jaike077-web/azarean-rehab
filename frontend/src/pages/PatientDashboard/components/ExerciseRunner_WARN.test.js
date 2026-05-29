// =====================================================
// TESTS: ExerciseRunner — WARN pre-end count_tick (2026-05-29)
//
// TZ WARN: в work-фазе countdown mode (auto_complete=true) cue('count_tick')
//   когда отсчёт ДОСТИГАЕТ 10 и 5 секунд (next === 10 / next === 5). Один раз
//   на порог (монотонный отсчёт). set_end на 0 — без изменений. Count-up
//   (open-hold, auto_complete=false) НЕ даёт warning-бипов (нет известного
//   конца). Короткие фазы: ≤10с не дают 10-бип, ≤5с — ни одного.
//
// Изоляция от прероллных count_tick (3-2-1 = count_tick ×3 + set_start) —
// mockCue.mockClear() сразу после входа в work-фазу, далее считаем только
// WARN/set_end. Rest-фаза покрыта RestTimer.test.js (там реальный RestTimer).
//
// Mock-стратегия унаследована от CP3a/CP3d: useAudioCue замокан, ui/RestTimer
// заменены упрощёнными мок-компонентами из __mocks__/ui-cp3a.js.
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

const renderRunner = (ceOverrides = {}) =>
  render(
    <ExerciseRunner
      complexId={1}
      exercises={[{
        id: 100,
        sets: 1,
        duration_seconds: 30,
        rest_seconds: 60,
        auto_complete: true,
        exercise: baseExercise,
        ...ceOverrides,
      }]}
      onBack={jest.fn()}
      onComplete={jest.fn()}
    />,
  );

// «Начать подход» + 3 сек преролл → work-фаза. После — mockClear для изоляции.
const enterWork = () => {
  fireEvent.click(screen.getByTestId('start-set-btn'));
  act(() => { jest.advanceTimersByTime(3000); });
  mockCue.mockClear();
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

describe('WARN — countdown work-фаза', () => {
  it('countdown 30с: тик 10 + тик 5 + set_end (2 count_tick, 1 set_end)', () => {
    renderRunner({ duration_seconds: 30 });
    enterWork();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(countCueCalls('count_tick')).toBe(2);
    expect(countCueCalls('set_end')).toBe(1);
  });

  it('countdown 30с по секундам: тик 10 при достижении 10с, тик 5 при 5с, set_end на 0', () => {
    renderRunner({ duration_seconds: 30 });
    enterWork();
    // 30 → 11 (19 тиков): отсчёт ещё не достиг 10 → 0 warning'ов
    act(() => { jest.advanceTimersByTime(19000); });
    expect(countCueCalls('count_tick')).toBe(0);
    // достигает 10 → тик 10
    act(() => { jest.advanceTimersByTime(1000); });
    expect(countCueCalls('count_tick')).toBe(1);
    // достигает 5 → тик 5
    act(() => { jest.advanceTimersByTime(5000); });
    expect(countCueCalls('count_tick')).toBe(2);
    expect(countCueCalls('set_end')).toBe(0);
    // достигает 0 → set_end (count_tick больше не растёт)
    act(() => { jest.advanceTimersByTime(5000); });
    expect(countCueCalls('count_tick')).toBe(2);
    expect(countCueCalls('set_end')).toBe(1);
  });

  it('короткий countdown 8с: тик 10 НЕ звучит, тик 5 звучит, set_end на 0', () => {
    renderRunner({ duration_seconds: 8 });
    enterWork();
    act(() => { jest.advanceTimersByTime(8000); });
    expect(countCueCalls('count_tick')).toBe(1); // только тик 5
    expect(countCueCalls('set_end')).toBe(1);
  });

  it('очень короткий countdown 4с: 0 warning-бипов, только set_end', () => {
    renderRunner({ duration_seconds: 4 });
    enterWork();
    act(() => { jest.advanceTimersByTime(4000); });
    expect(countCueCalls('count_tick')).toBe(0);
    expect(countCueCalls('set_end')).toBe(1);
  });
});

describe('WARN — count-up (open-hold) молчит', () => {
  it('open-hold count-up: 0 warning-бипов и 0 set_end за 30с', () => {
    renderRunner({ auto_complete: false, duration_seconds: 60 });
    enterWork();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(countCueCalls('count_tick')).toBe(0);
    expect(countCueCalls('set_end')).toBe(0);
  });
});
