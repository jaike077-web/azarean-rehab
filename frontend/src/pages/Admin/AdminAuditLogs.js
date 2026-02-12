import React, { useState, useEffect } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';
import './AdminAuditLogs.css';

const ACTION_LABELS = {
  CREATE: 'Создание', READ: 'Чтение', UPDATE: 'Обновление',
  DELETE: 'Удаление', LOGIN: 'Вход', LOGOUT: 'Выход',
  DEACTIVATE: 'Деактивация', ACTIVATE: 'Активация', UNLOCK: 'Разблокировка',
};

const ENTITY_LABELS = {
  user: 'Пользователь', patient: 'Пациент', complex: 'Комплекс',
  exercise: 'Упражнение', phase: 'Фаза', tip: 'Совет',
  video: 'Видео', program: 'Программа',
};

function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ user_id: '', action: '', entity_type: '', from: '', to: '' });
  const toast = useToast();

  useEffect(() => {
    admin.getUsers().then(res => setUsers(res.data?.data || [])).catch(() => {});
  }, []);

  useEffect(() => { loadLogs(); }, [page, filters]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 20 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const response = await admin.getAuditLogs(params);
      const data = response.data;
      setLogs(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      toast.error('Ошибка загрузки аудит-логов');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="admin-audit">
      <h2 className="admin-section-title">
        <ScrollText size={22} />
        <span>Журнал аудита</span>
        <span className="admin-title-badge">{total}</span>
      </h2>

      <div className="admin-filters">
        <select value={filters.user_id} onChange={e => handleFilterChange('user_id', e.target.value)}>
          <option value="">Все пользователи</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={filters.action} onChange={e => handleFilterChange('action', e.target.value)}>
          <option value="">Все действия</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.entity_type} onChange={e => handleFilterChange('entity_type', e.target.value)}>
          <option value="">Все сущности</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={e => handleFilterChange('from', e.target.value)} placeholder="От" />
        <input type="date" value={filters.to} onChange={e => handleFilterChange('to', e.target.value)} placeholder="До" />
      </div>

      {loading ? (
        <div className="admin-loading">Загрузка...</div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Пользователь</th>
                  <th>Действие</th>
                  <th>Сущность</th>
                  <th>ID</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="td-date">{formatDate(log.created_at)}</td>
                    <td className="td-name">{log.user_name || '—'}</td>
                    <td>
                      <span className={`audit-action action-${log.action?.toLowerCase()}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td>{ENTITY_LABELS[log.entity_type] || log.entity_type}</td>
                    <td className="td-id">{log.entity_id || '—'}</td>
                    <td className="td-ip">{log.ip_address || '—'}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan="6" className="td-empty">Нет записей</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="admin-pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></button>
              <span>Стр. {page} из {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AdminAuditLogs;
