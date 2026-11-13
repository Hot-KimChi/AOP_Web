/**
 * 에러 메시지 컴포넌트
 */

import React from 'react';

export const ErrorMessage = React.memo(({ message }) => {
  return (
    <div className="alert alert-danger">
      {message}
    </div>
  );
});

ErrorMessage.displayName = 'ErrorMessage';
