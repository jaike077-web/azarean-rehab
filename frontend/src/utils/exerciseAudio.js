// =====================================================
// Exercise Audio (EA4) — чистые helper'ы для per-упражнение трек-звука.
// Зеркало backend utils/exerciseAudio.js (резолв) на уровне формы комплекса.
//
// Состояние строки упражнения несёт: audio_preset_id (override|null),
// audio_loop (bool), audio_off (bool) + lib_audio_preset_id/lib_audio_loop
// (дефолт библиотеки, для метки «наследовать»). 3-way селектор:
//   'inherit' — наследовать дефолт библиотеки (off=false, override=null);
//   'off'     — выключить здесь (off=true);
//   '<id>'    — перебить конкретным треком (off=false, override=id).
// Pure functions (Rule #37).
// =====================================================

/** Значение 3-way селектора из строки упражнения. */
export function exerciseAudioSel(row) {
  if (row && row.audio_off === true) return 'off';
  if (row && row.audio_preset_id != null) return String(row.audio_preset_id);
  return 'inherit';
}

/** Патч полей строки при смене селектора (loop сбрасываем когда не трек). */
export function patchFromSel(sel) {
  if (sel === 'off') return { audio_off: true, audio_preset_id: null, audio_loop: false };
  if (sel === 'inherit') return { audio_off: false, audio_preset_id: null, audio_loop: false };
  const n = Number(sel);
  return { audio_off: false, audio_preset_id: Number.isInteger(n) && n > 0 ? n : null };
}

/**
 * Нормализованный audio-payload строки для POST/PUT /complexes.
 * off=true → обнуляет preset+loop (бэкстоп CHECK'ов chk_ce_audio_off_*).
 * loop осмыслен только при заданном override-preset.
 */
export function buildExerciseAudioPayload(row) {
  const off = row && row.audio_off === true;
  if (off) return { audio_preset_id: null, audio_loop: false, audio_off: true };
  const raw = row ? row.audio_preset_id : null;
  const n = Number(raw);
  const pid = raw != null && Number.isInteger(n) && n > 0 ? n : null;
  const loop = pid != null && (row.audio_loop === true);
  return { audio_preset_id: pid, audio_loop: loop, audio_off: false };
}

/** Имя пресета по id из списка (для метки), '' если нет. */
export function presetName(presets, id) {
  if (id == null) return '';
  const p = (presets || []).find((x) => String(x.id) === String(id));
  return p ? p.name : '';
}
