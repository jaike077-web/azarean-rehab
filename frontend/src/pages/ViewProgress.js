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
  Flame,
  CalendarDays,
  CheckCircle2,
  XCircle,
  MessageCircle
} from 'lucide-react';
import { Skeleton, SkeletonText } from '../components/Skeleton';
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

        const progressLogs = progressPayload.logs || [];

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
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatDateOnly = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const formatTime = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPainClass = (level) => {
    if (level <= 3) return 'low';
    if (level <= 6) return 'medium';
    return 'high';
  };

  const groupBySession = (logs) => {
    const sessions = {};

    logs.forEach((log) => {
      const sessionKey = log.session_id ?? (log.completed_at ? new Date(log.completed_at).getTime() : log.id);

      if (!sessions[sessionKey]) {
        sessions[sessionKey] = {
          session_id: sessionKey,
          date: log.completed_at,
          session_comment: log.session_comment,
          exercises: []
        };
      }

      const existingExercise = sessions[sessionKey].exercises.find(
        (exercise) => exercise.exercise_id === log.exercise_id
      );

      if (!existingExercise) {
        sessions[sessionKey].exercises.push({
          exercise_id: log.exercise_id,
          title: log.exercise_title,
          completed: log.completed,
          pain_level: log.pain_level,
          difficulty_rating: log.difficulty_rating,
          notes: log.notes
        });
      }
    });

    return Object.values(sessions).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const progressLogs = data?.logs || [];
  const statistics = data?.statistics || {};
  const uniqueDays = Number.parseInt(statistics.unique_days ?? 0, 10);

  const sessions = useMemo(() => groupBySession(progressLogs), [progressLogs]);

  const dateRange = useMemo(() => {
    if (sessions.length === 0) return 'Нет данных';
    const dates = sessions.map((session) => new Date(session.date));
    const firstDate = new Date(Math.min(...dates));
    const lastDate = new Date(Math.max(...dates));
    return `${formatDate(firstDate)} — ${formatDate(lastDate)}`;
  }, [sessions]);

  const calculateAvgPerWeek = () => {
    if (sessions.length === 0) return 0;
    const dates = sessions.map((session) => new Date(session.date));
    const firstDate = new Date(Math.min(...dates));
    const lastDate = new Date(Math.max(...dates));
    const totalDays = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;
    const totalWeeks = totalDays / 7;
    return totalWeeks > 0 ? sessions.length / totalWeeks : 0;
  };

  const calculateAvgPerDay = () => {
    const uniqueDays = Number.parseInt(statistics.unique_days ?? 0, 10);
    return uniqueDays > 0 ? sessions.length / uniqueDays : 0;
  };

  const calculateConsecutiveDays = () => {
    const dates = [
      ...new Set(progressLogs.map((log) => formatDateOnly(log.completed_at)).filter(Boolean))
    ].sort((a, b) => new Date(b) - new Date(a));

    if (dates.length === 0) return 0;

    let consecutive = 1;
    for (let i = 0; i < dates.length - 1; i += 1) {
      const dayDiff = Math.floor(
        (new Date(dates[i]) - new Date(dates[i + 1])) / (1000 * 60 * 60 * 24)
      );
      if (dayDiff === 1) {
        consecutive += 1;
      } else {
        break;
      }
    }
    return consecutive;
  };

  const consecutiveDays = useMemo(
    () => calculateConsecutiveDays(),
    [progressLogs]
  );

  const patientName = complex?.patient_name || 'Пациент';
  const complexName =
    complex?.diagnosis_name ||
    complex?.diagnosis?.name ||
    complex?.name ||
    'Комплекс';

  const ProgressSkeleton = () => (
    <div className="progress-page">
      <div className="loading">Загрузка...</div>
      <div className="progress-header">
        <SkeletonText width="40%" lines={1} />
        <SkeletonText width="60%" lines={1} />
        <SkeletonText width="35%" lines={1} />
      </div>
      <div className="sessions-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="session-block">
            <SkeletonText width="70%" lines={1} />
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
            <div className="patient-info-section">
              <div className="patient-header">
                <div className="progress-avatar">
                  <User size={28} aria-hidden="true" />
                </div>
                <div>
                  <h1>Прогресс пациента</h1>
                  <p className="patient-name">{patientName}</p>
                  <p className="complex-name">{complexName}</p>
                  <p className="date-range">
                    <CalendarRange size={16} aria-hidden="true" />
                    <span>{dateRange}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="progress-streak">
              <div className="streak-stats">
                <div className="streak-item">
                  <BarChart3 size={18} aria-hidden="true" />
                  <span className="streak-label">Всего дней:</span>
                  <span className="streak-value">{uniqueDays}</span>
                </div>
                <div className="streak-item">
                  <Flame size={18} aria-hidden="true" />
                  <span className="streak-label">Подряд:</span>
                  <span className="streak-value">{consecutiveDays}</span>
                </div>
              </div>
              <div className="streak-bar">
                <div
                  className="streak-fill"
                  style={{
                    width: `${
                      uniqueDays > 0
                        ? (consecutiveDays / uniqueDays) * 100
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>

            <div className="overall-stats">
              <div className="stat-card">
                <div className="stat-label">Всего выполнений</div>
                <div className="stat-value">
                  {Number.parseInt(statistics.completed_count ?? 0, 10)} сессий
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">В среднем в неделю</div>
                <div className="stat-value">{calculateAvgPerWeek().toFixed(1)} раза</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">В среднем в день</div>
                <div className="stat-value">{calculateAvgPerDay().toFixed(1)} раз</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Средняя боль</div>
                <div className="stat-value">
                  {Number.parseFloat(statistics.avg_pain_level ?? 0).toFixed(1)}/10
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Средняя сложность</div>
                <div className="stat-value">
                  {Number.parseFloat(statistics.avg_difficulty ?? 0).toFixed(1)}/5
                </div>
              </div>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="empty-state">
              <h3>Прогресса пока нет</h3>
              <p>Пациент ещё не выполнял упражнения из этого комплекса.</p>
            </div>
          ) : (
            <div className="sessions-list">
              {sessions.map((session, index) => (
                <div key={session.session_id} className="session-block">
                  <div className="session-header">
                    <div className="session-title">
                      <CalendarDays size={18} aria-hidden="true" />
                      <h3>
                        {formatDate(session.date)} — Сессия #{sessions.length - index}
                      </h3>
                    </div>
                    <span className="session-time">{formatTime(session.date)}</span>
                  </div>

                  <div className="session-table-wrapper">
                    <table className="session-table">
                      <thead>
                        <tr>
                          <th>Упражнение</th>
                          <th>Статус</th>
                          <th>Боль</th>
                          <th>Сложность</th>
                          <th>Комментарий</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.exercises.map((exercise) => (
                          <tr key={exercise.exercise_id}>
                            <td className="exercise-name">{exercise.title}</td>
                            <td className="exercise-status">
                              {exercise.completed ? (
                                <span className="status-badge status-completed">
                                  <CheckCircle2 size={16} aria-hidden="true" />
                                  Выполнено
                                </span>
                              ) : (
                                <span className="status-badge status-skipped">
                                  <XCircle size={16} aria-hidden="true" />
                                  Пропущено
                                </span>
                              )}
                            </td>
                            <td className="pain-cell">
                              {typeof exercise.pain_level === 'number' ? (
                                <span className={`pain-badge pain-${getPainClass(exercise.pain_level)}`}>
                                  {exercise.pain_level}
                                </span>
                              ) : (
                                <span className="no-data">—</span>
                              )}
                            </td>
                            <td className="difficulty-cell">
                              {typeof exercise.difficulty_rating === 'number' ? (
                                <span
                                  className="difficulty-badge"
                                  title={`Сложность: ${exercise.difficulty_rating}/5`}
                                >
                                  {exercise.difficulty_rating}/5
                                </span>
                              ) : (
                                <span className="no-data">—</span>
                              )}
                            </td>
                            <td className="notes-cell">
                              {exercise.notes ? (
                                <span className="notes-text">{exercise.notes}</span>
                              ) : (
                                <span className="no-data">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {session.session_comment && (
                    <div className="session-comment">
                      <MessageCircle size={18} aria-hidden="true" />
                      <span>
                        <strong>Самочувствие:</strong> "{session.session_comment}"
                      </span>
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
