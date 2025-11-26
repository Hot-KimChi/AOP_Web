/**
 * 필터 행 컴포넌트
 */

import React from 'react';
import { X } from 'lucide-react';

export const FilterRow = React.memo(({ headers, filters, comboBoxOptions, onFilterChange, onClearFilter }) => {
  return (
    <tr>
      <th className="px-2 py-1 border bg-gray-50"></th>
      {headers.map((header, index) => (
        <th key={index} className="px-2 py-1 border bg-gray-50">
          <div className="relative">
            <select
              className="w-full px-2 py-1 pr-6 text-sm border rounded focus:outline-none focus:border-blue-400"
              value={filters[header]?.[0] || ''}
              onChange={(e) => onFilterChange(header, e.target.value)}
            >
              <option value="">Select...</option>
              {comboBoxOptions[header]?.map((option, idx) => (
                <option key={idx} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {filters[header] && (
              <button
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded"
                onClick={() => onClearFilter(header)}
                title="필터 지우기"
              >
                <X size={12} className="text-gray-400" />
              </button>
            )}
          </div>
        </th>
      ))}
    </tr>
  );
});

FilterRow.displayName = 'FilterRow';
