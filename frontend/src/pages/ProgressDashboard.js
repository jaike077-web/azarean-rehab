import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Calendar,
  ChevronRight,
  TrendingDown,
  User,
} from 'lucide-react';
import { patients } from '../services/api';
import { formatDateShort } from '../utils/dateUtils';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import './ProgressDashboard.css';

const getPainStatus = (avgPain) => {
  if (avgPain == null) {
    return { color: 'gray', text: 'Нет данных' };
  }
  if (avgPain <= 3) {
    return { color: 'green', text: 'Отлично' };
  }
  if (avgPain <= 6) {
    return { color: 'yellow', text: 'Средне' };
  }
  return { color: 'red', text: 'Высокая' };
};

const getActivityStatus = (lastActivity, sessionsLastWeek) => {
  if (!lastActivity) {
    return { color: 'gray', text: 'Нет активности' };
  }

  const daysSinceActivity = Math.floor(
    (new Date() - new Date(lastActivity)) / (1000 * 60 * 60 * 24)
  );

  if (sessionsLastWeek >= 3) {
    return { color: 'green', text: 'Активен' };
  }
  if (daysSinceActivity <= 7) {
    return { color: 'blue', text: 'Тренируется' };
  }
  if (daysSinceActivity <= 14) {
    return { color: 'yellow', text: 'Неактивен' };
  }
  return { color: 'red', text: 'Давно не тренировался' };
};

// Форматирование даты с относительным временем для недавних дат
const formatDate = (dateString) => {
  if (!dateString) return 'Нет данных';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Нет данных';

  const today = new Date();
  const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return formatDateShort(dateString);
};

const ProgressDashboardSkeleton = () => (
  <div className="progress-dashboard">
    <div className="dashboard-header">
      <div className="header-title">
        <Skeleton className="skeleton-icon" />
        <div>
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-subtitle" />
        </div>
      </div>
    </div>

    <div className="overview-stats">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="stat-card" key={index}>
          <Skeleton className="skeleton-stat-icon" />
          <div className="stat-content">
            <Skeleton className="skeleton-stat-value" />
            <Skeleton className="skeleton-stat-label" />
          </div>
        </div>
      ))}
    </div>

    <div className="controls">
      <div className="filters">
        <Skeleton className="skeleton-filter" />
        <Skeleton className="skeleton-filter" />
        <Skeleton className="skeleton-filter" />
      </div>
      <div className="sort">
        <Skeleton className="skeleton-sort" />
      </div>
    </div>

    <div className="patients-grid">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="patient-progress-card" key={index}>
          <div className="card-header">
            <Skeleton className="skeleton-avatar" />
            <div className="patient-info">
              <SkeletonText lines={2} />
            </div>
            <Skeleton className="skeleton-badge" />
          </div>
          <div className="card-stats">
            <SkeletonText lines={4} />
          </div>
          <Skeleton className="skeleton-pill" />
          <Skeleton className="skeleton-button" />
        </div>
      ))}
    </div>
  </div>
);

function ProgressDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('lastActivity');
  const [filterActive, setFilterActive] = useState('all');

  useEffect(() => {
    const loadPatients = async () => {
      try {
        setLoading(true);
        const response = await patients.getWithProgress();
        setData(response.data || []);
      } catch (error) {
        console.error('Error loading patients:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPatients();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter((patient) => {
      if (filterActive === 'active') return patient.active_complexes > 0;
      if (filterActive === 'inactive') return patient.active_complexes === 0;
      return true;
    });
  }, [data, filterActive]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      if (sortBy === 'lastActivity') {
        if (!a.last_activity) return 1;
        if (!b.last_activity) return -1;
        return new Date(b.last_activity) - new Date(a.last_activity);
      }
      if (sortBy === 'pain') {
        return (b.avg_pain || 0) - (a.avg_pain || 0);
      }
      if (sortBy === 'name') {
        return a.full_name.localeCompare(b.full_name, 'ru');
      }
      return 0;
    });
  }, [filteredData, sortBy]);

  const stats = useMemo(() => {
    return {
      total: data.length,
      withProgress: data.filter((patient) => patient.has_progress).length,
      activeComplexes: data.reduce((sum, patient) => sum + patient.active_complexes, 0),
      totalSessions: data.reduce((sum, patient) => sum + patient.total_sessions, 0),
    };
  }, [data]);

  if (loading) {
    return <ProgressDashboardSkeleton />;
  }

  return (
    <div className="progress-dashboard">
      <div className="dashboard-header">
        <div className="header-title">
          <BarChart3 size={32} />
          <div>
            <h1>Прогресс пациентов</h1>
            <p className="subtitle">Обзор активности и результатов</p>
          </div>
        </div>
      </div>

      <div className="overview-stats">
        <div className="stat-card">
          <div className="stat-icon">
            <User size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Всего пациентов</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <Activity size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.withProgress}</div>
            <div className="stat-label">С прогрессом</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <BarChart3 size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.activeComplexes}</div>
            <div className="stat-label">Активных комплексов</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalSessions}</div>
            <div className="stat-label">Всего сессий</div>
          </div>
        </div>
      </div>

      <div className="controls">
        <div className="filters">
          <button
            className={`filter-btn ${filterActive === 'all' ? 'active' : ''}`}
            onClick={() => setFilterActive('all')}
            type="button"
          >
            Все ({data.length})
          </button>
          <button
            className={`filter-btn ${filterActive === 'active' ? 'active' : ''}`}
            onClick={() => setFilterActive('active')}
            type="button"
          >
            Активные ({data.filter((patient) => patient.active_complexes > 0).length})
          </button>
          <button
            className={`filter-btn ${filterActive === 'inactive' ? 'active' : ''}`}
            onClick={() => setFilterActive('inactive')}
            type="button"
          >
            Без комплексов ({data.filter((patient) => patient.active_complexes === 0).length})
          </button>
        </div>

        <div className="sort">
          <label htmlFor="progress-sort">Сортировка:</label>
          <select
            id="progress-sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="lastActivity">По последней активности</option>
            <option value="pain">По уровню боли</option>
            <option value="name">По имени</option>
          </select>
        </div>
      </div>

      {sortedData.length === 0 ? (
        <div className="empty-state">
          <h3>Нет пациентов</h3>
          <p>
            {filterActive === 'inactive'
              ? 'Нет пациентов без активных комплексов'
              : 'Добавьте пациентов, чтобы отслеживать их прогресс'}
          </p>
        </div>
      ) : (
        <div className="patients-grid">
          {sortedData.map((patient) => {
            const painStatus = getPainStatus(patient.avg_pain);
            const activityStatus = getActivityStatus(
              patient.last_activity,
              patient.sessions_last_week
            );

            return (
              <div
                key={patient.id}
                className="patient-progress-card"
                onClick={() => navigate(`/patient-progress/${patient.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    navigate(`/patient-progress/${patient.id}`);
                  }
                }}
              >
                <div className="card-header">
                  <div className="patient-avatar">
                    <User size={24} />
                  </div>
                  <div className="patient-info">
                    <h3>{patient.full_name}</h3>
                    <p className="patient-contact">
                      {patient.email || patient.phone || 'Нет контактов'}
                    </p>
                  </div>
                  <div className={`activity-badge ${activityStatus.color}`}>
                    {activityStatus.text}
                  </div>
                </div>

                <div className="card-stats">
                  <div className="stat-row">
                    <span className="stat-label">Комплексы:</span>
                    <span className="stat-value">
                      {patient.active_complexes > 0 ? (
                        <span className="highlight">
                          {patient.active_complexes} активных
                        </span>
                      ) : (
                        <span className="muted">Нет активных</span>
                      )}
                    </span>
                  </div>

                  <div className="stat-row">
                    <span className="stat-label">Сессий:</span>
                    <span className="stat-value">{patient.total_sessions}</span>
                  </div>

                  <div className="stat-row">
                    <span className="stat-label">Дней тренировок:</span>
                    <span className="stat-value">{patient.training_days}</span>
                  </div>

                  <div className="stat-row">
                    <span className="stat-label">Последняя тренировка:</span>
                    <span className="stat-value">
                      {formatDate(patient.last_activity)}
                    </span>
                  </div>
                </div>

                {patient.avg_pain !== null && (
                  <div className={`pain-indicator ${painStatus.color}`}>
                    <TrendingDown size={16} />
                    <span>Боль: {patient.avg_pain.toFixed(1)}/10</span>
                    <span className="pain-status">{painStatus.text}</span>
                  </div>
                )}

                <div className="card-footer">
                  <button className="btn-view-progress" type="button">
                    Посмотреть прогресс <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ProgressDashboard;
