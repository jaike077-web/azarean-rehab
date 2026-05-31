// =====================================================
// TEST: FunnelPanel (Wave 3 C5.2 + ARC-CYCLE AC7)
// Pure props consumer — без api mock'а.
// AC7: воронка = 4 стадии (без «Соблюдает»); приверженность — ДВЕ оси раздельно.
// =====================================================

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('./CommandCenter.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

import FunnelPanel from './FunnelPanel';

const fullSummary = {
  funnel: {
    created: 10,
    registered: 8,
    active_program: 5,
    active: 3,
  },
  adherence: {
    gymnastics: { adhering: 2, no_target: 1 }, // withTarget = 5 - 1 = 4 → "2 из 4"
    training: { adhering: 0, no_target: 5 },    // withTarget = 5 - 5 = 0 → "—"
  },
  funnel_gaps: { registered_no_active_program: 3 },
};

describe('FunnelPanel — Wave 3 C5.2 + AC7', () => {
  test('рендерит 4 стадии воронки (без «Соблюдает»)', () => {
    render(<FunnelPanel summary={fullSummary} loading={false} error={null} onRetry={() => {}} />);

    expect(screen.getByText('Воронка онбординга')).toBeInTheDocument();
    expect(screen.getByText('Заведён')).toBeInTheDocument();
    expect(screen.getByText('Зарегистрирован')).toBeInTheDocument();
    expect(screen.getByText('Активная программа')).toBeInTheDocument();
    expect(screen.getByText('Активен')).toBeInTheDocument();
    // AC7: «Соблюдает» больше НЕ стадия воронки
    expect(screen.queryByText('Соблюдает')).not.toBeInTheDocument();
    // Значения стадий
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  test('AC7: приверженность — две оси раздельно (Rule #34)', () => {
    render(<FunnelPanel summary={fullSummary} loading={false} error={null} onRetry={() => {}} />);

    expect(screen.getByText('Приверженность')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-adherence')).toBeInTheDocument();

    const gym = screen.getByTestId('adherence-gymnastics');
    expect(gym).toHaveTextContent('Гимнастика');
    expect(gym).toHaveTextContent('2 из 4');

    const train = screen.getByTestId('adherence-training');
    expect(train).toHaveTextContent('Тренировка');
    // training полностью no_target → «—», а не «0 из 0»
    expect(train).toHaveTextContent('—');
  });

  test('AC7: нет summary.adherence → блок приверженности скрыт (defensive)', () => {
    const noAdh = { funnel: { ...fullSummary.funnel }, funnel_gaps: { registered_no_active_program: 0 } };
    render(<FunnelPanel summary={noAdh} loading={false} error={null} onRetry={() => {}} />);
    expect(screen.queryByTestId('funnel-adherence')).not.toBeInTheDocument();
    // воронка всё равно рендерится
    expect(screen.getByText('Активен')).toBeInTheDocument();
  });

  test('gap-callout появляется при registered_no_active_program > 0', () => {
    render(<FunnelPanel summary={fullSummary} loading={false} error={null} onRetry={() => {}} />);

    expect(
      screen.getByText(/Зарегистрированы без активной программы/i)
    ).toBeInTheDocument();
    // plural: 3 → «пациента»
    expect(screen.getByText(/пациента/)).toBeInTheDocument();
  });

  test('gap-callout скрыт при registered_no_active_program === 0', () => {
    const summary = {
      funnel: { ...fullSummary.funnel },
      adherence: fullSummary.adherence,
      funnel_gaps: { registered_no_active_program: 0 },
    };
    render(<FunnelPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    expect(
      screen.queryByText(/Зарегистрированы без активной программы/i)
    ).not.toBeInTheDocument();
  });

  test('empty state при funnel.created === 0', () => {
    const summary = {
      funnel: { created: 0, registered: 0, active_program: 0, active: 0 },
      adherence: { gymnastics: { adhering: 0, no_target: 0 }, training: { adhering: 0, no_target: 0 } },
      funnel_gaps: { registered_no_active_program: 0 },
    };
    render(<FunnelPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    expect(screen.getByText('Пока нет заведённых пациентов')).toBeInTheDocument();
    // Стадии и приверженность не рендерятся
    expect(screen.queryByText('Заведён')).not.toBeInTheDocument();
    expect(screen.queryByTestId('funnel-adherence')).not.toBeInTheDocument();
  });

  test('loading state показывает скелетоны, не данные', () => {
    render(<FunnelPanel summary={null} loading={true} error={null} onRetry={() => {}} />);

    expect(screen.queryByText('Заведён')).not.toBeInTheDocument();
    expect(screen.queryByText(/Пока нет/)).not.toBeInTheDocument();
  });

  test('error state с retry-кнопкой', () => {
    const onRetry = jest.fn();
    render(<FunnelPanel summary={null} loading={false} error="Сервер недоступен" onRetry={onRetry} />);

    expect(screen.getByText('Сервер недоступен')).toBeInTheDocument();
    expect(screen.getByText('Повторить')).toBeInTheDocument();

    screen.getByText('Повторить').click();
    expect(onRetry).toHaveBeenCalled();
  });
});
