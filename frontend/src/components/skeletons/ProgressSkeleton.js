import React from 'react';
import { Skeleton } from '../Skeleton';
import './ProgressSkeleton.css';

const ProgressSkeleton = () => {
  return (
    <div className="progress-skeleton">
      <div className="skeleton-progress-header">
        <Skeleton width="200px" height="32px" />
        <Skeleton width="150px" height="20px" style={{ marginTop: '8px' }} />
      </div>

      <div className="skeleton-stats">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-stat-card">
            <Skeleton width="60%" height="14px" />
            <Skeleton width="80px" height="28px" style={{ marginTop: '8px' }} />
          </div>
        ))}
      </div>

      {[1, 2].map((i) => (
        <div key={i} className="skeleton-session">
          <Skeleton width="250px" height="24px" />
          <Skeleton
            width="100%"
            height="200px"
            style={{ marginTop: '16px' }}
            borderRadius="12px"
          />
        </div>
      ))}
    </div>
  );
};

export default ProgressSkeleton;
