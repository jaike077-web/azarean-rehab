import React from 'react';
import PropTypes from 'prop-types';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import s from './ThemeToggle.module.css';

// Простой toggle: Light ↔ Dark (без 'system'). Иконка показывает противоположную
// тему — то на что кликом переключишь. Pattern из X-UI / других admin-панелей.
function ThemeToggle({ hideOnMobile = false }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const wrapperClass = `${s.themeToggle} ${hideOnMobile ? s.themeToggleHeader : ''}`;

  return (
    <button
      type="button"
      className={wrapperClass}
      onClick={handleToggle}
      aria-label={isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
    >
      {isDark ? (
        <Sun size={18} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Moon size={18} strokeWidth={1.8} aria-hidden="true" />
      )}
    </button>
  );
}

ThemeToggle.propTypes = {
  hideOnMobile: PropTypes.bool,
};

export default ThemeToggle;
