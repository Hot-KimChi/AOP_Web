/**
 * 테이블 헤더 컴포넌트
 */

import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { truncateText } from '../../utils/dataFormatters';

export const TableHeader = React.memo(({ headers, editableKeys, sortConfig, onSort }) => {
  return (
    <tr className="bg-gray-100">
      <th className="px-3 py-2 border text-center" style={{ width: '60px' }}>
        <span title="행 복사/삭제" className="font-medium text-gray-700">복사/삭제</span>
      </th>
      {headers.map((header, index) => (
        <th key={index} className="border" style={{ padding: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span 
              title={header} 
              className="font-medium text-gray-700" 
              style={{ 
                textAlign: 'center', 
                display: 'block', 
                fontSize: '12px',
                color: editableKeys && editableKeys.includes(header) ? '#3b82f6' : '#374151'
              }}
            >
              {truncateText(header)}
            </span>
            <button
              style={{ padding: '1px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              className="hover:bg-gray-200 rounded transition-colors"
              onClick={() => onSort(header)}
              title={`정렬 ${sortConfig.key === header && sortConfig.direction === 'asc' ? '내림차순' : '오름차순'}`}
            >
              <ArrowUpDown
                size={9}
                className={`transition-colors ${sortConfig.key === header ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
              />
            </button>
          </div>
        </th>
      ))}
    </tr>
  );
});

TableHeader.displayName = 'TableHeader';
