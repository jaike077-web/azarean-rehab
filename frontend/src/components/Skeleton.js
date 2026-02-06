// =====================================================
// SKELETON COMPONENTS - Azarean Network
// Использование: <PatientCardSkeleton />
//               <ExerciseCardSkeleton />
//               <PatientsPageSkeleton />
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import './Skeleton.css';

// =====================================================
// БАЗОВЫЕ КОМПОНЕНТЫ
// =====================================================

export const Skeleton = (props) => {
  const {
    width = '100%',
    height = '20px',
    borderRadius = '4px',
    className = '',
    style = {}
  } = props;
  const hasExplicitSizing =
    Object.prototype.hasOwnProperty.call(props, 'width') ||
    Object.prototype.hasOwnProperty.call(props, 'height') ||
    Object.prototype.hasOwnProperty.call(props, 'borderRadius');
  const shouldApplySizing = hasExplicitSizing || !className;
  const mergedStyle = {
    ...style,
    ...(shouldApplySizing ? { width, height, borderRadius } : {})
  };

  return <div className={`skeleton ${className}`} style={mergedStyle} />;
};

Skeleton.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  borderRadius: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
  style: PropTypes.object
};

export const SkeletonText = ({ width = '100%', lines = 1 }) => (
  <>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="skeleton skeleton-text"
        style={{ width: i === lines - 1 && lines > 1 ? '70%' : width }}
      />
    ))}
  </>
);

SkeletonText.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  lines: PropTypes.number
};

export const SkeletonAvatar = ({ size = 'normal' }) => (
  <div className={`skeleton skeleton-avatar ${size === 'large' ? 'large' : ''}`} />
);

SkeletonAvatar.propTypes = {
  size: PropTypes.oneOf(['normal', 'large'])
};

export const SkeletonButton = ({ width = 120 }) => (
  <div className="skeleton skeleton-button" style={{ width }} />
);

SkeletonButton.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export const SkeletonImage = ({ height = 180 }) => (
  <div className="skeleton skeleton-image" style={{ height }} />
);

SkeletonImage.propTypes = {
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export const SkeletonBadge = () => (
  <div className="skeleton skeleton-badge" />
);

// =====================================================
// КАРТОЧКИ
// =====================================================

// Карточка пациента
export const PatientCardSkeleton = () => (
  <div className="skeleton-patient-card">
    <SkeletonAvatar />
    <div className="skeleton-patient-info">
      <div className="skeleton skeleton-title" style={{ width: '60%' }} />
      <div className="skeleton skeleton-text" style={{ width: '80%' }} />
      <div className="skeleton skeleton-text short" />
    </div>
  </div>
);

// Карточка упражнения
export const ExerciseCardSkeleton = () => (
  <div className="skeleton-exercise-card">
    <SkeletonImage height={160} />
    <div className="skeleton-exercise-content">
      <div className="skeleton skeleton-title" />
      <div className="skeleton-exercise-badges">
        <SkeletonBadge />
        <SkeletonBadge />
      </div>
      <SkeletonText lines={2} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <SkeletonButton width={100} />
        <SkeletonButton width={100} />
      </div>
    </div>
  </div>
);

// Карточка комплекса
export const ComplexCardSkeleton = () => (
  <div className="skeleton-complex-card">
    <div className="skeleton-complex-header">
      <SkeletonAvatar />
      <div style={{ flex: 1 }}>
        <div className="skeleton skeleton-title" style={{ width: '50%' }} />
        <div className="skeleton skeleton-text" style={{ width: '70%' }} />
      </div>
    </div>
    <SkeletonText lines={2} />
    <div className="skeleton-complex-stats">
      <div className="skeleton-stat">
        <div className="skeleton skeleton-stat-value" />
        <div className="skeleton skeleton-stat-label" />
      </div>
      <div className="skeleton-stat">
        <div className="skeleton skeleton-stat-value" />
        <div className="skeleton skeleton-stat-label" />
      </div>
      <div className="skeleton-stat">
        <div className="skeleton skeleton-stat-value" />
        <div className="skeleton skeleton-stat-label" />
      </div>
    </div>
  </div>
);

// Строка таблицы
export const TableRowSkeleton = ({ columns = 4 }) => (
  <div className="skeleton-table-row">
    {Array.from({ length: columns }).map((_, i) => (
      <div key={i} className="skeleton-table-cell">
        <div className="skeleton skeleton-text" style={{ width: `${60 + Math.random() * 30}%` }} />
      </div>
    ))}
  </div>
);

TableRowSkeleton.propTypes = {
  columns: PropTypes.number
};

// =====================================================
// СТРАНИЦЫ
// =====================================================

// Страница пациентов
export const PatientsPageSkeleton = ({ count = 6 }) => (
  <div className="skeleton-page">
    <div className="skeleton-page-header">
      <div className="skeleton skeleton-page-title" />
      <div className="skeleton skeleton-page-subtitle" />
    </div>

    <div className="skeleton-filters">
      <div className="skeleton skeleton-search" />
      <div className="skeleton skeleton-filter" />
    </div>

    <div className="skeleton-patients-grid">
      {Array.from({ length: count }).map((_, i) => (
        <PatientCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

PatientsPageSkeleton.propTypes = {
  count: PropTypes.number
};

// Страница упражнений
export const ExercisesPageSkeleton = ({ count = 6 }) => (
  <div className="skeleton-page">
    <div className="skeleton-page-header">
      <div className="skeleton skeleton-page-title" />
      <div className="skeleton skeleton-page-subtitle" />
    </div>

    <div className="skeleton-filters">
      <div className="skeleton skeleton-search" />
      <div className="skeleton skeleton-filter" />
      <div className="skeleton skeleton-filter" />
    </div>

    <div className="skeleton-exercises-grid">
      {Array.from({ length: count }).map((_, i) => (
        <ExerciseCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

ExercisesPageSkeleton.propTypes = {
  count: PropTypes.number
};

// Страница комплексов
export const ComplexesPageSkeleton = ({ count = 4 }) => (
  <div className="skeleton-page">
    <div className="skeleton-page-header">
      <div className="skeleton skeleton-page-title" />
      <div className="skeleton skeleton-page-subtitle" />
    </div>

    <div className="skeleton-filters">
      <div className="skeleton skeleton-search" />
      <div className="skeleton skeleton-filter" />
    </div>

    <div className="skeleton-complexes-list">
      {Array.from({ length: count }).map((_, i) => (
        <ComplexCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

ComplexesPageSkeleton.propTypes = {
  count: PropTypes.number
};

// Таблица
export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="skeleton-table">
    <div className="skeleton-table-header">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="skeleton-table-cell">
          <div className="skeleton" style={{ height: '14px', width: '70%' }} />
        </div>
      ))}
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <TableRowSkeleton key={i} columns={columns} />
    ))}
  </div>
);

TableSkeleton.propTypes = {
  rows: PropTypes.number,
  columns: PropTypes.number
};

// =====================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// =====================================================

const SkeletonComponents = {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonImage,
  SkeletonBadge,
  PatientCardSkeleton,
  ExerciseCardSkeleton,
  ComplexCardSkeleton,
  TableRowSkeleton,
  PatientsPageSkeleton,
  ExercisesPageSkeleton,
  ComplexesPageSkeleton,
  TableSkeleton,
};

export default SkeletonComponents;
