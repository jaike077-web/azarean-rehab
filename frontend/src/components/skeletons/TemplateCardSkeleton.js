import React from 'react';
import { Skeleton } from '../Skeleton';
import s from './TemplateCardSkeleton.module.css';

const TemplateCardSkeleton = () => {
  return (
    <div className={s.templateCardSkeleton}>
      <div className={s.templateSkeletonHeader}>
        <Skeleton width="36px" height="36px" borderRadius="10px" />
        <div className={s.templateSkeletonInfo}>
          <Skeleton width="70%" height="20px" />
          <Skeleton width="90%" height="14px" style={{ marginTop: '8px' }} />
        </div>
      </div>
      <Skeleton width="60%" height="14px" style={{ marginTop: '12px' }} />
      <div className={s.templateSkeletonActions}>
        <Skeleton width="44px" height="36px" borderRadius="8px" />
        <Skeleton width="44px" height="36px" borderRadius="8px" />
        <Skeleton width="44px" height="36px" borderRadius="8px" />
      </div>
    </div>
  );
};

export default TemplateCardSkeleton;
