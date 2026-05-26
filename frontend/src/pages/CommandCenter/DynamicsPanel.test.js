// =====================================================
// TEST: DynamicsPanel (Wave 3 C5.3)
// JSDOM-урок (C5.2): маппинги цвет/иконка — pure functions, тестируем
// напрямую; цвет в inline-style через style.X / getAttribute('style') НЕ
// ассертится — JSDOM не парсит CSS-переменные.
// =====================================================

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

jest.mock('../../services/api', () => ({
  admin: {
    commandCenter: {
      getDynamics: jest.fn(),
    },
  },
}));

jest.mock('./CommandCenter.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

import DynamicsPanel, { painTrendMeta, adherenceTrendMeta } from './DynamicsPanel';
import { admin } from '../../services/api';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('painTrendMeta — боль (improving = TrendingDown / success)', () => {
  test('improving: боль падает → TrendingDown + success', () => {
    const m = painTrendMeta('improving');
    expect(m.Icon).toBe(TrendingDown);
    expect(m.color).toBe('var(--color-success)');
    expect(m.label).toBe('Улучшение');
  });

  test('worsening: боль растёт → TrendingUp + danger', () => {
    const m = painTrendMeta('worsening');
    expect(m.Icon).toBe(TrendingUp);
    expect(m.color).toBe('var(--color-danger)');
    expect(m.label).toBe('Ухудшение');
  });

  test('stable + неизвестный ключ → Minus + muted', () => {
    expect(painTrendMeta('stable').Icon).toBe(Minus);
    expect(painTrendMeta('stable').color).toBe('var(--color-text-muted)');
    expect(painTrendMeta('garbage').Icon).toBe(Minus);
  });
});

describe('adherenceTrendMeta — приверженность (improving = TrendingUp / success)', () => {
  test('improving: активность растёт → TrendingUp + success', () => {
    const m = adherenceTrendMeta('improving');
    expect(m.Icon).toBe(TrendingUp);
    expect(m.color).toBe('var(--color-success)');
  });

  test('worsening: активность падает → TrendingDown + danger', () => {
    const m = adherenceTrendMeta('worsening');
    expect(m.Icon).toBe(TrendingDown);
    expect(m.color).toBe('var(--color-danger)');
  });

  test('stable → Minus + muted', () => {
    expect(adherenceTrendMeta('stable').Icon).toBe(Minus);
  });
});

describe('направления осей ПРОТИВОПОЛОЖНЫ (не копипастить mapping между ними)', () => {
  test('improving у боли = TrendingDown, у приверженности = TrendingUp', () => {
    expect(painTrendMeta('improving').Icon).not.toBe(adherenceTrendMeta('improving').Icon);
    expect(painTrendMeta('improving').Icon).toBe(TrendingDown);
    expect(adherenceTrendMeta('improving').Icon).toBe(TrendingUp);
  });

  test('worsening у боли = TrendingUp, у приверженности = TrendingDown', () => {
    expect(painTrendMeta('worsening').Icon).not.toBe(adherenceTrendMeta('worsening').Icon);
    expect(painTrendMeta('worsening').Icon).toBe(TrendingUp);
    expect(adherenceTrendMeta('worsening').Icon).toBe(TrendingDown);
  });
});

describe('DynamicsPanel — компонент', () => {
  const fullData = {
    period: '30d', window_days: 30, instructor_id: null, cohort: 2,
    pain:      { improving: 0, stable: 0, worsening: 0, insufficient_data: 2 },
    adherence: { improving: 0, stable: 0, worsening: 2, insufficient_data: 0 },
    phase:     { on_track: 1, stalled: 1 },
    conflicts: { overtraining_candidates: 0 },
  };

  test('рендерит 3 блока осей (Боль / Приверженность / Фазы) и контекст когорты', async () => {
    admin.commandCenter.getDynamics.mockResolvedValue({ data: fullData });

    await act(async () => { render(<DynamicsPanel period="30d" />); });

    await waitFor(() => {
      expect(screen.getByText('Боль')).toBeInTheDocument();
    });
    expect(screen.getByText('Приверженность')).toBeInTheDocument();
    expect(screen.getByText('Фазы')).toBeInTheDocument();
    // когорта с правильным склонением (2 → «пациента»)
    expect(screen.getByText(/пациента/)).toBeInTheDocument();
    expect(screen.getByText(/с активной программой/)).toBeInTheDocument();
  });

  test('insufficient_data показан числом, не спрятан в stable', async () => {
    admin.commandCenter.getDynamics.mockResolvedValue({ data: fullData });

    await act(async () => { render(<DynamicsPanel period="30d" />); });

    await waitFor(() => {
      expect(screen.getByText(/недостаточно данных/i)).toBeInTheDocument();
    });
    // pain.insufficient_data === 2
    const rows = screen.getAllByText(/недостаточно данных/i);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // микрокопия про 2 недели — под осью боли
    expect(screen.getByText(/2 недел/i)).toBeInTheDocument();
  });

  test('overtraining-бейдж показан при >0', async () => {
    admin.commandCenter.getDynamics.mockResolvedValue({
      data: { ...fullData, conflicts: { overtraining_candidates: 3 } },
    });

    await act(async () => { render(<DynamicsPanel period="30d" />); });

    await waitFor(() => {
      expect(screen.getByText(/возможный перетрен: 3/i)).toBeInTheDocument();
    });
  });

  test('overtraining-бейдж скрыт при === 0', async () => {
    admin.commandCenter.getDynamics.mockResolvedValue({ data: fullData });

    await act(async () => { render(<DynamicsPanel period="30d" />); });

    await waitFor(() => {
      expect(screen.getByText('Боль')).toBeInTheDocument();
    });
    expect(screen.queryByText(/возможный перетрен/i)).not.toBeInTheDocument();
  });

  test('empty при cohort === 0', async () => {
    admin.commandCenter.getDynamics.mockResolvedValue({
      data: {
        period: '30d', window_days: 30, instructor_id: null, cohort: 0,
        pain:      { improving: 0, stable: 0, worsening: 0, insufficient_data: 0 },
        adherence: { improving: 0, stable: 0, worsening: 0, insufficient_data: 0 },
        phase:     { on_track: 0, stalled: 0 },
        conflicts: { overtraining_candidates: 0 },
      },
    });

    await act(async () => { render(<DynamicsPanel period="30d" />); });

    await waitFor(() => {
      expect(screen.getByText(/Пока некого анализировать/i)).toBeInTheDocument();
    });
    // оси не должны рендериться
    expect(screen.queryByText('Боль')).not.toBeInTheDocument();
  });

  test('error state с retry', async () => {
    admin.commandCenter.getDynamics.mockRejectedValueOnce({
      response: { data: { message: 'Сервер ушёл в отпуск' } },
    });

    await act(async () => { render(<DynamicsPanel period="30d" />); });

    await waitFor(() => {
      expect(screen.getByText('Сервер ушёл в отпуск')).toBeInTheDocument();
    });
    expect(screen.getByText('Повторить')).toBeInTheDocument();

    admin.commandCenter.getDynamics.mockResolvedValueOnce({ data: fullData });
    await act(async () => {
      fireEvent.click(screen.getByText('Повторить'));
    });

    await waitFor(() => {
      expect(screen.getByText('Боль')).toBeInTheDocument();
    });
  });

  test('смена period вызывает рефетч (useCallback([period]))', async () => {
    admin.commandCenter.getDynamics.mockResolvedValue({ data: fullData });

    const { rerender } = render(<DynamicsPanel period="30d" />);
    await waitFor(() => {
      expect(admin.commandCenter.getDynamics).toHaveBeenCalledWith({ period: '30d' });
    });

    await act(async () => { rerender(<DynamicsPanel period="7d" />); });
    await waitFor(() => {
      expect(admin.commandCenter.getDynamics).toHaveBeenCalledWith({ period: '7d' });
    });
    expect(admin.commandCenter.getDynamics).toHaveBeenCalledTimes(2);
  });
});
