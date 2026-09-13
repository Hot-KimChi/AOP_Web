/**
 * 데이터 테이블 메인 컴포넌트
 */

import React, { useMemo, useRef } from 'react';
import { TableHeader } from './TableHeader';
import { FilterRow } from './FilterRow';
import { TableBody } from './TableBody';

export const DataTable = React.memo(({
  displayData,
  allData,
  editableKeys,
  sortConfig,
  filters,
  cascadedOptions,
  editedData,
  validationErrors,
  showChanges,
  onSort,
  onFilterChange,
  onClearFilter,
  onCellChange,
  onDeleteRow
}) => {
  // 필터 결과가 0건이어도 헤더·필터 UI 가 사라지지 않도록
  // 전체 데이터(allData)의 스키마를 우선 사용한다.
  //
  // 셀을 한 번 고칠 때마다 displayData 가 새 배열이 되므로, 그대로 두면
  // 컬럼 구성이 똑같아도 headers 가 매번 새 배열이 되어 하위 행 메모이제이션이
  // 전부 무효화된다. 내용이 같으면 이전 배열 참조를 그대로 돌려준다.
  const headersRef = useRef([]);
  const headers = useMemo(() => {
    const schemaSource =
      (allData && allData.length > 0 && allData[0]) ||
      (displayData.length > 0 && displayData[0]) ||
      null;
    const next = schemaSource ? Object.keys(schemaSource) : [];
    const prev = headersRef.current;
    if (prev.length === next.length && prev.every((name, i) => name === next[i])) {
      return prev;
    }
    headersRef.current = next;
    return next;
  }, [allData, displayData]);

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <TableHeader
            headers={headers}
            editableKeys={editableKeys}
            sortConfig={sortConfig}
            onSort={onSort}
          />
          <FilterRow
            headers={headers}
            filters={filters}
            cascadedOptions={cascadedOptions}
            onFilterChange={onFilterChange}
            onClearFilter={onClearFilter}
          />
        </thead>
        <TableBody
          displayData={displayData}
          headers={headers}
          editableKeys={editableKeys}
          editedData={editedData}
          validationErrors={validationErrors}
          showChanges={showChanges}
          onCellChange={onCellChange}
          onDeleteRow={onDeleteRow}
        />
      </table>
      <style jsx>{`
        .table-container {
          width: 100%;
          overflow: auto;
          max-height: calc(100vh - 150px);
          white-space: nowrap;
          background-color: var(--surface);
          border-radius: 12px;
          box-shadow: var(--shadow-md);
          border: 1px solid var(--border);
        }

        .data-table {
          width: 100%;
          min-width: 800px;
          border-collapse: collapse;
          border-spacing: 0;
        }

        .data-table :global(th),
        .data-table :global(td) {
          font-size: 12px;
          text-align: left;
          border: 0.5px solid var(--border) !important;
          padding: 4px !important;
          line-height: 1.3;
          box-sizing: border-box;
          color: var(--text);
        }

        .data-table :global(tbody td) {
          text-align: center;
        }

        .data-table :global(tbody tr:hover) {
          background-color: var(--table-hover);
        }

        .table-container :global(thead tr:first-child th) {
          position: sticky;
          top: 0;
          z-index: 20;
          background: var(--surface);
          padding: 4px !important;
          font-weight: 600;
          color: var(--text);
          border-bottom: 1px solid var(--border) !important;
        }

        .table-container :global(thead tr:nth-child(2) th) {
          position: sticky;
          top: 38px;
          z-index: 21;
          background-color: var(--bg);
          padding: 4px !important;
        }
      `}</style>
    </div>
  );
});

DataTable.displayName = 'DataTable';
