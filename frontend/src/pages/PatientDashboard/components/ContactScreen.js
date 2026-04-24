// =====================================================
// ContactScreen v12 — порт из azarean-v12-final.jsx (L1931-2073)
// =====================================================
// Blocks:
//   1. Header (заголовок + AvatarBtn)
//   2. Specialist feedback card — Татьяна, последнее сообщение
//        + chip «К записи N месяца» если linked_diary_id
//        + unread badge
//        + <MessengerCTA primary={preferred_messenger} label="Ответить"/>
//   3. Studio location — Azarean Network, Белинского 108, ст. 26
//   4. Emergency block — красная карточка + 103 + +79089049130
//   5. Quick actions — 4 кнопки, onClick заглушки (TODO)
//   6. Zari bot widget — read-only, отсылает управление в Профиль
//
// Messenger picker из старого Contact убран — он только в Profile.
// =====================================================

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Phone, MapPin, ChevronRight, MessageSquare, HelpCircle,
  AlertCircle, Calendar, Camera, Bot, Activity,
} from 'lucide-react';
import { rehab } from '../../../services/api';
import { MessengerCTA } from './ui';
import './ContactScreen.css';

// Форматирование времени сообщения: сегодня → «HH:mm»,
// вчера → «Вчера», раньше → «DD month» на русском.
const formatMsgTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

// Форматирование entry_date ("2026-04-11") → «11 апреля»
const formatEntryDate = (dateText) => {
  if (!dateText) return '';
  try {
    const d = new Date(dateText);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  } catch {
    return dateText;
  }
};

// Быстрые действия — визуал из v12, логика-заглушка до будущих сессий.
const QUICK_ACTIONS = [
  { id: 'question', Icon: HelpCircle, title: 'Задать вопрос', sub: 'Свободная форма', color: 'var(--pd-n500)' },
  { id: 'pain',     Icon: Activity,   title: 'Боль усилилась', sub: 'Срочное', color: 'var(--pd-color-err)' },
  { id: 'appointment', Icon: Calendar, title: 'Записаться', sub: 'Выбрать время', color: 'var(--pd-color-primary)' },
  { id: 'photo',    Icon: Camera,     title: 'Отправить фото', sub: 'Файл или МРТ', color: 'var(--pd-n500)' },
];

// Подписки Zari (read-only в Contact, управление — в Profile)
const ZARI_SCHEDULE = [
  { key: 'morning',  label: 'Утро',       time: '09:00' },
  { key: 'evening',  label: 'Вечер',      time: '21:00' },
  { key: 'tip',      label: 'Совет дня',  time: '12:00' },
  { key: 'phase',    label: 'Смена фазы', time: '—' },
];

export default function ContactScreen({ patient, dashboardData, onOpenProfile }) {
  const [lastFeedback, setLastFeedback] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [tgConnected, setTgConnected] = useState(false);
  const [tgStatusLoading, setTgStatusLoading] = useState(true);

  const primaryMessenger = patient?.preferred_messenger || 'telegram';
  const programId = dashboardData?.program?.id;

  // Последнее сообщение от инструктора + общее число непрочитанных.
  // Backend /my/messages требует program_id — иначе возвращает все по
  // всем программам пациента. Передаём текущую программу из dashboardData.
  useEffect(() => {
    let alive = true;
    const params = programId ? { program_id: programId, limit: 20 } : { limit: 20 };
    rehab.getMyMessages(params)
      .then((res) => {
        if (!alive) return;
        const msgs = Array.isArray(res.data) ? res.data : [];
        const fromInstructor = msgs.filter((m) => m.sender_type === 'instructor');
        setLastFeedback(fromInstructor[0] || null);
        setUnreadCount(fromInstructor.filter((m) => !m.is_read).length);
      })
      .catch(() => { /* заглушка — рендерим «нет сообщений» */ })
      .finally(() => { if (alive) setFeedbackLoading(false); });
    return () => { alive = false; };
  }, [programId]);

  // Статус Telegram для Zari-виджета (read-only индикатор)
  useEffect(() => {
    let alive = true;
    rehab.getTelegramStatus()
      .then((res) => {
        if (!alive) return;
        setTgConnected(Boolean(res.data?.connected || res.data?.linked));
      })
      .catch(() => { /* не подключён — ок */ })
      .finally(() => { if (alive) setTgStatusLoading(false); });
    return () => { alive = false; };
  }, []);

  const openProfile = () => onOpenProfile?.();

  return (
    <div className="pd-contact pd-contact-screen">
      {/* 1. Header — аватар единый в pd-header сверху */}
      <div className="pd-contact-header">
        <h1 className="pd-contact-title">Связь</h1>
      </div>

      {/* 2. Specialist feedback card */}
      <div className="pd-contact-feedback">
        {feedbackLoading ? (
          <div className="pd-skeleton" style={{ height: 120, borderRadius: 12 }} />
        ) : lastFeedback ? (
          <>
            <div className="pd-contact-feedback-top">
              <div className="pd-contact-feedback-ava">
                Т
                <span className="pd-contact-feedback-dot" aria-hidden="true" />
              </div>
              <div className="pd-contact-feedback-body">
                <div className="pd-contact-feedback-row">
                  <span className="pd-contact-feedback-name">Татьяна</span>
                  <span className="pd-contact-feedback-time">
                    {formatMsgTime(lastFeedback.created_at)}
                  </span>
                </div>
                <div className="pd-contact-feedback-role">куратор программы</div>
                <div className="pd-contact-feedback-text">
                  {lastFeedback.body || ''}
                </div>
                {lastFeedback.linked_diary_date && (
                  <div className="pd-contact-feedback-chip">
                    <MessageSquare size={10} color="var(--pd-n500)" aria-hidden="true" />
                    К записи {formatEntryDate(lastFeedback.linked_diary_date)}
                  </div>
                )}
              </div>
              {unreadCount > 0 && (
                <div className="pd-contact-feedback-unread" aria-label={`${unreadCount} непрочитанных`}>
                  {unreadCount}
                </div>
              )}
            </div>
            <MessengerCTA
              primary={primaryMessenger}
              label="Ответить"
              className="pd-contact-feedback-cta"
            />
          </>
        ) : (
          <div className="pd-contact-feedback-empty">
            <MessageSquare size={22} color="var(--pd-n400)" aria-hidden="true" />
            <div>
              <div className="pd-contact-feedback-empty-title">Пока нет сообщений</div>
              <div className="pd-contact-feedback-empty-sub">
                Напишите куратору через один из мессенджеров ниже
              </div>
            </div>
          </div>
        )}
        {!feedbackLoading && !lastFeedback && (
          <MessengerCTA
            primary={primaryMessenger}
            label="Написать"
            className="pd-contact-feedback-cta"
          />
        )}
      </div>

      {/* 3. Studio location — тап открывает Яндекс.Карты по адресу.
            На десктопе — новая вкладка, на мобильном iOS/Android ОС
            предложит выбрать приложение (Яндекс Карты / 2GIS / браузер). */}
      <a
        href="https://yandex.ru/maps/?text=Екатеринбург%2C%20Белинского%20108%2C%20строение%2026"
        target="_blank"
        rel="noopener noreferrer"
        className="pd-contact-studio"
        aria-label="Открыть адрес студии в Яндекс.Картах"
      >
        <div className="pd-contact-studio-icon">
          <MapPin size={18} color="var(--pd-color-primary)" aria-hidden="true" />
        </div>
        <div className="pd-contact-studio-text">
          <div className="pd-contact-studio-name">Azarean Network</div>
          <div className="pd-contact-studio-addr">
            Белинского 108, ст. 26 · Екатеринбург
          </div>
        </div>
        <ChevronRight size={16} color="var(--pd-n400)" aria-hidden="true" />
      </a>

      {/* 4. Emergency block */}
      <div className="pd-contact-emergency" role="region" aria-label="Экстренная связь">
        <div className="pd-contact-emergency-head">
          <div className="pd-contact-emergency-icon">
            <AlertCircle size={16} color="var(--pd-color-err)" aria-hidden="true" />
          </div>
          <h3 className="pd-contact-emergency-title">Экстренная ситуация</h3>
        </div>
        <p className="pd-contact-emergency-text">
          Температура &gt;38°, резкий отёк, сильная боль, онемение
        </p>
        <div className="pd-contact-emergency-actions">
          <a href="tel:103" className="pd-contact-emergency-btn pd-contact-emergency-btn--primary">
            <Phone size={14} aria-hidden="true" /> 103
          </a>
          <a
            href="tel:+79089049130"
            className="pd-contact-emergency-btn pd-contact-emergency-btn--outline"
          >
            <Phone size={14} aria-hidden="true" /> Azarean
          </a>
        </div>
      </div>

      {/* 5. Quick actions (visual only, logic = TODO) */}
      <div className="pd-contact-quick">
        {QUICK_ACTIONS.map((a, i) => {
          const Icon = a.Icon;
          const last = i === QUICK_ACTIONS.length - 1;
          return (
            <button
              key={a.id}
              type="button"
              className={`pd-contact-quick-row ${last ? 'pd-contact-quick-row--last' : ''}`}
              onClick={() => {
                // TODO: реализовать по-разному
                //   question → модалка свободного вопроса → send via preferred_messenger
                //   pain → prefilled «Боль усилилась» + критерии severity
                //   appointment → интеграция с календарём студии
                //   photo → multer upload до 10 МБ, аналог diary photos
              }}
            >
              <span
                className="pd-contact-quick-icon"
                style={{ background: `color-mix(in srgb, ${a.color} 12%, transparent)` }}
              >
                <Icon size={16} color={a.color} aria-hidden="true" />
              </span>
              <span className="pd-contact-quick-text">
                <span className="pd-contact-quick-title">{a.title}</span>
                <span className="pd-contact-quick-sub">{a.sub}</span>
              </span>
              <ChevronRight size={16} color="var(--pd-n300)" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* 6. Zari widget — read-only */}
      <div className="pd-contact-zari">
        <div className="pd-contact-zari-head">
          <Bot size={18} color="var(--pd-color-primary)" aria-hidden="true" />
          <span className="pd-contact-zari-title">Напоминания от Zari</span>
          {!tgStatusLoading && (
            <div className={`pd-contact-zari-badge ${tgConnected ? 'pd-contact-zari-badge--on' : 'pd-contact-zari-badge--off'}`}>
              <span className="pd-contact-zari-dot" />
              <span>{tgConnected ? 'Telegram' : 'Не подключён'}</span>
            </div>
          )}
        </div>
        <div className="pd-contact-zari-hint">
          Умные напоминания приходят только в Telegram.{' '}
          <button
            type="button"
            className="pd-contact-zari-link"
            onClick={openProfile}
          >
            Управление — в Профиле
          </button>
        </div>
        {ZARI_SCHEDULE.map((n, i) => {
          const last = i === ZARI_SCHEDULE.length - 1;
          return (
            <div
              key={n.key}
              className={`pd-contact-zari-row ${last ? 'pd-contact-zari-row--last' : ''}`}
            >
              <div>
                <div className="pd-contact-zari-label">{n.label}</div>
                <div className="pd-contact-zari-time">{n.time}</div>
              </div>
              <button
                type="button"
                className="pd-contact-zari-toarrow"
                onClick={openProfile}
                aria-label={`Настроить «${n.label}» в Профиле`}
              >
                <ChevronRight size={14} color="var(--pd-n400)" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

ContactScreen.propTypes = {
  patient: PropTypes.object,
  dashboardData: PropTypes.object,
  onOpenProfile: PropTypes.func,
};

ContactScreen.defaultProps = {
  patient: null,
  dashboardData: null,
  onOpenProfile: () => {},
};
