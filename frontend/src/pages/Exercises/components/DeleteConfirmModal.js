// DeleteConfirmModal.js - Модалка подтверждения удаления
// Azarean Network

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useModalOverlayClose } from '../../../hooks/useModalOverlayClose';
import s from './DeleteConfirmModal.module.css';

function DeleteConfirmModal({ title, onConfirm, onCancel }) {
  return (
      <div className={s.modalOverlay} {...useModalOverlayClose(onCancel)}>
      <div className={s.deleteConfirmModal}>
        <div className={s.modalIcon} aria-hidden="true">
          <AlertTriangle size={48} />
        </div>
        <h2>Удалить упражнение?</h2>
        <p className={s.modalText}>
          Вы уверены, что хотите удалить упражнение<br />
          <strong>"{title}"</strong>?
        </p>
        <p className={s.modalHint}>
          Это действие нельзя отменить. Упражнение будет архивировано.
        </p>
        <div className={s.modalActions}>
          <button className={s.btnCancel} onClick={onCancel}>
            Отмена
          </button>
          <button className={s.btnConfirm} onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
