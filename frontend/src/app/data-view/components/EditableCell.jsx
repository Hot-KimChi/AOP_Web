/**
 * 편집 가능한 셀 컴포넌트
 */

import React, { useMemo } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

// 기본 input 스타일
const BASE_INPUT_STYLE = {
  width: '100%',
  padding: '4px 18px 4px 4px',
  fontSize: '12px',
  borderRadius: '2px',
  outline: 'none',
  boxSizing: 'border-box',
  margin: 0,
  height: '100%',
};

// 상태별 색상 매핑
const STYLE_VARIANTS = {
  error:   { border: '1px solid #ef4444', background: '#fef2f2' },
  changed: { border: '1px solid #fbbf24', background: '#fffbeb' },
  normal:  { border: '1px solid #d1d5db', background: 'white' },
};

// 포커스 시 보더 색상
const FOCUS_COLORS = { error: '#ef4444', changed: '#fbbf24', normal: '#3b82f6' };

// 아이콘 위치 스타일
const ICON_POSITION_STYLE = {
  position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)',
};

export const EditableCell = React.memo(({
  value,
  rowIndex,
  columnName,
  hasError,
  isChanged,
  errorMessage,
  onChange
}) => {
  // 상태에 따른 스타일 결정
  const variant = hasError ? 'error' : isChanged ? 'changed' : 'normal';
  const inputStyle = useMemo(() => ({
    ...BASE_INPUT_STYLE,
    border: STYLE_VARIANTS[variant].border,
    backgroundColor: STYLE_VARIANTS[variant].background,
  }), [variant]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <input
        type="text"
        style={inputStyle}
        value={value || ''}
        onChange={(e) => onChange(rowIndex, columnName, e.target.value)}
        onFocus={(e) => e.target.style.borderColor = FOCUS_COLORS[variant]}
        onBlur={(e) => e.target.style.borderColor = STYLE_VARIANTS[variant].border.split(' ')[2]}
      />
      {hasError && (
        <div style={ICON_POSITION_STYLE}>
          <AlertCircle size={10} className="text-red-500" title={errorMessage} />
        </div>
      )}
      {isChanged && !hasError && (
        <div style={ICON_POSITION_STYLE}>
          <CheckCircle size={10} className="text-green-500" title="값이 수정되었습니다" />
        </div>
      )}
    </div>
  );
});

EditableCell.displayName = 'EditableCell';
