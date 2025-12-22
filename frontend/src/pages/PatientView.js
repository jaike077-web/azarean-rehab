import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { complexes, progress } from '../services/api';
import './PatientView.css';
import { useToast } from '../context/ToastContext';
import { ComplexesPageSkeleton } from '../components/Skeleton';
import { Activity, AlertTriangle, BarChart3, Check, Copy, FileText, Lightbulb, Mail, Meh, MessageCircle, Play, RefreshCw, Smile, Frown, Star, X, XCircle } from 'lucide-react';

function PatientView() {
  const toast = useToast();
  const { token } = useParams();
  const [complex, setComplex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completedExercises, setCompletedExercises] = useState({});
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [currentExerciseId, setCurrentExerciseId] = useState(null);
  const [currentExerciseTitle, setCurrentExerciseTitle] = useState('');
  const [ratings, setRatings] = useState({
    pain_level: 0,
    difficulty_rating: 3,
    mood_rating: 3,
    notes: ''
  });

  useEffect(() => {
    loadComplex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  const handleComplete = (exerciseId, exerciseTitle) => {
    setCurrentExerciseId(exerciseId);
    setCurrentExerciseTitle(exerciseTitle);
    setShowRatingModal(true);
  };

  const submitRating = async () => {
    try {
      // Генерируем session_id для текущей сессии (если нет)
      let sessionId = sessionStorage.getItem('current_session_id');
      if (!sessionId) {
        sessionId = Date.now().toString();
        sessionStorage.setItem('current_session_id', sessionId);
      }

      await progress.create({
        complex_id: complex.id,
        exercise_id: currentExerciseId,
        completed: true,
        pain_level: ratings.pain_level,
        difficulty_rating: ratings.difficulty_rating,
        mood_rating: ratings.mood_rating,
        notes: ratings.notes || null,
        session_id: sessionId
      });

      // Обновляем счётчик
      const newCounts = {
        ...completedExercises,
        [currentExerciseId]: (completedExercises[currentExerciseId] || 0) + 1
      };
      setCompletedExercises(newCounts);
      
      // Сохраняем в sessionStorage
      sessionStorage.setItem('exercise_counts', JSON.stringify(newCounts));

      // Закрываем модалку и сбрасываем форму
      setShowRatingModal(false);
      setRatings({
        pain_level: 0,
        difficulty_rating: 3,
        mood_rating: 3,
        notes: ''
      });

      toast.success('Выполнение отмечено');
    } catch (err) {
      console.error('Ошибка сохранения прогресса:', err);
      toast.error('Ошибка сохранения');
    }
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

  const getMoodIcon = (mood) => {
    // 1–5: от "плохо" к "отлично"
    switch (mood) {
      case 1:
      case 2:
        return <Frown size={18} aria-hidden="true" />;
      case 3:
        return <Meh size={18} aria-hidden="true" />;
      case 4:
      case 5:
        return <Smile size={18} aria-hidden="true" />;
      default:
        return <Meh size={18} aria-hidden="true" />;
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
      <header className="patient-header">
        <div className="logo"><Activity size={18} aria-hidden="true" /><span>Azarean Network</span></div>
        <div className="patient-info">
          <span className="patient-name">{complex.patient_name}</span>
          <span className="instructor-name">Инструктор: {complex.instructor_name}</span>
        </div>
      </header>

      <div className="patient-content">
        <div className="welcome-section">
          <h1>Ваш комплекс упражнений</h1>
          {complex.diagnosis_name && (
            <div className="diagnosis-badge">
              {complex.diagnosis_name}
              {complex.diagnosis_note && ` • ${complex.diagnosis_note}`}
            </div>
          )}
        </div>

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

        {complex.recommendations && (
          <div className="info-box recommendations">
            <div className="info-icon" aria-hidden="true"><Lightbulb size={18} /></div>
            <div>
              <strong>Рекомендации:</strong>
              <p>{complex.recommendations}</p>
            </div>
          </div>
        )}

        {complex.warnings && (
          <div className="info-box warnings">
            <div className="info-icon" aria-hidden="true"><AlertTriangle size={18} /></div>
            <div>
              <strong>Важно:</strong>
              <p>{complex.warnings}</p>
            </div>
          </div>
        )}

        <div className="exercises-list" id="exercises">
          <h2>Упражнения ({complex.exercises?.length || 0})</h2>
          {complex.exercises?.map((item, index) => {
            const duration = Number(item.duration_seconds || 0);
            const reps = Number(item.reps || 0);
            const hasDuration = duration > 0;

            const formatDuration = (seconds) => {
              const totalSeconds = Math.max(0, Math.floor(seconds));
              if (totalSeconds < 60) {
                return `${totalSeconds} сек`;
              }
              const minutes = Math.floor(totalSeconds / 60);
              const remainingSeconds = totalSeconds % 60;
              return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
            };

            return (
              <div
                key={item.id}
                className="exercise-card"
              >
              <div className="exercise-number">{index + 1}</div>
              
              <div className="exercise-content">
                <div className="exercise-header">
                  <h3>{item.exercise.title}</h3>
                  <div className="completion-info">
                    {completedExercises[item.exercise.id] > 0 && (
                      <span className="completion-badge">
                        <Check size={14} aria-hidden="true" />
                        Выполнено: {completedExercises[item.exercise.id]} раз
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn-complete"
                      onClick={() => handleComplete(item.exercise.id, item.exercise.title)}
                      aria-label={`Отметить упражнение «${item.exercise.title}» выполненным`}
                    >
                      <Check size={16} aria-hidden="true" />
                      Выполнено
                    </button>
                  </div>
                </div>

                {item.exercise.video_url && (
                  <div className="exercise-video">
                    <div className="video-container">
                      <iframe
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

                <p className="exercise-description">{item.exercise.description}</p>

                <div className="exercise-params">
                  <div className="param">
                    <span className="param-label">Подходы:</span>
                    <span className="param-value">{item.sets}</span>
                  </div>
                  {hasDuration ? (
                    <div className="param">
                      <span className="param-label">Время:</span>
                      <span className="param-value">{formatDuration(duration)}</span>
                    </div>
                  ) : (
                    <div className="param">
                      <span className="param-label">Повторения:</span>
                      <span className="param-value">{reps}</span>
                    </div>
                  )}
                  {item.rest_seconds && (
                    <div className="param">
                      <span className="param-label">Отдых:</span>
                      <span className="param-value">{item.rest_seconds} сек</span>
                    </div>
                  )}
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

      {showRatingModal && (
        <div className="modal-overlay" onClick={() => setShowRatingModal(false)}>
          <div className="rating-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Оцените выполнение</h3>
              <button className="modal-close" onClick={() => setShowRatingModal(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="rating-exercise-title">
              {currentExerciseTitle}
            </div>

            <div className="rating-form">
              <div className="rating-group">
                <label className="rating-label"><Activity size={16} aria-hidden="true" /> Уровень боли (0 = нет боли, 10 = максимальная)</label>
                <div className="pain-scale">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => (
                    <button
                      key={level}
                      className={`pain-btn ${ratings.pain_level === level ? 'active' : ''} level-${level}`}
                      onClick={() => setRatings({...ratings, pain_level: level})}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rating-group">
                <label className="rating-label"><BarChart3 size={16} aria-hidden="true" /> Сложность выполнения</label>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map(rating => (
                    <button
                      key={rating}
                      className={`star-btn ${ratings.difficulty_rating >= rating ? 'active' : ''}`}
                      onClick={() => setRatings({...ratings, difficulty_rating: rating})}
                    >
                      <Star size={18} aria-hidden="true" className="star-icon" />
                    </button>
                  ))}
                </div>
                <span className="rating-label">
                  {ratings.difficulty_rating === 1 && 'Очень легко'}
                  {ratings.difficulty_rating === 2 && 'Легко'}
                  {ratings.difficulty_rating === 3 && 'Нормально'}
                  {ratings.difficulty_rating === 4 && 'Сложно'}
                  {ratings.difficulty_rating === 5 && 'Очень сложно'}
                </span>
              </div>

              <div className="rating-group">
                <label className="rating-label"><Smile size={16} aria-hidden="true" /> Настроение</label>
                <div className="mood-buttons">
                  {[1, 2, 3, 4, 5].map(mood => (
                    <button
                      key={mood}
                      className={`mood-btn ${ratings.mood_rating === mood ? 'active' : ''}`}
                      onClick={() => setRatings({...ratings, mood_rating: mood})}
                    >
                      {getMoodIcon(mood)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rating-group">
                <label className="rating-label"><MessageCircle size={16} aria-hidden="true" /> Комментарий (необязательно)</label>
                <textarea
                  placeholder="Как прошло выполнение? Были ли трудности?"
                  value={ratings.notes}
                  onChange={(e) => setRatings({...ratings, notes: e.target.value})}
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowRatingModal(false)}>
                  Отмена
                </button>
                <button className="btn-primary" onClick={submitRating}>
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
