/**
 * 테이블 헤더 컴포넌트
 */

import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { truncateText } from '../../utils/dataFormatters';

export const TableHeader = React.memo(({ headers, editableKeys, sortConfig, onSort }) => {
  return (
    <tr style={{ background: 'var(--bg)' }}>
      <th className="px-3 py-2 border text-center" style={{ width: '60px' }}>
        <span title="행 삭제" style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>삭제</span>
      </th>
      {headers.map((header, index) => (
        <th key={index} className="border" style={{ padding: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span 
              title={header} 
              style={{ 
                textAlign: 'center', 
                display: 'block', 
                fontSize: '12px',
                fontWeight: 600,
                color: editableKeys && editableKeys.includes(header) ? 'var(--brand-text)' : 'var(--text)'
              }}
            >
              {truncateText(header)}
            </span>
            <button
              style={{ padding: '1px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: '4px' }}
              onClick={() => onSort(header)}
              title={`정렬 ${sortConfig.key === header && sortConfig.direction === 'asc' ? '내림차순' : '오름차순'}`}
            >
              <ArrowUpDown
                size={9}
                color={sortConfig.key === header ? 'var(--brand-text)' : 'var(--text-muted)'}
              />
            </button>
          </div>
        </th>
      ))}
    </tr>
  );
});

TableHeader.displayName = 'TableHeader';
