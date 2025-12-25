import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { complexes, progress } from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';
import { Annoyed, CalendarRange, Frown, Meh, Smile, SmilePlus, User } from 'lucide-react';
import ProgressSkeleton from '../components/skeletons/ProgressSkeleton';
import './ViewProgress.css';

function ViewProgress() {
  const { complexId } = useParams();
  const navigate = useNavigate();
  const [complex, setComplex] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const [complexRes, progressRes] = await Promise.all([
          complexes.getOne(complexId),
          progress.getByComplex(complexId)
        ]);

        const complexPayload = complexRes.data?.complex || complexRes.data;
        const progressPayload = progressRes.data?.items || progressRes.data || {};

        console.log('=== ViewProgress Debug ===');
        console.log('Raw API response:', progressPayload);
        const progressLogs = progressPayload.logs || [];
        const statistics = progressPayload.statistics || {};

        console.log('Progress logs count:', progressLogs.length);
        console.log('Statistics:', statistics);
        console.log('Total logs:', parseInt(statistics.total_logs, 10));
        console.log('Avg pain:', parseFloat(statistics.avg_pain_level).toFixed(1));

        setComplex(complexPayload || null);
        setData(progressPayload);
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        setError('Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [complexId]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
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

  const getPainClass = (level) => {
    if (level <= 3) return 'low';
    if (level <= 6) return 'medium';
    return 'high';
  };

  const getDifficultyIcon = (rating) => {
    const icons = {
      1: Smile,
      2: SmilePlus,
      3: Meh,
      4: Frown,
      5: Annoyed
    };
    return icons[rating] || Meh;
  };

  const progressLogs = data?.logs || [];

  const exercisesWithProgress = useMemo(() => {
    const exercisesMap = {};

    progressLogs.forEach((log) => {
      if (!exercisesMap[log.exercise_id]) {
        exercisesMap[log.exercise_id] = {
          id: log.exercise_id,
          title: log.exercise_title,
          category: log.exercise_category,
          progress: [],
          completionCount: 0,
          painLevels: [],
          difficultyRatings: [],
          comments: []
        };
      }

      exercisesMap[log.exercise_id].progress.push(log);

      if (log.completed) {
        exercisesMap[log.exercise_id].completionCount += 1;
      }

      if (typeof log.pain_level === 'number') {
        exercisesMap[log.exercise_id].painLevels.push(log.pain_level);
      }

      if (typeof log.difficulty_rating === 'number') {
        exercisesMap[log.exercise_id].difficultyRatings.push(log.difficulty_rating);
      }

      if (log.notes && log.notes.trim()) {
        exercisesMap[log.exercise_id].comments.push({
          text: log.notes,
          date: log.completed_at
        });
      }
    });

    return Object.values(exercisesMap);
  }, [progressLogs]);

  const progressStats = useMemo(() => {
    const statistics = data?.statistics || {};
    const completionDates = progressLogs
      .map((log) => log.completed_at)
      .filter(Boolean)
      .map((value) => new Date(value))
      .sort((a, b) => a - b);

    return {
      totalLogs: Number.parseInt(statistics.total_logs ?? progressLogs.length, 10),
      completedCount: Number.parseInt(statistics.completed_count ?? 0, 10),
      avgPain: Number.parseFloat(statistics.avg_pain_level ?? 0),
      avgDifficulty: Number.parseFloat(statistics.avg_difficulty ?? 0),
      dateRange:
        completionDates.length > 0
          ? formatDateRange(completionDates[0], completionDates[completionDates.length - 1])
          : 'Нет данных'
    };
  }, [data, progressLogs]);

  const patientName = complex?.patient_name || 'Пациент';
  const complexName =
    complex?.diagnosis_name ||
    complex?.diagnosis?.name ||
    complex?.name ||
    'Комплекс';

  const breadcrumbItems = [
    { label: 'Мои комплексы', path: '/my-complexes?tab=complexes' },
    { label: `Прогресс: ${patientName}` }
  ];

  if (loading) {
    return (
      <div className="view-progress-page progress-page">
        <Breadcrumbs items={breadcrumbItems} />
        <ProgressSkeleton />
      </div>
    );
  }

  return (
    <div className="view-progress-page progress-page">
      <Breadcrumbs items={breadcrumbItems} />

      {error && (
        <div className="error">
          <h2>Ошибка</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            На главную
          </button>
        </div>
      )}

      {!error && !data && (
        <div className="empty-state">
          <h3>Нет данных</h3>
          <p>Не удалось загрузить информацию о прогрессе.</p>
        </div>
      )}

      {!error && data && (
        <>
          <div className="progress-header">
            <div className="progress-header-main">
              <div className="progress-avatar">
                <User size={28} aria-hidden="true" />
              </div>
              <div className="progress-header-text">
                <h1>Прогресс пациента</h1>
                <p className="progress-subtitle">
                  {patientName} · {complexName}
                </p>
                <div className="progress-dates">
                  <CalendarRange size={16} aria-hidden="true" />
                  <span>{progressStats.dateRange}</span>
                </div>
              </div>
            </div>
            <div className="progress-stats">
              <div className="stat-card">
                <div className="stat-value">{progressStats.totalLogs}</div>
                <div className="stat-label">Всего записей</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progressStats.completedCount}</div>
                <div className="stat-label">Выполнено</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progressStats.avgPain.toFixed(1)}/10</div>
                <div className="stat-label">Средняя боль</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progressStats.avgDifficulty.toFixed(1)}/5</div>
                <div className="stat-label">Средняя сложность</div>
              </div>
            </div>
          </div>

          {progressLogs.length === 0 ? (
            <div className="empty-state">
              <h3>Прогресса пока нет</h3>
              <p>Пациент ещё не выполнял упражнения из этого комплекса.</p>
            </div>
          ) : (
            <div className="exercises-progress-grid">
              {exercisesWithProgress.map((exercise) => (
                <div key={exercise.id} className="exercise-progress-card">
                  <div className="exercise-card-header">
                    <h3>{exercise.title}</h3>
                    {exercise.category && <p className="exercise-category">{exercise.category}</p>}
                  </div>

                  <div className="completion-info">
                    Выполнено: {exercise.completionCount} раз
                  </div>

                  {exercise.painLevels.length > 0 && (
                    <div className="pain-section">
                      <h4>История боли:</h4>
                      <div className="pain-history">
                        {exercise.painLevels.map((level, index) => (
                          <div
                            key={`${exercise.id}-pain-${index}`}
                            className={`pain-indicator ${getPainClass(level)}`}
                            title={`Боль: ${level}/10`}
                          >
                            {level}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {exercise.difficultyRatings.length > 0 && (
                    <div className="difficulty-section">
                      <h4>Сложность:</h4>
                      <div className="difficulty-history">
                        {exercise.difficultyRatings.map((rating, index) => {
                          const DifficultyIcon = getDifficultyIcon(rating);
                          return (
                            <span
                              key={`${exercise.id}-diff-${index}`}
                              className="difficulty-icon"
                              title={`Сложность: ${rating}/5`}
                              role="img"
                              aria-label={`Сложность: ${rating} из 5`}
                            >
                              <DifficultyIcon size={18} aria-hidden="true" />
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {exercise.comments.length > 0 && (
                    <div className="comments-section">
                      <h4>Комментарии:</h4>
                      {exercise.comments.map((comment, index) => (
                        <div key={`${exercise.id}-comment-${index}`} className="comment-item">
                          <div className="comment-date">{formatDate(comment.date)}</div>
                          <div className="comment-text">{comment.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ViewProgress;
