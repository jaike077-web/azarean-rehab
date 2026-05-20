// =====================================================
// Wave 2 #2.08 — MeasurementsScreen tests
// =====================================================

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../../services/api', () => ({
  rehab: {
    getMeasurements: jest.fn(),
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

// MeasurementHistoryList (2.09 photo) использует usePatientAuth — mock'аем
jest.mock('../../../../context/PatientAuthContext', () => ({
  usePatientAuth: () => ({
    patient: { id: 14, photo_consent_at: null },
    refresh: jest.fn(),
  }),
}));

const { rehab } = require('../../../../services/api');

import MeasurementsScreen from '../MeasurementsScreen';

beforeEach(() => {
  jest.clearAllMocks();
  rehab.getMeasurements.mockResolvedValue({ data: { rom: [], girth: [] } });
});

describe('MeasurementsScreen', () => {
  it('header «Замеры» рендерится', async () => {
    render(<MeasurementsScreen />);
    expect(screen.getByRole('heading', { name: 'Замеры', level: 1 })).toBeInTheDocument();
  });

  it('фетчит историю на mount через rehab.getMeasurements', async () => {
    render(<MeasurementsScreen />);
    await waitFor(() => expect(rehab.getMeasurements).toHaveBeenCalled());
    expect(rehab.getMeasurements).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'all', limit: 20 })
    );
  });

  it('пустой response → empty state в истории', async () => {
    render(<MeasurementsScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Пока нет замеров/)).toBeInTheDocument();
    });
  });

  it('rom entry в response → отображается в истории', async () => {
    // Mock override ДО render (default из beforeEach пустой)
    rehab.getMeasurements.mockResolvedValueOnce({
      data: {
        rom: [{
          id: 1,
          measurement_type: 'knee_flexion_degrees',
          side: 'L',
          value_degrees: '120.0',
          measured_at: '2026-05-19',
        }],
        girth: [],
      },
    });
    render(<MeasurementsScreen />);
    // "120.0°" уникален для card — только value rendering имеет °.
    // findByText встроенный waitFor.
    expect(await screen.findByText(/120\.0°/)).toBeInTheDocument();
    // Лейбл "Колено: сгибание" появляется И в <option> формы И в карточке —
    // в карточке span с pd-measurement-card__type, не внутри option.
    const typeSpans = screen.getAllByText('Колено: сгибание');
    expect(typeSpans.length).toBeGreaterThanOrEqual(1);
  });
});
