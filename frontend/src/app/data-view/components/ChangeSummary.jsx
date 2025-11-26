/**
 * 변경 요약 컴포넌트
 */

import React from 'react';

export const ChangeSummary = React.memo(({
  changedCount,
  deletedCount,
  errorCount,
  onRestoreDeleted
}) => {
  if (changedCount === 0 && deletedCount === 0) return null;

  return (
    <div className={`p-2 rounded mb-3 ${errorCount > 0 ? 'bg-red-100' : 'bg-yellow-100'}`}>
      <p className="font-medium">
        {changedCount > 0 && `${changedCount}개의 셀이 수정되었습니다. `}
        {deletedCount > 0 && `${deletedCount}개의 행이 삭제 대기 중입니다. `}
        {errorCount > 0 && <span className="text-red-600"> {errorCount}개의 오류가 있습니다.</span>}
      </p>
      {deletedCount > 0 && (
        <button
          className="text-blue-600 text-sm underline hover:text-blue-800 mt-1"
          onClick={onRestoreDeleted}
        >
          삭제된 행 복원하기
        </button>
      )}
    </div>
  );
});

ChangeSummary.displayName = 'ChangeSummary';
