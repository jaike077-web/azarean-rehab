// Unit-тесты чистых helper'ов utils/exerciseAudio (EA4, фронт).
import {
  exerciseAudioSel,
  patchFromSel,
  buildExerciseAudioPayload,
  presetName,
} from './exerciseAudio';

describe('exerciseAudioSel', () => {
  it('off=true → "off" (даже при заданном preset)', () => {
    expect(exerciseAudioSel({ audio_off: true, audio_preset_id: 5 })).toBe('off');
  });
  it('preset задан → строка id', () => {
    expect(exerciseAudioSel({ audio_preset_id: 7 })).toBe('7');
  });
  it('ни off, ни preset → "inherit"', () => {
    expect(exerciseAudioSel({})).toBe('inherit');
    expect(exerciseAudioSel(null)).toBe('inherit');
  });
});

describe('patchFromSel', () => {
  it('off → {off:true, preset:null, loop:false}', () => {
    expect(patchFromSel('off')).toEqual({ audio_off: true, audio_preset_id: null, audio_loop: false });
  });
  it('inherit → {off:false, preset:null, loop:false}', () => {
    expect(patchFromSel('inherit')).toEqual({ audio_off: false, audio_preset_id: null, audio_loop: false });
  });
  it('id → {off:false, preset:id} (loop сохраняется — не в патче)', () => {
    expect(patchFromSel('7')).toEqual({ audio_off: false, audio_preset_id: 7 });
  });
  it('мусорный id → preset null', () => {
    expect(patchFromSel('abc')).toEqual({ audio_off: false, audio_preset_id: null });
  });
});

describe('buildExerciseAudioPayload', () => {
  it('off=true → обнуляет preset+loop', () => {
    expect(buildExerciseAudioPayload({ audio_off: true, audio_preset_id: 5, audio_loop: true }))
      .toEqual({ audio_preset_id: null, audio_loop: false, audio_off: true });
  });
  it('preset+loop → проброс', () => {
    expect(buildExerciseAudioPayload({ audio_preset_id: 7, audio_loop: true }))
      .toEqual({ audio_preset_id: 7, audio_loop: true, audio_off: false });
  });
  it('loop без preset → loop false', () => {
    expect(buildExerciseAudioPayload({ audio_loop: true }))
      .toEqual({ audio_preset_id: null, audio_loop: false, audio_off: false });
  });
  it('пустая строка / null row → дефолт нет звука', () => {
    expect(buildExerciseAudioPayload({})).toEqual({ audio_preset_id: null, audio_loop: false, audio_off: false });
    expect(buildExerciseAudioPayload(null)).toEqual({ audio_preset_id: null, audio_loop: false, audio_off: false });
  });
  it('невалидный preset_id (0/строка) → null', () => {
    expect(buildExerciseAudioPayload({ audio_preset_id: 0 }).audio_preset_id).toBeNull();
    expect(buildExerciseAudioPayload({ audio_preset_id: 'x' }).audio_preset_id).toBeNull();
  });
});

describe('presetName', () => {
  const presets = [{ id: 3, name: 'Медитация' }, { id: 5, name: 'Музыка' }];
  it('находит имя по id (строка/число)', () => {
    expect(presetName(presets, 3)).toBe('Медитация');
    expect(presetName(presets, '5')).toBe('Музыка');
  });
  it('нет id / нет совпадения → ""', () => {
    expect(presetName(presets, null)).toBe('');
    expect(presetName(presets, 99)).toBe('');
  });
});
