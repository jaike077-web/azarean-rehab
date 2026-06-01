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
});
