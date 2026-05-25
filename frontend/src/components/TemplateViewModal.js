import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { templates } from '../services/api';
import { useToast } from '../context/ToastContext';
import { BookOpen, X } from 'lucide-react';
import { SkeletonText } from './Skeleton';
import s from '../pages/MyComplexes.module.css';
import { useModalOverlayClose } from '../hooks/useModalOverlayClose';

const TemplateViewModal = ({ templateId, isOpen, onClose }) => {
  const toast = useToast();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);

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
    <div className={s.modalOverlay} {...useModalOverlayClose(onClose)}>
      <div
        className={`${s.modalContent} ${s.templateViewModal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={s.modalHeader}>
          <h2>
            <BookOpen size={24} />
            <span>{template?.name || 'Шаблон'}</span>
          </h2>
          <button className={s.modalClose} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className={s.modalBody}>
          {loading ? (
            <div className={s.templateViewLoading}>
              <SkeletonText lines={2} />
              <SkeletonText lines={3} />
            </div>
          ) : (
            <>
              {template?.description && (
                <p className={s.templateDescription}>{template.description}</p>
              )}

              <div className={s.templateInfo}>
                <div className={s.infoItem}>
                  <strong>Диагноз:</strong> {template?.diagnosis_name || 'Не указан'}
                </div>
                <div className={s.infoItem}>
                  <strong>Упражнений:</strong> {exercisesCount}
                </div>
              </div>

              <h4>Упражнения в шаблоне:</h4>
              <div className={s.exercisesList}>
                {exercisesCount === 0 ? (
                  <p className={s.emptyText}>Нет упражнений в шаблоне</p>
                ) : (
                  (template?.exercises || []).map((exercise, index) => (
                    <div key={exercise.id || `${exercise.exercise_id}-${index}`} className={s.exerciseItem}>
                      <div className={s.exerciseNumber}>{index + 1}</div>
                      <div className={s.exerciseDetails}>
                        <div className={s.exerciseTitle}>{exercise.title}</div>
                        <div className={s.exerciseParams}>
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

        <div className={s.modalFooter}>
          <button className={s.btnSecondary} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

TemplateViewModal.propTypes = {
  templateId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default TemplateViewModal;
