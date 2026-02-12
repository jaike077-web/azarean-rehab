// =====================================================
// CONTACT SCREEN - Patient Dashboard
// Communication, emergency contacts, notifications
// Sprint 3 — Telegram-бот интеграция
// =====================================================

import React, { useState, useEffect, useRef } from 'react';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

const QUICK_MSGS = [
  {
    icon: '\u2753',
    label: 'Задать вопрос',
    desc: 'Свободная форма',
    body: 'Здравствуйте, хочу задать вопрос.',
  },
  {
    icon: '\uD83D\uDE23',
    label: 'Боль усилилась',
    desc: 'Срочное сообщение',
    body: 'Боль усилилась, нужна консультация.',
  },
  {
    icon: '\uD83D\uDCC5',
    label: 'Записаться на приём',
    desc: 'Выбрать время',
    body: 'Хочу записаться на приём.',
  },
  {
    icon: '\uD83D\uDCCE',
    label: 'Отправить фото/МРТ',
    desc: 'Прикрепить файл',
    body: 'Хочу отправить фото/результаты обследования.',
  },
];

const ContactScreen = ({ dashboardData }) => {
  const toast = useToast();

  // Telegram state
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [linkCode, setLinkCode] = useState(null);
  const [codeGenerating, setCodeGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const pollingRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const [codeTimeLeft, setCodeTimeLeft] = useState(0);

  // Notification state
  const [notifications, setNotifications] = useState({
    exercise_reminders: true,
    diary_reminders: true,
    message_notifications: true,
    reminder_time: '09:00',
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(null);

  // Load telegram status + notification settings on mount
  useEffect(() => {
    const loadTelegramStatus = async () => {
      try {
        const response = await rehab.getTelegramStatus();
        const data = response.data?.data || response.data;
        setTelegramConnected(data?.connected || false);
      } catch (error) {
        // Silently catch
      } finally {
        setTelegramLoading(false);
      }
    };

    const loadNotifications = async () => {
      try {
        const response = await rehab.getNotifications();
        const notifData = response.data?.data || response.data;
        if (notifData) {
          setNotifications(notifData);
        }
      } catch (error) {
        // Silently catch
      } finally {
        setNotifLoading(false);
      }
    };

    loadTelegramStatus();
    loadNotifications();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    };
  }, []);

  // Generate link code
  const handleGenerateCode = async () => {
    setCodeGenerating(true);
    try {
      const response = await rehab.generateTelegramCode();
      const data = response.data?.data || response.data;
      setLinkCode(data.code);

      // Start countdown timer
      const expiresAt = new Date(data.expires_at);
      const updateTimer = () => {
        const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setCodeTimeLeft(left);
        if (left <= 0) {
          clearInterval(expiryTimerRef.current);
          clearInterval(pollingRef.current);
          setLinkCode(null);
        }
      };
      updateTimer();
      expiryTimerRef.current = setInterval(updateTimer, 1000);

      // Start polling for connection status every 3 seconds
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await rehab.getTelegramStatus();
          const statusData = statusRes.data?.data || statusRes.data;
          if (statusData?.connected) {
            setTelegramConnected(true);
            setLinkCode(null);
            clearInterval(pollingRef.current);
            clearInterval(expiryTimerRef.current);
            toast.success('Telegram подключён!');
          }
        } catch (e) { /* ignore */ }
      }, 3000);
    } catch (error) {
      toast.error('Ошибка', 'Не удалось сгенерировать код');
    } finally {
      setCodeGenerating(false);
    }
  };

  // Unlink telegram
  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      await rehab.unlinkTelegram();
      setTelegramConnected(false);
      toast.info('Telegram отключён');
    } catch (error) {
      toast.error('Ошибка', 'Не удалось отключить Telegram');
    } finally {
      setUnlinking(false);
    }
  };

  // Handle quick message send
  const handleQuickMessage = async (messageData, index) => {
    if (!dashboardData?.program?.id) {
      toast.error('Ошибка', 'Программа реабилитации не найдена');
      return;
    }

    setSendingMsg(index);

    try {
      await rehab.sendMessage({
        program_id: dashboardData.program.id,
        body: messageData.body,
      });
      toast.success('Отправлено', 'Ваше сообщение отправлено инструктору');
    } catch (error) {
      toast.error('Ошибка', 'Не удалось отправить сообщение');
    } finally {
      setSendingMsg(null);
    }
  };

  // Handle notification toggle
  const handleNotificationToggle = async (key) => {
    const updatedNotifications = {
      ...notifications,
      [key]: !notifications[key],
    };

    setNotifications(updatedNotifications);

    try {
      await rehab.updateNotifications(updatedNotifications);
    } catch (error) {
      // Revert on error
      setNotifications(notifications);
      toast.error('Ошибка', 'Не удалось обновить настройки');
    }
  };

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const botUsername = 'azarean_rehab_bot';

  return (
    <div>
      {/* Title */}
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 800,
          fontFamily: 'var(--pd-font-display)',
          color: 'var(--pd-text)',
          marginBottom: '16px',
        }}
      >
        Связь
      </h1>

      {/* Emergency Card */}
      <div className="pd-emergency">
        <h3 className="pd-emergency-title">{'\uD83D\uDEA8'} Экстренная ситуация</h3>
        <p className="pd-emergency-text">
          Температура &gt;38°, резкий отёк голени, сильная боль в икре, выделения из раны,
          онемение стопы
        </p>

        <div className="pd-emergency-actions">
          <a href="tel:103" className="pd-emergency-btn pd-emergency-btn--primary">
            {'\uD83D\uDCDE'} Скорая 103
          </a>
          <button className="pd-emergency-btn pd-emergency-btn--outline">
            {'\uD83D\uDCDE'} Связаться с Azarean
          </button>
        </div>

        {/* Algorithm Card */}
        <div
          style={{
            backgroundColor: '#FFF8F0',
            border: '1.5px solid #FDE8D0',
            borderRadius: 'var(--pd-radius-sm)',
            padding: '14px',
            marginTop: '14px',
          }}
        >
          <h4
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: 'var(--pd-text)',
              marginBottom: '10px',
            }}
          >
            {'\uD83E\uDDED'} Алгоритм действий
          </h4>
          <ol
            style={{
              margin: 0,
              paddingLeft: '20px',
              fontSize: '12px',
              color: 'var(--pd-text2)',
              lineHeight: 1.6,
            }}
          >
            <li>Оцените симптомы из списка выше</li>
            <li>При острых симптомах — звоните 103</li>
            <li>При сомнениях — свяжитесь с Azarean</li>
            <li>Опишите симптомы и когда они начались</li>
            <li>Следуйте инструкциям врача</li>
          </ol>
        </div>
      </div>

      {/* Quick Messages Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span style={{ fontSize: '20px' }}>{'\uD83D\uDCAC'}</span>
          <h2 className="pd-section-title">Быстрое сообщение</h2>
        </div>

        <div className="pd-quick-messages">
          {QUICK_MSGS.map((msg, index) => (
            <button
              key={index}
              className="pd-quick-msg"
              onClick={() => handleQuickMessage(msg, index)}
              disabled={sendingMsg !== null}
            >
              <span className="pd-quick-msg-icon" style={{ fontSize: '20px' }}>
                {sendingMsg === index ? '\u23F3' : msg.icon}
              </span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="pd-quick-msg-text">{msg.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--pd-text3)', marginTop: '2px' }}>
                  {msg.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Telegram Bot Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span style={{ fontSize: '20px' }}>{'\uD83E\uDD16'}</span>
          <h2 className="pd-section-title">Telegram-уведомления</h2>
        </div>

        {telegramLoading ? (
          <div>
            <div className="pd-skeleton pd-skeleton--text"></div>
            <div className="pd-skeleton pd-skeleton--text"></div>
          </div>
        ) : telegramConnected ? (
          /* Connected state */
          <div>
            <div
              style={{
                padding: '14px',
                backgroundColor: '#EDFAF5',
                border: '1.5px solid var(--pd-accent)',
                borderRadius: 'var(--pd-radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>{'\u2713'}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: 'var(--pd-accent)',
                    marginBottom: '2px',
                  }}
                >
                  Бот подключён
                </div>
                <div style={{ fontSize: '12px', color: 'var(--pd-text2)' }}>
                  Вы будете получать уведомления в Telegram
                </div>
              </div>
            </div>
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              style={{
                marginTop: '10px',
                padding: '10px 16px',
                borderRadius: 'var(--pd-radius-sm)',
                border: '1.5px solid #FECACA',
                backgroundColor: '#FEF2F2',
                color: 'var(--pd-danger)',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: 'var(--pd-font)',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {unlinking ? 'Отключение...' : 'Отключить Telegram'}
            </button>
          </div>
        ) : linkCode ? (
          /* Code generated, waiting for connection */
          <div>
            <p style={{ fontSize: '13px', color: 'var(--pd-text2)', marginBottom: '12px' }}>
              Откройте бот в Telegram и отправьте команду:
            </p>
            <div
              style={{
                padding: '14px',
                backgroundColor: 'var(--pd-bg)',
                border: '1.5px solid var(--pd-border)',
                borderRadius: 'var(--pd-radius-sm)',
                textAlign: 'center',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--pd-text3)', marginBottom: '6px' }}>
                Ваш код привязки:
              </div>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: 'var(--pd-text)',
                  letterSpacing: '4px',
                }}
                data-testid="telegram-link-code"
              >
                {linkCode}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--pd-text3)', marginTop: '8px' }}>
                {codeTimeLeft > 0
                  ? `Код действителен: ${formatTime(codeTimeLeft)}`
                  : 'Код истёк'}
              </div>
            </div>
            <a
              href={`https://t.me/${botUsername}?start=${linkCode}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '13px',
                borderRadius: 'var(--pd-radius-sm)',
                border: 'none',
                backgroundColor: '#2AABEE',
                color: 'white',
                fontSize: '14px',
                fontWeight: 700,
                fontFamily: 'var(--pd-font)',
                cursor: 'pointer',
                textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ flexShrink: 0 }}
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.53 3.67-.52.36-.99.53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.48 1.02-.73 3.99-1.73 6.66-2.87 8-3.42 3.81-1.58 4.6-1.85 5.12-1.86.11 0 .37.03.54.16.14.11.18.26.2.37.02.09.04.32.02.49z" />
              </svg>
              Открыть @{botUsername}
            </a>
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <div
                className="pd-skeleton pd-skeleton--text"
                style={{ width: '60%', margin: '0 auto', height: '4px', borderRadius: '2px' }}
              ></div>
              <div style={{ fontSize: '11px', color: 'var(--pd-text3)', marginTop: '6px' }}>
                Ожидаем подключение...
              </div>
            </div>
          </div>
        ) : (
          /* Not connected, no code */
          <>
            <p style={{ fontSize: '13px', color: 'var(--pd-text2)', marginBottom: '14px' }}>
              Подключите Telegram-бот для получения напоминаний о тренировках и дневнике прямо в
              мессенджере.
            </p>
            <button
              onClick={handleGenerateCode}
              disabled={codeGenerating}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: 'var(--pd-radius-sm)',
                border: 'none',
                backgroundColor: '#2AABEE',
                color: 'white',
                fontSize: '14px',
                fontWeight: 700,
                fontFamily: 'var(--pd-font)',
                cursor: codeGenerating ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                opacity: codeGenerating ? 0.7 : 1,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ flexShrink: 0 }}
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.53 3.67-.52.36-.99.53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.48 1.02-.73 3.99-1.73 6.66-2.87 8-3.42 3.81-1.58 4.6-1.85 5.12-1.86.11 0 .37.03.54.16.14.11.18.26.2.37.02.09.04.32.02.49z" />
              </svg>
              {codeGenerating ? 'Генерация...' : 'Подключить @azarean_rehab_bot'}
            </button>
          </>
        )}
      </div>

      {/* Notification Settings Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span style={{ fontSize: '20px' }}>{'\uD83D\uDD14'}</span>
          <h2 className="pd-section-title">Настройки уведомлений</h2>
        </div>

        {notifLoading ? (
          <div>
            <div className="pd-skeleton pd-skeleton--text"></div>
            <div className="pd-skeleton pd-skeleton--text"></div>
            <div className="pd-skeleton pd-skeleton--text"></div>
          </div>
        ) : (
          <div className="pd-notif-list">
            <div className="pd-notif-toggle">
              <div className="pd-notif-info">
                <div className="pd-notif-title">Утреннее напоминание</div>
                <div className="pd-notif-desc">09:00</div>
              </div>
              <div
                className={`pd-toggle-switch ${
                  notifications.exercise_reminders ? 'pd-toggle-switch--active' : ''
                }`}
                onClick={() => handleNotificationToggle('exercise_reminders')}
              >
                <div className="pd-toggle-dot"></div>
              </div>
            </div>

            <div className="pd-notif-toggle">
              <div className="pd-notif-info">
                <div className="pd-notif-title">Вечерний дневник</div>
                <div className="pd-notif-desc">21:00</div>
              </div>
              <div
                className={`pd-toggle-switch ${
                  notifications.diary_reminders ? 'pd-toggle-switch--active' : ''
                }`}
                onClick={() => handleNotificationToggle('diary_reminders')}
              >
                <div className="pd-toggle-dot"></div>
              </div>
            </div>

            <div className="pd-notif-toggle">
              <div className="pd-notif-info">
                <div className="pd-notif-title">Подсказка дня</div>
                <div className="pd-notif-desc">12:00</div>
              </div>
              <div
                className={`pd-toggle-switch ${
                  notifications.message_notifications ? 'pd-toggle-switch--active' : ''
                }`}
                onClick={() => handleNotificationToggle('message_notifications')}
              >
                <div className="pd-toggle-dot"></div>
              </div>
            </div>

            <div className="pd-notif-toggle">
              <div className="pd-notif-info">
                <div className="pd-notif-title">Смена фазы</div>
                <div className="pd-notif-desc">Когда готовы</div>
              </div>
              <div
                className={`pd-toggle-switch ${
                  notifications.phase_change ? 'pd-toggle-switch--active' : ''
                }`}
                onClick={() => handleNotificationToggle('phase_change')}
              >
                <div className="pd-toggle-dot"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactScreen;
