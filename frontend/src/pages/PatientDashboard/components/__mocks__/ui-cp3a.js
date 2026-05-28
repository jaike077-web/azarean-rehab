// =====================================================
// Mock UI components for CP3a/CP3c ExerciseRunner tests
// (TZ_TIMER_AUDIO_TIMESETS_CP3a + TZ_TIMER_RUNNER_UX_REDESIGN)
//
// Вынесено из тестов потому что babel-parser под jest спотыкается
// на JSX внутри блок-формы () => { return {...} } фабрики jest.mock.
// Отдельный файл — самый чистый способ держать функциональные моки
// с полноценным JSX.
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

// Mock PhaseRing (CP3c.2): простой div c data-phase + label + valueTestId.
// SVG-рендеринг реального PhaseRing избыточен для CP3a/c тестов, которые
// проверяют ТОЛЬКО логику флоу (testid'ы phase-ring/value, data-phase
// атрибут, текст label). Real PhaseRing покрыт PhaseRing.test.js отдельно.
export const PhaseRing = ({ phase, label, valueTestId }) => (
  <div data-testid="phase-ring" data-phase={phase}>
    <span data-testid={valueTestId}>{label}</span>
  </div>
);

// phaseColor — реальный helper тестируется напрямую в PhaseRing.test.js.
// В CP3a/c integration-тестах helper не используется (флоу-проверки идут
// через testid/text), re-export тут не нужен.
