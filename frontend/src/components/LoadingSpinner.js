import React from 'react';
import PropTypes from 'prop-types';
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

LoadingSpinner.propTypes = {
  message: PropTypes.string
};

export default LoadingSpinner;
