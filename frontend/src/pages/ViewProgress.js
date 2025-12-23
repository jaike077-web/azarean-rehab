import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { complexes, progress } from '../services/api';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import { CalendarRange, ClipboardList, LayoutDashboard, Play, User, BarChart3 } from 'lucide-react';
import { Skeleton, SkeletonText, SkeletonImage } from '../components/Skeleton';
import './ViewProgress.css';

function ViewProgress() {
  const { complexId } = useParams();
  const navigate = useNavigate();
  const [complex, setComplex] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [complexRes, progressRes] = await Promise.all([
        complexes.getOne(complexId),
        progress.getByComplex(complexId)
      ]);
      setComplex(complexRes.data.complex);
      setProgressData(progressRes.data);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      setError('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateShort = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short'
    });
  };

  const formatDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) return 'Нет данных';
    return `${formatDateShort(startDate)} — ${formatDateShort(endDate)}`;
  };

  const getPainLevelClass = (level) => {
    if (typeof level !== 'number') return 'unknown';
    return `level-${Math.max(0, Math.min(10, level))}`;
  };

  const getDifficultyEmoji = (rating) => {
    const emojis = ['😊', '🙂', '😐', '😓', '😰'];
    return emojis[rating - 1] || '😐';
  };

  const getVideoThumbnail = (exercise) => {
    if (exercise?.thumbnail_url) {
      return exercise.thumbnail_url;
    }

    if (!exercise?.video_url) return null;

    const kinescopeMatch = exercise.video_url.match(/kinescope\.io\/(?:watch\/|embed\/)?([a-zA-Z0-9]+)/);
    if (kinescopeMatch) {
      return `https://kinescope.io/preview/${kinescopeMatch[1]}/poster`;
    }

    const ytMatch = exercise.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (ytMatch) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
    }

    return null;
  };

  const normalizedExercises = useMemo(() => {
    if (!complex && !progressData) return [];
    const responseExercises = progressData?.exercises;
    if (Array.isArray(responseExercises) && responseExercises.length > 0) {
      return responseExercises.map((exercise, index) => ({
        ...exercise,
        order: exercise.order ?? index + 1,
        progress: Array.isArray(exercise.progress) ? exercise.progress : []
      }));
    }

    const complexExercises = complex?.exercises || [];
    const logs = progressData?.logs || [];
    const logsByExercise = logs.reduce((acc, log) => {
      const exerciseId = log.exercise_id || log.exerciseId || log.exercise?.id;
      if (!exerciseId) return acc;
      if (!acc[exerciseId]) acc[exerciseId] = [];
      acc[exerciseId].push(log);
      return acc;
    }, {});

    return complexExercises.map((exercise, index) => ({
      ...exercise,
      order: exercise.order ?? index + 1,
      progress: logsByExercise[exercise.id] || []
    }));
  }, [complex, progressData]);

  const allProgressEntries = useMemo(
    () => normalizedExercises.flatMap((exercise) => exercise.progress || []),
    [normalizedExercises]
  );

  const progressStats = useMemo(() => {
    const totalExercises = normalizedExercises.length;
    const totalCompletions = normalizedExercises.reduce(
      (sum, exercise) => sum + (exercise.progress?.length || 0),
      0
    );
    const painLevels = [];
    const difficultyRatings = [];
    const completionDates = [];

    normalizedExercises.forEach((exercise) => {
      (exercise.progress || []).forEach((entry) => {
        if (typeof entry.pain_level === 'number') {
          painLevels.push(entry.pain_level);
        }
        if (typeof entry.difficulty_rating === 'number') {
          difficultyRatings.push(entry.difficulty_rating);
        }
        const completedDate = entry.completed_at || entry.created_at;
        if (completedDate) completionDates.push(completedDate);
      });
    });

    const avgPain = painLevels.length
      ? (painLevels.reduce((sum, value) => sum + value, 0) / painLevels.length).toFixed(1)
      : null;
    const avgDifficulty = difficultyRatings.length
      ? (difficultyRatings.reduce((sum, value) => sum + value, 0) / difficultyRatings.length).toFixed(1)
      : null;
    const sortedDates = completionDates
      .map((value) => new Date(value))
      .sort((a, b) => a - b);

    return {
      totalExercises,
      totalCompletions,
      avgPain,
      avgDifficulty,
      dateRange:
        sortedDates.length > 0
          ? formatDateRange(sortedDates[0], sortedDates[sortedDates.length - 1])
          : 'Нет данных'
    };
  }, [normalizedExercises]);

  const patientName = progressData?.patient?.full_name || complex?.patient_name || 'Пациент';
  const complexName =
    progressData?.complex?.diagnosis?.name ||
    complex?.diagnosis_name ||
    progressData?.complex?.name ||
    'Комплекс';

  const isRecentComment = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const diff = Date.now() - date.getTime();
    return diff <= 7 * 24 * 60 * 60 * 1000;
  };

  const ProgressSkeleton = () => (
    <div className="progress-page">
      <div className="progress-header">
        <div className="progress-header-main">
          <Skeleton className="progress-avatar-skeleton" />
          <div className="progress-header-text">
            <SkeletonText width="60%" lines={1} />
            <SkeletonText width="40%" lines={1} />
            <SkeletonText width="30%" lines={1} />
          </div>
        </div>
        <div className="progress-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="stat-card">
              <SkeletonText width="50%" lines={1} />
              <SkeletonText width="80%" lines={1} />
            </div>
          ))}
        </div>
      </div>
      <div className="exercises-progress-grid">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="exercise-progress-card">
            <SkeletonText width="70%" lines={1} />
            <SkeletonImage height={160} />
            <SkeletonText width="45%" lines={1} />
            <SkeletonText width="90%" lines={2} />
            <SkeletonText width="80%" lines={2} />
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return <ProgressSkeleton />;
  }

  if (error) {
    return (
      <div className="error-view">
        <h2>Ошибка</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">
          На главную
        </button>
      </div>
    );
  }

  if (!progressData || !complex) {
    return (
      <div className="error-view">
        <h2>Нет данных</h2>
        <p>Не удалось загрузить информацию о прогрессе.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">
          На главную
        </button>
      </div>
    );
  }

  return (
    <div className="view-progress-page progress-page">
      <Breadcrumbs
        items={[
          { 
            icon: <LayoutDashboard size={16} />, 
            label: 'Главная', 
            path: '/dashboard' 
          },
          { 
            icon: <ClipboardList size={16} />, 
            label: 'Мои комплексы', 
            path: '/my-complexes' 
          },
          { 
            icon: <BarChart3 size={16} />, 
            label: `Прогресс: ${patientName}` 
          }
        ]}
      />

      <div className="back-button-wrapper">
        <BackButton to="/my-complexes" label="К списку комплексов" />
      </div>

      <div className="progress-header">
        <div className="progress-header-main">
          <div className="progress-avatar">
            <User size={28} aria-hidden="true" />
          </div>
          <div className="progress-header-text">
            <h1>{patientName}</h1>
            <p className="progress-subtitle">Комплекс: {complexName}</p>
            <div className="progress-dates">
              <CalendarRange size={16} aria-hidden="true" />
              <span>{progressStats.dateRange}</span>
            </div>
          </div>
        </div>
        <div className="progress-stats">
          <div className="stat-card">
            <div className="stat-value">{progressStats.totalExercises}</div>
            <div className="stat-label">Всего упражнений</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{progressStats.totalCompletions}</div>
            <div className="stat-label">Выполнено раз</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{progressStats.avgPain ? `${progressStats.avgPain}/10` : '-'}</div>
            <div className="stat-label">Средняя боль</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {progressStats.avgDifficulty ? `${progressStats.avgDifficulty}/5` : '-'}
            </div>
            <div className="stat-label">Средняя сложность</div>
          </div>
        </div>
      </div>

      {allProgressEntries.length === 0 ? (
        <div className="empty-state">
          <h3>Прогресса пока нет</h3>
          <p>Пациент ещё не выполнял упражнения из этого комплекса.</p>
        </div>
      ) : (
        <div className="exercises-progress-grid">
          {normalizedExercises
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((exercise) => {
              const progressEntries = (exercise.progress || [])
                .slice()
                .sort((a, b) => {
                  const dateA = new Date(a.completed_at || a.created_at || 0);
                  const dateB = new Date(b.completed_at || b.created_at || 0);
                  return dateA - dateB;
                });

              const painLevels = progressEntries
                .filter((entry) => typeof entry.pain_level === 'number')
                .map((entry) => entry.pain_level);
              const difficultyRatings = progressEntries
                .filter((entry) => typeof entry.difficulty_rating === 'number')
                .map((entry) => entry.difficulty_rating);
              const comments = progressEntries
                .filter((entry) => entry.notes)
                .map((entry) => ({
                  text: entry.notes,
                  date: entry.completed_at || entry.created_at
                }));
              const lastCompletedEntry = progressEntries
                .slice()
                .sort((a, b) => {
                  const dateA = new Date(a.completed_at || a.created_at || 0);
                  const dateB = new Date(b.completed_at || b.created_at || 0);
                  return dateB - dateA;
                })[0];
              const thumbnail = getVideoThumbnail(exercise);

              return (
                <div key={exercise.id || exercise.order} className="exercise-progress-card">
                  <div className="exercise-card-header">
                    <h3>
                      {exercise.order || 0}. {exercise.title || exercise.exercise_title || 'Без названия'}
                    </h3>
                    <span className="exercise-completion">
                      Выполнено: {progressEntries.length} раз
                    </span>
                  </div>

                  <div className="exercise-preview">
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={exercise.title || 'Превью упражнения'}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="exercise-preview-placeholder">
                        <Play size={24} aria-hidden="true" />
                        <span>Видео недоступно</span>
                      </div>
                    )}
                  </div>

                  <div className="exercise-metrics">
                    <div className="metric-block">
                      <h4>История боли</h4>
                      {painLevels.length > 0 ? (
                        <div className="pain-history">
                          {painLevels.map((level, index) => (
                            <span
                              key={`${exercise.id}-pain-${index}`}
                              className={`pain-indicator ${getPainLevelClass(level)}`}
                            >
                              {level}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="metric-empty">Нет оценок боли</p>
                      )}
                    </div>

                    <div className="metric-block">
                      <h4>Сложность выполнения</h4>
                      {difficultyRatings.length > 0 ? (
                        <div className="difficulty-history">
                          {difficultyRatings.map((rating, index) => (
                            <span key={`${exercise.id}-diff-${index}`} className="difficulty-icon">
                              {getDifficultyEmoji(rating)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="metric-empty">Нет оценок сложности</p>
                      )}
                    </div>
                  </div>

                  <div className="exercise-footer">
                    <div className="last-completed">
                      Последнее выполнение:{' '}
                      <span>{formatDate(lastCompletedEntry?.completed_at || lastCompletedEntry?.created_at)}</span>
                    </div>
                  </div>

                  <div className="comments-section">
                    <h4>Комментарии пациента</h4>
                    {comments.length > 0 ? (
                      <div className="comments-list">
                        {comments.map((comment, index) => (
                          <div
                            key={`${exercise.id}-comment-${index}`}
                            className={`comment-item ${
                              isRecentComment(comment.date) ? 'recent' : ''
                            }`}
                          >
                            <div className="comment-date">{formatDate(comment.date)}</div>
                            <div className="comment-text">{comment.text}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="metric-empty">Комментариев нет</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

export default ViewProgress;
