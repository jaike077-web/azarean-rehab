import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useAudioCue } from '../../context/AudioContext';
import './RestTimer.css';

const DEFAULT_PRESETS = [30, 60, 90, 120];

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function RestTimer({
  defaultSeconds = 60,
  presets = DEFAULT_PRESETS,
  onComplete,
  autoStart = false,
  hidePresets = false,
}) {
  const [total, setTotal] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  // CP3a.1: autoStart=true → таймер стартует сразу при mount (per-set
  // авто-отдых из ExerciseRunner). По умолчанию false — ручной режим (как было).
  const [running, setRunning] = useState(autoStart);
  const intervalRef = useRef(null);
  const { cue } = useAudioCue();

  // DA2: SVG ring 200→170 — консистентность с PhaseRing (тот же размер на всех
  // фазах). Цифра 48px остаётся, вмещается в 170.
  const size = 170;
  const strokeWidth = 8;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? remaining / total : 0;
  const offset = circumference * (1 - progress);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            // CP1: legacy локальный playBeep заменён на shared cue('rest_end').
            // Тон 880Hz / 300ms / gain 0.3 сохранён 1:1 в getCueConfig('rest_end').
            // Молчит при azarean_audio.enabled=false (намеренно).
            cue('rest_end');
            // Вибрация — без изменений: всегда работает (Android PWA fallback
            // когда звук выключен / устройство в беззвучном режиме).
            if (navigator.vibrate) {
              navigator.vibrate([50, 50, 50]);
            }
            onComplete?.();
            return 0;
          }
          // WARN (2026-05-29): pre-end бип cue('count_tick'), когда отдых
          // ДОСТИГАЕТ 10 и 5 секунд (как авто per-set rest, так и ручной
          // preset — оба обратные отсчёты с известным концом). Тот же
          // принцип, что rest_end на «0». Монотонный отсчёт → один раз на
          // порог. rest <10с не даёт 10-бип, <5с — ни одного. Молчит при
          // azarean_audio.enabled=false (gate внутри cue).
          const next = prev - 1;
          if (next === 10 || next === 5) cue('count_tick');
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, remaining, cue, onComplete]);

  const handlePreset = (sec) => {
    clearInterval(intervalRef.current);
    setTotal(sec);
    setRemaining(sec);
    setRunning(false);
  };

  const handleReset = () => {
    clearInterval(intervalRef.current);
    setRemaining(total);
    setRunning(false);
  };

  const toggleRunning = () => {
    setRunning(prev => !prev);
  };

  return (
    <div className="pd-rest-timer">
      {/* DA2: presets скрыты в auto-rest (per-set фиксированный rest_seconds —
          presets избыточны). Остаются для ручного rep-only режима. Код
          presets НЕ удалён, только скрыт через prop — easy revert. */}
      {!hidePresets && (
        <div className="pd-rest-timer-presets">
          {presets.map(sec => (
            <button
              key={sec}
              type="button"
              className={`pd-rest-timer-preset ${total === sec ? 'pd-rest-timer-preset--active' : ''}`}
              onClick={() => handlePreset(sec)}
            >
              {sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}с`}
            </button>
          ))}
        </div>
      )}

      {/* Circular timer */}
      <div className="pd-rest-timer-ring">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="var(--pd-neutral-200, #E5E5E5)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="var(--pd-primary, #0D9488)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: running ? 'stroke-dashoffset 1s linear' : 'none' }}
          />
          <text
            x={center} y={center - 8}
            textAnchor="middle" dominantBaseline="central"
            fontSize="48" fontWeight="700"
            fontFamily="'Manrope', sans-serif"
            fill="var(--pd-text, #171C2B)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatTime(remaining)}
          </text>
          <text
            x={center} y={center + 28}
            textAnchor="middle" dominantBaseline="central"
            fontSize="14" fontWeight="500"
            fontFamily="'Nunito Sans', sans-serif"
            fill="var(--pd-neutral-500, #737373)"
          >
            Отдых
          </text>
        </svg>
      </div>

      {/* Controls */}
      <div className="pd-rest-timer-controls">
        <button
          type="button"
          className="pd-rest-timer-ctrl pd-rest-timer-ctrl--reset"
          onClick={handleReset}
          aria-label="Сбросить таймер"
        >
          <RotateCcw size={20} />
        </button>
        <button
          type="button"
          className={`pd-rest-timer-ctrl pd-rest-timer-ctrl--main ${running ? 'pd-rest-timer-ctrl--pause' : ''}`}
          onClick={toggleRunning}
          aria-label={running ? 'Пауза' : 'Старт'}
        >
          {running ? <Pause size={24} /> : <Play size={24} />}
        </button>
      </div>
    </div>
  );
}

RestTimer.propTypes = {
  defaultSeconds: PropTypes.number,
  presets: PropTypes.arrayOf(PropTypes.number),
  onComplete: PropTypes.func,
  autoStart: PropTypes.bool,
  hidePresets: PropTypes.bool,
};
