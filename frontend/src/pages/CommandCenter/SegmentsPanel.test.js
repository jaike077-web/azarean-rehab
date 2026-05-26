// =====================================================
// TEST: SegmentsPanel (Wave 3 C5.2)
// =====================================================

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('./CommandCenter.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

import SegmentsPanel from './SegmentsPanel';

describe('SegmentsPanel — Wave 3 C5.2', () => {
  test('4 карточки с числами и labels', () => {
    const summary = {
      segments: { active: 5, at_risk: 2, dormant: 1, churned: 0 },
      segments_note: { no_target_set: 0 },
    };
    render(<SegmentsPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    expect(screen.getByText('Активны')).toBeInTheDocument();
    expect(screen.getByText('Под риском')).toBeInTheDocument();
    expect(screen.getByText('Спят')).toBeInTheDocument();
    expect(screen.getByText('Отвалились')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  test('нули показываются честно, не прячутся', () => {
    const summary = {
      segments: { active: 0, at_risk: 0, dormant: 0, churned: 0 },
      segments_note: { no_target_set: 0 },
    };
    render(<SegmentsPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    // 4 нуля рядом — должны быть видны
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Активны')).toBeInTheDocument();
  });

  test('сноска no_target_set при > 0 (с правильным склонением)', () => {
    const summary = {
      segments: { active: 1, at_risk: 0, dormant: 0, churned: 0 },
      segments_note: { no_target_set: 5 },
    };
    render(<SegmentsPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    // 5 → «программ» (форма родительного мн.)
    expect(screen.getByText(/без заданной цели/i)).toBeInTheDocument();
    expect(screen.getByText(/программ /i)).toBeInTheDocument();
  });

  test('сноска скрыта при no_target_set === 0', () => {
    const summary = {
      segments: { active: 1, at_risk: 0, dormant: 0, churned: 0 },
      segments_note: { no_target_set: 0 },
    };
    render(<SegmentsPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    expect(screen.queryByText(/без заданной цели/i)).not.toBeInTheDocument();
  });

  test('loading state — без карточек', () => {
    render(<SegmentsPanel summary={null} loading={true} error={null} onRetry={() => {}} />);

    expect(screen.queryByText('Активны')).not.toBeInTheDocument();
  });

  test('error state с retry', () => {
    const onRetry = jest.fn();
    render(<SegmentsPanel summary={null} loading={false} error="boom" onRetry={onRetry} />);

    expect(screen.getByText('boom')).toBeInTheDocument();
    screen.getByText('Повторить').click();
    expect(onRetry).toHaveBeenCalled();
  });
});
