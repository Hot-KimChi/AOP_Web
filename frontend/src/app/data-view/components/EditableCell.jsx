/**
 * 편집 가능한 셀 컴포넌트
 */

import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

export const EditableCell = React.memo(({
  value,
  rowIndex,
  columnName,
  hasError,
  isChanged,
  errorMessage,
  onChange
}) => {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <input
        type="text"
        style={{ 
          width: '100%', 
          padding: '4px 18px 4px 4px',
          fontSize: '12px',
          border: hasError ? '1px solid #ef4444' : isChanged ? '1px solid #fbbf24' : '1px solid #d1d5db',
          backgroundColor: hasError ? '#fef2f2' : isChanged ? '#fffbeb' : 'white',
          borderRadius: '2px',
          outline: 'none',
          boxSizing: 'border-box',
          margin: 0,
          height: '100%'
        }}
        value={value || ''}
        onChange={(e) => onChange(rowIndex, columnName, e.target.value)}
        onFocus={(e) => e.target.style.borderColor = hasError ? '#ef4444' : isChanged ? '#fbbf24' : '#3b82f6'}
        onBlur={(e) => e.target.style.borderColor = hasError ? '#ef4444' : isChanged ? '#fbbf24' : '#d1d5db'}
      />
      {hasError && (
        <div style={{ position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)' }}>
          <AlertCircle size={10} className="text-red-500" title={errorMessage} />
        </div>
      )}
      {isChanged && !hasError && (
        <div style={{ position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)' }}>
          <CheckCircle size={10} className="text-green-500" title="값이 수정되었습니다" />
        </div>
      )}
    </div>
  );
});

EditableCell.displayName = 'EditableCell';
