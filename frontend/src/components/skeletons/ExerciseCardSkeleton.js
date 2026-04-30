import React from 'react';
import { Skeleton } from '../Skeleton';
import s from './ExerciseCardSkeleton.module.css';

const ExerciseCardSkeleton = () => {
  return (
    <div className={s.exerciseCardSkeleton}>
      <Skeleton width="100%" height="200px" borderRadius="12px" />
      <Skeleton width="70%" height="20px" style={{ marginTop: '16px' }} />
      <Skeleton width="100%" height="16px" style={{ marginTop: '12px' }} />
      <Skeleton width="100%" height="16px" style={{ marginTop: '8px' }} />
      <Skeleton width="60%" height="16px" style={{ marginTop: '8px' }} />
    </div>
  );
};

export default ExerciseCardSkeleton;
