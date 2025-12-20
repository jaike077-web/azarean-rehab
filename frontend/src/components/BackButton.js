import React from 'react';
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

export default BackButton;