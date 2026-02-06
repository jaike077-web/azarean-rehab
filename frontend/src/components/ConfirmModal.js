// =====================================================
// CONFIRM MODAL - Azarean Network
// Замена window.confirm() на красивую модалку
// =====================================================

import React, { useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, X } from 'lucide-react';
import './ConfirmModal.css';

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Подтверждение',
  message,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  icon: CustomIcon
}) => {
  // Escape handler
  const handleEscape = useCallback((event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const Icon = CustomIcon || AlertTriangle;

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className={`confirm-modal confirm-modal-${variant}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <button
          className="confirm-modal-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        <div className="confirm-modal-icon">
          <Icon size={32} />
        </div>

        <h2 id="confirm-modal-title" className="confirm-modal-title">
          {title}
        </h2>

        {message && (
          <p className="confirm-modal-message">{message}</p>
        )}

        <div className="confirm-modal-actions">
          <button
            className="btn-secondary"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            className={`btn-${variant === 'danger' ? 'danger' : 'primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

ConfirmModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.string,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  variant: PropTypes.oneOf(['danger', 'warning', 'info']),
  icon: PropTypes.elementType
};

export default ConfirmModal;
