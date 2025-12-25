import React from 'react';
import { Skeleton } from '../Skeleton';
import './ExerciseCardSkeleton.css';

const ExerciseCardSkeleton = () => {
  return (
    <div className="exercise-card-skeleton">
      <Skeleton width="100%" height="200px" borderRadius="12px" />
      <Skeleton width="70%" height="20px" style={{ marginTop: '16px' }} />
      <Skeleton width="100%" height="16px" style={{ marginTop: '12px' }} />
      <Skeleton width="100%" height="16px" style={{ marginTop: '8px' }} />
      <Skeleton width="60%" height="16px" style={{ marginTop: '8px' }} />
    </div>
  );
};

export default ExerciseCardSkeleton;
