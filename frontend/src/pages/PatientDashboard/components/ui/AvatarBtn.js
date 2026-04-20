import React from 'react';
import PropTypes from 'prop-types';
import './AvatarBtn.css';

// Кнопка-аватар в правом верхнем углу экрана. Открывает Profile overlay.
// Внутри — квадратик 34×34 с инициалом пациента поверх teal-градиента.
// Вариант dark — для тёмных hero-карточек: полупрозрачная подложка.
export default function AvatarBtn({ initial, onClick, dark = false, ariaLabel = 'Открыть профиль' }) {
  const ch = (initial || '?').toString().trim().charAt(0).toUpperCase() || '?';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`pd-avatarbtn ${dark ? 'pd-avatarbtn--dark' : ''}`}
    >
      <span className={`pd-avatarbtn-inner ${dark ? 'pd-avatarbtn-inner--dark' : ''}`}>
        {ch}
      </span>
    </button>
  );
}

AvatarBtn.propTypes = {
  initial: PropTypes.string,
  onClick: PropTypes.func,
  dark: PropTypes.bool,
  ariaLabel: PropTypes.string,
};
