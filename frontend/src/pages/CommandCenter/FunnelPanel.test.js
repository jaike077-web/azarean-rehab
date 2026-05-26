// =====================================================
// TEST: FunnelPanel (Wave 3 C5.2)
// Pure props consumer — без api mock'а.
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
    adhering: 1,
  },
  funnel_gaps: { registered_no_active_program: 3 },
};

describe('FunnelPanel — Wave 3 C5.2', () => {
  test('рендерит 5 стадий с числами', () => {
    render(<FunnelPanel summary={fullSummary} loading={false} error={null} onRetry={() => {}} />);

    expect(screen.getByText('Воронка онбординга')).toBeInTheDocument();
    expect(screen.getByText('Заведён')).toBeInTheDocument();
    expect(screen.getByText('Зарегистрирован')).toBeInTheDocument();
    expect(screen.getByText('Активная программа')).toBeInTheDocument();
    expect(screen.getByText('Активен')).toBeInTheDocument();
    expect(screen.getByText('Соблюдает')).toBeInTheDocument();
    // Значения
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    // adhering=1 и funnel_gaps=3 — оба числа могут встретиться, главное «Соблюдает» ниже
    const ones = screen.queryAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
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
      funnel_gaps: { registered_no_active_program: 0 },
    };
    render(<FunnelPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    expect(
      screen.queryByText(/Зарегистрированы без активной программы/i)
    ).not.toBeInTheDocument();
  });

  test('empty state при funnel.created === 0', () => {
    const summary = {
      funnel: { created: 0, registered: 0, active_program: 0, active: 0, adhering: 0 },
      funnel_gaps: { registered_no_active_program: 0 },
    };
    render(<FunnelPanel summary={summary} loading={false} error={null} onRetry={() => {}} />);

    expect(screen.getByText('Пока нет заведённых пациентов')).toBeInTheDocument();
    // Стадии не рендерятся
    expect(screen.queryByText('Заведён')).not.toBeInTheDocument();
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
