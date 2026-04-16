import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './ProgressRing.css';

export default function ProgressRing({
  value = 0,
  size = 140,
  strokeWidth = 12,
  label = '',
  sublabel = '',
  color = 'var(--pd-primary, #0D9488)',
  color2 = '#06B6D4',
}) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedValue / 100) * circumference;
  const gradientId = `ring-grad-${size}-${Math.random().toString(36).slice(2, 6)}`;

  useEffect(() => {
    // Запускаем анимацию после mount
    const timer = requestAnimationFrame(() => {
      setAnimatedValue(Math.min(100, Math.max(0, value)));
    });
    return () => cancelAnimationFrame(timer);
  }, [value]);

  return (
    <div className="pd-progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color2} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(13, 148, 136, 0.12)"
          strokeWidth={strokeWidth}
        />

        {/* Fill */}
        <circle
          className="pd-progress-ring-fill"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />

        {/* Percentage text */}
        <text
          x={center}
          y={sublabel ? center - 6 : center}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size >= 120 ? 26 : 18}
          fontWeight="800"
          fontFamily="'Manrope', sans-serif"
          fill="var(--pd-text, #171C2B)"
        >
          {Math.round(animatedValue)}%
        </text>

        {sublabel && (
          <text
            x={center}
            y={center + (size >= 120 ? 18 : 14)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size >= 120 ? 12 : 10}
            fontWeight="500"
            fontFamily="'Nunito Sans', sans-serif"
            fill="var(--pd-text2, #6B7280)"
          >
            {sublabel}
          </text>
        )}
      </svg>

      {label && (
        <div className="pd-progress-ring-label">{label}</div>
      )}
    </div>
  );
}

ProgressRing.propTypes = {
  value: PropTypes.number,
  size: PropTypes.number,
  strokeWidth: PropTypes.number,
  label: PropTypes.string,
  sublabel: PropTypes.string,
  color: PropTypes.string,
  color2: PropTypes.string,
};
