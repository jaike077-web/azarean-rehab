import React from 'react';
import PropTypes from 'prop-types';
import './Pill.css';

// Pill-кнопка (chip): компактный round button с опциональной lucide-иконкой.
// Используется для выбора варианта (single/multi-select), фильтров, тегов.
export default function Pill({
  children,
  active = false,
  color,
  Icon,
  onClick,
  style,
  className = '',
  type = 'button',
}) {
  const accent = color || 'var(--pd-color-primary)';
  const inlineStyle = active
    ? { background: accent, ...style }
    : style;
  return (
    <button
      type={type}
      onClick={onClick}
      className={`pd-pill ${active ? 'pd-pill--active' : ''} ${className}`}
      style={inlineStyle}
    >
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}

Pill.propTypes = {
  children: PropTypes.node,
  active: PropTypes.bool,
  color: PropTypes.string,
  Icon: PropTypes.elementType,
  onClick: PropTypes.func,
  style: PropTypes.object,
  className: PropTypes.string,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
};
