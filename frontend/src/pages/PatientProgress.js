import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { progress } from '../services/api';
import { formatDateShortWithYear } from '../utils/dateUtils';
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
import s from './PatientProgress.module.css';

function PatientProgressSkeleton() {
  return (
    <div className={s.patientProgressPage}>
      <div className={s.patientProgressLoading}>
        <div className={s.patientHeader}>
          <div className={s.patientAvatar}>
            <SkeletonAvatar size="large" />
          </div>
          <div className={s.patientInfo}>
            <Skeleton className={s.skeletonTitle} />
            <SkeletonText lines={2} />
          </div>
        </div>

        <div className={s.overallStats}>
          <Skeleton className={s.skeletonTitle} />
          <div className={s.statsGrid}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={s.statCard}>
                <Skeleton className={s.skeletonIcon} />
                <div className={s.statContent}>
                  <Skeleton className={s.skeletonTitle} />
                  <Skeleton className={`${s.skeletonText} ${s.short}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={s.complexesSection}>
          <Skeleton className={s.skeletonTitle} />
          <div className={s.complexesGrid}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={s.complexCard}>
                <Skeleton className={s.skeletonTitle} />
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

  // Используем formatDateShortWithYear из utils/dateUtils.js
  const formatDate = formatDateShortWithYear;

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
        className: s.excellent
      };
    }
    if (avgPain <= 4) {
      return {
        icon: <ThumbsUp size={14} />,
        text: 'Хорошо',
        className: s.good
      };
    }
    if (avgPain <= 6) {
      return {
        icon: <AlertTriangle size={14} />,
        text: 'Средне',
        className: s.medium
      };
    }
    return {
      icon: <XCircle size={14} />,
      text: 'Высокая',
      className: s.high
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
      <div className={s.patientProgressPage}>
        <div className={s.error}>
          <h2>Ошибка</h2>
          <p>{error || 'Данные не найдены'}</p>
          <button
            className={s.btnPrimary}
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
    <div className={s.patientProgressPage}>
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

      <div className={s.backButtonWrapper}>
        <BackButton to="/dashboard?tab=patients" label="К списку пациентов" />
      </div>

      <div className={s.patientHeader}>
        <div className={s.patientAvatar} aria-hidden="true">
          <User size={32} />
        </div>
        <div className={s.patientInfo}>
          <h1>{patient.full_name || 'Пациент'}</h1>
          <p className={s.patientMeta}>
            {patient.email && <span>{patient.email}</span>}
            {patient.phone && <span>{patient.phone}</span>}
            <span className={s.patientMetaDate}>
              {`Добавлен: ${formatDate(patient.created_at)}`}
            </span>
          </p>
        </div>
      </div>

      <div className={s.overallStats}>
        <h2 className={s.sectionTitle}>
          <BarChart3 size={20} />
          Общая статистика
        </h2>
        <div className={s.statsGrid}>
          <div className={s.statCard}>
            <div className={s.statIcon}>
              <ClipboardList size={22} />
            </div>
            <div className={s.statContent}>
              <div className={s.statValue}>{complexes.length}</div>
              <div className={s.statLabel}>Всего комплексов</div>
            </div>
          </div>

          <div className={s.statCard}>
            <div className={s.statIcon}>
              <Activity size={22} />
            </div>
            <div className={s.statContent}>
              <div className={s.statValue}>{overallStats.totalSessions}</div>
              <div className={s.statLabel}>Всего сессий</div>
            </div>
          </div>

          <div className={s.statCard}>
            <div className={s.statIcon}>
              <Calendar size={22} />
            </div>
            <div className={s.statContent}>
              <div className={s.statValue}>{overallStats.uniqueDays}</div>
              <div className={s.statLabel}>Дней тренировок</div>
            </div>
          </div>

          <div className={s.statCard}>
            <div className={`${s.statIcon} ${s.pain}`}>
              <TrendingDown size={22} />
            </div>
            <div className={s.statContent}>
              <div className={s.statValue}>
                {overallStats.overallAvgPain.toFixed(1)}/10
              </div>
              <div className={s.statLabel}>Средняя боль</div>
            </div>
          </div>
        </div>

        <div className={s.statsSubgrid}>
          <div className={s.statPill}>
            <span>Всего отметок:</span>
            <strong>{overallStats.totalLogs}</strong>
          </div>
          <div className={s.statPill}>
            <span>Средняя сложность:</span>
            <strong>{overallStats.overallAvgDifficulty.toFixed(1)}/5</strong>
          </div>
        </div>
      </div>

      {activeComplexes.length > 0 && (
        <div className={s.complexesSection}>
          <h2 className={s.sectionTitle}>
            <Activity size={20} />
            Активные комплексы ({activeComplexes.length})
          </h2>
          <div className={s.complexesGrid}>
            {activeComplexes.map((complex) => {
              const painTrend = getPainTrend(complex.avgPain);

              return (
                <div
                  key={complex.id}
                  className={`${s.complexCard} ${s.active}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => viewComplexProgress(complex.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      viewComplexProgress(complex.id, event);
                    }
                  }}
                >
                  <div className={s.complexHeader}>
                    <div className={s.complexTitle}>
                      <h3>{complex.diagnosis_name || 'Без диагноза'}</h3>
                      <span className={`${s.statusBadge} ${s.active}`}>Активный</span>
                    </div>
                  </div>

                  <div className={s.complexStats}>
                    <div className={s.complexStat}>
                      <span className={s.label}>Сессий:</span>
                      <span className={s.value}>{complex.total_sessions}</span>
                    </div>
                    <div className={s.complexStat}>
                      <span className={s.label}>Последняя:</span>
                      <span className={s.value}>
                        {formatDate(complex.last_activity)}
                      </span>
                    </div>
                  </div>

                  <div className={s.complexMetrics}>
                    <div className={s.metric}>
                      <span className={s.metricLabel}>Боль:</span>
                      <span
                        className={`metric-value pain ${getPainClass(
                          complex.avgPain
                        )}`}
                      >
                        {complex.avgPain.toFixed(1)}
                        <span className={`${s.trendBadge} ${painTrend.className}`}>
                          {painTrend.icon}
                          {painTrend.text}
                        </span>
                      </span>
                    </div>
                    <div className={s.metric}>
                      <span className={s.metricLabel}>Сложность:</span>
                      <span className={s.metricValue}>
                        {complex.avgDifficulty.toFixed(1)}/5
                      </span>
                    </div>
                  </div>

                  <div className={s.complexFooter}>
                    <button
                      className={s.btnDetails}
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
        <div className={s.complexesSection}>
          <h2 className={s.sectionTitle}>
            <ClipboardList size={20} />
            Завершённые комплексы ({completedComplexes.length})
          </h2>
          <div className={s.complexesGrid}>
            {completedComplexes.map((complex) => (
              <div
                key={complex.id}
                className={`${s.complexCard} ${s.completed}`}
                role="button"
                tabIndex={0}
                onClick={() => viewComplexProgress(complex.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    viewComplexProgress(complex.id, event);
                  }
                }}
              >
                <div className={s.complexHeader}>
                  <div className={s.complexTitle}>
                    <h3>{complex.diagnosis_name || 'Без диагноза'}</h3>
                    <span className={`${s.statusBadge} ${s.completed}`}>Завершён</span>
                  </div>
                </div>

                <div className={s.complexStats}>
                  <div className={s.complexStat}>
                    <span className={s.label}>Сессий:</span>
                    <span className={s.value}>{complex.total_sessions}</span>
                  </div>
                  <div className={s.complexStat}>
                    <span className={s.label}>Завершён:</span>
                    <span className={s.value}>
                      {formatDate(complex.last_activity)}
                    </span>
                  </div>
                </div>

                <div className={s.complexMetrics}>
                  <div className={s.metric}>
                    <span className={s.metricLabel}>Финальная боль:</span>
                    <span
                      className={`metric-value pain ${getPainClass(
                        complex.avgPain
                      )}`}
                    >
                      {complex.avgPain.toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className={s.complexFooter}>
                  <button
                    className={s.btnDetails}
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
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>
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
