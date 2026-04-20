import React from 'react';
import PropTypes from 'prop-types';
import './Switch.css';

// Toggle-switch (iOS-style). Управляемый компонент.
// `on` — состояние, `onTap` — toggle-handler. Если `disabled` — серый, не реагирует.
export default function Switch({ on, onTap, disabled = false, ariaLabel }) {
  const handleClick = () => {
    if (disabled || !onTap) return;
    onTap(!on);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={`pd-switch ${on ? 'pd-switch--on' : ''} ${disabled ? 'pd-switch--disabled' : ''}`}
      onClick={handleClick}
    >
      <span className="pd-switch-knob" />
    </button>
  );
}

Switch.propTypes = {
  on: PropTypes.bool,
  onTap: PropTypes.func,
  disabled: PropTypes.bool,
  ariaLabel: PropTypes.string,
};
