// =====================================================
// Wave 2 #2.08 + #2.09 — MeasurementHistoryList tests
// =====================================================

// Mocks ДО import (axios ESM transform protection).
jest.mock('../../../../services/api', () => ({
  rehab: {
    postRomMeasurement: jest.fn(),
    postGirthMeasurement: jest.fn(),
    postPhotoConsent: jest.fn(),
    uploadRomPhoto: jest.fn(),
    fetchRomPhotoBlob: jest.fn(),
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

// PatientAuthContext mock — управляется через переменную (mutable patient)
let mockPatient = { id: 14, photo_consent_at: null };
jest.mock('../../../../context/PatientAuthContext', () => ({
  usePatientAuth: () => ({
    patient: mockPatient,
    refresh: jest.fn().mockResolvedValue(mockPatient),
  }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const { rehab } = require('../../../../services/api');
const { __toastMocks } = require('../../../../context/ToastContext');

import MeasurementHistoryList from '../MeasurementHistoryList';

beforeEach(() => {
  jest.clearAllMocks();
  mockPatient = { id: 14, photo_consent_at: null };
  rehab.uploadRomPhoto.mockResolvedValue({ data: { photo_url: '/uploads/measurements/rom_X.jpg' } });
  rehab.postPhotoConsent.mockResolvedValue({ data: { photo_consent_at: '2026-05-19T14:00:00Z' } });
  rehab.fetchRomPhotoBlob.mockResolvedValue({ data: new Blob([''], { type: 'image/jpeg' }) });
});

describe('MeasurementHistoryList — базовый рендер (2.08)', () => {
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
    expect(dates[0].textContent).toBe('2026-05-19');
    expect(dates[1].textContent).toBe('2026-05-18');
    expect(dates[2].textContent).toBe('2026-05-17');
  });
});

// =====================================================
// Wave 2 #2.09 — Photo capture controls
// =====================================================

describe('MeasurementHistoryList — photo controls (2.09)', () => {
  const romNoPhoto = {
    id: 100,
    measurement_type: 'knee_flexion_degrees',
    side: 'L',
    value_degrees: '120.0',
    measured_at: '2026-05-19',
    photo_url: null,
  };
  const romWithPhoto = {
    id: 101,
    measurement_type: 'knee_flexion_degrees',
    side: 'R',
    value_degrees: '118.0',
    measured_at: '2026-05-19',
    photo_url: '/uploads/measurements/rom_101.jpg',
  };
  const girthEntry = {
    id: 200,
    measurement_type: 'knee_joint_line_cm',
    side: 'L',
    value_cm: '42.5',
    measured_at: '2026-05-19',
  };

  it('ROM без photo_url → "Добавить фото" button', () => {
    render(<MeasurementHistoryList items={{ rom: [romNoPhoto], girth: [] }} />);
    expect(screen.getByRole('button', { name: /Добавить фото/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Открыть фото' })).toBeNull();
  });

  it('ROM с photo_url → thumbnail "Открыть фото" button', () => {
    render(<MeasurementHistoryList items={{ rom: [romWithPhoto], girth: [] }} />);
    expect(screen.getByRole('button', { name: 'Открыть фото' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Добавить фото/ })).toBeNull();
  });

  it('Girth entry → НЕ имеет photo controls', () => {
    render(<MeasurementHistoryList items={{ rom: [], girth: [girthEntry] }} />);
    expect(screen.queryByRole('button', { name: /Добавить фото/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Открыть фото' })).toBeNull();
  });

  it('Click "Добавить фото" БЕЗ consent → opens ConsentDialog, file picker НЕ trigger', () => {
    mockPatient = { id: 14, photo_consent_at: null };
    render(<MeasurementHistoryList items={{ rom: [romNoPhoto], girth: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: /Добавить фото/ }));
    // ConsentDialog заголовок виден
    expect(screen.getByText('Согласие на обработку фото')).toBeInTheDocument();
    expect(screen.getByLabelText(/Я согласен.*на обработку/)).toBeInTheDocument();
    expect(rehab.uploadRomPhoto).not.toHaveBeenCalled();
  });

  it('Click "Добавить фото" С existing consent → ConsentDialog НЕ открывается', () => {
    mockPatient = { id: 14, photo_consent_at: '2026-05-18T10:00:00Z' };
    render(<MeasurementHistoryList items={{ rom: [romNoPhoto], girth: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: /Добавить фото/ }));
    // ConsentDialog title НЕ в DOM
    expect(screen.queryByText('Согласие на обработку фото')).toBeNull();
    // File picker должен быть triggered — но в jsdom click не открывает picker,
    // proxy через data-romId на ref
    const input = screen.getByTestId('rom-photo-input');
    expect(input.dataset.romId).toBe('100');
  });

  it('Bilateral pair (L=photo, R=no photo) — обе кнопки независимо', () => {
    const items = {
      rom: [
        { ...romWithPhoto, id: 200, side: 'L' },
        { ...romNoPhoto, id: 201, side: 'R' },
      ],
      girth: [],
    };
    render(<MeasurementHistoryList items={items} />);
    // Одна card имеет thumbnail, вторая — add button
    expect(screen.getByRole('button', { name: 'Открыть фото' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Добавить фото/ })).toBeInTheDocument();
  });
});
