import React from 'react';
import PropTypes from 'prop-types';
import './Section.css';

// Заголовок-секция: компактный header с lucide-иконкой + опциональным sub-text справа.
// Используется внутри карточек чтобы группировать контент (Цели / Нельзя / Можно...).
export default function Section({ title, Icon, children, sub }) {
  return (
    <div className="pd-section">
      {title && (
        <div className="pd-section-header">
          {Icon && <Icon size={16} aria-hidden="true" className="pd-section-icon" />}
          <span className="pd-section-title">{title}</span>
          {sub && <span className="pd-section-sub">{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

Section.propTypes = {
  title: PropTypes.node,
  Icon: PropTypes.elementType,
  children: PropTypes.node,
  sub: PropTypes.node,
};
