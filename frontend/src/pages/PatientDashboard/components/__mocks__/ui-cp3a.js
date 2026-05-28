// =====================================================
// Mock UI components for CP3a.1 test
// (TZ_TIMER_AUDIO_TIMESETS_CP3a_RUNNER_COUNTDOWN, Шаг 6 — тесты)
//
// Вынесено из ExerciseRunner.cp3a.test.js потому что babel-parser
// под jest спотыкается на JSX внутри блок-формы () => { return {...} }
// фабрики jest.mock. Отдельный файл — самый чистый способ держать
// функциональный RestTimer-мок (с автоматическим вызовом onComplete
// под fake-timers) с полноценным JSX.
// =====================================================

import React from 'react';

export const PainScale = () => <div data-testid="pain-scale" />;
export const DifficultyScale = () => <div data-testid="difficulty-scale" />;
export const CelebrationOverlay = () => <div data-testid="celebration-overlay" />;

// Mock RestTimer:
//  - при autoStart=true стартует setTimeout(defaultSeconds*1000) → onComplete.
//  - при autoStart=false ничего не делает (имитирует ручной режим).
// Используется в CP3a.1 для детерминированного авто-перехода в следующий
// подход под fake-timers — без зависимости от Web Audio + интервала
// реального RestTimer'а.
export const RestTimer = ({ autoStart, defaultSeconds, onComplete }) => {
  React.useEffect(() => {
    if (!autoStart) return undefined;
    const id = setTimeout(() => {
      if (onComplete) onComplete();
    }, (defaultSeconds || 60) * 1000);
    return () => clearTimeout(id);
  }, [autoStart, defaultSeconds, onComplete]);
  return (
    <div
      data-testid="rest-timer"
      data-auto-start={String(!!autoStart)}
      data-default-seconds={defaultSeconds}
    />
  );
};
