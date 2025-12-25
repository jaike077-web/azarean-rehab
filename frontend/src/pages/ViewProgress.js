import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { complexes, progress } from '../services/api';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import {
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  User,
  BarChart3,
  Clock,
  MessageCircle,
  CheckCircle2,
  XCircle,
  SkipForward
} from 'lucide-react';
import ProgressSkeleton from '../components/skeletons/ProgressSkeleton';
import './ViewProgress.css';

function ViewProgress() {
  const { complexId } = useParams();
  const navigate = useNavigate();
  const [complex, setComplex] = useState(null);
  const [data, setData] = useState(null);
  const [complexExercises, setComplexExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const [complexRes, progressRes, exercisesRes] = await Promise.all([
          complexes.getOne(complexId),
          progress.getByComplex(complexId),
          complexes.getExercises(complexId)
        ]);

        const complexPayload = complexRes.data?.complex || complexRes.data;
        const progressPayload = progressRes.data?.items || progressRes.data || {};
        const exercisesPayload = exercisesRes.data?.exercises || [];

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
        setComplexExercises(exercisesPayload);
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        setError('Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [complexId]);

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
    if (level <= 3) return 'pain-low';
    if (level <= 6) return 'pain-medium';
    return 'pain-high';
  };

  const getDifficultyLabel = (rating) => `${rating}/5`;

  const progressLogs = data?.logs || [];

  const calculateAvgPerWeek = (dates) => {
    if (dates.length === 0) return 0;
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const totalDays = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = totalDays / 7;
    return weeks > 0 ? (dates.length / weeks).toFixed(1) : dates.length;
  };

  const calculateAvgPerDay = (dates) => {
    if (dates.length === 0) return 0;
    const uniqueDays = new Set(dates.map((d) => d.toISOString().split('T')[0]));
    return (dates.length / uniqueDays.size).toFixed(1);
  };

  // Group logs by session
  const groupedSessions = useMemo(() => {
    const sessionsMap = {};

    progressLogs.forEach((log) => {
      const sessionDate = log.completed_at || log.created_at;
      // Use session_id if available, otherwise group by date
      const sessionKey = log.session_id || new Date(sessionDate).getTime();

      if (!sessionsMap[sessionKey]) {
        sessionsMap[sessionKey] = {
          sessionId: sessionKey,
          date: sessionDate,
          sessionComment: log.session_comment,
          exercises: []
        };
      }

      sessionsMap[sessionKey].exercises.push({
        id: log.exercise_id,
        title: log.exercise_title,
        completed: log.completed,
        painLevel: log.pain_level,
        difficultyRating: log.difficulty_rating,
        notes: log.notes
      });
    });

    // Convert to array and sort by date (newest first)
    return Object.values(sessionsMap).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [progressLogs]);

  const progressStats = useMemo(() => {
    const statistics = data?.statistics || {};
    const completionDates = progressLogs
      .map((log) => log.completed_at)
      .filter(Boolean)
      .map((value) => new Date(value))
      .sort((a, b) => a - b);

    // Calculate unique sessions
    const uniqueSessions = new Set(
      progressLogs.map((log) => log.session_id).filter(Boolean)
    );

    // Calculate unique days
    const uniqueDays = new Set(
      progressLogs
        .map((log) => {
          if (!log.completed_at) return null;
          const date = new Date(log.completed_at);
          return date.toISOString().split('T')[0];
        })
        .filter(Boolean)
    );

    // Calculate consecutive days
    const sortedDays = Array.from(uniqueDays).sort();
    let consecutiveDays = 0;
    let currentStreak = 1;

    for (let i = 1; i < sortedDays.length; i += 1) {
      const prev = new Date(sortedDays[i - 1]);
      const curr = new Date(sortedDays[i]);
      const diffDays = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak += 1;
      } else {
        consecutiveDays = Math.max(consecutiveDays, currentStreak);
        currentStreak = 1;
      }
    }
    consecutiveDays = Math.max(consecutiveDays, currentStreak);

    return {
      totalSessions: uniqueSessions.size || groupedSessions.length,
      uniqueDays: uniqueDays.size,
      consecutiveDays,
      totalLogs: Number.parseInt(statistics.total_logs ?? progressLogs.length, 10),
      completedCount: Number.parseInt(statistics.completed_count ?? 0, 10),
      avgPain: Number.parseFloat(statistics.avg_pain_level ?? 0),
      avgDifficulty: Number.parseFloat(statistics.avg_difficulty ?? 0),
      avgPerWeek: calculateAvgPerWeek(completionDates),
      avgPerDay: calculateAvgPerDay(completionDates),
      dateRange:
        completionDates.length > 0
          ? formatDateRange(completionDates[0], completionDates[completionDates.length - 1])
          : 'Нет данных'
    };
  }, [data, progressLogs, groupedSessions]);

  const patientName = complex?.patient_name || 'Пациент';
  const complexName =
    complex?.diagnosis_name ||
    complex?.diagnosis?.name ||
    complex?.name ||
    'Комплекс';

  if (loading) {
    return <ProgressSkeleton />;
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
                <div className="stat-value">{progressStats.totalSessions}</div>
                <div className="stat-label">Всего сессий</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progressStats.uniqueDays} дней</div>
                <div className="stat-label">Подряд: {progressStats.consecutiveDays}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{progressStats.avgPerWeek}</div>
                <div className="stat-label">В среднем в неделю</div>
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
            <div className="sessions-container">
              {groupedSessions.map((session, index) => {
                const performedExercisesMap = session.exercises.reduce((acc, exercise) => {
                  acc[exercise.id] = exercise;
                  return acc;
                }, {});

                const baseExercises =
                  complexExercises.length > 0
                    ? complexExercises
                    : session.exercises.map((exercise) => ({
                        exercise_id: exercise.id,
                        title: exercise.title
                      }));

                const allSessionExercises = baseExercises.map((exercise) => {
                  const performed = performedExercisesMap[exercise.exercise_id];

                  if (performed) {
                    return {
                      ...performed,
                      title: exercise.title,
                      wasPerformed: true
                    };
                  }

                  return {
                    id: exercise.exercise_id,
                    title: exercise.title,
                    completed: false,
                    painLevel: null,
                    difficultyRating: null,
                    notes: null,
                    wasPerformed: false
                  };
                });

                const completedCount = allSessionExercises.filter((exercise) => exercise.completed)
                  .length;
                const totalCount = allSessionExercises.length;
                const completionPercent =
                  totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                return (
                  <div key={session.sessionId} className="session-card">
                    <div className="session-header">
                      <div className="session-info">
                        <h3>
                          <CalendarRange size={16} aria-hidden="true" />
                          <span>
                            {formatDateShort(session.date)} — Сессия #
                            {groupedSessions.length - index}
                          </span>
                        </h3>
                        <span className="session-time">
                          <Clock size={14} aria-hidden="true" />
                          {new Date(session.date).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="session-progress">
                      <div className="progress-text">
                        <strong>Выполнено:</strong> {completedCount} из {totalCount} (
                        {completionPercent}%)
                      </div>
                      <div className="progress-bar" aria-hidden="true">
                        <div
                          className="progress-fill"
                          style={{ width: `${completionPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="session-table-wrapper">
                      <table className="session-table">
                        <thead>
                          <tr>
                            <th>Упражнение</th>
                            <th className="text-center">Статус</th>
                            <th className="text-center">Боль</th>
                            <th className="text-center">Сложность</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allSessionExercises.map((exercise, exIndex) => {
                            const statusClass = exercise.wasPerformed
                              ? exercise.completed
                                ? 'completed'
                                : 'skipped'
                              : 'not-attempted';
                            const statusLabel = exercise.wasPerformed
                              ? exercise.completed
                                ? 'Выполнено'
                                : 'Не выполнено'
                              : 'Пропущено';
                            const statusIcon = exercise.wasPerformed ? (
                              exercise.completed ? (
                                <CheckCircle2 size={14} aria-hidden="true" />
                              ) : (
                                <XCircle size={14} aria-hidden="true" />
                              )
                            ) : (
                              <SkipForward size={14} aria-hidden="true" />
                            );

                            return (
                              <tr
                                key={`${session.sessionId}-${exercise.id}-${exIndex}`}
                                className={exercise.wasPerformed ? '' : 'skipped-exercise'}
                              >
                                <td className="exercise-name">{exercise.title}</td>
                                <td className="text-center">
                                  <span className={`status-badge ${statusClass}`}>
                                    {statusIcon}
                                    <span>{statusLabel}</span>
                                  </span>
                                </td>
                                <td className="text-center">
                                  {exercise.painLevel !== null &&
                                  exercise.painLevel !== undefined ? (
                                    <span
                                      className={`pain-badge ${getPainClass(exercise.painLevel)}`}
                                    >
                                      {exercise.painLevel}
                                    </span>
                                  ) : (
                                    <span className="no-data">—</span>
                                  )}
                                </td>
                                <td className="text-center difficulty-cell">
                                  {exercise.difficultyRating ? (
                                    <span className="difficulty-badge">
                                      {getDifficultyLabel(exercise.difficultyRating)}
                                    </span>
                                  ) : (
                                    <span className="no-data">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                  {session.sessionComment && (
                    <div className="session-comment">
                      <MessageCircle size={16} aria-hidden="true" />
                      <span>
                        <strong>Самочувствие:</strong> {session.sessionComment}
                      </span>
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ViewProgress;
