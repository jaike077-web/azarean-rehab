import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown } from 'lucide-react';
import { MESSENGERS, MESSENGER_ICONS, MESSENGER_KEYS } from './MessengerIcons';
import './MessengerCTA.css';

// Multi-channel CTA: основная кнопка («Отправить Татьяне · Telegram») в цвете
// предпочитаемого мессенджера + accordion «Другой канал» с двумя остальными.
// `primary` — ключ из MESSENGERS (telegram/whatsapp/max).
// `onSend` — опциональный hook (например, аналитика). Сам клик — обычная <a href>.
export default function MessengerCTA({
  primary = 'telegram',
  onSend,
  label = 'Отправить Татьяне',
  className = '',
}) {
  const [showOthers, setShowOthers] = useState(false);
  const main = MESSENGERS[primary] || MESSENGERS.telegram;
  const MainIcon = MESSENGER_ICONS[primary] || MESSENGER_ICONS.telegram;
  const others = MESSENGER_KEYS.filter((k) => k !== primary);

  return (
    <div className={`pd-messenger-cta ${className}`}>
      <a
        href={main.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSend}
        className="pd-messenger-cta-primary"
        style={{ background: main.color, boxShadow: `0 4px 16px color-mix(in srgb, ${main.color} 25%, transparent)` }}
      >
        <MainIcon size={18} color="#fff" />
        <span>{label} · {main.name}</span>
      </a>

      <button
        type="button"
        onClick={() => setShowOthers((v) => !v)}
        className="pd-messenger-cta-toggle"
      >
        {showOthers ? 'Скрыть' : 'Другой канал'}
        <ChevronDown
          size={11}
          aria-hidden="true"
          style={{
            transform: showOthers ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms',
          }}
        />
      </button>

      {showOthers && (
        <div className="pd-messenger-cta-others">
          {others.map((k) => {
            const m = MESSENGERS[k];
            const Icon = MESSENGER_ICONS[k];
            return (
              <a
                key={k}
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="pd-messenger-cta-other"
                style={{
                  borderColor: `color-mix(in srgb, ${m.color} 40%, transparent)`,
                  color: m.color,
                }}
              >
                <Icon size={14} color={m.color} />
                <span>{m.name}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

MessengerCTA.propTypes = {
  primary: PropTypes.oneOf(MESSENGER_KEYS),
  onSend: PropTypes.func,
  label: PropTypes.string,
  className: PropTypes.string,
};
