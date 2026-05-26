// =====================================================
// TEST: AttentionPanel (Wave 3 C5.2)
// =====================================================

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

// Mock api — admin.commandCenter.getAttention
jest.mock('../../services/api', () => ({
  admin: {
    commandCenter: {
      getAttention: jest.fn(),
      getSummary: jest.fn(),
    },
  },
}));

// Mock react-router useNavigate — клик по строке ведёт на /patients
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock CSS Modules — Proxy, любой ключ возвращает имя как строку
jest.mock('./CommandCenter.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

import AttentionPanel, { severityColor } from './AttentionPanel';
import { admin } from '../../services/api';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AttentionPanel — Wave 3 C5.2', () => {
  test('рендер списка из items, total в бейдже', async () => {
    admin.commandCenter.getAttention.mockResolvedValue({
      data: {
        items: [
          {
            kind: 'phase_stuck',
            patient_id: 14, patient_name: 'Вадим',
            instructor_id: 1, instructor_name: 'Администратор',
            severity: 'high',
            summary: 'Застрял на фазе 1',
            created_at: '2026-05-19T06:00:00Z',
          },
          {
            kind: 'pain_red_flag',
            patient_id: 14, patient_name: 'Вадим',
            instructor_id: 1, instructor_name: 'Администратор',
            severity: 'critical',
            summary: 'Резкая боль (VAS 8)',
            created_at: '2026-05-20T12:00:00Z',
          },
        ],
        total: 6,
      },
    });

    await act(async () => { render(<AttentionPanel />); });

    expect(screen.getByText('Требует внимания')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Застрял на фазе 1')).toBeInTheDocument();
    });
    expect(screen.getByText('Резкая боль (VAS 8)')).toBeInTheDocument();
    // total бейдж
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  test('empty state при items:[]', async () => {
    admin.commandCenter.getAttention.mockResolvedValue({
      data: { items: [], total: 0 },
    });

    await act(async () => { render(<AttentionPanel />); });

    await waitFor(() => {
      expect(screen.getByText('Нет сигналов, требующих внимания')).toBeInTheDocument();
    });
    // total=0 → бейдж не показываем
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  test('severityColor: маппинг severity → CSS-переменная токена', () => {
    expect(severityColor('critical')).toBe('var(--color-danger)');
    expect(severityColor('high')).toBe('var(--color-danger)');
    expect(severityColor('medium')).toBe('var(--color-warning)');
    expect(severityColor('low')).toBe('var(--color-text-muted)');
    expect(severityColor('unknown')).toBe('var(--color-text-muted)'); // fallback
  });

  test('клик по строке → navigate("/patients")', async () => {
    admin.commandCenter.getAttention.mockResolvedValue({
      data: {
        items: [
          { kind: 'phase_stuck', patient_id: 14, patient_name: 'Вадим', instructor_id: 1,
            instructor_name: 'Админ', severity: 'high', summary: 'row click test',
            created_at: '2026-05-19T06:00:00Z' },
        ],
        total: 1,
      },
    });

    await act(async () => { render(<AttentionPanel />); });

    await waitFor(() => {
      expect(screen.getByText('row click test')).toBeInTheDocument();
    });

    const row = screen.getByText('row click test').closest('[role="button"]');
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith('/patients');
  });

  test('error state с retry-кнопкой', async () => {
    admin.commandCenter.getAttention.mockRejectedValueOnce({
      response: { data: { message: 'Боль сервера' } },
    });

    await act(async () => { render(<AttentionPanel />); });

    await waitFor(() => {
      expect(screen.getByText('Боль сервера')).toBeInTheDocument();
    });
    expect(screen.getByText('Повторить')).toBeInTheDocument();

    // Retry — мокаем успешный ответ для следующего вызова
    admin.commandCenter.getAttention.mockResolvedValueOnce({
      data: { items: [], total: 0 },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Повторить'));
    });

    await waitFor(() => {
      expect(screen.getByText('Нет сигналов, требующих внимания')).toBeInTheDocument();
    });
  });
});
