import React, { useEffect, useState } from 'react';
import { templates } from '../services/api';
import { useToast } from '../context/ToastContext';
import { BookOpen, X } from 'lucide-react';
import { SkeletonText } from './Skeleton';

const TemplateViewModal = ({ templateId, isOpen, onClose }) => {
  const toast = useToast();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !templateId) {
      return;
    }

    let isMounted = true;
    const fetchTemplateDetails = async () => {
      setLoading(true);
      setTemplate(null);
      try {
        const response = await templates.getById(templateId);
        const data = response.data || {};
        const templateData = data.template || data || {};
        const exercises = data.exercises || [];
        if (isMounted) {
          setTemplate({ ...templateData, exercises });
        }
      } catch (error) {
        console.error('Error fetching template:', error);
        toast.error('Не удалось загрузить шаблон');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTemplateDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, templateId, toast]);

  if (!isOpen) {
    return null;
  }

  const exercisesCount = template?.exercises?.length || 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content template-view-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            <BookOpen size={24} />
            <span>{template?.name || 'Шаблон'}</span>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="template-view-loading">
              <SkeletonText lines={2} />
              <SkeletonText lines={3} />
            </div>
          ) : (
            <>
              {template?.description && (
                <p className="template-description">{template.description}</p>
              )}

              <div className="template-info">
                <div className="info-item">
                  <strong>Диагноз:</strong> {template?.diagnosis_name || 'Не указан'}
                </div>
                <div className="info-item">
                  <strong>Упражнений:</strong> {exercisesCount}
                </div>
              </div>

              <h4>Упражнения в шаблоне:</h4>
              <div className="exercises-list">
                {exercisesCount === 0 ? (
                  <p className="empty-text">Нет упражнений в шаблоне</p>
                ) : (
                  (template?.exercises || []).map((exercise, index) => (
                    <div key={exercise.id || `${exercise.exercise_id}-${index}`} className="exercise-item">
                      <div className="exercise-number">{index + 1}</div>
                      <div className="exercise-details">
                        <div className="exercise-title">{exercise.title}</div>
                        <div className="exercise-params">
                          <span>Подходы: {exercise.sets || '-'}</span>
                          {exercise.reps ? <span>Повторения: {exercise.reps}</span> : null}
                          {exercise.duration_seconds ? (
                            <span>Время: {exercise.duration_seconds}с</span>
                          ) : null}
                          <span>Отдых: {exercise.rest_seconds || 30}с</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateViewModal;
