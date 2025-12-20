// DeleteConfirmModal.js - Модалка подтверждения удаления
// Azarean Network

import React from 'react';
import './DeleteConfirmModal.css';

function DeleteConfirmModal({ title, onConfirm, onCancel }) {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="delete-confirm-modal">
        <div className="modal-icon">⚠️</div>
        <h2>Удалить упражнение?</h2>
        <p className="modal-text">
          Вы уверены, что хотите удалить упражнение<br />
          <strong>"{title}"</strong>?
        </p>
        <p className="modal-hint">
          Это действие нельзя отменить. Упражнение будет архивировано.
        </p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn-confirm" onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;