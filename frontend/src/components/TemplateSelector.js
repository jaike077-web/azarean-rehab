import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Search, X } from 'lucide-react';
import { templates } from '../services/api';
import { useToast } from '../context/ToastContext';
import { SkeletonText } from './Skeleton';

const TemplateSelector = ({ isOpen, onClose, onSelect, diagnosisId }) => {
  const toast = useToast();
  const [templatesList, setTemplatesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content template-selector"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3>
            <FolderOpen size={20} />
            <span>Выбор шаблона</span>
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Поиск шаблона..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button className="clear-search" onClick={() => setSearchTerm('')}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="templates-list">
            {loading ? (
              <div className="templates-loading">
                <SkeletonText lines={3} />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <p className="empty-state">Шаблоны не найдены</p>
            ) : (
              filteredTemplates.map((template) => (
                <div key={template.id} className="template-option">
                  <div className="template-info">
                    <strong>{template.name}</strong>
                    <div className="template-meta">
                      {template.exercises_count || 0} упражнений
                      {template.diagnosis_name && ` • ${template.diagnosis_name}`}
                    </div>
                  </div>
                  <button className="btn-primary" onClick={() => onSelect(template.id)}>
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

export default TemplateSelector;
