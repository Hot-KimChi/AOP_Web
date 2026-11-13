/**
 * 로딩 스피너 컴포넌트
 */

import React from 'react';

export const LoadingSpinner = React.memo(() => {
  return (
    <div className="text-center p-5">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">로딩 중...</span>
      </div>
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';
