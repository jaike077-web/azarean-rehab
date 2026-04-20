import React from 'react';
import PropTypes from 'prop-types';
import AvatarBtn from './AvatarBtn';
import './ScreenHeader.css';

// Шапка экрана: заголовок (+ опциональный subtitle) слева, AvatarBtn справа.
// Используется на каждом из 5 главных экранов пациентского дашборда.
// onOpenProfile — открывает Profile overlay (state в PatientDashboard).
export default function ScreenHeader({
  title,
  subtitle,
  initial,
  onOpenProfile,
  rightSlot,
  avatarDark = false,
}) {
  return (
    <header className="pd-screen-header">
      <div className="pd-screen-header-text">
        {subtitle && <div className="pd-screen-header-subtitle">{subtitle}</div>}
        {title && <h1 className="pd-screen-header-title">{title}</h1>}
      </div>
      <div className="pd-screen-header-right">
        {rightSlot}
        <AvatarBtn initial={initial} onClick={onOpenProfile} dark={avatarDark} />
      </div>
    </header>
  );
}

ScreenHeader.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  initial: PropTypes.string,
  onOpenProfile: PropTypes.func,
  rightSlot: PropTypes.node,
  avatarDark: PropTypes.bool,
};
