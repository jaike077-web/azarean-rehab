// =====================================================
// Wave 2 #2.05 — PainHistoryView tests
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../../services/api', () => ({
  rehab: {
    getPainHistory: jest.fn(),
  },
}));

const { rehab } = require('../../../../services/api');
import PainHistoryView from '../PainHistoryView';

beforeEach(() => {
  jest.clearAllMocks();
  rehab.getPainHistory.mockResolvedValue({ data: [] });
});

describe('PainHistoryView', () => {
  it('empty state', async () => {
    render(<PainHistoryView />);
    expect(await screen.findByText(/Пока нет записей/)).toBeInTheDocument();
  });

  it('renders entries с badges «Событие» и «Внимание» для red-flag', async () => {
    rehab.getPainHistory.mockResolvedValue({
      data: [
        {
          id: 1, vas_score: 4, is_event: false, red_flag_triggered: false,
          locations: [{ code: 'knee_anterior', label: 'Передняя' }],
          notes: 'OK', created_at: new Date().toISOString(),
        },
        {
          id: 2, vas_score: 8, is_event: true, red_flag_triggered: true,
          locations: [{ code: 'calf_posterior', label: 'Икроножная' }],
          notes: 'икра', created_at: new Date().toISOString(),
        },
      ],
    });
    render(<PainHistoryView />);
    expect(await screen.findByText('Событие')).toBeInTheDocument();
    expect(screen.getByText('Внимание')).toBeInTheDocument();
    expect(screen.getByText(/ВАШ: 4\/10/)).toBeInTheDocument();
    expect(screen.getByText(/ВАШ: 8\/10/)).toBeInTheDocument();
  });

  it('filter type=daily → SQL filter передан', async () => {
    render(<PainHistoryView />);
    await waitFor(() => expect(rehab.getPainHistory).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('tab', { name: 'Дневник' }));
    await waitFor(() => {
      expect(rehab.getPainHistory).toHaveBeenCalledWith(expect.objectContaining({ type: 'daily' }));
    });
  });

  it('filter type=event', async () => {
    render(<PainHistoryView />);
    await waitFor(() => expect(rehab.getPainHistory).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('tab', { name: 'Срочные' }));
    await waitFor(() => {
      expect(rehab.getPainHistory).toHaveBeenCalledWith(expect.objectContaining({ type: 'event' }));
    });
  });
});
