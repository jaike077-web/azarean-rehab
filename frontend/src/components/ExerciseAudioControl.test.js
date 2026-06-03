// =====================================================
// TESTS: ExerciseAudioControl (EA4) — per-упражнение трек-звук в редакторе комплекса.
// Rule #37: assertions через data-testid. CSS-модуль → {} через CRA cssTransform.
// =====================================================
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseAudioControl from './ExerciseAudioControl';

const presets = [
  { id: 3, name: 'Медитация', is_active: true },
  { id: 5, name: 'Музыка', is_active: true },
  { id: 9, name: 'Старый трек', is_active: false },
];

describe('ExerciseAudioControl', () => {
  it('inherit-метка показывает имя трека библиотеки, если задан', () => {
    render(<ExerciseAudioControl row={{ lib_audio_preset_id: 3 }} presets={presets} onChange={() => {}} />);
    expect(screen.getByTestId('exercise-audio-select')).toHaveTextContent('Наследовать (библиотека: Медитация)');
  });

  it('inherit-метка «нет трека» когда библиотека пуста', () => {
    render(<ExerciseAudioControl row={{}} presets={presets} onChange={() => {}} />);
    expect(screen.getByTestId('exercise-audio-select')).toHaveTextContent('Наследовать (нет трека)');
  });

  it('неактивный трек помечен «(неактивен)»', () => {
    render(<ExerciseAudioControl row={{}} presets={presets} onChange={() => {}} />);
    expect(screen.getByTestId('exercise-audio-select')).toHaveTextContent('Старый трек (неактивен)');
  });

  it('выбор трека → onChange патч {off:false, preset:id}', () => {
    const onChange = jest.fn();
    render(<ExerciseAudioControl row={{}} presets={presets} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('exercise-audio-select'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ audio_off: false, audio_preset_id: 5 });
  });

  it('выбор «без звука» → onChange {off:true, preset:null, loop:false}', () => {
    const onChange = jest.fn();
    render(<ExerciseAudioControl row={{ audio_preset_id: 5 }} presets={presets} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('exercise-audio-select'), { target: { value: 'off' } });
    expect(onChange).toHaveBeenCalledWith({ audio_off: true, audio_preset_id: null, audio_loop: false });
  });

  it('loop disabled при inherit/off, активен при выбранном треке', () => {
    const { rerender } = render(<ExerciseAudioControl row={{}} presets={presets} onChange={() => {}} />);
    expect(screen.getByTestId('exercise-audio-loop')).toBeDisabled(); // inherit
    rerender(<ExerciseAudioControl row={{ audio_preset_id: 5 }} presets={presets} onChange={() => {}} />);
    expect(screen.getByTestId('exercise-audio-loop')).not.toBeDisabled();
  });

  it('клик loop → onChange {audio_loop:true}', () => {
    const onChange = jest.fn();
    render(<ExerciseAudioControl row={{ audio_preset_id: 5 }} presets={presets} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('exercise-audio-loop'));
    expect(onChange).toHaveBeenCalledWith({ audio_loop: true });
  });

  it('▶ disabled при inherit, активна при треке, зовёт onPreview с id', () => {
    const onPreview = jest.fn();
    const { rerender } = render(<ExerciseAudioControl row={{}} presets={presets} onChange={() => {}} onPreview={onPreview} />);
    expect(screen.getByTestId('exercise-audio-preview')).toBeDisabled();
    rerender(<ExerciseAudioControl row={{ audio_preset_id: 5 }} presets={presets} onChange={() => {}} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId('exercise-audio-preview'));
    expect(onPreview).toHaveBeenCalledWith(5);
  });

  it('без onPreview кнопка ▶ не рендерится', () => {
    render(<ExerciseAudioControl row={{ audio_preset_id: 5 }} presets={presets} onChange={() => {}} />);
    expect(screen.queryByTestId('exercise-audio-preview')).not.toBeInTheDocument();
  });
});
