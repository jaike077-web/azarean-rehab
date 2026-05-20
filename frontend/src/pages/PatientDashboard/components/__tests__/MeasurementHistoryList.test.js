// =====================================================
// Wave 2 #2.08 — MeasurementHistoryList tests
// =====================================================

// Mock services/api перед import — НЕ используется в этом тесте, но
// MeasurementHistoryList импортирует labels из NumericInputForm, который
// импортирует services/api → axios (ESM transform issue).
jest.mock('../../../../services/api', () => ({
  rehab: {
    postRomMeasurement: jest.fn(),
    postGirthMeasurement: jest.fn(),
  },
}));
jest.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import MeasurementHistoryList from '../MeasurementHistoryList';

describe('MeasurementHistoryList', () => {
  it('пустой items → empty state', () => {
    render(<MeasurementHistoryList items={{ rom: [], girth: [] }} />);
    expect(screen.getByText(/Пока нет замеров/)).toBeInTheDocument();
  });

  it('ROM entry с value_degrees=120 → отображает "120°"', () => {
    const items = {
      rom: [{
        id: 1,
        measurement_type: 'knee_flexion_degrees',
        side: 'L',
        value_degrees: '120.0',
        value_cm: null,
        value_categorical: null,
        measured_at: '2026-05-19',
      }],
      girth: [],
    };
    render(<MeasurementHistoryList items={items} />);
    expect(screen.getByText(/120\.0°/)).toBeInTheDocument();
    expect(screen.getByText('Колено: сгибание')).toBeInTheDocument();
    expect(screen.getByText('Левая')).toBeInTheDocument();
    expect(screen.getByText('2026-05-19')).toBeInTheDocument();
  });

  it('ROM entry с value_categorical=L3 → отображает "L3"', () => {
    const items = {
      rom: [{
        id: 2,
        measurement_type: 'shoulder_hbb_categorical',
        side: 'R',
        value_categorical: 'L3',
        measured_at: '2026-05-19',
      }],
      girth: [],
    };
    render(<MeasurementHistoryList items={items} />);
    // L3 — лейбл совпадает с value (только sacrum/great_trochanter — cyrillic)
    expect(screen.getByText('L3')).toBeInTheDocument();
    expect(screen.getByText('Плечо: рука за спину (HBB)')).toBeInTheDocument();
    expect(screen.getByText('Правая')).toBeInTheDocument();
  });

  it('ROM entry с value_categorical=sacrum → отображает "Крестец"', () => {
    const items = {
      rom: [{
        id: 3,
        measurement_type: 'shoulder_hbb_categorical',
        side: 'L',
        value_categorical: 'sacrum',
        measured_at: '2026-05-19',
      }],
      girth: [],
    };
    render(<MeasurementHistoryList items={items} />);
    expect(screen.getByText('Крестец')).toBeInTheDocument();
  });

  it('Girth entry → отображает "42.5 см"', () => {
    const items = {
      rom: [],
      girth: [{
        id: 10,
        measurement_type: 'knee_joint_line_cm',
        side: 'L',
        value_cm: '42.50',
        measured_at: '2026-05-19',
      }],
    };
    render(<MeasurementHistoryList items={items} />);
    expect(screen.getByText(/42\.50 см/)).toBeInTheDocument();
    expect(screen.getByText('Окружность колена (суставная линия)')).toBeInTheDocument();
  });

  it('Сортирует по measured_at DESC + id DESC', () => {
    const items = {
      rom: [
        { id: 1, measurement_type: 'knee_flexion_degrees', side: 'L', value_degrees: '100.0', measured_at: '2026-05-17' },
        { id: 5, measurement_type: 'knee_flexion_degrees', side: 'L', value_degrees: '110.0', measured_at: '2026-05-19' },
      ],
      girth: [
        { id: 10, measurement_type: 'knee_joint_line_cm', side: 'L', value_cm: '42.0', measured_at: '2026-05-18' },
      ],
    };
    render(<MeasurementHistoryList items={items} />);
    const dates = screen.getAllByText(/2026-05-\d{2}/);
    // Expected order: 2026-05-19, 2026-05-18, 2026-05-17
    expect(dates[0].textContent).toBe('2026-05-19');
    expect(dates[1].textContent).toBe('2026-05-18');
    expect(dates[2].textContent).toBe('2026-05-17');
  });
});
