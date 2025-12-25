import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { complexes, progress } from '../services/api';
import './PatientView.css';
import { useToast } from '../context/ToastContext';
import { Skeleton } from '../components/Skeleton';
import ExerciseCardSkeleton from '../components/skeletons/ExerciseCardSkeleton';
import Breadcrumbs from '../components/Breadcrumbs';
import { AlertTriangle, Annoyed, Check, CheckCircle, Clock, Copy, FileText, Frown, Lightbulb, Mail, Meh, MessageCircle, Play, RefreshCw, Smile, SmilePlus, X, XCircle } from 'lucide-react';

function PatientView() {
  const toast = useToast();
  const { token } = useParams();
  const [complex, setComplex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionData, setSessionData] = useState({});
  const [savedExercises, setSavedExercises] = useState({});
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [sessionComment, setSessionComment] = useState('');
  const [headerVisible, setHeaderVisible] = useState(true);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [currentExerciseId, setCurrentExerciseId] = useState(null);
  const [currentExerciseTitle, setCurrentExerciseTitle] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [exerciseComments, setExerciseComments] = useState({});
  const [savingStates, setSavingStates] = useState({});
  const [saveErrors, setSaveErrors] = useState({});
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const lastScrollRef = useRef(0);
  const difficultyLevels = [
    { value: 1, icon: Smile, label: 'Легко' },
    { value: 2, icon: SmilePlus, label: 'Легко+' },
    { value: 3, icon: Meh, label: 'Средне' },
    { value: 4, icon: Frown, label: 'Средне+' },
    { value: 5, icon: Annoyed, label: 'Тяжело' }
  ];
  const breadcrumbItems = [{ label: 'Мой комплекс упражнений' }];

  useEffect(() => {
    loadComplex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const newSessionId = Date.now();
    setSessionId(newSessionId);
    setSessionStarted(true);
  }, []);

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

  const loadComplex = async () => {
    try {
      setLoading(true);
      const response = await complexes.getByToken(token);
      setComplex(response.data.complex);
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

  const clearSavedStatus = (exerciseId) => {
    setSavedExercises((prev) => {
      if (!prev[exerciseId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
  };

  const updateSessionData = (exerciseId, updater) => {
    setSessionData((prev) => {
      const current = prev[exerciseId] || {};
      const nextEntry = typeof updater === 'function'
        ? updater(current)
        : { ...current, ...updater };

      if (nextEntry === null) {
        const next = { ...prev };
        delete next[exerciseId];
        return next;
      }
      return {
        ...prev,
        [exerciseId]: nextEntry
      };
    });
    clearSavedStatus(exerciseId);
  };

  const handleCompletionToggle = (exerciseId) => {
    updateSessionData(exerciseId, (current) => {
      const nextCompleted = !current.completed;
      const hasPain = current.pain_level !== undefined && current.pain_level !== null;
      const hasDifficulty = current.difficulty_rating !== undefined && current.difficulty_rating !== null;
      const hasNotes = current.notes;

      if (!nextCompleted && !hasPain && !hasDifficulty && !hasNotes) {
        return null;
      }

      return {
        ...current,
        completed: nextCompleted
      };
    });
    toast.info('Отмечено (будет сохранено при завершении)');
  };

  const handlePainSelect = (exerciseId, level) => {
    updateSessionData(exerciseId, { pain_level: level });
    toast.info('Отмечено (будет сохранено при завершении)');
  };

  const handleDifficultyChange = (exerciseId, value) => {
    updateSessionData(exerciseId, { difficulty_rating: value });
    toast.info('Отмечено (будет сохранено при завершении)');
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
    setSessionId(Date.now());
    setSessionStarted(true);
    setSessionData({});
    setSavedExercises({});
    setSessionComment('');
    toast.success('Новая тренировка начата! Отметки сброшены.');
  };

  const handleFinishWorkout = async () => {
    if (!complex?.id) {
      return;
    }

    const entries = Object.entries(sessionData);
    if (entries.length === 0) {
      toast.warning('Нет отмеченных упражнений для сохранения.');
      return;
    }

    const activeSessionId = sessionId ?? Date.now();
    if (!sessionId) {
      setSessionId(activeSessionId);
    }

    try {
      const trimmedSessionComment = sessionComment.trim();
      await Promise.all(entries.map(([exerciseId, data]) => (
        progress.create({
          complex_id: complex.id,
          exercise_id: Number(exerciseId),
          session_id: activeSessionId,
          session_comment: trimmedSessionComment || null,
          completed: Boolean(data.completed),
          pain_level: data.pain_level ?? null,
          difficulty_rating: data.difficulty_rating ?? null,
          notes: data.notes ?? null
        })
      )));

      const nextSaved = entries.reduce((acc, [exerciseId]) => {
        acc[exerciseId] = true;
        return acc;
      }, {});

      setSavedExercises(nextSaved);
      setSessionData({});
      setSessionComment('');
      setShowFinishModal(false);
      setSessionId(Date.now());
      setSessionStarted(true);
      toast.success('Тренировка завершена!');
    } catch (err) {
      console.error('Ошибка сохранения сессии:', err);
      toast.error('Ошибка сохранения');
    }
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
    return (
      <div className="patient-view loading">
        <Breadcrumbs items={breadcrumbItems} showHome={false} />
        <header className="patient-header">
          <div className="logo">
            <Skeleton width="44px" height="44px" borderRadius="10px" />
            <Skeleton width="140px" height="18px" />
          </div>
        </header>

        <div className="patient-content">
          <div className="welcome-section">
            <div className="patient-identity">
              <Skeleton width="160px" height="20px" />
              <Skeleton width="200px" height="16px" style={{ marginTop: '8px' }} />
            </div>
            <Skeleton width="60%" height="32px" style={{ marginTop: '16px' }} />
            <Skeleton width="220px" height="20px" style={{ marginTop: '12px' }} />
          </div>

          <div className="exercises-list">
            {Array.from({ length: 3 }).map((_, index) => (
              <ExerciseCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="patient-view error-view">
        <Breadcrumbs items={breadcrumbItems} showHome={false} />
        <div className="error-icon" aria-hidden="true"><XCircle size={56} /></div>
        <h2>Ошибка</h2>
        <p>{error}</p>
      </div>
    );
  }

  const completedCount = Object.values(sessionData).filter((entry) => entry.completed).length;

  const totalCount = complex.exercises?.length || 0;
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalExecutions = completedCount;

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
      <Breadcrumbs items={breadcrumbItems} showHome={false} />
      <header className={`patient-header ${headerVisible ? '' : 'is-hidden'}`}>
        <div className="logo">
          <img src="/AN-logo.jpg" alt="Azarean Network" className="logo-image" />
          <span>Azarean Network</span>
        </div>
      </header>

      <div className="patient-content">
        <div className="welcome-section">
          <div className="patient-identity">
            <span className="patient-name">{complex.patient_name}</span>
            <span className="instructor-name">Инструктор: {complex.instructor_name}</span>
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
            const sessionEntry = sessionData[exerciseId];
            const isCompleted = Boolean(sessionEntry?.completed);
            const description = item.exercise.description || '';
            const isExpanded = expandedDescriptions[exerciseId];
            const shouldTruncate = description.length > 150;
            const painLevel = sessionEntry?.pain_level;
            const difficultyRating = sessionEntry?.difficulty_rating;
            const isSaving = savingStates[exerciseId];
            const saveError = saveErrors[exerciseId];
            const hasPendingData = Boolean(sessionEntry);
            const hasSavedData = Boolean(savedExercises[exerciseId]);

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
                          onClick={() => handleCompletionToggle(exerciseId)}
                          aria-label={`Отметить упражнение «${item.exercise.title}» выполненным`}
                        >
                          <Check size={16} aria-hidden="true" />
                          {isCompleted ? 'Выполнено' : 'Отметить выполненным'}
                        </button>
                        <button
                          type="button"
                          className="btn-comment"
                          onClick={() => handleOpenComment(exerciseId, item.exercise.title)}
                          aria-label={`Добавить комментарий к упражнению «${item.exercise.title}»`}
                        >
                          <MessageCircle size={16} aria-hidden="true" />
                          Комментарий
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
                      {(hasPendingData || hasSavedData) && (
                        <div
                          className={`session-status ${hasPendingData ? 'is-pending' : 'is-saved'}`}
                          role="status"
                          aria-live="polite"
                        >
                          {hasPendingData ? (
                            <Clock size={14} aria-hidden="true" />
                          ) : (
                            <CheckCircle size={14} aria-hidden="true" />
                          )}
                          {hasPendingData ? 'Не сохранено' : 'Сохранено'}
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
                            className={`pain-button ${painLevel === level ? 'selected' : ''}`}
                            data-level={level}
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
                      <p className="difficulty-label">Сложность выполнения:</p>
                      <div className="difficulty-icon-container" role="radiogroup" aria-label="Сложность выполнения">
                        {difficultyLevels.map(({ value, icon: Icon, label }) => (
                          <button
                            key={value}
                            type="button"
                            className={`difficulty-icon-btn ${difficultyRating === value ? 'selected' : ''}`}
                            onClick={() => handleDifficultyChange(exerciseId, value)}
                            aria-label={`Сложность: ${label}`}
                            aria-pressed={difficultyRating === value}
                          >
                            <Icon className="icon" size={32} aria-hidden="true" />
                            <span className="label">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p
                    className={`exercise-description ${shouldTruncate && !isExpanded ? 'collapsed' : ''}`}
                    id={`exercise-description-${exerciseId}`}
                  >
                    {description}
                  </p>
                  {shouldTruncate && (
                    <button
                      type="button"
                      className="show-more-btn"
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

        <div className="finish-workout-section">
          <button
            type="button"
            className="btn-finish-workout"
            onClick={() => setShowFinishModal(true)}
            disabled={!sessionStarted}
          >
            Завершить тренировку
          </button>
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

      {showFinishModal && (
        <div className="modal-overlay" onClick={() => setShowFinishModal(false)}>
          <div className="modal-content finish-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Завершение тренировки</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowFinishModal(false)}
                aria-label="Закрыть окно завершения тренировки"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="modal-body">
              <p>Как вы себя чувствуете сегодня?</p>
              <textarea
                className="session-comment-input"
                placeholder="Опишите ваше общее самочувствие..."
                value={sessionComment}
                onChange={(e) => setSessionComment(e.target.value)}
                rows={4}
              />

              <div className="session-summary">
                <h4>Выполнено упражнений:</h4>
                {Object.keys(sessionData).length === 0 ? (
                  <p className="session-empty">Нет отмеченных упражнений.</p>
                ) : (
                  <ul>
                    {Object.entries(sessionData).map(([exerciseId, data]) => {
                      const exercise = complex.exercises.find(
                        (entry) => entry.exercise.id === Number(exerciseId)
                      );
                      const painLabel = data.pain_level !== undefined && data.pain_level !== null
                        ? `Боль: ${data.pain_level}/10`
                        : null;
                      const difficultyLabel = data.difficulty_rating !== undefined && data.difficulty_rating !== null
                        ? `Сложность: ${data.difficulty_rating}/5`
                        : null;

                      return (
                        <li key={exerciseId}>
                          <div className="session-summary-title">
                            {exercise?.exercise.title || 'Упражнение'}
                          </div>
                          <div className={`session-summary-status ${data.completed ? 'is-completed' : 'is-skipped'}`}>
                            {data.completed ? (
                              <CheckCircle size={16} aria-hidden="true" />
                            ) : (
                              <XCircle size={16} aria-hidden="true" />
                            )}
                            {data.completed ? 'Выполнено' : 'Пропущено'}
                          </div>
                          {(painLabel || difficultyLabel) && (
                            <div className="session-summary-meta">
                              {painLabel && <span>{painLabel}</span>}
                              {difficultyLabel && <span>{difficultyLabel}</span>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowFinishModal(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleFinishWorkout}
              >
                Сохранить и завершить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default PatientView;
