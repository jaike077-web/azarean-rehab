import React from 'react';
import PropTypes from 'prop-types';
import './Card.css';

export default function Card({
  variant = 'secondary',
  gradient,
  className = '',
  onClick,
  loading = false,
  children,
  style,
  ...rest
}) {
  const cls = [
    'pd-card',
    `pd-card--${variant}`,
    onClick ? 'pd-card--clickable' : '',
    loading ? 'pd-card--loading' : '',
    className,
  ].filter(Boolean).join(' ');

  const dynamicStyle = gradient ? { ...style, background: gradient } : style;

  return (
    <div
      className={cls}
      style={dynamicStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...rest}
    >
      {loading ? (
        <div className="pd-card-skeleton">
          <div className="pd-card-skeleton-line pd-card-skeleton-line--title" />
          <div className="pd-card-skeleton-line" />
          <div className="pd-card-skeleton-line pd-card-skeleton-line--short" />
        </div>
      ) : children}
    </div>
  );
}

Card.propTypes = {
  variant: PropTypes.oneOf(['hero', 'secondary', 'inline']),
  gradient: PropTypes.string,
  className: PropTypes.string,
  onClick: PropTypes.func,
  loading: PropTypes.bool,
  children: PropTypes.node,
  style: PropTypes.object,
};
