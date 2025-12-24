import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { templates } from '../services/api';
import { useToast } from '../context/ToastContext';

const DeleteTemplateModal = ({ template, isOpen, onClose, onConfirm }) => {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content delete-template-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            <AlertTriangle size={22} />
            <span>Удалить шаблон?</span>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p>
            Шаблон <strong>"{template?.name}"</strong> будет удалён навсегда.
          </p>
          <p className="warning-text">Это действие нельзя отменить.</p>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={deleting}>
            Отмена
          </button>
          <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
            <Trash2 size={16} />
            <span>{deleting ? 'Удаление...' : 'Удалить'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteTemplateModal;
