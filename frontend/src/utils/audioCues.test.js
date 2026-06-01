// =====================================================
// TESTS: audioCues (AA4) — pure-хелперы cue-состояния секции «Звуки комплекса».
// Rule #37: named pure helpers тестируются без браузера/сети.
// =====================================================

import {
  AUDIO_CUE_UI,
  CUE_LABELS,
  emptyCueState,
  cueStateFromBindings,
  buildCueSoundsPayload,
} from './audioCues';

describe('audioCues', () => {
  it('AUDIO_CUE_UI = 4 UI-cue, CUE_LABELS покрывает каждый', () => {
    expect(AUDIO_CUE_UI).toEqual(['count_tick', 'set_start', 'set_end', 'rest_end']);
    AUDIO_CUE_UI.forEach((c) => expect(typeof CUE_LABELS[c]).toBe('string'));
  });

  it('emptyCueState — все cue inherit/unlocked', () => {
    const st = emptyCueState();
    expect(Object.keys(st)).toEqual(AUDIO_CUE_UI);
    AUDIO_CUE_UI.forEach((c) => expect(st[c]).toEqual({ sel: 'inherit', locked: false }));
  });

  it('cueStateFromBindings: preset_id → строковый sel, null → tone, отсутствие → inherit', () => {
    const st = cueStateFromBindings([
      { cue_name: 'set_start', preset_id: 7, is_locked: true },
      { cue_name: 'set_end', preset_id: null, is_locked: false },
    ]);
    expect(st.set_start).toEqual({ sel: '7', locked: true });
    expect(st.set_end).toEqual({ sel: 'tone', locked: false });
    expect(st.count_tick).toEqual({ sel: 'inherit', locked: false });
    expect(st.rest_end).toEqual({ sel: 'inherit', locked: false });
  });

  it('cueStateFromBindings игнорирует неизвестные cue (tempo_tick) и null-элементы', () => {
    const st = cueStateFromBindings([{ cue_name: 'tempo_tick', preset_id: 3 }, null]);
    expect(Object.keys(st)).toEqual(AUDIO_CUE_UI);
    expect(st.count_tick).toEqual({ sel: 'inherit', locked: false });
  });

  it('cueStateFromBindings(undefined) → emptyCueState', () => {
    expect(cueStateFromBindings(undefined)).toEqual(emptyCueState());
  });

  it('cueStateFromBindings: неактивный привязанный пресет → tone (не блокирует re-save)', () => {
    const st = cueStateFromBindings([
      { cue_name: 'set_start', preset_id: 5, is_locked: true, preset_is_active: false },
      { cue_name: 'set_end', preset_id: 6, is_locked: false, preset_is_active: true },
    ]);
    expect(st.set_start).toEqual({ sel: 'tone', locked: true });
    expect(st.set_end).toEqual({ sel: '6', locked: false });
  });

  it('buildCueSoundsPayload: inherit опускается, tone→null, id→Number, lock booleanized', () => {
    const payload = buildCueSoundsPayload({
      count_tick: { sel: 'inherit', locked: false },
      set_start: { sel: '7', locked: true },
      set_end: { sel: 'tone', locked: false },
      rest_end: { sel: '2', locked: false },
    });
    expect(payload).toEqual([
      { cue_name: 'set_start', preset_id: 7, is_locked: true },
      { cue_name: 'set_end', preset_id: null, is_locked: false },
      { cue_name: 'rest_end', preset_id: 2, is_locked: false },
    ]);
  });

  it('buildCueSoundsPayload пустой при всех inherit', () => {
    expect(buildCueSoundsPayload(emptyCueState())).toEqual([]);
  });

  it('round-trip: bindings → state → payload эквивалентен исходным привязкам', () => {
    const bindings = [
      { cue_name: 'set_start', preset_id: 7, is_locked: true },
      { cue_name: 'rest_end', preset_id: null, is_locked: false },
    ];
    expect(buildCueSoundsPayload(cueStateFromBindings(bindings))).toEqual([
      { cue_name: 'set_start', preset_id: 7, is_locked: true },
      { cue_name: 'rest_end', preset_id: null, is_locked: false },
    ]);
  });
});
