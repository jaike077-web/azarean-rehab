// =====================================================
// TESTS: PatientAuthContext
// =====================================================

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../services/api', () => ({
  patientAuth: {
    getMe: jest.fn(),
    logout: jest.fn(),
  },
}));

const { patientAuth } = require('../services/api');
const { PatientAuthProvider, usePatientAuth } = require('./PatientAuthContext');

// Тест-компонент, который отображает состояние контекста
function Probe() {
  const { patient, loading, login, logout } = usePatientAuth();
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="patient">{patient ? patient.full_name : 'none'}</div>
      <button onClick={() => login({ id: 2, full_name: 'Новый' })} data-testid="login-btn">
        login
      </button>
      <button onClick={logout} data-testid="logout-btn">logout</button>
    </div>
  );
}

describe('PatientAuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('устанавливает patient если getMe успешен', async () => {
    patientAuth.getMe.mockResolvedValue({
      data: { patient: { id: 14, full_name: 'Вадим' } },
    });

    render(
      <PatientAuthProvider>
        <Probe />
      </PatientAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });
    expect(screen.getByTestId('patient')).toHaveTextContent('Вадим');
  });

  it('оставляет patient=null если getMe падает', async () => {
    patientAuth.getMe.mockRejectedValue({ response: { status: 401 } });

    render(
      <PatientAuthProvider>
        <Probe />
      </PatientAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });
    expect(screen.getByTestId('patient')).toHaveTextContent('none');
  });

  it('login обновляет state без вызова API', async () => {
    patientAuth.getMe.mockRejectedValue({ response: { status: 401 } });

    render(
      <PatientAuthProvider>
        <Probe />
      </PatientAuthProvider>
    );

    await waitFor(() => screen.getByTestId('loading'));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('loaded'));

    act(() => {
      fireEvent.click(screen.getByTestId('login-btn'));
    });

    expect(screen.getByTestId('patient')).toHaveTextContent('Новый');
  });

  it('logout вызывает api.logout и очищает state', async () => {
    patientAuth.getMe.mockResolvedValue({ data: { patient: { id: 14, full_name: 'Вадим' } } });
    patientAuth.logout.mockResolvedValue({});

    render(
      <PatientAuthProvider>
        <Probe />
      </PatientAuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('patient')).toHaveTextContent('Вадим'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('logout-btn'));
    });

    expect(patientAuth.logout).toHaveBeenCalled();
    expect(screen.getByTestId('patient')).toHaveTextContent('none');
  });
});
