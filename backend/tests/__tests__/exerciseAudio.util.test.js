// Unit-тесты чистых helper'ов utils/exerciseAudio (EA3).
// normalizeExerciseAudio — без БД; validateTrackPresetIds — с фейковым query.
const {
  normalizeExerciseAudio,
  validateTrackPresetIds,
  RESOLVED_EXERCISE_AUDIO_SQL,
  EXERCISE_AUDIO_JOINS,
} = require('../../utils/exerciseAudio');

describe('normalizeExerciseAudio', () => {
  it('audio_off=true → обнуляет preset+loop (off wins даже при заданном пресете)', () => {
    expect(normalizeExerciseAudio({ audio_off: true, audio_preset_id: 5, audio_loop: true }))
      .toEqual({ audioPresetId: null, audioLoop: false, audioOff: true });
  });

  it('audio_off строкой "true" → тоже off', () => {
    expect(normalizeExerciseAudio({ audio_off: 'true', audio_preset_id: 5 }).audioOff).toBe(true);
  });

  it('пресет + loop=true → {id, true, false}', () => {
    expect(normalizeExerciseAudio({ audio_preset_id: 7, audio_loop: true }))
      .toEqual({ audioPresetId: 7, audioLoop: true, audioOff: false });
  });

  it('пресет без loop → loop=false', () => {
    expect(normalizeExerciseAudio({ audio_preset_id: 7 }))
      .toEqual({ audioPresetId: 7, audioLoop: false, audioOff: false });
  });

  it('loop=true БЕЗ пресета → loop игнорируется (false)', () => {
    expect(normalizeExerciseAudio({ audio_loop: true }))
      .toEqual({ audioPresetId: null, audioLoop: false, audioOff: false });
  });

  it('нет audio-полей → всё дефолтно (нет звука)', () => {
    expect(normalizeExerciseAudio({ exercise_id: 1, order_number: 1 }))
      .toEqual({ audioPresetId: null, audioLoop: false, audioOff: false });
  });

  it('невалидный preset_id (0/строка/отрицательный) → null', () => {
    expect(normalizeExerciseAudio({ audio_preset_id: 0 }).audioPresetId).toBeNull();
    expect(normalizeExerciseAudio({ audio_preset_id: -3 }).audioPresetId).toBeNull();
    expect(normalizeExerciseAudio({ audio_preset_id: 'abc' }).audioPresetId).toBeNull();
  });

  it('preset_id строкой "7" → 7 (числовая коэрсия)', () => {
    expect(normalizeExerciseAudio({ audio_preset_id: '7', audio_loop: 'true' }))
      .toEqual({ audioPresetId: 7, audioLoop: true, audioOff: false });
  });
});

describe('validateTrackPresetIds', () => {
  it('пустой/all-null набор → ok, query НЕ вызван', async () => {
    const q = jest.fn();
    expect(await validateTrackPresetIds(q, [null, null])).toEqual({ ok: true });
    expect(await validateTrackPresetIds(q, [])).toEqual({ ok: true });
    expect(q).not.toHaveBeenCalled();
  });

  it('все валидные track-пресеты → ok', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [{ id: 5 }, { id: 9 }] });
    const r = await validateTrackPresetIds(q, [5, 9, null, 5]);
    expect(r).toEqual({ ok: true });
    // дедуп: уникальные [5,9]; SQL фильтрует kind='track' AND is_active.
    expect(q.mock.calls[0][0]).toMatch(/kind = 'track'/);
    expect(q.mock.calls[0][0]).toMatch(/is_active = TRUE/);
    expect(q.mock.calls[0][1]).toEqual([[5, 9]]);
  });

  it('один отсутствует/не track → ok:false с упоминанием id', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [{ id: 5 }] }); // 9 не вернулся
    const r = await validateTrackPresetIds(q, [5, 9]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/9/);
  });
});

describe('SQL-константы резолва', () => {
  it('RESOLVED_EXERCISE_AUDIO_SQL: приоритет off → ce-preset → lib-preset, только track+active', () => {
    expect(RESOLVED_EXERCISE_AUDIO_SQL).toMatch(/WHEN ce\.audio_off THEN NULL/);
    expect(RESOLVED_EXERCISE_AUDIO_SQL).toMatch(/ce\.audio_preset_id IS NOT NULL/);
    expect(RESOLVED_EXERCISE_AUDIO_SQL).toMatch(/e\.audio_preset_id IS NOT NULL/);
    expect(RESOLVED_EXERCISE_AUDIO_SQL).toMatch(/ap_ce\.is_active AND ap_ce\.kind = 'track'/);
    expect(RESOLVED_EXERCISE_AUDIO_SQL).toMatch(/ap_e\.is_active AND ap_e\.kind = 'track'/);
    expect(RESOLVED_EXERCISE_AUDIO_SQL).toMatch(/'sig', ap_ce\.updated_at/);
  });

  it('EXERCISE_AUDIO_JOINS: оба LEFT JOIN (ap_ce/ap_e)', () => {
    expect(EXERCISE_AUDIO_JOINS).toMatch(/LEFT JOIN audio_presets ap_ce ON ap_ce\.id = ce\.audio_preset_id/);
    expect(EXERCISE_AUDIO_JOINS).toMatch(/LEFT JOIN audio_presets ap_e\s+ON ap_e\.id\s+= e\.audio_preset_id/);
  });
});
