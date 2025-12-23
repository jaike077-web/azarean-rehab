import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { complexes, progress } from '../services/api';
import BackButton from '../components/BackButton';
import Breadcrumbs from '../components/Breadcrumbs';
import { LayoutDashboard, ClipboardList, BarChart3 } from 'lucide-react';
import { TableSkeleton } from '../components/Skeleton';
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

  const getCompletionRate = () => {
    if (!complex || !progressData) return 0;
    const totalExercises = complex.exercises.length;
    const completedCount = progressData.statistics.completed_count;
    return Math.round((completedCount / totalExercises) * 100) || 0;
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

  if (loading) {
    return <TableSkeleton rows={6} columns={5} />;
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

  return (
    <div className="view-progress-page">
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
            label: `Прогресс: ${complex?.patient_name || '...'}` 
          }
        ]}
      />

      <div className="back-button-wrapper">
        <BackButton to="/my-complexes" label="К списку комплексов" />
      </div>

      <div className="page-header">
        <div>
          <h1>
            <BarChart3 className="page-icon" size={28} />
            <span>Прогресс пациента</span>
          </h1>
          <p>{complex.patient_name}</p>
        </div>
      </div>

      <div className="stats-overview">
        <div className="stat-big">
          <div className="stat-value">{getCompletionRate()}%</div>
          <div className="stat-label">Выполнено</div>
        </div>
        <div className="stat-big">
          <div className="stat-value">{progressData.statistics.completed_count || 0}</div>
          <div className="stat-label">Упражнений выполнено</div>
        </div>
        <div className="stat-big">
          <div className="stat-value">{progressData.total || 0}</div>
          <div className="stat-label">Всего записей</div>
        </div>
        <div className="stat-big">
          <div className="stat-value">
            {progressData.statistics.avg_pain_level ? 
              parseFloat(progressData.statistics.avg_pain_level).toFixed(1) : '-'}
          </div>
          <div className="stat-label">Средний уровень боли</div>
        </div>
      </div>

      <div className="complex-info-box">
        <h3>Информация о комплексе</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Диагноз:</span>
            <span className="info-value">{complex.diagnosis_name || 'Не указан'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Упражнений в комплексе:</span>
            <span className="info-value">{complex.exercises.length}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Создан:</span>
            <span className="info-value">{formatDate(complex.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="progress-list">
        <h2>История выполнения</h2>
        {progressData.logs.length === 0 ? (
          <div className="empty-state">
            <p>Пациент ещё не выполнял упражнения</p>
          </div>
        ) : (
          <div className="logs-table">
            <div className="table-header">
              <div className="col-date">Дата и время</div>
              <div className="col-exercise">Упражнение</div>
              <div className="col-status">Статус</div>
              <div className="col-pain">Боль</div>
              <div className="col-difficulty">Сложность</div>
            </div>
            {progressData.logs.map((log) => (
              <div key={log.id} className="table-row">
                <div className="col-date">{formatDate(log.completed_at || log.created_at)}</div>
                <div className="col-exercise">{log.exercise_title}</div>
                <div className="col-status">
                  {log.completed ? (
                    <span className="status-badge completed">✓ Выполнено</span>
                  ) : (
                    <span className="status-badge pending">○ Не выполнено</span>
                  )}
                </div>
                <div className="col-pain">
                  <span className={`pain-level level-${log.pain_level || 0}`}>
                    {log.pain_level !== null ? log.pain_level : '-'}
                  </span>
                </div>
                <div className="col-difficulty">
                  {log.difficulty_rating ? `${log.difficulty_rating}/10` : '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {progressData.logs.length > 0 && (
        <div className="notes-section">
          <h3>Комментарии пациента</h3>
          {progressData.logs.filter(log => log.notes).length === 0 ? (
            <p className="no-notes">Комментариев нет</p>
          ) : (
            <div className="notes-list">
              {progressData.logs.filter(log => log.notes).map((log) => (
                <div key={log.id} className="note-item">
                  <div className="note-header">
                    <strong>{log.exercise_title}</strong>
                    <span className="note-date">{formatDate(log.created_at)}</span>
                  </div>
                  <p className="note-text">{log.notes}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ViewProgress;
