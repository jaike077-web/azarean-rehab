// =====================================================
// TEST: ARC-CYCLE AC3 — BlockEditor (редактор блоков микроцикла)
// Каркас по recon RehabProgramModal.test.js: CSS Modules Proxy-мок,
// namespace-мок api (rehabPrograms.*), useToast мок, RTL + data-testid (Rule #37).
// =====================================================

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('./RehabProgramModal.module.css', () => new Proxy({}, { get: (_, p) => String(p) }));

jest.mock('../../services/api', () => ({
  rehabPrograms: {
    getProgramBlocks: jest.fn(),
    createBlock: jest.fn(),
    updateBlock: jest.fn(),
    deleteBlock: jest.fn(),
  },
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../context/ToastContext', () => ({ useToast: () => mockToast }));

const { rehabPrograms } = require('../../services/api');
import BlockEditor from './BlockEditor';

const COMPLEXES = [
  { id: 10, title: 'A1', derived_title: 'A1' },
  { id: 11, title: 'A2', derived_title: 'A2' },
];

describe('BlockEditor (AC3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rehabPrograms.getProgramBlocks.mockResolvedValue({ data: [] });
  });

  it('грузит блоки программы при монтировании', async () => {
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(rehabPrograms.getProgramBlocks).toHaveBeenCalledWith(7));
    expect(screen.getByTestId('block-editor')).toBeInTheDocument();
  });

  it('без блоков — обе кнопки «Добавить» доступны', async () => {
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('add-gym')).toBeInTheDocument());
    expect(screen.getByTestId('add-gym')).not.toBeDisabled();
    expect(screen.getByTestId('add-training')).not.toBeDisabled();
  });

  it('нет комплексов у пациента → кнопки «Добавить» disabled', async () => {
    render(<BlockEditor programId={7} complexes={[]} />);
    await waitFor(() => expect(screen.getByTestId('add-gym')).toBeInTheDocument());
    expect(screen.getByTestId('add-gym')).toBeDisabled();
    expect(screen.getByTestId('add-training')).toBeDisabled();
  });

  it('существующие блоки → сводки с числом комплексов/дней и целью', async () => {
    rehabPrograms.getProgramBlocks.mockResolvedValue({
      data: [
        { id: 5, block_type: 'gymnastics', complexes: [{ complex_id: 10 }, { complex_id: 11 }], target_min: 1, target_max: 2 },
        { id: 6, block_type: 'training', complexes: [{ complex_id: 12, day_index: 1 }, { complex_id: 13, day_index: 2 }], target_min: 3, target_max: 4 },
      ],
    });
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('gym-summary')).toBeInTheDocument());
    expect(screen.getByTestId('gym-summary')).toHaveTextContent('2 компл.');
    expect(screen.getByTestId('gym-summary')).toHaveTextContent('1–2/день');
    expect(screen.getByTestId('training-summary')).toHaveTextContent('2 дн.');
    expect(screen.getByTestId('training-summary')).toHaveTextContent('3–4/нед');
  });

  it('добавить гимнастику → createBlock с block_type gymnastics + complexes', async () => {
    rehabPrograms.createBlock.mockResolvedValue({ data: { id: 1 } });
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('add-gym')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-gym'));
    expect(screen.getByTestId('gym-form')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить блок/ }));

    await waitFor(() => expect(rehabPrograms.createBlock).toHaveBeenCalledTimes(1));
    const [programId, payload] = rehabPrograms.createBlock.mock.calls[0];
    expect(programId).toBe(7);
    expect(payload.block_type).toBe('gymnastics');
    expect(payload.complexes).toEqual([{ complex_id: 10 }]);
    expect(payload.target_unit).toBeNull(); // цель не задана
  });

  it('добавить тренировку с 2 днями → day_index 1,2 контигуозно', async () => {
    rehabPrograms.createBlock.mockResolvedValue({ data: { id: 2 } });
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('add-training')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-training'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Добавить день/ }));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить блок/ }));

    await waitFor(() => expect(rehabPrograms.createBlock).toHaveBeenCalledTimes(1));
    const [, payload] = rehabPrograms.createBlock.mock.calls[0];
    expect(payload.block_type).toBe('training');
    expect(payload.complexes).toEqual([
      { complex_id: 10, day_index: 1, label: null },
      { complex_id: 11, day_index: 2, label: null },
    ]);
  });

  it('гимнастика с целью только/неделю недопустима — берём day, и цель раз/день в payload', async () => {
    rehabPrograms.createBlock.mockResolvedValue({ data: { id: 3 } });
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('add-gym')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-gym'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Цель раз в день, от'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Цель раз в день, до'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить блок/ }));

    await waitFor(() => expect(rehabPrograms.createBlock).toHaveBeenCalledTimes(1));
    const [, payload] = rehabPrograms.createBlock.mock.calls[0];
    expect(payload.target_min).toBe(1);
    expect(payload.target_max).toBe(2);
    expect(payload.target_unit).toBe('day');
  });

  it('сохранение гимнастики без выбранного комплекса → toast.error, createBlock НЕ вызван', async () => {
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('add-gym')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-gym'));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить блок/ }));

    expect(mockToast.error).toHaveBeenCalled();
    expect(rehabPrograms.createBlock).not.toHaveBeenCalled();
  });

  it('цель с одним заполненным полем → toast.error, createBlock НЕ вызван', async () => {
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('add-gym')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('add-gym'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Цель раз в день, от'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить блок/ }));

    expect(mockToast.error).toHaveBeenCalled();
    expect(rehabPrograms.createBlock).not.toHaveBeenCalled();
  });

  it('изменить существующий блок → updateBlock (не createBlock)', async () => {
    rehabPrograms.getProgramBlocks.mockResolvedValue({
      data: [{ id: 5, block_type: 'gymnastics', complexes: [{ complex_id: 10 }] }],
    });
    rehabPrograms.updateBlock.mockResolvedValue({ data: { id: 5 } });
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('gym-summary')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить блок/ }));

    await waitFor(() => expect(rehabPrograms.updateBlock).toHaveBeenCalledTimes(1));
    expect(rehabPrograms.updateBlock.mock.calls[0][0]).toBe(5);
    expect(rehabPrograms.createBlock).not.toHaveBeenCalled();
  });

  it('удалить блок → deleteBlock(id)', async () => {
    rehabPrograms.getProgramBlocks.mockResolvedValue({
      data: [{ id: 5, block_type: 'gymnastics', complexes: [{ complex_id: 10 }] }],
    });
    rehabPrograms.deleteBlock.mockResolvedValue({ data: { id: 5 } });
    render(<BlockEditor programId={7} complexes={COMPLEXES} />);
    await waitFor(() => expect(screen.getByTestId('gym-summary')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Удалить гимнастику'));
    await waitFor(() => expect(rehabPrograms.deleteBlock).toHaveBeenCalledWith(5));
  });
});
