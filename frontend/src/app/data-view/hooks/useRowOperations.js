/**
 * 행 조작 Custom Hook
 * 
 * @description
 * 행 삭제, 복원 등의 기능을 관리합니다.
 */

import { useState, useCallback } from 'react';
import { MESSAGES } from '../constants/messages';
import { buildNormalizedFilterSets, isRowMatchingFilters } from '../utils/filterHelpers';
import { getRowId } from '../utils/rowIdentity';

export const useRowOperations = (
  csvData,
  setCsvData,
  displayData,
  setDisplayData,
  filters,
  editedData,
  setEditedData,
  validationErrors,
  setValidationErrors
) => {
  // 삭제 대기 행: { rowId, row, index } — index 는 삭제 직전의 csvData 위치로,
  // 복원 시 원래 자리에 되돌리기 위해 보관한다.
  const [deletedRows, setDeletedRows] = useState([]);

  /**
   * 행 삭제 핸들러
   *
   * 화면 인덱스가 아니라 안정 식별자로 삭제 대상을 추적한다.
   * 화면(displayData)뿐 아니라 원본(csvData)에서도 즉시 제거해야
   * 필터를 다시 적용했을 때 삭제한 행이 되살아나지 않는다.
   *
   * 해당 행의 편집·검증 기록은 삭제 항목에 함께 보관한다. 그냥 버리면
   * 복원 후 "수정됨" 표시가 사라져 저장 버튼이 비활성화되고, 편집된 값이
   * 저장 스냅샷과 다른데도 변경 없음으로 취급된다.
   */
  const handleDeleteRow = useCallback((rowId) => {
    if (confirm(MESSAGES.DELETE_CONFIRM)) {
      const prefix = `${rowId}-`;
      const removedEdits = {};
      const removedErrors = {};

      const newEditedData = { ...editedData };
      Object.keys(newEditedData).forEach(key => {
        if (key.startsWith(prefix)) {
          removedEdits[key] = newEditedData[key];
          delete newEditedData[key];
        }
      });

      const newValidationErrors = { ...validationErrors };
      Object.keys(newValidationErrors).forEach(key => {
        if (key.startsWith(prefix)) {
          removedErrors[key] = newValidationErrors[key];
          delete newValidationErrors[key];
        }
      });

      const targetIndex = csvData.findIndex(row => getRowId(row) === rowId);
      if (targetIndex >= 0) {
        setDeletedRows(prev =>
          prev.some(entry => entry.rowId === rowId)
            ? prev
            : [
                ...prev,
                {
                  rowId,
                  row: csvData[targetIndex],
                  index: targetIndex,
                  edits: removedEdits,
                  errors: removedErrors,
                },
              ]
        );
        setCsvData(csvData.filter(row => getRowId(row) !== rowId));
      }

      // 화면에서 행 제거
      setDisplayData(displayData.filter(row => getRowId(row) !== rowId));

      setEditedData(newEditedData);
      setValidationErrors(newValidationErrors);
    }
  }, [csvData, setCsvData, displayData, setDisplayData, editedData, setEditedData, validationErrors, setValidationErrors]);

  /**
   * 삭제된 행 복원
   */
  const restoreDeletedRows = useCallback(() => {
    if (deletedRows.length === 0) return;

    if (confirm(MESSAGES.RESTORE_CONFIRM)) {
      // 각 index 는 "그 삭제 직전 배열" 기준이므로, 삭제의 역순으로 되돌려야
      // 원래 순서가 정확히 복구된다(오름차순 삽입은 순서를 뒤바꾼다).
      const restored = [...csvData];
      const restoredEdits = {};
      const restoredErrors = {};

      for (let i = deletedRows.length - 1; i >= 0; i -= 1) {
        const { row, index, edits, errors } = deletedRows[i];
        restored.splice(Math.min(index, restored.length), 0, row);
        Object.assign(restoredEdits, edits || {});
        Object.assign(restoredErrors, errors || {});
      }

      const normalizedFilterSets = buildNormalizedFilterSets(filters);
      setCsvData(restored);
      setDisplayData(
        restored.filter(row => isRowMatchingFilters(row, normalizedFilterSets))
      );
      // 복원된 행의 편집·검증 기록도 되살려 변경 추적을 일치시킨다.
      setEditedData(prev => ({ ...prev, ...restoredEdits }));
      setValidationErrors(prev => ({ ...prev, ...restoredErrors }));
      setDeletedRows([]);
    }
  }, [deletedRows, csvData, setCsvData, filters, setDisplayData, setEditedData, setValidationErrors]);

  return {
    deletedRows,
    setDeletedRows,
    handleDeleteRow,
    restoreDeletedRows,
  };
};
