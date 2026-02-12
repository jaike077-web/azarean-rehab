import React, { useState, useEffect } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Users, UserCheck, Activity, BookOpen, MessageSquare, FileText, Shield, BarChart3, TrendingUp, Flame } from 'lucide-react';
import './AdminStats.css';

function AdminStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await admin.getStats();
      setStats(response.data?.data || response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
      toast.error('Ошибка загрузки статистики');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-stats">
        <h2 className="admin-section-title">
          <Shield size={22} />
          <span>Статистика платформы</span>
        </h2>
        <div className="admin-stats-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="admin-stat-card skeleton-card">
              <div className="skeleton-icon" />
              <div className="skeleton-text" />
              <div className="skeleton-number" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: 'Пользователей', value: stats.users?.total || 0, sub: `${stats.users?.admins || 0} админов, ${stats.users?.instructors || 0} инструкторов`, icon: Users, color: '#6366f1' },
    { label: 'Активных юзеров', value: stats.users?.active || 0, icon: UserCheck, color: '#10b981' },
    { label: 'Пациентов', value: stats.patients?.total || 0, sub: `${stats.patients?.active || 0} активных`, icon: Users, color: '#3b82f6' },
    { label: 'Программ', value: stats.programs?.total || 0, sub: `${stats.programs?.active || 0} активных`, icon: Activity, color: '#f59e0b' },
    { label: 'Комплексов', value: stats.complexes?.total || 0, icon: BookOpen, color: '#8b5cf6' },
    { label: 'Упражнений', value: stats.exercises?.total || 0, icon: BarChart3, color: '#ec4899' },
    { label: 'Записей дневника', value: stats.diary_entries?.total || 0, icon: FileText, color: '#14b8a6' },
    { label: 'Сообщений', value: stats.messages?.total || 0, icon: MessageSquare, color: '#f97316' },
    { label: 'Советов', value: stats.tips?.total || 0, sub: `${stats.tips?.active || 0} активных`, icon: TrendingUp, color: '#06b6d4' },
    { label: 'Фаз', value: stats.phases?.total || 0, icon: BookOpen, color: '#84cc16' },
    { label: 'Видео', value: stats.videos?.total || 0, icon: Activity, color: '#a855f7' },
    { label: 'Активных стриков', value: stats.active_streaks || 0, icon: Flame, color: '#ef4444' },
    { label: 'Аудит-записей', value: stats.audit_logs?.total || 0, icon: Shield, color: '#64748b' },
    { label: 'Регистраций (мес.)', value: stats.registrations_this_month || 0, icon: TrendingUp, color: '#22c55e' },
  ];

  return (
    <div className="admin-stats">
      <h2 className="admin-section-title">
        <Shield size={22} />
        <span>Статистика платформы</span>
      </h2>

      <div className="admin-stats-grid">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="admin-stat-card">
              <div className="admin-stat-icon" style={{ background: `${card.color}15`, color: card.color }}>
                <Icon size={20} />
              </div>
              <div className="admin-stat-info">
                <div className="admin-stat-value">{card.value}</div>
                <div className="admin-stat-label">{card.label}</div>
                {card.sub && <div className="admin-stat-sub">{card.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <button className="admin-refresh-btn" onClick={loadStats}>
        Обновить статистику
      </button>
    </div>
  );
}

export default AdminStats;
