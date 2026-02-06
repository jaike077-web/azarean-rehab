import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import './Breadcrumbs.css';

function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        const content = (
          <>
            {item.icon && (
              <span className="crumb-icon">
                {item.icon}
              </span>
            )}
            <span className="crumb-label">{item.label}</span>
          </>
        );

        return (
          <span
            key={index}
            className={`crumb-item ${isLast ? 'active' : ''}`}
          >
            {!isLast && item.path ? (
              <Link to={item.path}>
                {content}
              </Link>
            ) : (
              content
            )}

            {!isLast && (
              <span className="crumb-separator">/</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

Breadcrumbs.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      icon: PropTypes.node,
      label: PropTypes.string.isRequired,
      path: PropTypes.string
    })
  )
};

// React.memo для предотвращения лишних ререндеров
export default React.memo(Breadcrumbs);
