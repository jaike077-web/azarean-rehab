import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { templates } from '../services/api';
import { useToast } from '../context/ToastContext';
import s from '../pages/MyComplexes.module.css';

const DeleteTemplateModal = ({ template, isOpen, onClose, onConfirm }) => {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  // Escape handler для закрытия модалки
  const handleEscape = useCallback((event) => {
    if (event.key === 'Escape' && !deleting) {
      onClose();
    }
  }, [onClose, deleting]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  if (!isOpen || !template) {
    return null;
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await templates.delete(template.id);
      if (response.status >= 200 && response.status < 300) {
        toast.success('Шаблон удалён');
        onConfirm();
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Ошибка удаления шаблона');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div
        className={`${s.modalContent} ${s.deleteTemplateModal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={s.modalHeader}>
          <h2>
            <AlertTriangle size={22} />
            <span>Удалить шаблон?</span>
          </h2>
          <button className={s.modalClose} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className={s.modalBody}>
          <p>
            Шаблон <strong>"{template?.name}"</strong> будет удалён навсегда.
          </p>
          <p className={s.warningText}>Это действие нельзя отменить.</p>
        </div>

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose} disabled={deleting}>
            Отмена
          </button>
          <button className={s.btnDanger} onClick={handleDelete} disabled={deleting}>
            <Trash2 size={16} />
            <span>{deleting ? 'Удаление...' : 'Удалить'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

DeleteTemplateModal.propTypes = {
  template: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired
  }),
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired
};

export default DeleteTemplateModal;
