import React from 'react';
import PropTypes from 'prop-types';
import './AnimatedCheckmark.css';

export default function AnimatedCheckmark({ size = 80, color = 'var(--pd-success, #22C55E)', delay = 0 }) {
  const center = size / 2;
  const r = size * 0.38;

  return (
    <svg
      className="pd-animated-checkmark"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <circle
        className="pd-checkmark-circle"
        cx={center}
        cy={center}
        r={r}
        fill={`${color}15`}
        stroke={color}
        strokeWidth={3}
        style={{ animationDelay: `${delay}ms` }}
      />
      <polyline
        className="pd-checkmark-check"
        points={`${size * 0.28} ${size * 0.5} ${size * 0.44} ${size * 0.64} ${size * 0.72} ${size * 0.36}`}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="40"
        strokeDashoffset="40"
        style={{ animationDelay: `${delay + 200}ms` }}
      />
    </svg>
  );
}

AnimatedCheckmark.propTypes = {
  size: PropTypes.number,
  color: PropTypes.string,
  delay: PropTypes.number,
};
