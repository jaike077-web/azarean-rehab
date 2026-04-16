import React from 'react';
import PropTypes from 'prop-types';
import './ChipGroup.css';

export default function ChipGroup({ options, selected, onChange, multi = false }) {
  const selectedArr = Array.isArray(selected) ? selected : (selected != null ? [selected] : []);

  const handleClick = (val) => {
    if (multi) {
      const next = selectedArr.includes(val)
        ? selectedArr.filter(v => v !== val)
        : [...selectedArr, val];
      onChange(next);
    } else {
      onChange(selectedArr.includes(val) ? null : val);
    }
  };

  return (
    <div className="pd-chip-group-v2" role="group">
      {options.map(opt => {
        const val = opt.value ?? opt.id ?? opt.val;
        const isSelected = selectedArr.includes(val);
        return (
          <button
            key={val}
            type="button"
            className={`pd-chip-v2 ${isSelected ? 'pd-chip-v2--active' : ''}`}
            onClick={() => handleClick(val)}
            aria-pressed={isSelected}
          >
            {opt.icon && <span className="pd-chip-v2-icon">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

ChipGroup.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.any,
    id: PropTypes.any,
    val: PropTypes.any,
    icon: PropTypes.node,
  })).isRequired,
  selected: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  multi: PropTypes.bool,
};
