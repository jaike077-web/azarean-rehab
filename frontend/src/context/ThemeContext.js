import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

// Применяет/снимает атрибут data-theme на <html>.
// theme === 'system' → атрибут снимается, в дело вступает @media prefers-color-scheme.
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

const STORAGE_KEY = 'azarean_theme';
const VALID = ['light', 'dark', 'system'];

function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

const ThemeContext = createContext({
  theme: 'system',
  setTheme: () => {},
  resolvedTheme: 'light',
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  // Применяем тему при монтировании и при смене.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Слушаем смену системной темы — нужно если выбран 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const setTheme = (next) => {
    if (!VALID.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / quota — не страшно, тема всё равно применится в текущей сессии */
    }
  };

  const value = useMemo(() => {
    const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    return { theme, setTheme, resolvedTheme };
  }, [theme, systemDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

ThemeProvider.propTypes = {
  children: PropTypes.node,
};

export function useTheme() {
  return useContext(ThemeContext);
}
