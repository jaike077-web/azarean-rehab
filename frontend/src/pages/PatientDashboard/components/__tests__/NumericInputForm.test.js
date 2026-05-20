// =====================================================
// Wave 2 #2.08 — NumericInputForm tests
// =====================================================

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../../services/api', () => ({
  rehab: {
    postRomMeasurement: jest.fn(),
    postGirthMeasurement: jest.fn(),
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

import NumericInputForm from '../NumericInputForm';

beforeEach(() => {
  jest.clearAllMocks();
  rehab.postRomMeasurement.mockResolvedValue({ data: { id: 1 } });
  rehab.postGirthMeasurement.mockResolvedValue({ data: { id: 2 } });
});

function selectType(value) {
  fireEvent.change(screen.getByLabelText(/Что замеряем/), { target: { value } });
}

describe('NumericInputForm', () => {
  it('рендерит category switcher (ROM/Girth)', () => {
    render(<NumericInputForm />);
    expect(screen.getByText('Подвижность (ROM)')).toBeInTheDocument();
    expect(screen.getByText('Окружность')).toBeInTheDocument();
  });

  it('category=rom → measurement_type select содержит 8 ROM-опций', () => {
    render(<NumericInputForm />);
    // default category=rom
    const select = screen.getByLabelText(/Что замеряем/);
    // 8 ROM + 1 placeholder
    expect(select.querySelectorAll('option')).toHaveLength(9);
    expect(select.innerHTML).toContain('Колено: сгибание');
    expect(select.innerHTML).toContain('Плечо: рука за спину (HBB)');
  });

  it('переключение на category=girth → 7 girth-опций', () => {
    render(<NumericInputForm />);
    fireEvent.click(screen.getByText('Окружность'));
    const select = screen.getByLabelText(/Что замеряем/);
    expect(select.querySelectorAll('option')).toHaveLength(8);
    expect(select.innerHTML).toContain('Окружность колена (суставная линия)');
    expect(select.innerHTML).not.toContain('Плечо: рука за спину');
  });

  it('HBB type → numeric input заменяется ChipGroup из 19 позвонков', () => {
    render(<NumericInputForm />);
    selectType('shoulder_hbb_categorical');
    expect(screen.queryByRole('spinbutton')).toBeNull(); // нет numeric input
    // Chips L3, T5, Крестец etc.
    expect(screen.getByRole('button', { name: 'L3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Крестец' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Большой вертел' })).toBeInTheDocument();
  });

  it('submit valid ROM (knee_flexion_degrees, side=L, value=120) → postRomMeasurement', async () => {
    const onSaved = jest.fn();
    render(<NumericInputForm onSaved={onSaved} />);
    selectType('knee_flexion_degrees');
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '120' } });
    // side default = 'L'
    fireEvent.click(screen.getByRole('button', { name: /Сохранить замер/ }));

    await waitFor(() => expect(rehab.postRomMeasurement).toHaveBeenCalled());
    expect(rehab.postRomMeasurement).toHaveBeenCalledWith(expect.objectContaining({
      measurement_type: 'knee_flexion_degrees',
      side: 'L',
      value: 120,
    }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('bilateral → два POST с одинаковым session_id и side L/R', async () => {
    const RealNow = Date.now;
    Date.now = jest.fn(() => 1716100000000);

    render(<NumericInputForm />);
    selectType('knee_flexion_degrees');
    // toggle bilateral
    fireEvent.click(screen.getByLabelText(/Замерить обе стороны/));

    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: '125' } });
    fireEvent.change(inputs[1], { target: { value: '120' } });

    fireEvent.click(screen.getByRole('button', { name: /Сохранить замер/ }));

    await waitFor(() => expect(rehab.postRomMeasurement).toHaveBeenCalledTimes(2));
    const callL = rehab.postRomMeasurement.mock.calls[0][0];
    const callR = rehab.postRomMeasurement.mock.calls[1][0];
    expect(callL.side).toBe('L');
    expect(callR.side).toBe('R');
    expect(callL.measurement_session_id).toBe(1716100000000);
    expect(callR.measurement_session_id).toBe(1716100000000);
    expect(callL.value).toBe(125);
    expect(callR.value).toBe(120);

    Date.now = RealNow;
  });

  it('Invalid degrees (500) → toast.error + НЕ API call', async () => {
    render(<NumericInputForm />);
    selectType('knee_flexion_degrees');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить замер/ }));

    await waitFor(() => {
      expect(__toastMocks.error).toHaveBeenCalled();
    });
    expect(rehab.postRomMeasurement).not.toHaveBeenCalled();
  });

  it('Invalid cm (-5) → toast.error + НЕ API call', async () => {
    render(<NumericInputForm />);
    fireEvent.click(screen.getByText('Окружность'));
    selectType('knee_joint_line_cm');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить замер/ }));

    await waitFor(() => expect(__toastMocks.error).toHaveBeenCalled());
    expect(rehab.postGirthMeasurement).not.toHaveBeenCalled();
  });

  it('Girth submit → postGirthMeasurement с value_cm', async () => {
    render(<NumericInputForm />);
    fireEvent.click(screen.getByText('Окружность'));
    selectType('knee_joint_line_cm');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '42.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить замер/ }));

    await waitFor(() => expect(rehab.postGirthMeasurement).toHaveBeenCalled());
    expect(rehab.postGirthMeasurement).toHaveBeenCalledWith(expect.objectContaining({
      measurement_type: 'knee_joint_line_cm',
      side: 'L',
      value_cm: 42.5,
    }));
  });

  it('HBB submit → postRomMeasurement с value="L3" (string)', async () => {
    render(<NumericInputForm />);
    selectType('shoulder_hbb_categorical');
    fireEvent.click(screen.getByRole('button', { name: 'L3' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить замер/ }));

    await waitFor(() => expect(rehab.postRomMeasurement).toHaveBeenCalled());
    expect(rehab.postRomMeasurement).toHaveBeenCalledWith(expect.objectContaining({
      measurement_type: 'shoulder_hbb_categorical',
      side: 'L',
      value: 'L3',
    }));
  });

  it('submit success → форма reset (selected type cleared)', async () => {
    render(<NumericInputForm />);
    selectType('knee_flexion_degrees');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить замер/ }));

    await waitFor(() => expect(rehab.postRomMeasurement).toHaveBeenCalled());
    // measurement_type select сбросилось — submit-кнопки больше нет (meta=null)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Сохранить замер/ })).toBeNull();
    });
  });
});
