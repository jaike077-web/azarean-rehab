// =====================================================
// TOAST COMPONENT - Azarean Network
// =====================================================

import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import './Toast.css';

// lucide иконки вместо unicode-символов — выглядят чище и согласованно
// с остальным UI пациентского дашборда (правило проекта: lucide-react only).
const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TITLES = {
  success: 'Успешно',
  error: 'Ошибка',
  warning: 'Внимание',
  info: 'Информация',
};

const Toast = ({ id, type = 'info', title, message, duration = 4000, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);
  const exitTimerRef = useRef(null);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  // Cleanup exit timer on unmount
  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => {
      onClose(id);
    }, 300); // Время анимации выхода
  };

  const Icon = ICONS[type] || Info;

  return (
    <div className={`toast toast-${type} ${isExiting ? 'toast-exiting' : ''}`} role="status" aria-live="polite">
      <span className="toast-icon">
        <Icon size={20} aria-hidden="true" />
      </span>

      <div className="toast-content">
        <p className="toast-title">{title || TITLES[type]}</p>
        {message && <p className="toast-message">{message}</p>}
      </div>

      <button
        type="button"
        className="toast-close"
        onClick={handleClose}
        aria-label="Закрыть уведомление"
      >
        <X size={16} aria-hidden="true" />
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

Toast.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  type: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
  title: PropTypes.string,
  message: PropTypes.string,
  duration: PropTypes.number,
  onClose: PropTypes.func.isRequired
};

export default Toast;
