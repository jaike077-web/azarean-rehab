import React from 'react';
import PropTypes from 'prop-types';
import './DifficultyScale.css';

const RPE_GROUPS = [
  { label: 'Легко', range: [1, 2, 3], className: 'pd-rpe-lo', color: 'var(--pd-success, #22C55E)' },
  { label: 'Средне', range: [4, 5, 6], className: 'pd-rpe-md', color: 'var(--pd-warning, #F59E0B)' },
  { label: 'Тяжело', range: [7, 8], className: 'pd-rpe-hi', color: 'var(--pd-accent-warm, #F97316)' },
  { label: 'Предел', range: [9, 10], className: 'pd-rpe-mx', color: 'var(--pd-error, #EF4444)' },
];

export default function DifficultyScale({ value, onChange, disabled = false }) {
  return (
    <div className="pd-difficulty-scale" role="group" aria-label="Шкала сложности">
      <div className="pd-difficulty-groups">
        {RPE_GROUPS.map(group => (
          <div key={group.label} className={`pd-difficulty-group ${group.className}`}>
            <div className="pd-difficulty-group-label">{group.label}</div>
            <div className="pd-difficulty-group-buttons">
              {group.range.map(n => {
                const isSelected = value === n;
                return (
                  <button
                    key={n}
                    type="button"
                    className={`pd-difficulty-btn ${isSelected ? 'pd-difficulty-btn--selected' : ''}`}
                    style={{
                      '--group-color': group.color,
                      backgroundColor: isSelected ? group.color : 'transparent',
                      borderColor: isSelected ? group.color : 'var(--pd-neutral-300, #D4D4D4)',
                      color: isSelected ? '#fff' : 'var(--pd-neutral-600, #525252)',
                    }}
                    onClick={() => !disabled && onChange(n)}
                    disabled={disabled}
                    aria-label={`Сложность ${n} из 10 — ${group.label}`}
                    aria-pressed={isSelected}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

DifficultyScale.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
