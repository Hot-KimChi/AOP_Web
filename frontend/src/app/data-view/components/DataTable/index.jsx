/**
 * 데이터 테이블 메인 컴포넌트
 */

import React, { useMemo } from 'react';
import { TableHeader } from './TableHeader';
import { FilterRow } from './FilterRow';
import { TableBody } from './TableBody';

export const DataTable = React.memo(({
  displayData,
  editableKeys,
  sortConfig,
  filters,
  comboBoxOptions,
  editedData,
  validationErrors,
  showChanges,
  onSort,
  onFilterChange,
  onClearFilter,
  onCellChange,
  onCopyRow,
  onDeleteRow
}) => {
  const headers = useMemo(() => {
    return displayData.length > 0 ? Object.keys(displayData[0]) : [];
  }, [displayData]);

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
            comboBoxOptions={comboBoxOptions}
            onFilterChange={onFilterChange}
            onClearFilter={onClearFilter}
          />
        </thead>
        <TableBody
          displayData={displayData}
          editableKeys={editableKeys}
          editedData={editedData}
          validationErrors={validationErrors}
          showChanges={showChanges}
          onCellChange={onCellChange}
          onCopyRow={onCopyRow}
          onDeleteRow={onDeleteRow}
        />
      </table>
      <style jsx>{`
        .table-container {
          width: 100%;
          overflow: auto;
          max-height: calc(100vh - 150px);
          white-space: nowrap;
          background-color: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e5e7eb;
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
          border: 0.5px solid #e5e7eb !important;
          padding: 4px !important;
          line-height: 1.3;
          box-sizing: border-box;
        }

        .data-table :global(tbody td) {
          text-align: center;
        }

        .data-table :global(tbody tr:hover) {
          background-color: #f9fafb;
        }

        .table-container :global(thead tr:first-child th) {
          position: sticky;
          top: 0;
          z-index: 20;
          background: linear-gradient(to bottom, #f3f4f6, #e5e7eb);
          padding: 4px !important;
          font-weight: 600;
          color: #374151;
        }

        .table-container :global(thead tr:nth-child(2) th) {
          position: sticky;
          top: 38px;
          z-index: 10;
          background-color: #fafafa;
          padding: 4px !important;
        }
      `}</style>
    </div>
  );
});

DataTable.displayName = 'DataTable';
