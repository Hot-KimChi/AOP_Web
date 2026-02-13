/**
 * 테이블 바디 컴포넌트
 */

import React from 'react';
import { RowActions } from '../RowActions';
import { EditableCell } from '../EditableCell';
import { formatNumber, truncateText } from '../../utils/dataFormatters';
import { MESSAGES } from '../../constants/messages';

export const TableBody = React.memo(({
  displayData,
  editableKeys,
  editedData,
  validationErrors,
  showChanges,
  onCellChange,
  onDeleteRow
}) => {
  const renderCellContent = (value, rowIndex, columnName) => {
    const isEditable = editableKeys && editableKeys.includes(columnName);
    const cellKey = `${rowIndex}-${columnName}`;
    const hasError = validationErrors[cellKey];
    const isChanged = editedData[cellKey] !== undefined;

    if (isEditable) {
      return (
        <EditableCell
          value={value}
          rowIndex={rowIndex}
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

    const formattedValue = formatNumber(value);
    return formattedValue === 0 ? '0' : truncateText(formattedValue);
  };

  if (displayData.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={Object.keys(displayData[0] || {}).length + 1} className="text-center py-3 text-gray-500">
            {MESSAGES.INFO_NO_MATCHING_DATA}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {displayData.map((row, rowIndex) => (
        <tr key={rowIndex} className="hover:bg-gray-50">
          <RowActions
            rowIndex={rowIndex}
            onDelete={onDeleteRow}
          />
          {Object.entries(row).map(([columnName, value], colIndex) => {
            const cellKey = `${rowIndex}-${columnName}`;
            const isChanged = editedData[cellKey] !== undefined;
            const showHighlight = showChanges && isChanged;
            const isEditable = editableKeys && editableKeys.includes(columnName);

            return (
              <td
                key={colIndex}
                className="border"
                style={{
                  padding: '4px',
                  backgroundColor: showHighlight ? '#fef3c7' : isEditable ? '#eff6ff' : 'white',
                  fontSize: '12px',
                  maxWidth: isEditable ? '120px' : 'auto',
                  minWidth: isEditable ? '80px' : 'auto'
                }}
                title={formatNumber(value)}
              >
                {renderCellContent(value, rowIndex, columnName)}
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  );
});

TableBody.displayName = 'TableBody';
