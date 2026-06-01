// =====================================================
// ExerciseAudioControl (EA4) — компактный per-упражнение контрол трек-звука
// в редакторе комплекса (CreateComplex / EditComplex, admin-only).
// 3-way: наследовать (дефолт библиотеки) / без звука / конкретный трек + цикл.
// Зеркало паттерна ComplexCueSounds. onChange(patch) — мердж в строку упражнения.
// =====================================================
import React from 'react';
import { Play } from 'lucide-react';
import s from './ExerciseAudioControl.module.css';
import { exerciseAudioSel, patchFromSel, presetName } from '../utils/exerciseAudio';

export default function ExerciseAudioControl({ row, presets = [], onChange, onPreview }) {
  const sel = exerciseAudioSel(row);
  const isTrack = sel !== 'inherit' && sel !== 'off';
  const selKnown = !isTrack || presets.some((p) => String(p.id) === sel);

  const libName = presetName(presets, row && row.lib_audio_preset_id);
  const inheritLabel = libName
    ? `Наследовать (библиотека: ${libName})`
    : (row && row.lib_audio_preset_id != null
      ? 'Наследовать (трек из библиотеки)'
      : 'Наследовать (нет трека)');

  const previewId = isTrack ? Number(sel) : null;

  return (
    <div className={s.row}>
      <span className={s.label}>Звук упр.:</span>
      <select
        className={s.select}
        data-testid="exercise-audio-select"
        value={sel}
        onChange={(e) => onChange(patchFromSel(e.target.value))}
        aria-label="Звук упражнения"
      >
        <option value="inherit">{inheritLabel}</option>
        <option value="off">Без звука</option>
        {!selKnown && <option value={sel}>Трек #{sel}</option>}
        {presets.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.is_active === false ? `${p.name} (неактивен)` : p.name}
          </option>
        ))}
      </select>
      {onPreview && (
        <button
          type="button"
          className={s.preview}
          data-testid="exercise-audio-preview"
          disabled={previewId == null}
          onClick={() => onPreview(previewId)}
          title="Прослушать"
        >
          <Play size={14} />
        </button>
      )}
      <label className={s.loop} title="Зациклить трек на всё упражнение">
        <input
          type="checkbox"
          data-testid="exercise-audio-loop"
          disabled={!isTrack}
          checked={isTrack && !!(row && row.audio_loop)}
          onChange={(e) => onChange({ audio_loop: e.target.checked })}
        />
        <span>цикл</span>
      </label>
    </div>
  );
}
