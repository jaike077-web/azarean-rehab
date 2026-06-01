// =====================================================
// TESTS: ComplexCueSounds (AA4) — секция «Звуки комплекса».
// Rule #37: assertions через data-testid. CSS-модуль → {} через CRA cssTransform.
// =====================================================

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ComplexCueSounds from './ComplexCueSounds';
import { emptyCueState } from '../utils/audioCues';

const presets = [
  { id: 1, name: 'Гонг', is_active: true },
  { id: 2, name: 'Голос', is_active: true },
  { id: 9, name: 'Старый', is_active: false },
];
const defaults = [
  { cue_name: 'set_start', preset_id: 1, is_locked: false, preset_name: 'Гонг' },
];

describe('ComplexCueSounds', () => {
  it('рендерит 4 cue-строки с лейблами', () => {
    render(<ComplexCueSounds cueState={emptyCueState()} onChange={() => {}} presets={presets} defaults={defaults} />);
    expect(screen.getByTestId('cue-sound-select-count_tick')).toBeInTheDocument();
    expect(screen.getByTestId('cue-sound-select-set_start')).toBeInTheDocument();
    expect(screen.getByTestId('cue-sound-select-set_end')).toBeInTheDocument();
    expect(screen.getByTestId('cue-sound-select-rest_end')).toBeInTheDocument();
    expect(screen.getByText('Старт подхода')).toBeInTheDocument();
  });

  it('выбор пресета зовёт onChange с обновлённым cueState', () => {
    const onChange = jest.fn();
    render(<ComplexCueSounds cueState={emptyCueState()} onChange={onChange} presets={presets} defaults={defaults} />);
    fireEvent.change(screen.getByTestId('cue-sound-select-set_start'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      set_start: { sel: '2', locked: false },
    }));
  });

  it('lock-чекбокс disabled при inherit, активен при tone/пресете', () => {
    const state = { ...emptyCueState(), set_end: { sel: 'tone', locked: false } };
    render(<ComplexCueSounds cueState={state} onChange={() => {}} presets={presets} defaults={defaults} />);
    expect(screen.getByTestId('cue-sound-lock-count_tick')).toBeDisabled();
    expect(screen.getByTestId('cue-sound-lock-set_end')).not.toBeDisabled();
  });

  it('клик по lock зовёт onChange с locked=true', () => {
    const onChange = jest.fn();
    const state = { ...emptyCueState(), set_start: { sel: '1', locked: false } };
    render(<ComplexCueSounds cueState={state} onChange={onChange} presets={presets} defaults={defaults} />);
    fireEvent.click(screen.getByTestId('cue-sound-lock-set_start'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      set_start: { sel: '1', locked: true },
    }));
  });

  it('inherit-опция показывает имя дом-звука для cue с дефолтом, иначе «стандартный тон»', () => {
    render(<ComplexCueSounds cueState={emptyCueState()} onChange={() => {}} presets={presets} defaults={defaults} />);
    expect(screen.getByTestId('cue-sound-select-set_start')).toHaveTextContent('Наследовать (дом-звук: Гонг)');
    expect(screen.getByTestId('cue-sound-select-count_tick')).toHaveTextContent('Наследовать (дом-звук: стандартный тон)');
  });

  it('неактивный пресет в опциях помечен «(неактивен)»', () => {
    render(<ComplexCueSounds cueState={emptyCueState()} onChange={() => {}} presets={presets} defaults={defaults} />);
    expect(screen.getByTestId('cue-sound-select-count_tick')).toHaveTextContent('Старый (неактивен)');
  });

  it('без onPreview кнопка прослушки ▶ не рендерится', () => {
    render(<ComplexCueSounds cueState={emptyCueState()} onChange={() => {}} presets={presets} defaults={defaults} />);
    expect(screen.queryByTestId('cue-sound-preview-set_start')).not.toBeInTheDocument();
  });

  it('▶ для выбранного пресета зовёт onPreview с его id', () => {
    const onPreview = jest.fn();
    const state = { ...emptyCueState(), set_start: { sel: '2', locked: false } };
    render(<ComplexCueSounds cueState={state} onChange={() => {}} presets={presets} defaults={defaults} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId('cue-sound-preview-set_start'));
    expect(onPreview).toHaveBeenCalledWith(2);
  });

  it('▶ при inherit с дом-дефолтом зовёт onPreview с preset_id дефолта', () => {
    const onPreview = jest.fn();
    render(<ComplexCueSounds cueState={emptyCueState()} onChange={() => {}} presets={presets} defaults={defaults} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId('cue-sound-preview-set_start'));
    expect(onPreview).toHaveBeenCalledWith(1);
  });

  it('▶ disabled при tone и при inherit без дом-дефолта, активна при inherit с дефолтом', () => {
    const state = { ...emptyCueState(), set_end: { sel: 'tone', locked: false } };
    render(<ComplexCueSounds cueState={state} onChange={() => {}} presets={presets} defaults={defaults} onPreview={() => {}} />);
    expect(screen.getByTestId('cue-sound-preview-count_tick')).toBeDisabled(); // inherit без дефолта
    expect(screen.getByTestId('cue-sound-preview-set_end')).toBeDisabled();    // tone
    expect(screen.getByTestId('cue-sound-preview-set_start')).not.toBeDisabled(); // inherit с дефолтом
  });
});
