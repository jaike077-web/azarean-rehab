import React from 'react';
import PropTypes from 'prop-types';
import './TabBar.css';

export default function TabBar({ items, activeId, onChange }) {
  return (
    <nav className="pd-tabbar" role="tablist">
      {items.map(item => {
        const isActive = activeId === item.id;
        const { Icon } = item;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`pd-tabbar-btn ${isActive ? 'pd-tabbar-btn--active' : ''} ${item.accent ? 'pd-tabbar-btn--accent' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className={`pd-tabbar-icon-wrap ${isActive ? 'pd-tabbar-icon-wrap--active' : ''}`}>
              <Icon size={24} />
            </span>
            <span className="pd-tabbar-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

TabBar.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    Icon: PropTypes.elementType.isRequired,
    label: PropTypes.string.isRequired,
    accent: PropTypes.bool,
  })).isRequired,
  activeId: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
};
