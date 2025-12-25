import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { progress } from '../services/api';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import {
  Activity,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  ThumbsUp,
  TrendingDown,
  User,
  Users,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonText
} from '../components/Skeleton';
import './PatientProgress.css';

function PatientProgressSkeleton() {
  return (
    <div className="patient-progress-page">
      <div className="patient-progress-loading">
        <div className="patient-header">
          <div className="patient-avatar">
            <SkeletonAvatar size="large" />
          </div>
          <div className="patient-info">
            <Skeleton className="skeleton-title" />
            <SkeletonText lines={2} />
          </div>
        </div>

        <div className="overall-stats">
          <Skeleton className="skeleton-title" />
          <div className="stats-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="stat-card">
                <Skeleton className="skeleton-icon" />
                <div className="stat-content">
                  <Skeleton className="skeleton-title" />
                  <Skeleton className="skeleton-text short" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="complexes-section">
          <Skeleton className="skeleton-title" />
          <div className="complexes-grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="complex-card">
                <Skeleton className="skeleton-title" />
                <SkeletonText lines={3} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PatientProgress() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await progress.getPatientProgress(patientId);
        setData(response.data);
      } catch (err) {
        console.error('Error loading patient progress:', err);
        setError('Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [patientId]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Нет данных';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getPainClass = (level) => {
    if (level <= 3) return 'low';
    if (level <= 6) return 'medium';
    return 'high';
  };

  const getPainTrend = (avgPain) => {
    if (avgPain <= 2) {
      return {
        icon: <CheckCircle2 size={14} />,
        text: 'Отлично',
        className: 'excellent'
      };
    }
    if (avgPain <= 4) {
      return {
        icon: <ThumbsUp size={14} />,
        text: 'Хорошо',
        className: 'good'
      };
    }
    if (avgPain <= 6) {
      return {
        icon: <AlertTriangle size={14} />,
        text: 'Средне',
        className: 'medium'
      };
    }
    return {
      icon: <XCircle size={14} />,
      text: 'Высокая',
      className: 'high'
    };
  };

  const viewComplexProgress = (complexId, event) => {
    if (event) {
      event.stopPropagation();
    }
    navigate(`/progress/${complexId}`);
  };

  const derivedData = useMemo(() => {
    const patient = data?.patient || {};
    const complexes = data?.complexes || [];
    const overallStats = data?.overallStats || {};

    const parsedOverallStats = {
      totalSessions: Number.parseInt(overallStats.total_sessions, 10) || 0,
      uniqueDays: Number.parseInt(overallStats.unique_days, 10) || 0,
      totalLogs: Number.parseInt(overallStats.total_logs, 10) || 0,
      overallAvgPain:
        Number.parseFloat(overallStats.overall_avg_pain ?? 0) || 0,
      overallAvgDifficulty:
        Number.parseFloat(overallStats.overall_avg_difficulty ?? 0) || 0
    };

    const normalizedComplexes = complexes.map((complex) => ({
      ...complex,
      avgPain: Number.parseFloat(complex.avg_pain ?? 0) || 0,
      avgDifficulty: Number.parseFloat(complex.avg_difficulty ?? 0) || 0
    }));

    return {
      patient,
      complexes: normalizedComplexes,
      overallStats: parsedOverallStats,
      activeComplexes: normalizedComplexes.filter((complex) => complex.is_active),
      completedComplexes: normalizedComplexes.filter(
        (complex) => !complex.is_active
      )
    };
  }, [data]);

  if (loading) {
    return <PatientProgressSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="patient-progress-page">
        <div className="error">
          <h2>Ошибка</h2>
          <p>{error || 'Данные не найдены'}</p>
          <button
            className="btn-primary"
            onClick={() => navigate('/dashboard?tab=patients')}
          >
            Вернуться к пациентам
          </button>
        </div>
      </div>
    );
  }

  const {
    patient,
    complexes,
    overallStats,
    activeComplexes,
    completedComplexes
  } = derivedData;

  return (
    <div className="patient-progress-page">
      <Breadcrumbs
        items={[
          {
            icon: <LayoutDashboard size={16} />,
            label: 'Главная',
            path: '/dashboard'
          },
          {
            icon: <Users size={16} />,
            label: 'Пациенты',
            path: '/dashboard?tab=patients'
          },
          {
            icon: <BarChart3 size={16} />,
            label: `Прогресс: ${patient.full_name || 'Пациент'}`
          }
        ]}
      />

      <div className="back-button-wrapper">
        <BackButton to="/dashboard?tab=patients" label="К списку пациентов" />
      </div>

      <div className="patient-header">
        <div className="patient-avatar" aria-hidden="true">
          <User size={32} />
        </div>
        <div className="patient-info">
          <h1>{patient.full_name || 'Пациент'}</h1>
          <p className="patient-meta">
            {patient.email && <span>{patient.email}</span>}
            {patient.phone && <span>{patient.phone}</span>}
            <span className="patient-meta-date">
              {`Добавлен: ${formatDate(patient.created_at)}`}
            </span>
          </p>
        </div>
      </div>

      <div className="overall-stats">
        <h2 className="section-title">
          <BarChart3 size={20} />
          Общая статистика
        </h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <ClipboardList size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{complexes.length}</div>
              <div className="stat-label">Всего комплексов</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Activity size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{overallStats.totalSessions}</div>
              <div className="stat-label">Всего сессий</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Calendar size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{overallStats.uniqueDays}</div>
              <div className="stat-label">Дней тренировок</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon pain">
              <TrendingDown size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-value">
                {overallStats.overallAvgPain.toFixed(1)}/10
              </div>
              <div className="stat-label">Средняя боль</div>
            </div>
          </div>
        </div>

        <div className="stats-subgrid">
          <div className="stat-pill">
            <span>Всего отметок:</span>
            <strong>{overallStats.totalLogs}</strong>
          </div>
          <div className="stat-pill">
            <span>Средняя сложность:</span>
            <strong>{overallStats.overallAvgDifficulty.toFixed(1)}/5</strong>
          </div>
        </div>
      </div>

      {activeComplexes.length > 0 && (
        <div className="complexes-section">
          <h2 className="section-title">
            <Activity size={20} />
            Активные комплексы ({activeComplexes.length})
          </h2>
          <div className="complexes-grid">
            {activeComplexes.map((complex) => {
              const painTrend = getPainTrend(complex.avgPain);

              return (
                <div
                  key={complex.id}
                  className="complex-card active"
                  role="button"
                  tabIndex={0}
                  onClick={() => viewComplexProgress(complex.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      viewComplexProgress(complex.id, event);
                    }
                  }}
                >
                  <div className="complex-header">
                    <div className="complex-title">
                      <h3>{complex.diagnosis_name || 'Без диагноза'}</h3>
                      <span className="status-badge active">Активный</span>
                    </div>
                  </div>

                  <div className="complex-stats">
                    <div className="complex-stat">
                      <span className="label">Сессий:</span>
                      <span className="value">{complex.total_sessions}</span>
                    </div>
                    <div className="complex-stat">
                      <span className="label">Последняя:</span>
                      <span className="value">
                        {formatDate(complex.last_activity)}
                      </span>
                    </div>
                  </div>

                  <div className="complex-metrics">
                    <div className="metric">
                      <span className="metric-label">Боль:</span>
                      <span
                        className={`metric-value pain ${getPainClass(
                          complex.avgPain
                        )}`}
                      >
                        {complex.avgPain.toFixed(1)}
                        <span className={`trend-badge ${painTrend.className}`}>
                          {painTrend.icon}
                          {painTrend.text}
                        </span>
                      </span>
                    </div>
                    <div className="metric">
                      <span className="metric-label">Сложность:</span>
                      <span className="metric-value">
                        {complex.avgDifficulty.toFixed(1)}/5
                      </span>
                    </div>
                  </div>

                  <div className="complex-footer">
                    <button
                      className="btn-details"
                      onClick={(event) => viewComplexProgress(complex.id, event)}
                    >
                      Подробнее
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completedComplexes.length > 0 && (
        <div className="complexes-section">
          <h2 className="section-title">
            <ClipboardList size={20} />
            Завершённые комплексы ({completedComplexes.length})
          </h2>
          <div className="complexes-grid">
            {completedComplexes.map((complex) => (
              <div
                key={complex.id}
                className="complex-card completed"
                role="button"
                tabIndex={0}
                onClick={() => viewComplexProgress(complex.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    viewComplexProgress(complex.id, event);
                  }
                }}
              >
                <div className="complex-header">
                  <div className="complex-title">
                    <h3>{complex.diagnosis_name || 'Без диагноза'}</h3>
                    <span className="status-badge completed">Завершён</span>
                  </div>
                </div>

                <div className="complex-stats">
                  <div className="complex-stat">
                    <span className="label">Сессий:</span>
                    <span className="value">{complex.total_sessions}</span>
                  </div>
                  <div className="complex-stat">
                    <span className="label">Завершён:</span>
                    <span className="value">
                      {formatDate(complex.last_activity)}
                    </span>
                  </div>
                </div>

                <div className="complex-metrics">
                  <div className="metric">
                    <span className="metric-label">Финальная боль:</span>
                    <span
                      className={`metric-value pain ${getPainClass(
                        complex.avgPain
                      )}`}
                    >
                      {complex.avgPain.toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className="complex-footer">
                  <button
                    className="btn-details"
                    onClick={(event) => viewComplexProgress(complex.id, event)}
                  >
                    Посмотреть
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {complexes.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <ClipboardList size={32} />
          </div>
          <h3>Нет комплексов</h3>
          <p>У этого пациента пока нет созданных комплексов.</p>
        </div>
      )}
    </div>
  );
}

export default PatientProgress;
