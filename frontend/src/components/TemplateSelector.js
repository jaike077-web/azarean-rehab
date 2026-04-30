import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FolderOpen, Search, X } from 'lucide-react';
import { templates } from '../services/api';
import { useToast } from '../context/ToastContext';
import { SkeletonText } from './Skeleton';
import s from '../pages/MyComplexes.module.css';

const TemplateSelector = ({ isOpen, onClose, onSelect, diagnosisId }) => {
  const toast = useToast();
  const [templatesList, setTemplatesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Escape handler для закрытия модалки
  const handleEscape = useCallback((event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleEscape]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const params = diagnosisId ? { diagnosis_id: diagnosisId } : {};
        const response = await templates.getAll(params);
        const data = response.data?.items || response.data?.templates || response.data || [];
        setTemplatesList(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching templates:', error);
        toast.error('Не удалось загрузить шаблоны');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [isOpen, diagnosisId, toast]);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    return templatesList.filter((template) =>
      template.name.toLowerCase().includes(normalizedSearch)
    );
  }, [searchTerm, templatesList]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div
        className={`${s.modalContent} ${s.templateSelector}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={s.modalHeader}>
          <h3>
            <FolderOpen size={20} />
            <span>Выбор шаблона</span>
          </h3>
          <button className={s.modalClose} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className={s.modalBody}>
          <div className={s.searchBox}>
            <Search size={18} className={s.searchIcon} />
            <input
              type="text"
              className={s.searchInput}
              placeholder="Поиск шаблона..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button className={s.clearSearch} onClick={() => setSearchTerm('')}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className={s.templatesList}>
            {loading ? (
              <div className={s.templatesLoading}>
                <SkeletonText lines={3} />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <p className={s.emptyState}>Шаблоны не найдены</p>
            ) : (
              filteredTemplates.map((template) => (
                <div key={template.id} className={s.templateOption}>
                  <div className={s.templateInfo}>
                    <strong>{template.name}</strong>
                    <div className={s.templateMeta}>
                      {template.exercises_count || 0} упражнений
                      {template.diagnosis_name && ` • ${template.diagnosis_name}`}
                    </div>
                  </div>
                  <button className={s.btnPrimary} onClick={() => onSelect(template.id)}>
                    Выбрать
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

TemplateSelector.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  diagnosisId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export default TemplateSelector;
