// =====================================================
// Wave 2 #2.05 — PatientModal
// Простая reusable modal обёртка с overlay + Esc + click-outside.
// Используется PainEventForm. Если в проекте появится shared modal — заменить.
// =====================================================

import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';
import { useModalOverlayClose } from '../../../hooks/useModalOverlayClose';
import './PainComponents.css';

export default function PatientModal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  // Hook ВЫШЕ early return — Rules of Hooks: порядок должен быть стабильным.
  const overlayProps = useModalOverlayClose(onClose);

  if (!isOpen) return null;

  return (
    <div
      className="pd-modal-overlay"
      role="presentation"
      {...overlayProps}
    >
      <div className="pd-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="pd-modal__header">
          <h2 className="pd-modal__title">{title}</h2>
          <button
            type="button"
            className="pd-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        <div className="pd-modal__body">{children}</div>
      </div>
    </div>
  );
}

PatientModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
};
