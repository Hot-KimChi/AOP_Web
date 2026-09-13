/**
 * 테이블 바디 컴포넌트
 */

import React, { useMemo } from 'react';
import { RowActions } from '../RowActions';
import { EditableCell } from '../EditableCell';
import { formatNumber, truncateText } from '../../utils/dataFormatters';
import { getRowId } from '../../utils/rowIdentity';
import { MESSAGES } from '../../constants/messages';

/**
 * 행 단위 렌더러.
 *
 * 편집 상태(`editedData`)와 검증 결과(`validationErrors`)는 셀 하나를 고칠 때마다
 * 새 객체로 교체된다. 이 평면 맵을 모든 행에 그대로 내려주면 표 전체(행 x 컬럼)가
 * 타이핑 한 번마다 다시 조정된다. 그래서 부모에서 행별 버킷으로 나눠 전달하고,
 * 변화가 없는 행에는 항상 같은 참조(`undefined` 또는 동일 버킷)가 전달되게 한다.
 * 덕분에 기본 얕은 비교만으로 실제 바뀐 행만 다시 그린다.
 *
 * 편집 훅은 수정되지 않은 행 객체의 참조를 그대로 유지하므로(`rows.map` 에서
 * 동일 객체 반환) `row` 참조 비교도 안전하게 동작한다.
 */
const TableRow = React.memo(({
  row,
  rowId,
  headers,
  editableKeySet,
  rowEdited,
  rowErrors,
  showChanges,
  onCellChange,
  onDeleteRow
}) => {
  const renderCellContent = (value, columnName, isEditable, formattedValue) => {
    const errorMessage = rowErrors ? rowErrors[columnName] : undefined;
    const isChanged = rowEdited ? rowEdited[columnName] !== undefined : false;

    if (isEditable) {
      return (
        <EditableCell
          value={value}
          rowId={rowId}
          columnName={columnName}
          hasError={errorMessage}
          isChanged={isChanged}
          errorMessage={errorMessage}
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

  return (
    <tr>
      <RowActions
        rowId={rowId}
        onDelete={onDeleteRow}
      />
      {headers.map((columnName, colIndex) => {
        const value = row[columnName];
        const isChanged = rowEdited ? rowEdited[columnName] !== undefined : false;
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
            {renderCellContent(value, columnName, isEditable, formattedValue)}
          </td>
        );
      })}
    </tr>
  );
});

TableRow.displayName = 'TableRow';

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

  /**
   * 편집 항목은 자기 자신이 `rowId` / `columnName` 을 들고 있으므로
   * 키 문자열을 되짚을 필요 없이 그대로 행별로 모을 수 있다.
   * 비용은 "편집한 셀 수"에 비례하며 행 수와 무관하다.
   */
  const editedByRow = useMemo(() => {
    const grouped = new Map();
    Object.values(editedData || {}).forEach((entry) => {
      if (!entry || entry.rowId === undefined) return;
      let bucket = grouped.get(entry.rowId);
      if (!bucket) {
        // 프로토타입 없는 객체로 만들어야 "constructor" 같은 이름의 컬럼을
        // 조회할 때 Object.prototype 의 속성이 잡히지 않는다.
        bucket = Object.create(null);
        grouped.set(entry.rowId, bucket);
      }
      bucket[entry.columnName] = entry;
    });
    return grouped;
  }, [editedData]);

  /**
   * 검증 오류는 값이 메시지 문자열뿐이라 행 정보를 담고 있지 않다.
   * 오류가 하나도 없으면(대부분의 경우) 즉시 빈 Map 을 돌려주고,
   * 오류가 있을 때만 화면에 보이는 행의 접두사로 나눈다.
   */
  const errorsByRow = useMemo(() => {
    const grouped = new Map();
    const errorKeys = Object.keys(validationErrors || {});
    if (errorKeys.length === 0) return grouped;

    displayData.forEach((row, rowIndex) => {
      const rowId = getRowId(row) ?? rowIndex;
      const prefix = `${rowId}-`;
      errorKeys.forEach((key) => {
        if (!key.startsWith(prefix)) return;
        let bucket = grouped.get(rowId);
        if (!bucket) {
          bucket = Object.create(null);
          grouped.set(rowId, bucket);
        }
        bucket[key.slice(prefix.length)] = validationErrors[key];
      });
    });
    return grouped;
  }, [validationErrors, displayData]);

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
          <TableRow
            key={rowId}
            row={row}
            rowId={rowId}
            headers={headers}
            editableKeySet={editableKeySet}
            rowEdited={editedByRow.get(rowId)}
            rowErrors={errorsByRow.get(rowId)}
            showChanges={showChanges}
            onCellChange={onCellChange}
            onDeleteRow={onDeleteRow}
          />
        );
      })}
    </tbody>
  );
});

TableBody.displayName = 'TableBody';
