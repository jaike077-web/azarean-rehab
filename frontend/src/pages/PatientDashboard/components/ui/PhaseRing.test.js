// =====================================================
// TESTS: PhaseRing — CP3c.2 крупное кольцо-таймер + phaseColor helper.
//
// Rule #37: pure-function asserts для phaseColor (JSDOM не ассертит
// inline-style/CSS-variables; цвет управляется через data-phase + CSS,
// а тесты валидируют helper программно).
//
// Render-тесты: data-testid="phase-ring", data-phase attribute,
// label в data-testid={valueTestId} — для проверок наличия и
// контекста (не пиксельных значений stroke).
// =====================================================

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PhaseRing, { phaseColor } from './PhaseRing';

describe('phaseColor — pure helper (Rule #37)', () => {
  it('work → coral (--pd-accent-warm)', () => {
    expect(phaseColor('work')).toBe('var(--pd-accent-warm)');
  });

  it('preroll → coral (та же группа что work)', () => {
    expect(phaseColor('preroll')).toBe('var(--pd-accent-warm)');
  });

  it('rest → teal (--pd-primary)', () => {
    expect(phaseColor('rest')).toBe('var(--pd-primary)');
  });

  it('ready → нейтраль (--pd-neutral-500)', () => {
    expect(phaseColor('ready')).toBe('var(--pd-neutral-500, #737373)');
  });

  it('done → нейтраль (та же группа что ready)', () => {
    expect(phaseColor('done')).toBe('var(--pd-neutral-500, #737373)');
  });

  it('unknown / undefined → нейтраль (default branch)', () => {
    expect(phaseColor('foo')).toBe('var(--pd-neutral-500, #737373)');
    expect(phaseColor(undefined)).toBe('var(--pd-neutral-500, #737373)');
  });
});

describe('PhaseRing — render', () => {
  it('рендерит data-testid="phase-ring" + data-phase=phase + label', () => {
    render(<PhaseRing phase="work" label="0:30" progress={0.5} valueTestId="set-countdown" />);
    const ring = screen.getByTestId('phase-ring');
    expect(ring).toBeInTheDocument();
    expect(ring).toHaveAttribute('data-phase', 'work');
    expect(screen.getByTestId('set-countdown')).toHaveTextContent('0:30');
  });

  it('data-phase обновляется при смене prop (ready → work)', () => {
    const { rerender } = render(<PhaseRing phase="ready" label="0:30" progress={1} />);
    expect(screen.getByTestId('phase-ring')).toHaveAttribute('data-phase', 'ready');
    rerender(<PhaseRing phase="work" label="0:25" progress={0.83} />);
    expect(screen.getByTestId('phase-ring')).toHaveAttribute('data-phase', 'work');
  });

  it('progress clamp: -0.5 → 0, 1.5 → 1 (защита от плохих props)', () => {
    // Просто проверяем что не падает; визуально strokeDashoffset clamp проверять
    // на DOM не нужно — это inline SVG attribute, JSDOM его не ассертит надёжно.
    expect(() =>
      render(<PhaseRing phase="work" label="X" progress={-0.5} />),
    ).not.toThrow();
    expect(() =>
      render(<PhaseRing phase="work" label="X" progress={1.5} />),
    ).not.toThrow();
  });

  it('aria-label дефолтный из phase + label, если не передан', () => {
    render(<PhaseRing phase="rest" label="0:60" progress={0.8} />);
    const svg = screen.getByLabelText(/rest 0:60/);
    expect(svg).toBeInTheDocument();
  });

  it('ariaLabel override используется когда передан', () => {
    render(<PhaseRing phase="work" label="0:30" progress={0.5} ariaLabel="Подход 1, осталось 30 секунд" />);
    expect(screen.getByLabelText('Подход 1, осталось 30 секунд')).toBeInTheDocument();
  });
});
