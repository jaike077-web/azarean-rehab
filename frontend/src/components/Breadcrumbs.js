import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import s from './Breadcrumbs.module.css';

function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className={s.breadcrumbs}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        const content = (
          <>
            {item.icon && (
              <span className={s.crumbIcon}>
                {item.icon}
              </span>
            )}
            <span className={s.crumbLabel}>{item.label}</span>
          </>
        );

        return (
          <span
            key={index}
            className={`${s.crumbItem} ${isLast ? s.active : ''}`}
          >
            {!isLast && item.path ? (
              <Link to={item.path}>
                {content}
              </Link>
            ) : (
              content
            )}

            {!isLast && (
              <span className={s.crumbSeparator}>/</span>
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
