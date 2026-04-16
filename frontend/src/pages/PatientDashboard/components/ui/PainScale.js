import React from 'react';
import PropTypes from 'prop-types';
import './PainScale.css';

const PAIN_LABELS = [
  'Нет боли', 'Минимальная', 'Слабая', 'Лёгкая', 'Умеренная',
  'Средняя', 'Сильная', 'Очень сильная', 'Интенсивная', 'Мучительная', 'Невыносимая'
];

const PAIN_COLORS = [
  '#22C55E', '#4ADE80', '#86EFAC', '#BEF264', '#FDE047',
  '#FBBF24', '#F59E0B', '#F97316', '#EF4444', '#DC2626', '#991B1B'
];

const ANCHOR_EMOJIS = { 0: '😊', 5: '😐', 10: '😣' };

export default function PainScale({ value, onChange, showEmoji = true, disabled = false }) {
  return (
    <div className="pd-pain-scale" role="group" aria-label="Шкала боли">
      <div className="pd-pain-scale-buttons">
        {Array.from({ length: 11 }, (_, i) => {
          const isSelected = value === i;
          const color = PAIN_COLORS[i];
          return (
            <button
              key={i}
              type="button"
              className={`pd-pain-scale-btn ${isSelected ? 'pd-pain-scale-btn--selected' : ''}`}
              style={{
                '--btn-color': color,
                backgroundColor: isSelected ? color : 'transparent',
                borderColor: isSelected ? color : 'var(--pd-neutral-300, #D4D4D4)',
                color: isSelected ? '#fff' : 'var(--pd-neutral-600, #525252)',
              }}
              onClick={() => !disabled && onChange(i)}
              disabled={disabled}
              aria-label={`Уровень боли ${i} из 10`}
              aria-pressed={isSelected}
            >
              {i}
            </button>
          );
        })}
      </div>

      {showEmoji && (
        <div className="pd-pain-scale-anchors">
          {Object.entries(ANCHOR_EMOJIS).map(([idx, emoji]) => (
            <span key={idx} className="pd-pain-scale-anchor" style={{ left: `${(idx / 10) * 100}%` }}>
              {emoji}
            </span>
          ))}
        </div>
      )}

      {value !== null && value !== undefined && (
        <div className="pd-pain-scale-label" style={{ color: PAIN_COLORS[value] }}>
          {value} — {PAIN_LABELS[value]}
        </div>
      )}
    </div>
  );
}

PainScale.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  showEmoji: PropTypes.bool,
  disabled: PropTypes.bool,
};
