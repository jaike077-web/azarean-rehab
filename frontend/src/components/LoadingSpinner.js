import React from 'react';
import './LoadingSpinner.css';

function LoadingSpinner({ message = 'Загрузка...' }) {
  return (
    <div className="loading-spinner-container">
      <div className="loading-spinner-content">
        <div className="loading-spinner"></div>
        <p className="loading-spinner-message">{message}</p>
      </div>
    </div>
  );
}

export default LoadingSpinner;
