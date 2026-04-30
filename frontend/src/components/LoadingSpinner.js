import React from 'react';
import PropTypes from 'prop-types';
import s from './LoadingSpinner.module.css';

function LoadingSpinner({ message = 'Загрузка...' }) {
  return (
    <div className={s.loadingSpinnerContainer} data-testid="loading-spinner-container">
      <div className={s.loadingSpinnerContent}>
        <div className={s.loadingSpinner} data-testid="loading-spinner"></div>
        <p className={s.loadingSpinnerMessage}>{message}</p>
      </div>
    </div>
  );
}

LoadingSpinner.propTypes = {
  message: PropTypes.string
};

export default LoadingSpinner;
