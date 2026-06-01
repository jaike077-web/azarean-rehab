// =====================================================
// TESTS: ExerciseRunner — CP3a.1 + CP3a.2 + CP3c.1 per-set гайд
//
// CP3a.1 — countdown ветка (auto_complete=true): countdown вниз →
//   cue('set_end') на 0 → авто-rest → следующий подход.
// CP3a.2 — open-hold ветка (auto_complete=false): открытый count-UP →
//   ручное «Завершить подход» → авто-rest → следующий подход. БЕЗ set_end.
// CP3c.1 — UX-редизайн поверх обоих:
//   * Гейт `ready`: countdown/sw НЕ стартует сам. Кнопка «Начать подход».
//   * 3-2-1 преролл: cue('count_tick') ×3 + cue('set_start') («go») перед work.
//   * Единая кнопка «Завершить подход» (testid finish-set-btn) — заменяет
//     «Раньше» (countdown) и «Готово» (open-hold).
//   * После rest → ready (НЕ авто-work). Пациент сам стартует каждый подход.
//
// Helper'ы:
//   - startCurrentSet(): «Начать подход» + 3 сек преролл → переход в work.
//   - countCueCalls(name): счётчик конкретного cue в mockCue (т.к. preroll
//     добавляет count_tick × 3 + set_start, prior toHaveBeenCalledTimes
//     на одиночный cue перестал работать).
//
// Mock-стратегия:
//   - useAudioCue замокан на module-level (mockCue jest.fn). prime — no-op.
//   - RestTimer замокан фейком, который дёргает onComplete по fake-timer.
//   - progressPatient.create через mockProgressCreate.
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
  useExerciseAudio: () => ({ startExerciseAudio: () => {}, stopExerciseAudio: () => {} }),
  useAudioSettings: () => ({
    cue: mockCue,
    prime: () => {},
    settings: { enabled: true, volume: 0.6 },
    setSettings: () => {},
  }),
  AudioProvider: ({ children }) => children,
  getCueConfig: () => null,
}));

// Mock RestTimer вынесен в отдельный файл — позволяет использовать JSX без
// нюанса парсинга factory-блока (нашли в первом прогоне CP3a.1 тестов).
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

// CP3c.1 helper: тап «Начать подход» + 3 сек преролл → work-фаза.
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

describe('CP3c.1 — ready-гейт + 3-2-1 преролл + set_start + единая кнопка', () => {
  it('Initial state — ready: countdown/sw НЕ показаны, есть «Начать подход»', () => {
    renderRunner();
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 1 из 3');
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
    expect(screen.getByTestId('start-set-btn')).toHaveTextContent(/Начать подход/i);
    // Отсчёт/секундомер ещё не активны
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('set-stopwatch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preroll-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finish-set-btn')).not.toBeInTheDocument();
  });

  it('Гейт countdown: 5 сек fake-time без тапа → отсчёт НЕ стартовал, cue не вызывался', () => {
    renderRunner();
    act(() => { jest.advanceTimersByTime(5000); });
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
    expect(mockCue).not.toHaveBeenCalled();
  });

  it('Тап «Начать подход» → 3-2-1 преролл (count_tick ×3 + set_start), затем countdown стартует', () => {
    renderRunner();
    fireEvent.click(screen.getByTestId('start-set-btn'));
    // Сразу после тапа: count_tick «3» уже прошёл, preroll-indicator показывает 3
    expect(countCueCalls('count_tick')).toBe(1);
    expect(screen.getByTestId('preroll-indicator')).toHaveTextContent('3');

    // t=1s: «2»
    act(() => { jest.advanceTimersByTime(1000); });
    expect(countCueCalls('count_tick')).toBe(2);
    expect(screen.getByTestId('preroll-indicator')).toHaveTextContent('2');

    // t=2s: «1»
    act(() => { jest.advanceTimersByTime(1000); });
    expect(countCueCalls('count_tick')).toBe(3);
    expect(screen.getByTestId('preroll-indicator')).toHaveTextContent('1');

    // t=3s: set_start + переход в work (countdown стартует)
    act(() => { jest.advanceTimersByTime(1000); });
    expect(countCueCalls('set_start')).toBe(1);
    expect(screen.queryByTestId('preroll-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:30');
    expect(screen.getByTestId('finish-set-btn')).toHaveTextContent(/Завершить подход/i);
  });

  it('Open-hold mode тоже за гейтом + auto-start sw после преролла', () => {
    renderRunner({ auto_complete: false });
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
    expect(screen.queryByTestId('set-stopwatch')).not.toBeInTheDocument();

    startCurrentSet();
    // После преролла: open-hold sw запущен (sw считает от 0)
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:00');
    expect(screen.getByTestId('finish-set-btn')).toHaveTextContent(/Завершить подход/i);
    // Тикаем 2 сек → sw считает вверх (auto-start prerolled)
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:02');
  });

  it('После rest → следующий подход возвращается в ready (НЕ авто-work)', () => {
    renderRunner({ sets: 2 });
    startCurrentSet();
    // Set 1 work: countdown 30 → 0 → авто-rest
    act(() => { jest.advanceTimersByTime(30000); });
    // Авто-rest 60s
    act(() => { jest.advanceTimersByTime(60000); });
    // Подход 2 — снова ready, НЕ авто work
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 2 из 2');
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
    expect(screen.getByTestId('start-set-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
  });
});

describe('CP3a.1 — countdown ветка (через ready-гейт)', () => {
  it('После старта: countdown 0:30 показан, кнопка «Завершить подход» видна', () => {
    renderRunner();
    startCurrentSet();
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:30');
    expect(screen.getByTestId('finish-set-btn')).toHaveTextContent(/Завершить подход/i);
  });

  it('3 sets timed: 3 countdown-цикла + 2 авто-rest\'а; cue(\'set_end\') ×3', () => {
    renderRunner();

    // Set 1
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(countCueCalls('set_end')).toBe(1);

    // Rest 1 → Set 2 ready
    act(() => { jest.advanceTimersByTime(60000); });
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 2 из 3');
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();

    // Set 2
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(countCueCalls('set_end')).toBe(2);

    // Rest 2 → Set 3 ready
    act(() => { jest.advanceTimersByTime(60000); });
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 3 из 3');

    // Set 3 (последний) — rest НЕ стартует
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(countCueCalls('set_end')).toBe(3);
    expect(screen.queryByTestId('rest-timer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();

    // Дополнительно: преролл-cue\'ы + WARN-бипы скопились.
    // На каждый 30с-подход: 3 преролл-tick + 2 WARN-tick (отсчёт достигает
    // 10 и 5) = 5. 3 подхода × 5 = 15. (WARN добавлен 2026-05-29.)
    expect(countCueCalls('count_tick')).toBe(15);
    expect(countCueCalls('set_start')).toBe(3);
  });

  it('Ручной «Завершить подход» на 2-й секунде countdown\'а → авто-rest без cue(\'set_end\')', () => {
    renderRunner();
    startCurrentSet();
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:30');

    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:28');
    fireEvent.click(screen.getByTestId('finish-set-btn'));

    // Звук set_end НЕ зовётся — только на countdown-0
    expect(countCueCalls('set_end')).toBe(0);
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    expect(screen.getByTestId('rest-timer')).toHaveAttribute('data-auto-start', 'true');
  });

  it('Anti-regression: POST /api/progress зовётся РОВНО 1 раз после полного гайда', async () => {
    renderRunner();

    // 3 подхода: ready → start → preroll → work → rest (× 2) → ready → start → work
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); }); // set 1 done
    act(() => { jest.advanceTimersByTime(60000); }); // rest 1 → ready 2
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); }); // set 2 done
    act(() => { jest.advanceTimersByTime(60000); }); // rest 2 → ready 3
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(30000); }); // set 3 done (last → done)

    expect(mockProgressCreate).toHaveBeenCalledTimes(0);

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

  it('Anti-regression rep-only: duration_seconds=null → гайд НЕ активен (ready-state нет, кнопок нет)', () => {
    renderRunner({ duration_seconds: null, reps: 10 });
    expect(screen.queryByTestId('phase-label')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ready-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('start-set-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finish-set-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auto-rest-block')).not.toBeInTheDocument();
  });
});

describe('CP3a.2 — open-hold ветка (через ready-гейт)', () => {
  it('Open-hold UI после старта: sw на 0:00, toggle, единая кнопка «Завершить подход»', () => {
    renderRunner({ auto_complete: false });
    startCurrentSet();
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 1 из 3');
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:00');
    expect(screen.getByTestId('set-stopwatch-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('finish-set-btn')).toHaveTextContent(/Завершить подход/i);
    // Countdown-ветка НЕ рендерится
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
  });

  it('2 sets open-hold flow: «Завершить подход» → авто-rest → 2-й подход через ready; cue(\'set_end\') НЕ вызывается', () => {
    renderRunner({ sets: 2, auto_complete: false });

    // Set 1: тикаем 5 сек после auto-start sw
    startCurrentSet();
    act(() => { jest.advanceTimersByTime(5000); });
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:05');

    // Завершить подход → авто-rest
    fireEvent.click(screen.getByTestId('finish-set-btn'));
    expect(countCueCalls('set_end')).toBe(0);
    expect(screen.queryByTestId('set-stopwatch')).not.toBeInTheDocument();
    expect(screen.getByTestId('rest-timer')).toHaveAttribute('data-auto-start', 'true');

    // Rest 1 → Set 2 ready
    act(() => { jest.advanceTimersByTime(60000); });
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 2 из 2');
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();

    // Set 2: старт → sw на 0:00 (сброшен)
    startCurrentSet();
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:00');

    // Завершить подход 2 → done, rest НЕ стартует
    fireEvent.click(screen.getByTestId('finish-set-btn'));
    expect(screen.queryByTestId('rest-timer')).not.toBeInTheDocument();
    expect(countCueCalls('set_end')).toBe(0);
  });

  it('Anti-regression open-hold: POST /api/progress зовётся РОВНО 1 раз', async () => {
    renderRunner({ sets: 2, auto_complete: false });

    startCurrentSet();
    fireEvent.click(screen.getByTestId('finish-set-btn')); // set 1 → rest
    act(() => { jest.advanceTimersByTime(60000); }); // rest 1 → ready 2
    startCurrentSet();
    fireEvent.click(screen.getByTestId('finish-set-btn')); // set 2 → done

    expect(mockProgressCreate).toHaveBeenCalledTimes(0);

    await act(async () => {
      fireEvent.click(screen.getByTestId('done-btn'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockProgressCreate).toHaveBeenCalledTimes(1);
  });

  it('Countdown-эффект НЕ запускается в open-hold mode (sanity для work-фазы)', () => {
    renderRunner({ auto_complete: false });
    startCurrentSet();
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    // 30 сек после старта — sw продолжает считать, но cue(set_end) НЕ зовётся
    act(() => { jest.advanceTimersByTime(30000); });
    expect(countCueCalls('set_end')).toBe(0);
    expect(screen.queryByTestId('rest-timer')).not.toBeInTheDocument();
    expect(screen.getByTestId('finish-set-btn')).toBeInTheDocument();
  });

  it('Сброс per-set state при переходе на следующее упражнение → ready-фаза', () => {
    const ce1 = {
      id: 100,
      sets: 2,
      duration_seconds: 20,
      rest_seconds: 30,
      auto_complete: true,
      exercise: { id: 1, title: 'A' },
    };
    const ce2 = {
      id: 101,
      sets: 3,
      duration_seconds: 15,
      rest_seconds: 45,
      auto_complete: true,
      exercise: { id: 2, title: 'B' },
    };
    render(
      <ExerciseRunner
        complexId={1}
        exercises={[ce1, ce2]}
        onBack={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    // A set 1: старт → 0:20 countdown → ручное «Завершить» → rest → ready 2
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 1 из 2');
    startCurrentSet();
    fireEvent.click(screen.getByTestId('finish-set-btn'));
    act(() => { jest.advanceTimersByTime(30000); }); // rest
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Подход 2 из 2');
    expect(screen.getByTestId('ready-state')).toBeInTheDocument();
  });
});
