// =====================================================
// PhaseRing — крупное кольцо-таймер для per-set гайда (CP3c.2)
//
// Унифицированный SVG progress-ring + крупная цифра в центре.
// Фаз-цвета через data-phase атрибут (CSS-управляемо в PhaseRing.css) +
// named pure helper phaseColor() для тестов (Rule #37, JSDOM не
// ассертит inline-style/CSS-variables — нужен programmatic путь).
//
// Используется в ExerciseRunner work-фазы (CP3c.2). RestTimer остаётся
// независимым компонентом (свой ring, свой цвет — уже teal).
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import './PhaseRing.css';

// Named pure export — Rule #37: тестируется как чистая функция.
// Возвращает CSS-токен (var) который CSS использует через data-phase.
// JS-возврат — для тестов и опционального inline-fallback.
export function phaseColor(phase) {
  switch (phase) {
    case 'preroll':
    case 'work':
      return 'var(--pd-accent-warm)'; // coral #F97316 — «активный подход»
    case 'rest':
      return 'var(--pd-primary)'; // teal #0D9488 — «восстановление»
    case 'ready':
    case 'done':
    default:
      return 'var(--pd-neutral-500, #737373)'; // нейтраль — «ожидание»
  }
}

const SIZE = 170;
const STROKE = 10;
const CENTER = SIZE / 2;
const RADIUS = CENTER - STROKE / 2;
const CIRC = 2 * Math.PI * RADIUS;

export default function PhaseRing({
  phase,
  label,
  progress = 1,
  valueTestId,
  ariaLabel,
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = CIRC * (1 - clamped);
  return (
    <div
      className="pd-phase-ring"
      data-phase={phase}
      data-testid="phase-ring"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={ariaLabel || `${phase} ${label}`}
      >
        <circle
          className="pd-phase-ring-track"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
        />
        <circle
          className="pd-phase-ring-progress"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
        <text
          className="pd-phase-ring-value"
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          data-testid={valueTestId}
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

PhaseRing.propTypes = {
  phase: PropTypes.oneOf(['ready', 'preroll', 'work', 'rest', 'done']).isRequired,
  label: PropTypes.node.isRequired,
  progress: PropTypes.number,
  valueTestId: PropTypes.string,
  ariaLabel: PropTypes.string,
};
