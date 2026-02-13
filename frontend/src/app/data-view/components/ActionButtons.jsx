/**
 * 액션 버튼 그룹 컴포넌트
 */

import React from 'react';
import { Save, X, FileSpreadsheet } from 'lucide-react';

export const ActionButtons = React.memo(({
  showChanges,
  onToggleChanges,
  hasData,
  hasChanges,
  hasErrors,
  onSave,
  onRevert,
  onDownload,
  onClose
}) => {
  return (
    <div className="flex gap-2">
      <div className="form-check">
        <input
          type="checkbox"
          id="showChanges"
          className="form-check-input"
          checked={showChanges}
          onChange={onToggleChanges}
        />
        <label htmlFor="showChanges" className="form-check-label">변경 사항 하이라이트</label>
      </div>

      {hasChanges && (
        <>
          <button
            className="btn btn-success"
            onClick={onSave}
            disabled={hasErrors}
          >
            <Save size={16} className="mr-1" />
            변경사항 저장
          </button>
          <button
            className="btn btn-secondary"
            onClick={onRevert}
          >
            <X size={16} className="mr-1" />
            변경취소
          </button>
        </>
      )}

      <button
        className="btn btn-primary"
        onClick={onDownload}
        disabled={!hasData}
      >
        <FileSpreadsheet size={16} className="mr-1" />
        CSV 다운로드
      </button>

      <button
        className="btn btn-secondary"
        onClick={onClose}
      >
        창 닫기
      </button>
    </div>
  );
});

ActionButtons.displayName = 'ActionButtons';
