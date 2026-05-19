// =====================================================
// Wave 2 #2.05 — PainCharacterSelect
// Single-select chips для pain_character (6 значений из backend CHECK enum).
// ВАЖНО: backend хранит pain_character как VARCHAR(50) single value
// (verify-step 2.04 drift #9 — НЕ массив, как ассумит TZ 2.05 v1).
// Отдельная секция от TriggerSelect (UX option 3A — обе всегда видны).
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import { PAIN_CHARACTER_OPTIONS } from '../constants/pain';
import './PainComponents.css';

export default function PainCharacterSelect({ value, onChange, error, disabled }) {
  return (
    <fieldset className="pd-pain-character">
      <legend className="pd-pain-character__legend">Характер боли (опционально)</legend>
      <div className="pd-pain-character__chips" role="radiogroup">
        {PAIN_CHARACTER_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`pd-pain-character-chip ${isSelected ? 'pd-pain-character-chip--selected' : ''}`}
              onClick={() => !disabled && onChange(isSelected ? '' : opt.value)}
              disabled={disabled}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && <div className="pd-pain-error">{error}</div>}
    </fieldset>
  );
}

PainCharacterSelect.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  disabled: PropTypes.bool,
};

PainCharacterSelect.defaultProps = {
  value: '',
};
