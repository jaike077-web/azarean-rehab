// =====================================================
// TESTS: ExerciseRunner — CP3a.1 + CP3a.2 per-set гайд (timed unlock)
//
// Узкий unlock LOCKED-раннера. Две ветки work-фазы:
//  - auto_complete=true  (CP3a.1, countdown): countdown вниз → cue('set_end')
//    на 0 → авто-rest → следующий подход.
//  - auto_complete=false (CP3a.2, open-hold): открытый count-UP секундомер
//    → ручное «Готово» → авто-rest → следующий подход. БЕЗ cue('set_end').
//
// Покрытие:
//  - CP3a.1: 3 sets timed (3 countdown'а + 2 авто-rest'а, cue('set_end') ×3).
//  - CP3a.1: ручной «Раньше» (без cue('set_end')).
//  - CP3a.2: open-hold UI (sw, toggle, set-done-btn видны; set-countdown НЕТ).
//  - CP3a.2: 2 sets open-hold (стоп+готово → авто-rest → 2-й подход;
//    cue('set_end') НЕ зовётся; sw сбрасывается на каждый новый подход).
//  - Anti-regression POST×1: один submit на упражнение (одинаков для обеих веток).
//  - Anti-regression rep-only: duration_seconds=null → гайд НЕ активен.
//
// Mock-стратегия:
//  - useAudioCue замокан на module-level через mockCue jest.fn (Rule #37: spy).
//  - RestTimer замокан фейком, который дёргает onComplete по fake-timer (для
//    детерминированного авто-перехода в следующий подход без реального
//    Web Audio + interval RestTimer'а).
//  - progressPatient.create через mockProgressCreate — для toHaveBeenCalledTimes(1).
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

beforeEach(() => {
  jest.useFakeTimers();
  mockCue.mockReset();
  mockProgressCreate.mockReset();
  mockProgressCreate.mockImplementation(() => Promise.resolve({ data: { id: 1 } }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CP3a.1 — per-set countdown + auto-rest (auto_complete=true)', () => {
  it('гайд активен: индикатор подхода + countdown показаны', () => {
    renderRunner();
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 1 из 3');
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:30');
    expect(screen.getByTestId('finish-set-early-btn')).toBeInTheDocument();
  });

  it('3 sets, duration=30, rest=60: 3 work countdown\'а + 2 авто-rest\'а; cue(\'set_end\') ×3', () => {
    renderRunner();

    // ===== Set 1 work: countdown 30 → 0 =====
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 1 из 3');
    act(() => { jest.advanceTimersByTime(30000); });
    expect(mockCue).toHaveBeenCalledWith('set_end');
    expect(mockCue).toHaveBeenCalledTimes(1);

    // ===== Set 1 → rest: RestTimer autoStart=true =====
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    const rest1 = screen.getByTestId('rest-timer');
    expect(rest1).toHaveAttribute('data-auto-start', 'true');
    expect(rest1).toHaveAttribute('data-default-seconds', '60');

    // ===== Rest 1 → Set 2 work =====
    act(() => { jest.advanceTimersByTime(60000); });
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 2 из 3');
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:30');

    // ===== Set 2 work: countdown 30 → 0 =====
    act(() => { jest.advanceTimersByTime(30000); });
    expect(mockCue).toHaveBeenCalledTimes(2);

    // ===== Rest 2 → Set 3 work =====
    act(() => { jest.advanceTimersByTime(60000); });
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 3 из 3');

    // ===== Set 3 work: countdown 30 → 0 — последний подход, rest НЕ стартует =====
    act(() => { jest.advanceTimersByTime(30000); });
    expect(mockCue).toHaveBeenCalledTimes(3);
    expect(screen.queryByTestId('rest-timer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
  });

  it('Ручной «Раньше» на 2-й секунде → completeSet без ожидания 0; cue(\'set_end\') НЕ зовётся', () => {
    renderRunner();
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:30');

    // Тикнем 2 секунды и нажмём «Раньше»
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:28');

    fireEvent.click(screen.getByTestId('finish-set-early-btn'));

    // cue('set_end') НЕ должен быть вызван — звук только на countdown-0
    expect(mockCue).not.toHaveBeenCalled();

    // Перешли в rest, RestTimer виден с autoStart
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    expect(screen.getByTestId('rest-timer')).toHaveAttribute('data-auto-start', 'true');
  });

  it('Anti-regression: POST /api/progress зовётся РОВНО 1 раз после полного гайда + клика «Выполнено»', async () => {
    renderRunner();

    // Прогон всех 3 подходов с rest'ами
    act(() => { jest.advanceTimersByTime(30000); }); // set 1
    act(() => { jest.advanceTimersByTime(60000); }); // rest 1
    act(() => { jest.advanceTimersByTime(30000); }); // set 2
    act(() => { jest.advanceTimersByTime(60000); }); // rest 2
    act(() => { jest.advanceTimersByTime(30000); }); // set 3 — done phase

    // Per-set цикл сам по себе POST /api/progress НЕ вызывает
    expect(mockProgressCreate).toHaveBeenCalledTimes(0);

    // Клик «Выполнено» — единственный submit упражнения
    await act(async () => {
      fireEvent.click(screen.getByTestId('done-btn'));
      // Дать промису из submit() разрешиться
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockProgressCreate).toHaveBeenCalledTimes(1);
    expect(mockProgressCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        complex_id: 1,
        exercise_id: 42,
        completed: true,
      }),
    );
  });

  it('Anti-regression rep-only: duration_seconds=null → гайд НЕ активен, set-countdown отсутствует', () => {
    renderRunner({ duration_seconds: null, reps: 10 });
    expect(screen.queryByTestId('set-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finish-set-early-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auto-rest-block')).not.toBeInTheDocument();
  });

  it('CP3a.2: auto_complete=false — open-hold mode активен (sw + toggle + Готово), countdown скрыт', () => {
    renderRunner({ auto_complete: false });
    // Гайд активен — индикатор подхода виден (single guide для обеих веток)
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 1 из 3');
    // Open-hold UI: open count-UP секундомер на 0:00, toggle, кнопка «Готово»
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:00');
    expect(screen.getByTestId('set-stopwatch-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('set-done-btn')).toBeInTheDocument();
    // Countdown-ветка НЕ рендерится
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finish-set-early-btn')).not.toBeInTheDocument();
  });

  it('CP3a.2: 2 sets open-hold, ручное «Готово» → авто-rest → 2-й подход; cue(\'set_end\') НЕ зовётся', () => {
    renderRunner({ sets: 2, auto_complete: false });

    // Set 1: запускаем секундомер, тикаем 5 сек
    fireEvent.click(screen.getByTestId('set-stopwatch-toggle'));
    act(() => { jest.advanceTimersByTime(5000); });
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:05');

    // Жмём «Готово» → переход в rest
    fireEvent.click(screen.getByTestId('set-done-btn'));
    expect(mockCue).not.toHaveBeenCalled();
    expect(screen.queryByTestId('set-stopwatch')).not.toBeInTheDocument();

    // RestTimer auto-started, дефолт rest_seconds=60
    const rest1 = screen.getByTestId('rest-timer');
    expect(rest1).toHaveAttribute('data-auto-start', 'true');
    expect(rest1).toHaveAttribute('data-default-seconds', '60');

    // Rest 1 → Set 2: sw сброшен на 0:00, новая кнопка «Готово»
    act(() => { jest.advanceTimersByTime(60000); });
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 2 из 2');
    expect(screen.getByTestId('set-stopwatch')).toHaveTextContent('0:00');

    // Set 2: «Готово» → последний подход, rest НЕ стартует
    fireEvent.click(screen.getByTestId('set-done-btn'));
    expect(screen.queryByTestId('rest-timer')).not.toBeInTheDocument();
    expect(mockCue).not.toHaveBeenCalled();
  });

  it('CP3a.2 Anti-regression: open-hold mode → POST /api/progress зовётся РОВНО 1 раз после «Выполнено»', async () => {
    renderRunner({ sets: 2, auto_complete: false });

    // Прогон 2 подходов open-hold
    fireEvent.click(screen.getByTestId('set-done-btn')); // set 1 → rest
    act(() => { jest.advanceTimersByTime(60000); }); // rest 1
    fireEvent.click(screen.getByTestId('set-done-btn')); // set 2 → done

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

  it('CP3a.2: countdown-эффект НЕ запускается в open-hold mode (setRemaining не уменьшается)', () => {
    renderRunner({ auto_complete: false });
    // setRemaining инициализирован значением duration_seconds (30), но в
    // open-hold mode не отображается и не тикается. Просто убедимся что
    // никакого set-countdown в DOM и через 30 сек не появляется ни cue,
    // ни авто-переход в rest.
    expect(screen.queryByTestId('set-countdown')).not.toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(30000); });
    expect(mockCue).not.toHaveBeenCalled();
    expect(screen.queryByTestId('rest-timer')).not.toBeInTheDocument();
    // Работа подхода продолжается — «Готово» по-прежнему доступно
    expect(screen.getByTestId('set-done-btn')).toBeInTheDocument();
  });

  it('Сброс per-set state при переходе на следующее упражнение (currentSetIndex=0, work-фаза)', () => {
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

    // Set 1 of A: countdown 0:20 → клик «Раньше», rest, потом следующий подход
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 1 из 2');
    fireEvent.click(screen.getByTestId('finish-set-early-btn'));
    act(() => { jest.advanceTimersByTime(30000); }); // rest
    expect(screen.getByTestId('set-indicator')).toHaveTextContent('Подход 2 из 2');
  });
});
