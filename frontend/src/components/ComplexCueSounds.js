// =====================================================
// ComplexCueSounds (AA4) — секция «Звуки комплекса» в конструкторе.
//
// Контролируемый компонент: родитель держит cueState (cue → {sel, locked}),
// передаёт его + onChange. Payload собирается родителем через
// buildCueSoundsPayload(cueState) (utils/audioCues) на submit.
//
// 3-way выбор на каждый из 4 cue:
//   'inherit' — наследовать дом-карту студии (строка cue не отправляется);
//   'tone'    — «явный тон» (preset_id=null, перебивает дом-карту назад на тон);
//   '<id>'    — конкретный пресет из библиотеки.
// Чекбокс lock («запретить пациенту менять») активен только когда выбран не-inherit.
//
// Рендерится только для админа (gate в CreateComplex/EditComplex) — библиотека
// пресетов admin-only.
// =====================================================

import React from 'react';
import { Volume2, Play } from 'lucide-react';
import { AUDIO_CUE_UI, CUE_LABELS } from '../utils/audioCues';
import s from './ComplexCueSounds.module.css';

// onPreview(presetId) — опц. колбэк прослушки (родитель прокидывает useAudioPreview).
// Кнопка ▶ рендерится только если onPreview передан (тесты без него не меняются).
function ComplexCueSounds({ cueState, onChange, presets = [], defaults = [], onPreview }) {
  const setRow = (cue, patch) =>
    onChange({ ...cueState, [cue]: { ...(cueState[cue] || { sel: 'inherit', locked: false }), ...patch } });

  return (
    <div className={s.cueSoundsSection} data-testid="complex-cue-sounds">
      <p className={s.cueSoundsHint}>
        <Volume2 size={14} strokeWidth={1.8} /> Звук срабатывает у пациента в момент события.
        «Наследовать» берёт дом-звук студии; «Запретить менять» — пациент не сможет
        переопределить своим звуком.
      </p>
      {AUDIO_CUE_UI.map((cue) => {
        const row = cueState[cue] || { sel: 'inherit', locked: false };
        const def = defaults.find((d) => d.cue_name === cue);
        const inheritLabel = def && def.preset_id != null && def.preset_name
          ? `Наследовать (дом-звук: ${def.preset_name})`
          : 'Наследовать (дом-звук: стандартный тон)';
        // Если выбранный пресет не пришёл в список (деградация загрузки пресетов) —
        // показываем fallback-опцию, чтобы <select> не отображал чужое значение.
        const selKnown = row.sel === 'inherit' || row.sel === 'tone'
          || presets.some((p) => String(p.id) === row.sel);
        // Эффективный пресет для прослушки: tone → нет; inherit → дом-звук cue
        // (может быть тон → нет); конкретный пресет → его id.
        const previewId = row.sel === 'tone'
          ? null
          : row.sel === 'inherit'
            ? (def && def.preset_id != null ? def.preset_id : null)
            : Number(row.sel);
        return (
          <div key={cue} className={s.cueSoundsRow}>
            <label className={s.cueSoundsLabel} htmlFor={`cue-sound-select-${cue}`}>
              {CUE_LABELS[cue]}
            </label>
            <select
              id={`cue-sound-select-${cue}`}
              data-testid={`cue-sound-select-${cue}`}
              value={row.sel}
              onChange={(e) => setRow(cue, { sel: e.target.value })}
            >
              <option value="inherit">{inheritLabel}</option>
              <option value="tone">Стандартный тон</option>
              {!selKnown && <option value={row.sel}>Пресет #{row.sel}</option>}
              {presets.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.is_active === false ? `${p.name} (неактивен)` : p.name}
                </option>
              ))}
            </select>
            {onPreview && (
              <button
                type="button"
                className={s.cueSoundsPreview}
                data-testid={`cue-sound-preview-${cue}`}
                title="Прослушать выбранный звук"
                aria-label={`Прослушать звук для «${CUE_LABELS[cue]}»`}
                disabled={previewId == null}
                onClick={() => onPreview(previewId)}
              >
                <Play size={14} strokeWidth={1.8} />
              </button>
            )}
            <label className={s.cueSoundsLock}>
              <input
                type="checkbox"
                data-testid={`cue-sound-lock-${cue}`}
                checked={!!row.locked}
                disabled={row.sel === 'inherit'}
                onChange={(e) => setRow(cue, { locked: e.target.checked })}
              />{' '}
              Запретить менять
            </label>
          </div>
        );
      })}
    </div>
  );
}

export default ComplexCueSounds;
