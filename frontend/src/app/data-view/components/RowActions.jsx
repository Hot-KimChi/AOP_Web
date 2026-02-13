/**
 * 행 액션 버튼 컴포넌트 (삭제)
 */

import React from 'react';
import { Trash2 } from 'lucide-react';

export const RowActions = React.memo(({ rowIndex, onDelete }) => {
  return (
    <td className="px-1 py-2 border text-center">
      <button
        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
        onClick={() => onDelete(rowIndex)}
        title="행 삭제"
      >
        <Trash2 size={16} />
      </button>
    </td>
  );
});

RowActions.displayName = 'RowActions';
