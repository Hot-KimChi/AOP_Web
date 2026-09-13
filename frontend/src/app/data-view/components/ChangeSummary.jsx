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

  const isError = errorCount > 0;

  return (
    <div
      style={{
        padding: '0.625rem 0.875rem',
        borderRadius: 'var(--radius)',
        marginBottom: '0.75rem',
        background: isError ? 'var(--status-error-bg)' : 'var(--status-warning-bg)',
        border: `1px solid ${isError ? 'var(--status-error-border)' : 'var(--status-warning-border)'}`,
        color: isError ? 'var(--status-error-text)' : 'var(--status-warning-text)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 500, fontSize: '0.875rem' }}>
        {changedCount > 0 && `${changedCount}개의 셀이 수정되었습니다. `}
        {deletedCount > 0 && `${deletedCount}개의 행이 삭제 대기 중입니다. `}
        {errorCount > 0 && <span style={{ color: 'var(--status-error-text)', fontWeight: 600 }}> {errorCount}개의 오류가 있습니다.</span>}
      </p>
      {deletedCount > 0 && (
        <button
          className="btn-app btn-app-ghost btn-app-sm"
          style={{ marginTop: '0.375rem' }}
          onClick={onRestoreDeleted}
        >
          삭제된 행 복원하기
        </button>
      )}
    </div>
  );
});

ChangeSummary.displayName = 'ChangeSummary';
