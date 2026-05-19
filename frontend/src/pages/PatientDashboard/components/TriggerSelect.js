// =====================================================
// Wave 2 #2.05 — TriggerSelect
// Single-select chips для trigger_type (8 значений из backend CHECK enum).
// Отдельная секция от PainCharacterSelect (UX option 3A).
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import { TRIGGER_TYPE_OPTIONS } from '../constants/pain';
import './PainComponents.css';

export default function TriggerSelect({ value, onChange, required, error, disabled }) {
  return (
    <fieldset className="pd-pain-trigger">
      <legend className="pd-pain-trigger__legend">
        Когда возникает? {required && <span className="pd-pain-required">*</span>}
      </legend>
      <div className="pd-pain-trigger__chips" role="radiogroup">
        {TRIGGER_TYPE_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`pd-pain-trigger-chip ${isSelected ? 'pd-pain-trigger-chip--selected' : ''}`}
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

TriggerSelect.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  required: PropTypes.bool,
  error: PropTypes.string,
  disabled: PropTypes.bool,
};

TriggerSelect.defaultProps = {
  value: '',
  required: false,
};
