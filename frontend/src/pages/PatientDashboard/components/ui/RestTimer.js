import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Play, Pause, RotateCcw } from 'lucide-react';
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
}) {
  const [total, setTotal] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);

  // SVG circle params
  const size = 200;
  const strokeWidth = 8;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? remaining / total : 0;
  const offset = circumference * (1 - progress);

  const playBeep = useCallback(() => {
    try {
      if (!audioRef.current) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 300);
      }
    } catch { /* Аудио недоступно */ }

    // Вибрация (Android PWA)
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  }, []);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            playBeep();
            onComplete?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, remaining, playBeep, onComplete]);

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
      {/* Presets */}
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
};
