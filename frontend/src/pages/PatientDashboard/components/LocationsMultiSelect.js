// =====================================================
// Wave 2 #2.05 — LocationsMultiSelect
// Chips для выбора локаций боли (multi-select). Red-flag локации
// получают AlertTriangle иконку + coral border (UX option 1A).
// Не использует shared ChipGroup т.к. нужна special red-flag индикация.
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle } from 'lucide-react';
import './PainComponents.css';

export default function LocationsMultiSelect({ locations, value, onChange, error, disabled }) {
  const toggle = (code) => {
    if (disabled) return;
    const next = value.includes(code) ? value.filter((c) => c !== code) : [...value, code];
    onChange(next);
  };

  return (
    <div className="pd-pain-locations">
      <div className="pd-pain-locations__chips" role="group" aria-label="Локации боли">
        {locations.map((loc) => {
          const isSelected = value.includes(loc.code);
          const cls = [
            'pd-pain-loc-chip',
            isSelected ? 'pd-pain-loc-chip--selected' : '',
            loc.is_red_flag ? 'pd-pain-loc-chip--redflag' : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={loc.code}
              type="button"
              className={cls}
              onClick={() => toggle(loc.code)}
              aria-pressed={isSelected}
              disabled={disabled}
            >
              {loc.is_red_flag && (
                <AlertTriangle size={14} aria-label="Локация требует внимания" />
              )}
              <span>{loc.label}</span>
            </button>
          );
        })}
      </div>
      {error && <div className="pd-pain-error">{error}</div>}
    </div>
  );
}

LocationsMultiSelect.propTypes = {
  locations: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      is_red_flag: PropTypes.bool,
    })
  ).isRequired,
  value: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  error: PropTypes.string,
  disabled: PropTypes.bool,
};
