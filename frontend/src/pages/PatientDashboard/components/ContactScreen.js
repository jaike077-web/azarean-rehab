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

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Phone, MapPin, ChevronRight, MessageSquare, HelpCircle,
  AlertCircle, Calendar, Camera, Bot, Activity, FileText, Copy, Check,
} from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { rehab } from '../../../services/api';
import { MessengerCTA } from './ui';
import PainEventForm from './PainEventForm';
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

export default function ContactScreen({ patient, dashboardData, onOpenProfile, goTo, screenParams }) {
  const toast = useToast();
  const [lastFeedback, setLastFeedback] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [tgConnected, setTgConnected] = useState(false);
  const [tgStatusLoading, setTgStatusLoading] = useState(true);
  const [isPainEventOpen, setIsPainEventOpen] = useState(false);
  // Wave 0 commit 03 — последний отчёт пациента (message_kind='diary_report').
  // Показываем как карточку под feedback'ом инструктора, чтобы пациент видел
  // что отчёт реально ушёл в систему. Кнопка «Открыть запись» ведёт на Дневник.
  const [lastSentReport, setLastSentReport] = useState(null);
  // Wave 0 commit 06 — pre-filled сообщение от RoadmapScreen («связаться
  // с куратором» из stuck-banner). Автоматически копируется в буфер при
  // переходе, чтобы пациент мог сразу вставить в Telegram/WhatsApp/Max.
  const prefilledMessage = screenParams?.prefilledMessage;
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  // Wave 0 commit 06 — flash-подтверждение прямо на кнопке копирования.
  // Toast в этом приложении показывается внизу страницы, на мобильном не
  // виден без скролла. Inline-feedback гарантирует что пациент видит
  // что копирование сработало, не глядя в toast. Длится 1.5 сек.
  const [copyFlash, setCopyFlash] = useState(false);

  const primaryMessenger = patient?.preferred_messenger || 'telegram';
  const programId = dashboardData?.program?.id;

  useEffect(() => {
    if (!prefilledMessage) return;
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    let cancelled = false;
    navigator.clipboard.writeText(prefilledMessage)
      .then(() => {
        if (cancelled) return;
        setCopyConfirmed(true);
        toast.success('Сообщение в буфере', 'Вставь в чат с куратором (Ctrl+V)');
      })
      .catch(() => { /* clipboard заблокирован — карточка с кнопкой Copy всё равно покажется */ });
    return () => { cancelled = true; };
  }, [prefilledMessage, toast]);

  // Кнопка «Скопировать ещё раз». Показываем toast синхронно ДО clipboard
  // API: в Chrome writeText может зависнуть (без resolve и без reject)
  // если document потерял focus, и юзер не получает feedback'а. Toast
  // первым — чтобы fix не зависел от поведения clipboard.
  const handleCopyPrefilled = useCallback(() => {
    if (!prefilledMessage) return;
    setCopyConfirmed(true);
    setCopyFlash(true);
    setTimeout(() => setCopyFlash(false), 1500);
    toast.success('Скопировано', 'Вставь в чат куратору');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prefilledMessage).catch(() => {
        // Если clipboard действительно упал — отдельный error toast;
        // визуальный flash на кнопке уже показан, ничего не откатываем.
        toast.error('Не удалось скопировать', 'Скопируй текст вручную');
      });
    }
  }, [prefilledMessage, toast]);

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

        // Последний diary_report от пациента — для карточки «отправлен отчёт».
        // Backend сортирует по created_at DESC, берём первый match.
        const sentReport = msgs.find(
          (m) => m.sender_type === 'patient' && m.message_kind === 'diary_report'
        );
        setLastSentReport(sentReport || null);
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

      {/* Wave 0 commit 06 — pre-filled сообщение из stuck-banner на Roadmap.
          Текст уже в буфере (auto-copy). Карточка показывает контент для
          подтверждения и кнопку Copy на случай если auto-copy не сработал. */}
      {prefilledMessage && (
        <div
          style={{
            background: 'var(--pd-color-primary-bg, rgba(13, 148, 136, 0.08))',
            border: '1px solid var(--pd-color-primary, #0d9488)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: '0.85rem', fontWeight: 600, color: 'var(--pd-color-primary, #0d9488)',
          }}>
            <MessageSquare size={14} aria-hidden="true" />
            <span>Готовое сообщение для куратора</span>
          </div>
          <div style={{
            fontSize: '0.85rem', color: 'var(--pd-n700)', lineHeight: 1.5,
            whiteSpace: 'pre-line',
          }}>
            {prefilledMessage}
          </div>
          <button
            type="button"
            onClick={handleCopyPrefilled}
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: copyFlash
                ? 'var(--pd-color-ok, #10b981)'
                : copyConfirmed
                  ? 'var(--pd-color-ok, #10b981)'
                  : 'var(--pd-color-primary, #0d9488)',
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transform: copyFlash ? 'scale(1.04)' : 'scale(1)',
              transition: 'transform 200ms ease, background 200ms',
              boxShadow: copyFlash ? '0 4px 12px rgba(16, 185, 129, 0.4)' : 'none',
            }}
          >
            {copyFlash ? (
              <>
                <Check size={14} aria-hidden="true" strokeWidth={3} />
                Скопировано!
              </>
            ) : copyConfirmed ? (
              <>
                <Check size={12} aria-hidden="true" />
                Скопировано · нажми ещё раз
              </>
            ) : (
              <>
                <Copy size={12} aria-hidden="true" />
                Скопировать ещё раз
              </>
            )}
          </button>
          <div style={{
            fontSize: '0.72rem', color: 'var(--pd-n500)',
            marginBottom: 6,
          }}>
            Выбери мессенджер ниже и вставь сообщение (Ctrl+V) в чат с куратором.
          </div>
          <MessengerCTA
            primary={primaryMessenger}
            label="Открыть"
          />
        </div>
      )}

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

      {/* Wave 0 commit 03 — карточка последнего отправленного отчёта.
          Показывает дату, превью pain_level и кнопку «Открыть запись» →
          переключение на Дневник. Полная инструкторская карточка с
          ответом куратора будет в Волне 2. */}
      {lastSentReport && (
        <div
          style={{
            background: 'var(--pd-color-white)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
            border: '1px solid var(--pd-color-border, var(--pd-n200))',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: '0.85rem', color: 'var(--pd-n600)', fontWeight: 600,
          }}>
            <FileText size={14} color="var(--pd-color-primary)" aria-hidden="true" />
            <span>
              Отчёт по дневнику
              {lastSentReport.linked_diary?.entry_date
                ? ` · ${formatEntryDate(lastSentReport.linked_diary.entry_date)}`
                : ''}
            </span>
          </div>
          <div style={{
            fontSize: '0.78rem', color: 'var(--pd-n500)',
            whiteSpace: 'pre-line',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}>
            {lastSentReport.body}
          </div>
          <button
            type="button"
            onClick={() => goTo && goTo(2)}
            style={{
              alignSelf: 'flex-start',
              background: 'transparent',
              border: 'none',
              padding: '4px 0',
              color: 'var(--pd-color-primary)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Открыть запись
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        </div>
      )}

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
                // pain → live PainEventForm (Wave 2 #2.05).
                // Остальные 3 — backend не имплементирован, показываем info-toast.
                if (a.id === 'pain') {
                  setIsPainEventOpen(true);
                  return;
                }
                toast.info('Скоро будет доступно', 'Готовим эту функцию');
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

      {/* Pain Event modal — открывается из quick-action «Боль усилилась».
          Источник той же PainEventForm что HomeScreen footer link (Wave 2 #2.05). */}
      <PainEventForm
        isOpen={isPainEventOpen}
        onClose={() => setIsPainEventOpen(false)}
      />
    </div>
  );
}

ContactScreen.propTypes = {
  patient: PropTypes.object,
  dashboardData: PropTypes.object,
  onOpenProfile: PropTypes.func,
  goTo: PropTypes.func,
  screenParams: PropTypes.object,
};

ContactScreen.defaultProps = {
  patient: null,
  dashboardData: null,
  onOpenProfile: () => {},
  goTo: undefined,
  screenParams: null,
};
