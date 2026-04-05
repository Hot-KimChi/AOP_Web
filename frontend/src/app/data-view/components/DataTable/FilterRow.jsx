/**
 * 필터 행 컴포넌트 — 멀티 선택 + 연쇄 필터링 지원
 */

import React from 'react';
import { MultiSelectDropdown } from '../MultiSelectDropdown';

export const FilterRow = React.memo(({
  headers,
  filters,
  cascadedOptions,
  onFilterChange,
  onClearFilter,
}) => {
  return (
    <tr>
      <th className="px-2 py-1 border" />
      {headers.map((header) => (
        <th key={header} className="px-1 py-1 border">
          <MultiSelectDropdown
            column={header}
            options={cascadedOptions[header] ?? []}
            selected={filters[header] ?? []}
            onChange={onFilterChange}
            onClear={onClearFilter}
          />
        </th>
      ))}
    </tr>
  );
});

FilterRow.displayName = 'FilterRow';
