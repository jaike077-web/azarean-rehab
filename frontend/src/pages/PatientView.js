import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { complexes, progress } from '../services/api';
import './PatientView.css';
import { useToast } from '../context/ToastContext';
import { ComplexesPageSkeleton } from '../components/Skeleton';
import { AlertTriangle, Check, Copy, FileText, Lightbulb, Mail, MessageCircle, Play, RefreshCw, X, XCircle } from 'lucide-react';

function PatientView() {
  const toast = useToast();
  const { token } = useParams();
  const [complex, setComplex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completedExercises, setCompletedExercises] = useState({});
  const [headerVisible, setHeaderVisible] = useState(true);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [currentExerciseId, setCurrentExerciseId] = useState(null);
  const [currentExerciseTitle, setCurrentExerciseTitle] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [painLevels, setPainLevels] = useState({});
  const [difficultyRatings, setDifficultyRatings] = useState({});
  const [exerciseComments, setExerciseComments] = useState({});
  const [savingStates, setSavingStates] = useState({});
  const [saveErrors, setSaveErrors] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const lastScrollRef = useRef(0);
  const difficultyTimeouts = useRef({});

  useEffect(() => {
    loadComplex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = window.scrollY;
      if (currentScroll > 100 && currentScroll > lastScrollRef.current) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollRef.current = currentScroll;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(difficultyTimeouts.current).forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  const loadComplex = async () => {
    try {
      setLoading(true);
      const response = await complexes.getByToken(token);
      setComplex(response.data.complex);
      
      // Загружаем счётчики выполнений из sessionStorage
      const savedCounts = sessionStorage.getItem('exercise_counts');
      if (savedCounts) {
        setCompletedExercises(JSON.parse(savedCounts));
      }
    } catch (err) {
      console.error('Ошибка загрузки комплекса:', err);
      setError('Комплекс не найден или ссылка недействительна');
    } finally {
      setLoading(false);
    }
  };

  const setExerciseSaving = (exerciseId, isSaving) => {
    setSavingStates((prev) => ({ ...prev, [exerciseId]: isSaving }));
  };

  const setExerciseError = (exerciseId, message) => {
    setSaveErrors((prev) => ({ ...prev, [exerciseId]: message }));
  };

  const saveProgress = async (exerciseId, payload, { onSuccess, onError } = {}) => {
    if (!complex?.id) return;
    setExerciseSaving(exerciseId, true);
    setExerciseError(exerciseId, '');

    try {
      await progress.create({
        complex_id: complex.id,
        exercise_id: exerciseId,
        ...payload
      });

      setExerciseSaving(exerciseId, false);
      setExerciseError(exerciseId, '');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('Ошибка сохранения прогресса:', err);
      setExerciseSaving(exerciseId, false);
      setExerciseError(exerciseId, 'Ошибка сохранения');
      toast.error('Ошибка сохранения');
      if (onError) {
        onError();
      }
    }
  };

  const handleComplete = (exerciseId) => {
    const previousCount = completedExercises[exerciseId] || 0;
    setCompletedExercises((prev) => {
      const newCounts = {
        ...prev,
        [exerciseId]: (prev[exerciseId] || 0) + 1
      };
      sessionStorage.setItem('exercise_counts', JSON.stringify(newCounts));
      return newCounts;
    });

    saveProgress(
      exerciseId,
      { completed: true },
      {
        onError: () => {
          setCompletedExercises((prev) => {
            const newCounts = {
              ...prev,
              [exerciseId]: previousCount
            };
            sessionStorage.setItem('exercise_counts', JSON.stringify(newCounts));
            return newCounts;
          });
        }
      }
    );
  };

  const handlePainSelect = (exerciseId, level) => {
    setPainLevels((prev) => ({ ...prev, [exerciseId]: level }));
    saveProgress(exerciseId, { pain_level: level });
  };

  const handleDifficultyChange = (exerciseId, value) => {
    setDifficultyRatings((prev) => ({ ...prev, [exerciseId]: value }));
    if (difficultyTimeouts.current[exerciseId]) {
      clearTimeout(difficultyTimeouts.current[exerciseId]);
    }
    difficultyTimeouts.current[exerciseId] = setTimeout(() => {
      saveProgress(exerciseId, { difficulty_rating: value });
    }, 500);
  };

  const handleOpenComment = (exerciseId, exerciseTitle) => {
    setCurrentExerciseId(exerciseId);
    setCurrentExerciseTitle(exerciseTitle);
    setCommentDraft(exerciseComments[exerciseId] || '');
    setShowCommentModal(true);
  };

  const handleSaveComment = () => {
    if (!currentExerciseId) return;
    const trimmedComment = commentDraft.trim();
    saveProgress(currentExerciseId, { comment: trimmedComment || null }, {
      onSuccess: () => {
        setExerciseComments((prev) => ({
          ...prev,
          [currentExerciseId]: trimmedComment
        }));
        setShowCommentModal(false);
      }
    });
  };

  const handleNewSession = () => {
    sessionStorage.removeItem('current_session_id');
    sessionStorage.removeItem('exercise_counts');
    setCompletedExercises({});
    toast.success('Новая тренировка начата! Отметки сброшены.');
  };

  const handleCopyEmail = async (email) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email скопирован');
    } catch (e) {
      toast.error('Не удалось скопировать email');
    }
  };

  if (loading) {
    return <ComplexesPageSkeleton count={4} />;
  }

  if (error) {
    return (
      <div className="patient-view error-view">
        <div className="error-icon" aria-hidden="true"><XCircle size={56} /></div>
        <h2>Ошибка</h2>
        <p>{error}</p>
      </div>
    );
  }

  const completedCount = complex.exercises?.filter(ex => 
    completedExercises[ex.exercise.id] > 0
  ).length || 0;

  const totalCount = complex.exercises?.length || 0;
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalExecutions = Object.values(completedExercises).reduce((sum, count) => sum + count, 0);

  const toInt = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  };

  const formatDurationSeconds = (durationSeconds) => {
    if (!durationSeconds || durationSeconds <= 0) {
      return '';
    }
    if (durationSeconds < 60) {
      return `${durationSeconds} сек`;
    }
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  // Функция для получения embed URL из разных видеохостингов
  const getVideoUrl = (url) => {
    // Kinescope - если уже embed URL, используем как есть
    if (url.includes('kinescope.io/embed/')) {
      return url;
    }
    
    // Kinescope - конвертируем обычный URL в embed
    const kinescopeMatch = url.match(/kinescope\.io\/(?:watch\/)?([a-zA-Z0-9]+)/);
    if (kinescopeMatch) {
      return `https://kinescope.io/embed/${kinescopeMatch[1]}`;
    }
    
    // YouTube - конвертируем в embed
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    
    // Иначе отдаем как есть (для других хостингов)
    return url;
  };

  return (
    <div className="patient-view">
      <header className={`patient-header ${headerVisible ? '' : 'is-hidden'}`}>
        <div className="logo">
          <img src="/AN-logo.jpg" alt="Azarean Network" className="logo-image" />
          <span>Azarean Network</span>
        </div>
      </header>

      <div className="patient-content">
        <div className="welcome-section">
          <div className="patient-identity">
            <span>Пациент: {complex.patient_name}</span>
            <span>Инструктор: {complex.instructor_name}</span>
          </div>
          <h1>Ваш комплекс упражнений</h1>
          {complex.diagnosis_name && (
            <div className="diagnosis-badge">
              {complex.diagnosis_name}
            </div>
          )}
        </div>

        {(complex.diagnosis_note || complex.recommendations) && (
          <div className="info-box recommendations">
            <h3><Lightbulb size={20} aria-hidden="true" /> Рекомендации</h3>
            <p>{complex.diagnosis_note || complex.recommendations}</p>
          </div>
        )}

        {complex.warnings && (
          <div className="info-box warnings">
            <h3><AlertTriangle size={20} aria-hidden="true" /> Важно</h3>
            <p>{complex.warnings}</p>
          </div>
        )}

        <div className="progress-overview">
          <div className="progress-stat">
            <div className="stat-number">{completedCount}/{totalCount}</div>
            <div className="stat-label">Упражнений выполнено</div>
          </div>
          <div className="progress-stat">
            <div className="stat-number">{completionPercent}%</div>
            <div className="stat-label">Прогресс</div>
          </div>
          <div className="progress-stat">
            <div className="stat-number">{totalExecutions}</div>
            <div className="stat-label">Всего выполнений</div>
          </div>
        </div>

        <div className="session-controls">
          <button type="button" className="btn-new-session" onClick={handleNewSession}>
            <RefreshCw size={16} aria-hidden="true" />
            Начать новую тренировку
          </button>
          <p className="session-note">
            Нажмите эту кнопку перед началом новой тренировки
          </p>
        </div>

        <div className="exercises-list" id="exercises">
          <h2>Упражнения ({complex.exercises?.length || 0})</h2>
          {complex.exercises?.map((item, index) => {
            const sets = toInt(item.sets, 0);
            const reps = toInt(item.reps, 0);
            const durationSeconds = toInt(item.duration_seconds, 0);
            const restSeconds = toInt(item.rest_seconds, 0);
            const showDuration = durationSeconds > 0;
            const exerciseId = item.exercise.id;
            const completionCount = completedExercises[exerciseId] || 0;
            const isCompleted = completionCount > 0;
            const description = item.exercise.description || '';
            const isExpanded = expandedDescriptions[exerciseId];
            const shouldTruncate = description.length > 150;
            const visibleDescription = shouldTruncate && !isExpanded
              ? `${description.slice(0, 150)}...`
              : description;
            const descriptionClassName = `exercise-description${shouldTruncate ? (isExpanded ? ' expanded' : ' collapsed') : ''}`;
            const painLevel = painLevels[exerciseId];
            const difficultyRating = difficultyRatings[exerciseId] ?? 5;
            const isSaving = savingStates[exerciseId];
            const saveError = saveErrors[exerciseId];

            return (
              <div
                key={item.id}
                className="exercise-card"
              >
                <div className="exercise-content">
                  <div className="exercise-header">
                    <div className="exercise-number">{index + 1}</div>
                    <h3 className="exercise-title">{item.exercise.title}</h3>
                    <div className="completion-info">
                      <div className="exercise-actions">
                        <button
                          type="button"
                          className={`btn-complete ${isCompleted ? 'is-completed' : ''}`}
                          onClick={() => handleComplete(exerciseId)}
                          aria-label={`Отметить упражнение «${item.exercise.title}» выполненным`}
                        >
                          <Check size={16} aria-hidden="true" />
                          {isCompleted ? `Выполнено: ${completionCount} раз` : 'Выполнено'}
                        </button>
                        <button
                          type="button"
                          className="btn-comment"
                          onClick={() => handleOpenComment(exerciseId, item.exercise.title)}
                          aria-label={`Добавить комментарий к упражнению «${item.exercise.title}»`}
                        >
                          💬 Комментарий
                        </button>
                      </div>
                      {(isSaving || saveError) && (
                        <div
                          className={`exercise-save-status ${saveError ? 'has-error' : ''}`}
                          role="status"
                          aria-live="polite"
                        >
                          {isSaving ? 'Сохранение...' : saveError}
                        </div>
                      )}
                    </div>
                  </div>

                  {item.exercise.video_url && (
                    <div className="exercise-video-wrapper">
                      <div className="video-container">
                        <iframe
                          className="exercise-video"
                          loading="lazy"
                          src={getVideoUrl(item.exercise.video_url)}
                          title={item.exercise.title}
                          frameBorder="0"
                          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write; screen-wake-lock"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}

                  <p className={descriptionClassName} id={`exercise-description-${exerciseId}`}>
                    {visibleDescription}
                  </p>
                  {shouldTruncate && (
                    <button
                      type="button"
                      className="description-toggle"
                      onClick={() =>
                        setExpandedDescriptions((prev) => ({
                          ...prev,
                          [exerciseId]: !prev[exerciseId]
                        }))
                      }
                      aria-expanded={Boolean(isExpanded)}
                      aria-controls={`exercise-description-${exerciseId}`}
                    >
                      {isExpanded ? 'Скрыть' : 'Показать ещё'}
                    </button>
                  )}

                  <div className="exercise-params">
                    <div className="param">
                      <span className="param-label">Подходы:</span>
                      <span className="param-value">{sets}</span>
                    </div>
                    {showDuration ? (
                      <div className="param">
                        <span className="param-label">Время:</span>
                        <span className="param-value">{formatDurationSeconds(durationSeconds)}</span>
                      </div>
                    ) : (
                      <div className="param">
                        <span className="param-label">Повторения:</span>
                        <span className="param-value">{reps}</span>
                      </div>
                    )}
                    {restSeconds > 0 && (
                      <div className="param">
                        <span className="param-label">Отдых:</span>
                        <span className="param-value">{restSeconds} сек</span>
                      </div>
                    )}
                  </div>

                  <div className="exercise-feedback">
                    <div className="pain-rating">
                      <p className="pain-scale-label">Уровень боли (0 = нет боли, 10 = максимальная)</p>
                      <div className="pain-scale" role="radiogroup" aria-label="Уровень боли">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`pain-button ${painLevel === level ? 'active' : ''}`}
                            onClick={() => handlePainSelect(exerciseId, level)}
                            aria-pressed={painLevel === level}
                            aria-label={`Боль: ${level}`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="difficulty-rating">
                      <label className="difficulty-label" htmlFor={`difficulty-${exerciseId}`}>
                        Сложность выполнения:
                      </label>
                      <div className="difficulty-slider">
                        <input
                          id={`difficulty-${exerciseId}`}
                          type="range"
                          min="1"
                          max="10"
                          value={difficultyRating}
                          onChange={(event) => handleDifficultyChange(exerciseId, Number(event.target.value))}
                          aria-label={`Сложность выполнения: ${difficultyRating} из 10`}
                        />
                        <span className="difficulty-value">{difficultyRating}/10</span>
                      </div>
                    </div>
                  </div>

                  {item.exercise.instructions && (
                    <div className="exercise-instructions">
                      <strong><FileText size={16} aria-hidden="true" /> Как выполнять:</strong>
                      <p>{item.exercise.instructions}</p>
                    </div>
                  )}

                  {item.exercise.contraindications && (
                    <div className="exercise-warnings">
                      <strong><AlertTriangle size={16} aria-hidden="true" /> Противопоказания:</strong>
                      <p>{item.exercise.contraindications}</p>
                    </div>
                  )}

                  {item.notes && (
                    <div className="exercise-notes">
                      <strong><FileText size={16} aria-hidden="true" /> Примечания от инструктора:</strong>
                      <p>{item.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="contact-section" aria-label="Поддержка">
          <div className="contact-header">
            <MessageCircle size={18} aria-hidden="true" />
            <h3>Вопросы?</h3>
          </div>
          <p className="contact-text">
            Если что-то непонятно или усилилась боль — напишите инструктору.
          </p>

          {complex.instructor_email ? (
            <div className="contact-actions">
              <a className="btn-contact primary" href={`mailto:${complex.instructor_email}`} aria-label="Написать инструктору на email">
                <Mail size={16} aria-hidden="true" />
                Написать
              </a>
              <button
                type="button"
                className="btn-contact"
                onClick={() => handleCopyEmail(complex.instructor_email)}
                aria-label="Скопировать email инструктора"
              >
                <Copy size={16} aria-hidden="true" />
                Скопировать email
              </button>
            </div>
          ) : (
            <p className="contact-text muted">Контакты инструктора не указаны.</p>
          )}
        </div>

        {complex.instructor_email && (
          <div className="sticky-cta" role="region" aria-label="Быстрые действия">
            <button
              type="button"
              className="sticky-btn primary"
              onClick={() =>
                document.getElementById('exercises')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <Play size={18} aria-hidden="true" />
              К упражнениям
            </button>

            <a className="sticky-btn" href={`mailto:${complex.instructor_email}`} aria-label="Написать инструктору на email">
              <Mail size={18} aria-hidden="true" />
              Написать
            </a>
          </div>
        )}
      </div>

      {showCommentModal && (
        <div className="modal-overlay" onClick={() => setShowCommentModal(false)}>
          <div className="rating-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Комментарий (необязательно)</h3>
              <button className="modal-close" onClick={() => setShowCommentModal(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="rating-exercise-title">
              {currentExerciseTitle}
            </div>

            <div className="rating-form">
              <div className="rating-group">
                <label className="rating-label"><MessageCircle size={16} aria-hidden="true" /> Комментарий (необязательно)</label>
                <textarea
                  placeholder="Как прошло выполнение? Были ли трудности?"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowCommentModal(false)}>
                  Отмена
                </button>
                <button className="btn-primary" onClick={handleSaveComment}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default PatientView;
