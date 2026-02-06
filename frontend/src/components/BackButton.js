import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import './BackButton.css';

function BackButton({ to, label = 'Назад' }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1); // Назад в истории
    }
  };

  return (
    <button className="back-button" onClick={handleClick}>
      <span className="back-arrow">←</span>
      <span>{label}</span>
    </button>
  );
}

BackButton.propTypes = {
  to: PropTypes.string,
  label: PropTypes.string
};

// React.memo для предотвращения лишних ререндеров
export default React.memo(BackButton);