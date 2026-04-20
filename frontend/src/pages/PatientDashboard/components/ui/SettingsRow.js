import React from 'react';
import PropTypes from 'prop-types';
import { ChevronRight } from 'lucide-react';
import './SettingsRow.css';

// Строка iOS-стиля для настроек / профиля. Иконка слева, label/value, chevron справа.
// readonly — без chevron, без cursor:pointer.
// destructive — красный текст и фон иконки (обычно «Выйти», «Удалить»).
export default function SettingsRow({
  label,
  value,
  Icon,
  iconColor,
  readonly = false,
  destructive = false,
  onClick,
  last = false,
  ariaLabel,
}) {
  const accent = iconColor || 'var(--pd-n500)';
  const bgColor = destructive
    ? 'rgba(239, 68, 68, 0.08)' // err 12% — fixed для destructive
    : 'transparent';
  const iconWrapStyle = destructive
    ? { background: bgColor }
    : { background: `color-mix(in srgb, ${accent} 12%, transparent)` };

  return (
    <button
      type="button"
      onClick={readonly ? undefined : onClick}
      disabled={readonly}
      aria-label={ariaLabel || label}
      className={[
        'pd-settings-row',
        readonly ? 'pd-settings-row--readonly' : '',
        destructive ? 'pd-settings-row--destructive' : '',
        last ? 'pd-settings-row--last' : '',
      ].filter(Boolean).join(' ')}
    >
      {Icon && (
        <span className="pd-settings-row-icon-wrap" style={iconWrapStyle}>
          <Icon size={16} color={destructive ? 'var(--pd-color-err)' : accent} aria-hidden="true" />
        </span>
      )}
      <span className="pd-settings-row-text">
        <span className="pd-settings-row-label">{label}</span>
        {value && <span className="pd-settings-row-value">{value}</span>}
      </span>
      {!readonly && !destructive && (
        <ChevronRight size={14} className="pd-settings-row-chevron" aria-hidden="true" />
      )}
      {readonly && <span className="pd-settings-row-dot" aria-hidden="true">·</span>}
    </button>
  );
}

SettingsRow.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node,
  Icon: PropTypes.elementType,
  iconColor: PropTypes.string,
  readonly: PropTypes.bool,
  destructive: PropTypes.bool,
  onClick: PropTypes.func,
  last: PropTypes.bool,
  ariaLabel: PropTypes.string,
};
