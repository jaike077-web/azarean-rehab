import React from 'react';
import PropTypes from 'prop-types';
import './AvatarBtn.css';

// Кнопка-аватар в правом верхнем углу экрана. Открывает Profile overlay.
// Внутри — кружок 34×34. Если есть avatarSrc (blob URL или внешний URL) —
// показывает фото, иначе — инициал поверх teal-градиента.
// Вариант dark — для тёмных hero-карточек: полупрозрачная подложка.
//
// avatarSrc формируется в родителе:
//  - для локальных файлов /uploads/avatars/... — нужен blob-fetch через
//    patientAuth.fetchAvatarBlob() (endpoint защищён cookie, <img> не
//    может слать креды). Используется хук usePatientAvatarBlob.
//  - для OAuth-провайдеров (full URL) — используется avatar_url напрямую.
export default function AvatarBtn({
  initial,
  avatarSrc,
  onClick,
  dark = false,
  ariaLabel = 'Открыть профиль',
}) {
  const ch = (initial || '?').toString().trim().charAt(0).toUpperCase() || '?';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`pd-avatarbtn ${dark ? 'pd-avatarbtn--dark' : ''}`}
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt=""
          className={`pd-avatarbtn-inner pd-avatarbtn-inner--img ${dark ? 'pd-avatarbtn-inner--dark' : ''}`}
        />
      ) : (
        <span className={`pd-avatarbtn-inner ${dark ? 'pd-avatarbtn-inner--dark' : ''}`}>
          {ch}
        </span>
      )}
    </button>
  );
}

AvatarBtn.propTypes = {
  initial: PropTypes.string,
  avatarSrc: PropTypes.string,
  onClick: PropTypes.func,
  dark: PropTypes.bool,
  ariaLabel: PropTypes.string,
};
