/**
 * 행 액션 버튼 컴포넌트 (삭제)
 */

import React from 'react';
import { Trash2 } from 'lucide-react';

export const RowActions = React.memo(({ rowId, onDelete }) => {
  return (
    <td className="px-1 py-2 border text-center">
      <button
        className="btn-app btn-app-ghost btn-app-sm btn-app-icon-danger"
        onClick={() => onDelete(rowId)}
        title="행 삭제"
      >
        <Trash2 size={15} />
      </button>
    </td>
  );
});

RowActions.displayName = 'RowActions';
