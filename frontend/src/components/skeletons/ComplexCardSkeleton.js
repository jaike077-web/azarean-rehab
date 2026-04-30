import React from 'react';
import { Skeleton } from '../Skeleton';
import s from './ComplexCardSkeleton.module.css';

const ComplexCardSkeleton = () => {
  return (
    <div className={s.complexCardSkeleton}>
      <div className={s.skeletonHeader}>
        <Skeleton width="60%" height="24px" />
        <Skeleton width="100px" height="32px" borderRadius="20px" />
      </div>
      <Skeleton width="80%" height="16px" style={{ marginTop: '12px' }} />
      <Skeleton width="40%" height="16px" style={{ marginTop: '8px' }} />

      <div className={s.skeletonFooter}>
        <Skeleton width="80px" height="36px" borderRadius="8px" />
        <Skeleton width="80px" height="36px" borderRadius="8px" />
        <Skeleton width="80px" height="36px" borderRadius="8px" />
      </div>
    </div>
  );
};

export default ComplexCardSkeleton;
