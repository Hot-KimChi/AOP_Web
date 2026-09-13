/**
 * 테이블 바디 컴포넌트
 */

import React, { useMemo } from 'react';
import { RowActions } from '../RowActions';
import { EditableCell } from '../EditableCell';
import { formatNumber, truncateText } from '../../utils/dataFormatters';
import { getRowId } from '../../utils/rowIdentity';
import { MESSAGES } from '../../constants/messages';

export const TableBody = React.memo(({
  displayData,
  headers,
  editableKeys,
  editedData,
  validationErrors,
  showChanges,
  onCellChange,
  onDeleteRow
}) => {
  const editableKeySet = useMemo(() => new Set(editableKeys || []), [editableKeys]);

  const renderCellContent = (value, rowId, columnName, isEditable, formattedValue) => {
    const cellKey = `${rowId}-${columnName}`;
    const hasError = validationErrors[cellKey];
    const isChanged = editedData[cellKey] !== undefined;

    if (isEditable) {
      return (
        <EditableCell
          value={value}
          rowId={rowId}
          columnName={columnName}
          hasError={hasError}
          isChanged={isChanged}
          errorMessage={validationErrors[cellKey]}
          onChange={onCellChange}
        />
      );
    }

    // 일반 셀 렌더링
    if (value === null || value === undefined) {
      return '';
    }

    return formattedValue === 0 ? '0' : truncateText(formattedValue);
  };

  if (displayData.length === 0) {
    // 삭제 버튼 열 + 전체 컬럼 수를 합산해야 안내 문구가 표 전체를 덮는다.
    const colCount = (headers?.length || 0) + 1;
    return (
      <tbody>
        <tr>
          <td colSpan={colCount} className="text-center py-3 text-gray-500">
            {MESSAGES.INFO_NO_MATCHING_DATA}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {displayData.map((row, rowIndex) => {
        const rowId = getRowId(row) ?? rowIndex;
        return (
          <tr key={rowId}>
            <RowActions
              rowId={rowId}
              onDelete={onDeleteRow}
            />
            {headers.map((columnName, colIndex) => {
              const value = row[columnName];
              const cellKey = `${rowId}-${columnName}`;
              const isChanged = editedData[cellKey] !== undefined;
              const showHighlight = showChanges && isChanged;
              const isEditable = editableKeySet.has(columnName);
              const formattedValue = formatNumber(value, columnName);
              const title = formattedValue === 0 ? '0' : String(formattedValue ?? '');

              return (
                <td
                  key={colIndex}
                  className="border"
                  style={{
                    padding: '4px',
                    backgroundColor: showHighlight ? 'var(--status-warning-bg)' : isEditable ? 'var(--brand-light)' : 'transparent',
                    fontSize: '12px',
                    maxWidth: isEditable ? '120px' : 'auto',
                    minWidth: isEditable ? '80px' : 'auto'
                  }}
                  title={title}
                >
                  {renderCellContent(value, rowId, columnName, isEditable, formattedValue)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );
});

TableBody.displayName = 'TableBody';
