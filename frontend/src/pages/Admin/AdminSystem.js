import React, { useState, useEffect } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Server, RefreshCw, Database, Cpu, Clock, Bot, Globe } from 'lucide-react';
import { Skeleton } from '../../components/Skeleton';
import s from './AdminSystem.module.css';

function AdminSystem() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const loadInfo = async () => {
    try {
      setLoading(true);
      const response = await admin.getSystemInfo();
      setInfo(response.data);
    } catch (error) {
      toast.error('Ошибка загрузки системной информации');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInfo(); }, []);

  if (loading) {
    return (
      <div className={s.adminSystem}>
        <h2 className={s.adminSectionTitle}>
          <Server size={22} strokeWidth={1.8} />
          <span>Система</span>
        </h2>
        <div className={s.systemGrid}>
          {[...Array(7)].map((_, i) => (
            <div key={i} className={s.systemCard} style={{ opacity: 0.6 }}>
              <Skeleton width={44} height={44} borderRadius="10px" />
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height="12px" style={{ marginBottom: 6 }} />
                <Skeleton width="80%" height="16px" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className={s.adminSystem}>
      <div className={s.adminSectionHeader}>
        <h2 className={s.adminSectionTitle}><Server size={22} strokeWidth={1.8} /><span>Система</span></h2>
        <button className={s.adminBtnSecondary} onClick={loadInfo}>
          <RefreshCw size={14} strokeWidth={1.8} /> Обновить
        </button>
      </div>

      <div className={s.systemGrid}>
        <div className={s.systemCard}>
          <div className={s.systemCardIcon}><Clock size={20} strokeWidth={1.8} /></div>
          <div className={s.systemCardInfo}>
            <div className={s.systemCardLabel}>Uptime сервера</div>
            <div className={s.systemCardValue}>{info.server_uptime_formatted}</div>
          </div>
        </div>

        <div className={s.systemCard}>
          <div className={s.systemCardIcon}><Cpu size={20} strokeWidth={1.8} /></div>
          <div className={s.systemCardInfo}>
            <div className={s.systemCardLabel}>Node.js</div>
            <div className={s.systemCardValue}>{info.node_version}</div>
          </div>
        </div>

        <div className={s.systemCard}>
          <div className={s.systemCardIcon}><Globe size={20} strokeWidth={1.8} /></div>
          <div className={s.systemCardInfo}>
            <div className={s.systemCardLabel}>Окружение</div>
            <div className={s.systemCardValue}>{info.environment}</div>
          </div>
        </div>

        <div className={s.systemCard}>
          <div className={s.systemCardIcon}><Cpu size={20} strokeWidth={1.8} /></div>
          <div className={s.systemCardInfo}>
            <div className={s.systemCardLabel}>Память (RSS)</div>
            <div className={s.systemCardValue}>{info.memory_usage?.rss}</div>
            <div className={s.systemCardSub}>Heap: {info.memory_usage?.heap_used} / {info.memory_usage?.heap_total}</div>
          </div>
        </div>

        <div className={s.systemCard}>
          <div className={`${s.systemCardIcon} ${info.db_connected ? s.iconSuccess : s.iconError}`}>
            <Database size={20} strokeWidth={1.8} />
          </div>
          <div className={s.systemCardInfo}>
            <div className={s.systemCardLabel}>База данных</div>
            <div className={s.systemCardValue}>
              {info.db_connected ? '✅ Подключена' : '❌ Отключена'}
            </div>
            <div className={s.systemCardSub}>Размер: {info.db_size}</div>
          </div>
        </div>

        <div className={s.systemCard}>
          <div className={`${s.systemCardIcon} ${info.telegram_bot_active ? s.iconSuccess : s.iconWarning}`}>
            <Bot size={20} strokeWidth={1.8} />
          </div>
          <div className={s.systemCardInfo}>
            <div className={s.systemCardLabel}>Telegram бот</div>
            <div className={s.systemCardValue}>
              {info.telegram_bot_active ? '✅ Активен' : '⚠️ Не настроен'}
            </div>
            {info.telegram_bot_username && (
              <div className={s.systemCardSub}>@{info.telegram_bot_username}</div>
            )}
          </div>
        </div>
      </div>

      <div className={s.systemTimestamp}>
        Данные на: {new Date(info.timestamp).toLocaleString('ru-RU')}
      </div>
    </div>
  );
}

export default AdminSystem;
