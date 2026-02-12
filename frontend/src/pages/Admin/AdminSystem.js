import React, { useState, useEffect } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Server, RefreshCw, Database, Cpu, Clock, Bot, Globe } from 'lucide-react';
import './AdminSystem.css';

function AdminSystem() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const loadInfo = async () => {
    try {
      setLoading(true);
      const response = await admin.getSystemInfo();
      setInfo(response.data?.data || response.data);
    } catch (error) {
      toast.error('Ошибка загрузки системной информации');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInfo(); }, []);

  if (loading) {
    return (
      <div className="admin-system">
        <h2 className="admin-section-title"><Server size={22} /><span>Система</span></h2>
        <div className="admin-loading">Загрузка...</div>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="admin-system">
      <div className="admin-section-header">
        <h2 className="admin-section-title"><Server size={22} /><span>Система</span></h2>
        <button className="admin-btn-secondary" onClick={loadInfo}>
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      <div className="system-grid">
        <div className="system-card">
          <div className="system-card-icon"><Clock size={20} /></div>
          <div className="system-card-info">
            <div className="system-card-label">Uptime сервера</div>
            <div className="system-card-value">{info.server_uptime_formatted}</div>
          </div>
        </div>

        <div className="system-card">
          <div className="system-card-icon"><Cpu size={20} /></div>
          <div className="system-card-info">
            <div className="system-card-label">Node.js</div>
            <div className="system-card-value">{info.node_version}</div>
          </div>
        </div>

        <div className="system-card">
          <div className="system-card-icon"><Globe size={20} /></div>
          <div className="system-card-info">
            <div className="system-card-label">Окружение</div>
            <div className="system-card-value">{info.environment}</div>
          </div>
        </div>

        <div className="system-card">
          <div className="system-card-icon"><Cpu size={20} /></div>
          <div className="system-card-info">
            <div className="system-card-label">Память (RSS)</div>
            <div className="system-card-value">{info.memory_usage?.rss}</div>
            <div className="system-card-sub">Heap: {info.memory_usage?.heap_used} / {info.memory_usage?.heap_total}</div>
          </div>
        </div>

        <div className="system-card">
          <div className={`system-card-icon ${info.db_connected ? 'icon-success' : 'icon-error'}`}>
            <Database size={20} />
          </div>
          <div className="system-card-info">
            <div className="system-card-label">База данных</div>
            <div className="system-card-value">
              {info.db_connected ? '✅ Подключена' : '❌ Отключена'}
            </div>
            <div className="system-card-sub">Размер: {info.db_size}</div>
          </div>
        </div>

        <div className="system-card">
          <div className={`system-card-icon ${info.telegram_bot_active ? 'icon-success' : 'icon-warning'}`}>
            <Bot size={20} />
          </div>
          <div className="system-card-info">
            <div className="system-card-label">Telegram бот</div>
            <div className="system-card-value">
              {info.telegram_bot_active ? '✅ Активен' : '⚠️ Не настроен'}
            </div>
            {info.telegram_bot_username && (
              <div className="system-card-sub">@{info.telegram_bot_username}</div>
            )}
          </div>
        </div>
      </div>

      <div className="system-timestamp">
        Данные на: {new Date(info.timestamp).toLocaleString('ru-RU')}
      </div>
    </div>
  );
}

export default AdminSystem;
