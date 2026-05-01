import React from 'react';
import PropTypes from 'prop-types';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import s from './ThemeToggle.module.css';

const OPTIONS = [
  { value: 'light', label: 'Светлая', Icon: Sun },
  { value: 'system', label: 'Системная', Icon: Monitor },
  { value: 'dark', label: 'Тёмная', Icon: Moon },
];

function ThemeToggle({ compact = false }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={s.themeToggle} role="radiogroup" aria-label="Тема оформления">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          className={`${s.themeBtn} ${theme === value ? s.themeBtnActive : ''}`}
          onClick={() => setTheme(value)}
        >
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}

ThemeToggle.propTypes = {
  compact: PropTypes.bool,
};

export default ThemeToggle;
