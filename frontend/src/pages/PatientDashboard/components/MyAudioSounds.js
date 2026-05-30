// =====================================================
// MyAudioSounds (CA3) — секция «Мои звуки» в ProfileScreen
//
// Пациент грузит свой MP3/WAV на каждый звуковой cue раннера. 4 активных
// cue Phase 1 (count_tick/set_start/set_end/rest_end; tempo_tick — CP3b,
// в UI не показываем — decision #7). Каждая строка: статус (свой файл /
// стандартный тон), upload, preview (▶), сброс (✕).
//
// Стиль — pd-profile-* + inline (как остальной ProfileScreen), lucide-react.
// Preview — ЖЕСТ, тут new Audio() допустим (это НЕ cue-путь раннера). Кастом-
// playback в раннере (через AudioContext-буфер) — CA4.
// =====================================================

import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Play, Upload, Trash2, Loader2 } from 'lucide-react';
import { patientAuth } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useAudioCue, useAudioOverrides } from '../context/AudioContext';
import validateAudioFile from '../utils/validateAudioFile';

// 4 активных cue Phase 1 + RU-лейблы (decision #7).
const CUE_ROWS = [
  { cue: 'count_tick', label: 'Тики 3-2-1' },
  { cue: 'set_start', label: 'Старт подхода' },
  { cue: 'set_end', label: 'Конец подхода' },
  { cue: 'rest_end', label: 'Конец отдыха' },
];

const iconBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '1px solid var(--pd-border, #E5E5E5)',
  background: 'var(--pd-surface, #fff)',
  color: 'var(--pd-text, #171C2B)',
  flexShrink: 0,
  padding: 0,
};

export default function MyAudioSounds() {
  const toast = useToast();
  const { overrides, refresh, getOverride } = useAudioOverrides();
  const { cue, prime } = useAudioCue();
  const [busyCue, setBusyCue] = useState(null);
  const previewUrlRef = useRef(null);

  // Тянем список при монтировании секции.
  useEffect(() => { refresh(); }, [refresh]);

  // Подчистка objectURL превью при размонтировании.
  useEffect(() => () => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch (_) { /* ignore */ }
    }
  }, []);

  const handleFile = async (cueName, file) => {
    if (!file) return;
    const result = await validateAudioFile(file);
    if (!result.ok) {
      toast.error('Не подходит', result.error);
      return;
    }
    setBusyCue(cueName);
    try {
      const fd = new FormData();
      fd.append('cue_name', cueName);
      fd.append('file', file);
      await patientAuth.uploadSound(fd);
      await refresh();
      toast.success('Готово', 'Звук загружен');
    } catch (err) {
      toast.error('Ошибка', (err.response && err.response.data && err.response.data.message) || 'Не удалось загрузить');
    } finally {
      setBusyCue(null);
    }
  };

  const handleClear = async (cueName) => {
    setBusyCue(cueName);
    try {
      await patientAuth.deleteSound(cueName);
      await refresh();
      toast.success('Готово', 'Возвращён стандартный звук');
    } catch (err) {
      toast.error('Ошибка', (err.response && err.response.data && err.response.data.message) || 'Не удалось сбросить');
    } finally {
      setBusyCue(null);
    }
  };

  // Превью — жест. Свой звук → проигрываем файл (HTMLAudioElement, допустимо
  // вне cue-пути). Нет override → дефолтный осциллятор-тон (CP1 cue).
  const handlePreview = async (cueName) => {
    if (getOverride(cueName)) {
      try {
        const res = await patientAuth.fetchSoundBlob(cueName);
        if (previewUrlRef.current) {
          try { URL.revokeObjectURL(previewUrlRef.current); } catch (_) { /* ignore */ }
        }
        const url = URL.createObjectURL(res.data);
        previewUrlRef.current = url;
        const audio = new Audio(url);
        await audio.play();
      } catch (_) {
        toast.error('Ошибка', 'Не удалось воспроизвести');
      }
    } else {
      // Жест → надёжно резюмим AudioContext + играем стандартный тон.
      prime();
      cue(cueName);
    }
  };

  return (
    <div className="pd-profile-section">
      <div className="pd-profile-section-label">Мои звуки</div>
      <div className="pd-profile-section-card" data-testid="my-audio-sounds">
        {CUE_ROWS.map((row, i) => {
          const ov = getOverride(row.cue);
          const busy = busyCue === row.cue;
          return (
            <div
              key={row.cue}
              data-testid={`audio-row-${row.cue}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '12px 16px',
                borderTop: i > 0 ? '1px solid var(--pd-border, #EEEEEE)' : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--pd-text)' }}>{row.label}</div>
                <div
                  data-testid={`audio-state-${row.cue}`}
                  style={{
                    fontSize: 12,
                    color: ov ? 'var(--pd-primary, #0D9488)' : 'var(--pd-text-muted, #737373)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ov ? (ov.original_filename || 'свой звук') : 'стандартный тон'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  style={iconBtn}
                  onClick={() => handlePreview(row.cue)}
                  data-testid={`audio-preview-${row.cue}`}
                  aria-label="Прослушать"
                  disabled={busy}
                >
                  <Play size={16} />
                </button>

                <label
                  style={{ ...iconBtn, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                  data-testid={`audio-upload-${row.cue}`}
                  aria-label="Загрузить свой звук"
                >
                  {busy ? <Loader2 size={16} /> : <Upload size={16} />}
                  <input
                    type="file"
                    accept=".mp3,.wav,audio/mpeg,audio/wav"
                    data-testid={`audio-input-${row.cue}`}
                    style={{ display: 'none' }}
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      e.target.value = ''; // позволяет повторно выбрать тот же файл
                      handleFile(row.cue, file);
                    }}
                  />
                </label>

                {ov && (
                  <button
                    type="button"
                    style={{ ...iconBtn, color: 'var(--pd-accent-warm, #F97316)' }}
                    onClick={() => handleClear(row.cue)}
                    data-testid={`audio-clear-${row.cue}`}
                    aria-label="Вернуть стандартный звук"
                    disabled={busy}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="pd-profile-section-hint">
        Свой звук на сигнал в тренировке (MP3 или WAV, до 5 секунд и 512 КБ).
        Действует на всех ваших устройствах.
      </div>
    </div>
  );
}

MyAudioSounds.propTypes = {
  // Без props — читает overrides из AudioProvider.
};
