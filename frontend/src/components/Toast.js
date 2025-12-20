// =====================================================
// TOAST COMPONENT - Azarean Network
// =====================================================

import React, { useState, useEffect } from 'react';
import './Toast.css';

const ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const TITLES = {
  success: 'Успешно',
  error: 'Ошибка',
  warning: 'Внимание',
  info: 'Информация',
};

const Toast = ({ id, type = 'info', title, message, duration = 4000, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(id);
    }, 300); // Время анимации выхода
  };

  return (
    <div className={`toast toast-${type} ${isExiting ? 'toast-exiting' : ''}`}>
      <span className="toast-icon">{ICONS[type]}</span>
      
      <div className="toast-content">
        <p className="toast-title">{title || TITLES[type]}</p>
        {message && <p className="toast-message">{message}</p>}
      </div>

      <button className="toast-close" onClick={handleClose}>
        ×
      </button>

      {duration > 0 && (
        <div 
          className="toast-progress" 
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  );
};

export default Toast;
