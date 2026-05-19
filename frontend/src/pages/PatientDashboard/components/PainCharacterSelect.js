// =====================================================
// Wave 2 Hot-fix #9 v2 — PainCharacterSelect multi-select
// =====================================================
// Backend хранит pain_character как TEXT[] (после migration 20260520).
// Multi нужен клинически: sharp + burning при cervical radiculopathy,
// throbbing + aching при vascular pathology и т.п.
//
// Props:
//   value: string[] — array of selected codes (default [])
//   onChange: (string[]) => void — receives new array on toggle
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import { PAIN_CHARACTER_OPTIONS } from '../constants/pain';
import './PainComponents.css';

export default function PainCharacterSelect({ value, onChange, error, disabled }) {
  const arr = Array.isArray(value) ? value : [];

  const toggle = (val) => {
    if (disabled) return;
    onChange(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  return (
    <fieldset className="pd-pain-character">
      <legend className="pd-pain-character__legend">Характер боли (можно несколько)</legend>
      <div className="pd-pain-character__chips" role="group">
        {PAIN_CHARACTER_OPTIONS.map((opt) => {
          const isSelected = arr.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={isSelected}
              className={`pd-pain-character-chip ${isSelected ? 'pd-pain-character-chip--selected' : ''}`}
              onClick={() => toggle(opt.value)}
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
  value: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  disabled: PropTypes.bool,
};

PainCharacterSelect.defaultProps = {
  value: [],
};
