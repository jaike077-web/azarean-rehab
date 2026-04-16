import React from 'react';
import PropTypes from 'prop-types';
import './PainScale.css';

const PAIN_LABELS = [
  'Нет', 'Мин.', 'Лёгкая', 'Терпимо', 'Умерен.',
  'Средняя', 'Ощутимо', 'Сильная', 'Очень', 'Мучит.', 'Нест.'
];

const PAIN_COLORS = [
  '#10B981', '#34D399', '#6EE7B7', '#A3E635', '#FACC15',
  '#F59E0B', '#F97316', '#EF4444', '#DC2626', '#B91C1C', '#7F1D1D'
];

export default function PainScale({ value, onChange, showEmoji = false, disabled = false }) {
  return (
    <div className="pd-pain-scale" role="group" aria-label="Шкала боли">
      <div className="pd-pain-scale-buttons">
        {Array.from({ length: 11 }, (_, i) => {
          const isSelected = value === i;
          const color = PAIN_COLORS[i];
          const hasValue = value !== null && value !== undefined;
          return (
            <button
              key={i}
              type="button"
              className={`pd-pain-scale-btn ${isSelected ? 'pd-pain-scale-btn--selected' : ''}`}
              style={{
                backgroundColor: isSelected ? color : hasValue ? `${color}18` : undefined,
                color: isSelected ? '#fff' : 'var(--pd-n500, #64748B)',
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

      {value !== null && value !== undefined && (
        <div className="pd-pain-scale-label" style={{ color: PAIN_COLORS[value] }}>
          {PAIN_LABELS[value]}
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
