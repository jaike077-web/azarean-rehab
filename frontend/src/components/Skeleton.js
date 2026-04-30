// =====================================================
// SKELETON COMPONENTS - Azarean Network
// Использование: <PatientCardSkeleton />
//               <ExerciseCardSkeleton />
//               <PatientsPageSkeleton />
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import s from './Skeleton.module.css';

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

  return <div className={`${s.skeleton} ${className}`} style={mergedStyle} />;
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
        className={`${s.skeleton} ${s.skeletonText}`}
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
  <div className={`${s.skeleton} ${s.skeletonAvatar} ${size === 'large' ? s.large : ''}`} />
);

SkeletonAvatar.propTypes = {
  size: PropTypes.oneOf(['normal', 'large'])
};

export const SkeletonButton = ({ width = 120 }) => (
  <div className={`${s.skeleton} ${s.skeletonButton}`} style={{ width }} />
);

SkeletonButton.propTypes = {
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export const SkeletonImage = ({ height = 180 }) => (
  <div className={`${s.skeleton} ${s.skeletonImage}`} style={{ height }} />
);

SkeletonImage.propTypes = {
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export const SkeletonBadge = () => (
  <div className={`${s.skeleton} ${s.skeletonBadge}`} />
);

// =====================================================
// КАРТОЧКИ
// =====================================================

// Карточка пациента
export const PatientCardSkeleton = () => (
  <div className={s.skeletonPatientCard}>
    <SkeletonAvatar />
    <div className={s.skeletonPatientInfo}>
      <div className={`${s.skeleton} ${s.skeletonTitle}`} style={{ width: '60%' }} />
      <div className={`${s.skeleton} ${s.skeletonText}`} style={{ width: '80%' }} />
      <div className={`${s.skeleton} ${s.skeletonText} ${s.short}`} />
    </div>
  </div>
);

// Карточка упражнения
export const ExerciseCardSkeleton = () => (
  <div className={s.skeletonExerciseCard}>
    <SkeletonImage height={160} />
    <div className={s.skeletonExerciseContent}>
      <div className={`${s.skeleton} ${s.skeletonTitle}`} />
      <div className={s.skeletonExerciseBadges}>
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
  <div className={s.skeletonComplexCard}>
    <div className={s.skeletonComplexHeader}>
      <SkeletonAvatar />
      <div style={{ flex: 1 }}>
        <div className={`${s.skeleton} ${s.skeletonTitle}`} style={{ width: '50%' }} />
        <div className={`${s.skeleton} ${s.skeletonText}`} style={{ width: '70%' }} />
      </div>
    </div>
    <SkeletonText lines={2} />
    <div className={s.skeletonComplexStats}>
      <div className={s.skeletonStat}>
        <div className={`${s.skeleton} ${s.skeletonStatValue}`} />
        <div className={`${s.skeleton} ${s.skeletonStatLabel}`} />
      </div>
      <div className={s.skeletonStat}>
        <div className={`${s.skeleton} ${s.skeletonStatValue}`} />
        <div className={`${s.skeleton} ${s.skeletonStatLabel}`} />
      </div>
      <div className={s.skeletonStat}>
        <div className={`${s.skeleton} ${s.skeletonStatValue}`} />
        <div className={`${s.skeleton} ${s.skeletonStatLabel}`} />
      </div>
    </div>
  </div>
);

// Строка таблицы
export const TableRowSkeleton = ({ columns = 4 }) => (
  <div className={s.skeletonTableRow}>
    {Array.from({ length: columns }).map((_, i) => (
      <div key={i} className={s.skeletonTableCell}>
        <div className={`${s.skeleton} ${s.skeletonText}`} style={{ width: `${60 + Math.random() * 30}%` }} />
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
  <div className={s.skeletonPage}>
    <div className={s.skeletonPageHeader}>
      <div className={`${s.skeleton} ${s.skeletonPageTitle}`} />
      <div className={`${s.skeleton} ${s.skeletonPageSubtitle}`} />
    </div>

    <div className={s.skeletonFilters}>
      <div className={`${s.skeleton} ${s.skeletonSearch}`} />
      <div className={`${s.skeleton} ${s.skeletonFilter}`} />
    </div>

    <div className={s.skeletonPatientsGrid}>
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
  <div className={s.skeletonPage}>
    <div className={s.skeletonPageHeader}>
      <div className={`${s.skeleton} ${s.skeletonPageTitle}`} />
      <div className={`${s.skeleton} ${s.skeletonPageSubtitle}`} />
    </div>

    <div className={s.skeletonFilters}>
      <div className={`${s.skeleton} ${s.skeletonSearch}`} />
      <div className={`${s.skeleton} ${s.skeletonFilter}`} />
      <div className={`${s.skeleton} ${s.skeletonFilter}`} />
    </div>

    <div className={s.skeletonExercisesGrid}>
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
  <div className={s.skeletonPage}>
    <div className={s.skeletonPageHeader}>
      <div className={`${s.skeleton} ${s.skeletonPageTitle}`} />
      <div className={`${s.skeleton} ${s.skeletonPageSubtitle}`} />
    </div>

    <div className={s.skeletonFilters}>
      <div className={`${s.skeleton} ${s.skeletonSearch}`} />
      <div className={`${s.skeleton} ${s.skeletonFilter}`} />
    </div>

    <div className={s.skeletonComplexesList}>
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
  <div className={s.skeletonTable}>
    <div className={s.skeletonTableHeader}>
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className={s.skeletonTableCell}>
          <div className={s.skeleton} style={{ height: '14px', width: '70%' }} />
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
