// =====================================================
// CONTACT SCREEN - Patient Dashboard
// Communication, emergency contacts, notifications
// Sprint 3 — Telegram-бот интеграция
// =====================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle, Phone, ClipboardList, MessageSquare, HelpCircle,
  Frown, Calendar, Paperclip, Hourglass, Bot, Check, Bell, Send
} from 'lucide-react';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { Card } from './ui';

const QUICK_MSGS = [
  {
    Icon: HelpCircle,
    label: 'Задать вопрос',
    desc: 'Свободная форма',
    body: 'Здравствуйте, хочу задать вопрос.',
  },
  {
    Icon: Frown,
    label: 'Боль усилилась',
    desc: 'Срочное сообщение',
    body: 'Боль усилилась, нужна консультация.',
  },
  {
    Icon: Calendar,
    label: 'Записаться на приём',
    desc: 'Выбрать время',
    body: 'Хочу записаться на приём.',
  },
  {
    Icon: Paperclip,
    label: 'Отправить фото/МРТ',
    desc: 'Прикрепить файл',
    body: 'Хочу отправить фото/результаты обследования.',
  },
];

// Telegram brand logo (circular blue)
const TelegramIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.53 3.67-.52.36-.99.53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.48 1.02-.73 3.99-1.73 6.66-2.87 8-3.42 3.81-1.58 4.6-1.85 5.12-1.86.11 0 .37.03.54.16.14.11.18.26.2.37.02.09.04.32.02.49z" />
  </svg>
);

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
        const data = response.data;
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
        const notifData = response.data;
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

  const handleGenerateCode = async () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);

    setCodeGenerating(true);
    try {
      const response = await rehab.generateTelegramCode();
      const data = response.data;
      setLinkCode(data.code);

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

      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await rehab.getTelegramStatus();
          const statusData = statusRes.data;
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

  const handleNotificationToggle = async (key) => {
    const updatedNotifications = {
      ...notifications,
      [key]: !notifications[key],
    };

    setNotifications(updatedNotifications);

    try {
      await rehab.updateNotifications(updatedNotifications);
    } catch (error) {
      setNotifications(notifications);
      toast.error('Ошибка', 'Не удалось обновить настройки');
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const botUsername = 'azarean_rehab_bot';

  return (
    <div className="pd-contact-screen">
      <h1 className="pd-screen-title">Связь</h1>

      {/* Emergency Card */}
      <Card variant="secondary" className="pd-emergency">
        <h3 className="pd-emergency-title">
          <AlertTriangle size={18} />
          <span>Экстренная ситуация</span>
        </h3>
        <p className="pd-emergency-text">
          Температура &gt;38°, резкий отёк голени, сильная боль в икре, выделения из раны,
          онемение стопы
        </p>

        <div className="pd-emergency-actions">
          <a href="tel:103" className="pd-emergency-btn pd-emergency-btn--primary">
            <Phone size={16} />
            <span>Скорая 103</span>
          </a>
          <button className="pd-emergency-btn pd-emergency-btn--outline">
            <Phone size={16} />
            <span>Связаться с Azarean</span>
          </button>
        </div>

        {/* Algorithm Card */}
        <div className="pd-algorithm">
          <h4 className="pd-algorithm-title">
            <ClipboardList size={15} />
            <span>Алгоритм действий</span>
          </h4>
          <ol className="pd-algorithm-list">
            <li>Оцените симптомы из списка выше</li>
            <li>При острых симптомах — звоните 103</li>
            <li>При сомнениях — свяжитесь с Azarean</li>
            <li>Опишите симптомы и когда они начались</li>
            <li>Следуйте инструкциям врача</li>
          </ol>
        </div>
      </Card>

      {/* Quick Messages Section */}
      <Card variant="secondary" className="pd-section">
        <div className="pd-section-header">
          <MessageSquare size={18} className="pd-section-icon" />
          <h2 className="pd-section-title">Быстрое сообщение</h2>
        </div>

        <div className="pd-quick-messages">
          {QUICK_MSGS.map((msg, index) => {
            const MsgIcon = msg.Icon;
            const isSending = sendingMsg === index;
            return (
              <button
                key={index}
                className="pd-quick-msg"
                onClick={() => handleQuickMessage(msg, index)}
                disabled={sendingMsg !== null}
              >
                <span className="pd-quick-msg-icon">
                  {isSending ? <Hourglass size={20} /> : <MsgIcon size={20} />}
                </span>
                <div className="pd-quick-msg-body">
                  <div className="pd-quick-msg-text">{msg.label}</div>
                  <div className="pd-quick-msg-desc">{msg.desc}</div>
                </div>
                <Send size={14} className="pd-quick-msg-send" />
              </button>
            );
          })}
        </div>
      </Card>

      {/* Telegram Bot Section */}
      <Card variant="secondary" className="pd-section">
        <div className="pd-section-header">
          <Bot size={18} className="pd-section-icon" />
          <h2 className="pd-section-title">Telegram-уведомления</h2>
        </div>

        {telegramLoading ? (
          <div>
            <div className="pd-skeleton pd-skeleton--text"></div>
            <div className="pd-skeleton pd-skeleton--text"></div>
          </div>
        ) : telegramConnected ? (
          <div>
            <div className="pd-telegram-connected">
              <div className="pd-telegram-connected-icon">
                <Check size={16} strokeWidth={3} />
              </div>
              <div className="pd-telegram-connected-body">
                <div className="pd-telegram-connected-title">Бот подключён</div>
                <div className="pd-telegram-connected-sub">
                  Вы будете получать уведомления в Telegram
                </div>
              </div>
            </div>
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="pd-telegram-unlink-btn"
            >
              {unlinking ? 'Отключение...' : 'Отключить Telegram'}
            </button>
          </div>
        ) : linkCode ? (
          <div>
            <p className="pd-telegram-hint">
              Откройте бот в Telegram и отправьте команду:
            </p>
            <div className="pd-telegram-code-box">
              <div className="pd-telegram-code-label">Ваш код привязки:</div>
              <div className="pd-telegram-code" data-testid="telegram-link-code">
                {linkCode}
              </div>
              <div className="pd-telegram-code-timer">
                {codeTimeLeft > 0
                  ? `Код действителен: ${formatTime(codeTimeLeft)}`
                  : 'Код истёк'}
              </div>
            </div>
            <a
              href={`https://t.me/${botUsername}?start=${linkCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-telegram-cta"
            >
              <TelegramIcon size={18} />
              Открыть @{botUsername}
            </a>
            <div className="pd-telegram-waiting">
              <div className="pd-telegram-waiting-bar" />
              <div className="pd-telegram-waiting-text">Ожидаем подключение...</div>
            </div>
          </div>
        ) : (
          <>
            <p className="pd-telegram-hint">
              Подключите Telegram-бот для получения напоминаний о тренировках и дневнике прямо в
              мессенджере.
            </p>
            <button
              onClick={handleGenerateCode}
              disabled={codeGenerating}
              className="pd-telegram-cta"
            >
              <TelegramIcon size={18} />
              {codeGenerating ? 'Генерация...' : 'Подключить @azarean_rehab_bot'}
            </button>
          </>
        )}
      </Card>

      {/* Notification Settings Section */}
      <Card variant="inline" className="pd-section">
        <div className="pd-section-header">
          <Bell size={18} className="pd-section-icon" />
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
                className={`pd-toggle-switch ${notifications.exercise_reminders ? 'pd-toggle-switch--active' : ''}`}
                onClick={() => handleNotificationToggle('exercise_reminders')}
                role="switch"
                aria-checked={!!notifications.exercise_reminders}
                tabIndex={0}
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
                className={`pd-toggle-switch ${notifications.diary_reminders ? 'pd-toggle-switch--active' : ''}`}
                onClick={() => handleNotificationToggle('diary_reminders')}
                role="switch"
                aria-checked={!!notifications.diary_reminders}
                tabIndex={0}
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
                className={`pd-toggle-switch ${notifications.message_notifications ? 'pd-toggle-switch--active' : ''}`}
                onClick={() => handleNotificationToggle('message_notifications')}
                role="switch"
                aria-checked={!!notifications.message_notifications}
                tabIndex={0}
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
                className={`pd-toggle-switch ${notifications.phase_change ? 'pd-toggle-switch--active' : ''}`}
                onClick={() => handleNotificationToggle('phase_change')}
                role="switch"
                aria-checked={!!notifications.phase_change}
                tabIndex={0}
              >
                <div className="pd-toggle-dot"></div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ContactScreen;
