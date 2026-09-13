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
    <div className="action-bar">
      <div className="form-check mb-0 me-2">
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
            className="btn-app btn-app-primary"
            onClick={onSave}
            disabled={hasErrors}
          >
            <Save size={15} />
            변경사항 저장
          </button>
          <button
            className="btn-app btn-app-secondary"
            onClick={onRevert}
          >
            <X size={15} />
            변경취소
          </button>
        </>
      )}

      <button
        className="btn-app btn-app-secondary"
        onClick={onDownload}
        disabled={!hasData}
      >
        <FileSpreadsheet size={15} />
        CSV 다운로드
      </button>

      <button
        className="btn-app btn-app-ghost action-bar-end"
        onClick={onClose}
      >
        창 닫기
      </button>
    </div>
  );
});

ActionButtons.displayName = 'ActionButtons';
