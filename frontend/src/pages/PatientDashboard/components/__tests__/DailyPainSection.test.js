// =====================================================
// Wave 2 #2.05 — DailyPainSection tests
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../../services/api', () => ({
  rehab: {
    getPainLocations: jest.fn(),
    getDailyPainToday: jest.fn(),
    createDailyPain: jest.fn(),
  },
}));

jest.mock('../../../../context/ToastContext', () => {
  const success = jest.fn();
  const error = jest.fn();
  return {
    useToast: () => ({ success, error, info: jest.fn() }),
    __toastMocks: { success, error },
  };
});

const { rehab } = require('../../../../services/api');
const { __toastMocks } = require('../../../../context/ToastContext');

import DailyPainSection from '../DailyPainSection';

beforeEach(() => {
  jest.clearAllMocks();
  rehab.getPainLocations.mockResolvedValue({
    data: [{ code: 'knee_anterior', label: 'Передняя', position: 10, is_red_flag: false }],
  });
  rehab.getDailyPainToday.mockResolvedValue({ data: [] });
  rehab.createDailyPain.mockResolvedValue({ data: { id: 1 } });
});

describe('DailyPainSection', () => {
  it('empty state — нет banner, кнопка «Сохранить»', async () => {
    render(<DailyPainSection />);
    await waitFor(() => expect(rehab.getDailyPainToday).toHaveBeenCalled());
    expect(screen.queryByText(/Сегодняшняя запись от/)).toBeNull();
    expect(await screen.findByRole('button', { name: /Сохранить/ })).toBeInTheDocument();
  });

  it('pre-load existing today entry — banner + кнопка «Обновить»', async () => {
    rehab.getDailyPainToday.mockResolvedValue({
      data: [{
        id: 50,
        entry_date: new Date().toISOString().slice(0, 10),
        vas_score: 5,
        locations: [{ code: 'knee_anterior' }],
        notes: 'OK',
        trigger_type: 'at_rest',
        pain_character: 'aching',
        created_at: new Date().toISOString(),
      }],
    });

    render(<DailyPainSection />);
    expect(await screen.findByText(/Сегодняшняя запись от/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Обновить/ })).toBeInTheDocument();
  });

  it('игнорирует entry с другой даты (не сегодня)', async () => {
    rehab.getDailyPainToday.mockResolvedValue({
      data: [{
        id: 50,
        entry_date: '2026-01-01',
        vas_score: 5,
        locations: [],
        created_at: '2026-01-01T10:00:00Z',
      }],
    });

    render(<DailyPainSection />);
    await waitFor(() => expect(rehab.getDailyPainToday).toHaveBeenCalled());
    expect(screen.queryByText(/Сегодняшняя запись от/)).toBeNull();
  });

  it('submit без VAS → error toast, не вызывает createDailyPain', async () => {
    render(<DailyPainSection />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => {
      expect(__toastMocks.error).toHaveBeenCalledWith('Укажите уровень боли');
    });
    expect(rehab.createDailyPain).not.toHaveBeenCalled();
  });

  it('submit с VAS → createDailyPain + toast', async () => {
    const onSaved = jest.fn();
    render(<DailyPainSection onSaved={onSaved} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Уровень боли 4 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));

    await waitFor(() => {
      expect(rehab.createDailyPain).toHaveBeenCalledWith(expect.objectContaining({ vas_score: 4 }));
    });
    expect(__toastMocks.success).toHaveBeenCalledWith('Запись сохранена');
    expect(onSaved).toHaveBeenCalled();
  });

  it('UPDATE existing — toast «Сегодняшняя запись обновлена»', async () => {
    rehab.getDailyPainToday.mockResolvedValue({
      data: [{
        id: 60,
        entry_date: new Date().toISOString().slice(0, 10),
        vas_score: 3,
        locations: [],
        created_at: new Date().toISOString(),
      }],
    });

    render(<DailyPainSection />);
    await waitFor(() => expect(rehab.getDailyPainToday).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Уровень боли 7 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: /Обновить/ }));

    await waitFor(() => {
      expect(__toastMocks.success).toHaveBeenCalledWith('Сегодняшняя запись обновлена');
    });
  });
});
