// =====================================================
// Wave 2 #2.09 — ConsentDialog tests
// =====================================================

jest.mock('../../../../services/api', () => ({
  rehab: {
    postPhotoConsent: jest.fn(),
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
jest.mock('../../../../context/PatientAuthContext', () => ({
  usePatientAuth: () => ({
    refresh: jest.fn().mockResolvedValue({ photo_consent_at: '2026-05-19T14:00:00Z' }),
  }),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const { rehab } = require('../../../../services/api');
const { __toastMocks } = require('../../../../context/ToastContext');

import ConsentDialog from '../ConsentDialog';

beforeEach(() => {
  jest.clearAllMocks();
  rehab.postPhotoConsent.mockResolvedValue({
    data: { photo_consent_at: '2026-05-19T14:00:00Z', photo_consent_version: 'v1' },
  });
});

describe('ConsentDialog', () => {
  it('open=true → рендерит title + checkbox + buttons', () => {
    render(<ConsentDialog open={true} onConsent={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('Согласие на обработку фото')).toBeInTheDocument();
    expect(screen.getByLabelText(/Я согласен.*на обработку/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Принять/ })).toBeInTheDocument();
  });

  it('open=false → не рендерится в DOM', () => {
    render(<ConsentDialog open={false} onConsent={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByText('Согласие на обработку фото')).toBeNull();
  });

  it('Accept button disabled пока checkbox не checked', () => {
    render(<ConsentDialog open={true} onConsent={jest.fn()} onCancel={jest.fn()} />);
    const acceptBtn = screen.getByRole('button', { name: /Принять/ });
    expect(acceptBtn).toBeDisabled();
  });

  it('Accept button enabled после check', () => {
    render(<ConsentDialog open={true} onConsent={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByLabelText(/Я согласен.*на обработку/));
    expect(screen.getByRole('button', { name: /Принять/ })).toBeEnabled();
  });

  it('Click Accept → postPhotoConsent + onConsent + toast.success', async () => {
    const onConsent = jest.fn();
    render(<ConsentDialog open={true} onConsent={onConsent} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByLabelText(/Я согласен.*на обработку/));
    fireEvent.click(screen.getByRole('button', { name: /Принять/ }));

    await waitFor(() => expect(rehab.postPhotoConsent).toHaveBeenCalledTimes(1));
    expect(__toastMocks.success).toHaveBeenCalledWith('Согласие получено');
    expect(onConsent).toHaveBeenCalledWith('2026-05-19T14:00:00Z');
  });

  it('Click Cancel → onCancel без API call', () => {
    const onCancel = jest.fn();
    render(<ConsentDialog open={true} onConsent={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalled();
    expect(rehab.postPhotoConsent).not.toHaveBeenCalled();
  });

  it('postPhotoConsent падает → toast.error, onConsent НЕ вызван', async () => {
    rehab.postPhotoConsent.mockRejectedValueOnce({
      response: { data: { message: 'Backend error' } },
    });
    const onConsent = jest.fn();
    render(<ConsentDialog open={true} onConsent={onConsent} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByLabelText(/Я согласен.*на обработку/));
    fireEvent.click(screen.getByRole('button', { name: /Принять/ }));

    await waitFor(() => expect(__toastMocks.error).toHaveBeenCalledWith('Backend error'));
    expect(onConsent).not.toHaveBeenCalled();
  });
});
