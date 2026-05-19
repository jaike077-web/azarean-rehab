// =====================================================
// Wave 2 #2.05 — PainEventForm tests
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../../services/api', () => ({
  rehab: {
    getPainLocations: jest.fn(),
    getRecentRedFlagAlerts: jest.fn(),
    createPainEvent: jest.fn(),
  },
}));

jest.mock('../../../../context/ToastContext', () => {
  const success = jest.fn();
  const error = jest.fn();
  const info = jest.fn();
  return {
    useToast: () => ({ success, error, info }),
    __toastMocks: { success, error, info },
  };
});

const { rehab } = require('../../../../services/api');
const { __toastMocks } = require('../../../../context/ToastContext');

import PainEventForm from '../PainEventForm';

const LOCATIONS = [
  { code: 'knee_anterior', label: 'Передняя поверхность колена', position: 10, is_red_flag: false },
  { code: 'calf_posterior', label: 'Икроножная', position: 80, is_red_flag: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  rehab.getPainLocations.mockResolvedValue({ data: LOCATIONS });
  rehab.getRecentRedFlagAlerts.mockResolvedValue({ data: [] });
  rehab.createPainEvent.mockResolvedValue({ data: { id: 100, ops_alert_id: null } });
});

describe('PainEventForm', () => {
  it('не рендерится когда isOpen=false', () => {
    const { container } = render(<PainEventForm isOpen={false} onClose={jest.fn()} />);
    expect(container.querySelector('.pd-modal')).toBeNull();
  });

  it('загружает локации и recent alerts на open', async () => {
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => {
      expect(rehab.getPainLocations).toHaveBeenCalledTimes(1);
      expect(rehab.getRecentRedFlagAlerts).toHaveBeenCalledWith(1);
    });
  });

  it('показывает recent red-flag banner если за час был alert', async () => {
    rehab.getRecentRedFlagAlerts.mockResolvedValue({
      data: [{ id: 1, created_at: new Date().toISOString() }],
    });
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    expect(await screen.findByText(/Куратор уже уведомлён/)).toBeInTheDocument();
  });

  it('НЕ показывает banner если recent alerts пуст', async () => {
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getRecentRedFlagAlerts).toHaveBeenCalled());
    expect(screen.queryByText(/Куратор уже уведомлён/)).toBeNull();
  });

  it('validation: submit без VAS → error toast', async () => {
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Отправить/ }));
    await waitFor(() => {
      expect(screen.getByText(/Укажите уровень боли/)).toBeInTheDocument();
    });
    expect(rehab.createPainEvent).not.toHaveBeenCalled();
  });

  it('validation: submit без локаций → error', async () => {
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    // Выбираем VAS=5
    fireEvent.click(screen.getByRole('button', { name: 'Уровень боли 5 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: /Отправить/ }));
    await waitFor(() => {
      expect(screen.getByText(/Укажите хотя бы одну локацию/)).toBeInTheDocument();
    });
  });

  it('submit без red-flag → toast success обычный', async () => {
    const onClose = jest.fn();
    render(<PainEventForm isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Уровень боли 4 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Передняя поверхность колена' }));
    fireEvent.click(screen.getByRole('button', { name: /Отправить/ }));

    await waitFor(() => {
      expect(rehab.createPainEvent).toHaveBeenCalledWith(expect.objectContaining({
        vas_score: 4,
        location_codes: ['knee_anterior'],
      }));
    });
    await waitFor(() => {
      expect(__toastMocks.success).toHaveBeenCalledWith('Запись о боли сохранена');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('submit с red-flag (ops_alert_id) → toast «получит срочное уведомление»', async () => {
    rehab.createPainEvent.mockResolvedValue({ data: { id: 101, ops_alert_id: 200 } });
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Уровень боли 8 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: /Икроножная/ }));
    fireEvent.click(screen.getByRole('button', { name: /Отправить/ }));

    await waitFor(() => {
      expect(__toastMocks.success).toHaveBeenCalledWith(
        expect.stringMatching(/получит срочное уведомление/)
      );
    });
  });

  it('submit с red-flag + active dedup → toast «уже был уведомлён»', async () => {
    rehab.getRecentRedFlagAlerts.mockResolvedValue({
      data: [{ id: 1, created_at: new Date().toISOString() }],
    });
    rehab.createPainEvent.mockResolvedValue({ data: { id: 102, ops_alert_id: 201 } });
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getRecentRedFlagAlerts).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Уровень боли 9 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: /Икроножная/ }));
    fireEvent.click(screen.getByRole('button', { name: /Отправить/ }));

    await waitFor(() => {
      expect(__toastMocks.success).toHaveBeenCalledWith(
        expect.stringMatching(/уже был уведомлён за последний час/)
      );
    });
  });

  it('Esc закрывает modal', async () => {
    const onClose = jest.fn();
    render(<PainEventForm isOpen={true} onClose={onClose} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // HF#9 v2 — multi-select pain_character
  it('multi-select pain_character — несколько values отправляются массивом', async () => {
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    // Required: VAS + location
    fireEvent.click(await screen.findByRole('button', { name: 'Уровень боли 5 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Передняя поверхность колена' }));
    // Multi-select pain_character: «Острая» (sharp) + «Жгучая» (burning)
    fireEvent.click(screen.getByRole('button', { name: 'Острая' }));
    fireEvent.click(screen.getByRole('button', { name: 'Жгучая' }));
    fireEvent.click(screen.getByRole('button', { name: /Отправить/ }));
    await waitFor(() => {
      expect(rehab.createPainEvent).toHaveBeenCalledWith(
        expect.objectContaining({ pain_character: ['sharp', 'burning'] })
      );
    });
  });

  it('toggle pain_character chip — снимает выбор, не накапливает', async () => {
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    const chip = await screen.findByRole('button', { name: 'Острая' });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('пустой pain_character → payload не содержит pain_character', async () => {
    render(<PainEventForm isOpen={true} onClose={jest.fn()} />);
    await waitFor(() => expect(rehab.getPainLocations).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Уровень боли 4 из 10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Передняя поверхность колена' }));
    fireEvent.click(screen.getByRole('button', { name: /Отправить/ }));
    await waitFor(() => {
      expect(rehab.createPainEvent).toHaveBeenCalled();
    });
    const payload = rehab.createPainEvent.mock.calls[0][0];
    expect(payload.pain_character).toBeUndefined();
  });
});
