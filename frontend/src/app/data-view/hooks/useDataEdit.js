/**
 * 데이터 편집 Custom Hook
 * 
 * @description
 * 셀 편집, 유효성 검사, 저장/복원 로직을 관리합니다.
 */

import { useState, useCallback } from 'react';
import { MESSAGES } from '../constants/messages';
import { validateCellData as validateCell } from '../utils/dataValidation';
import { buildNormalizedFilterSets, isRowMatchingFilters } from '../utils/filterHelpers';
import { assignRowIds, cloneRows, findRowIndexById, getRowId } from '../utils/rowIdentity';

export const useDataEdit = (
  csvData,
  setCsvData,
  originalData,
  setOriginalData,
  displayData,
  setDisplayData,
  editableColumns,
  filters,
  saveData
) => {
  const [editedData, setEditedData] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [showChanges, setShowChanges] = useState(false);

  /**
   * 셀 데이터 유효성 검사
   *
   * `validationErrors` 를 의존성으로 두면 handleCellChange 가 오래된 스냅샷을
   * 붙잡아 다른 셀의 오류를 지워버린다. 항상 최신 상태를 기준으로 갱신하도록
   * 함수형 업데이트를 사용하고, 이 콜백 자체는 재생성되지 않게 한다.
   */
  const validateCellData = useCallback((rowId, columnName, value) => {
    const errKey = `${rowId}-${columnName}`;
    const errorMessage = validateCell(columnName, value, editableColumns.editableKeys);

    setValidationErrors(prev => {
      const next = { ...prev };
      if (errorMessage) {
        next[errKey] = errorMessage;
      } else {
        delete next[errKey];
      }
      return next;
    });
  }, [editableColumns]);

  /**
   * 셀 값 변경 핸들러
   *
   * rowId 는 필터·정렬과 무관한 안정 식별자다. 화면 인덱스를 사용하면
   * 정렬/필터 상태에서 전혀 다른 원본 행이 수정된다.
   *
   * 편집 결과는 화면(displayData)뿐 아니라 원본(csvData)에도 즉시 반영한다.
   * 화면에만 반영하면 필터를 적용/해제하는 순간 displayData 가 csvData 로부터
   * 다시 계산되어 편집 이전 값이 되살아나고, CSV 내보내기도 옛 값을 쓴다.
   */
  const handleCellChange = useCallback((rowId, columnName, value) => {
    const applyEdit = (rows) =>
      rows.map(row =>
        getRowId(row) === rowId ? { ...row, [columnName]: value } : row
      );

    setDisplayData(prev => applyEdit(prev));
    setCsvData(prev => applyEdit(prev));

    // 편집된 데이터 추적 — 원래 값은 로드 시점 스냅샷(originalData)을 기준으로
    // 잡아야 같은 셀을 두 번 고쳐도 "변경 전 값"이 흔들리지 않는다.
    const editKey = `${rowId}-${columnName}`;
    const baselineIndex = findRowIndexById(originalData, rowId);
    setEditedData(prev => ({
      ...prev,
      [editKey]: {
        rowId,
        columnName,
        value,
        originalValue: prev[editKey]
          ? prev[editKey].originalValue
          : baselineIndex >= 0
            ? originalData[baselineIndex][columnName]
            : undefined
      }
    }));

    // 데이터 유효성 검사
    validateCellData(rowId, columnName, value);
  }, [originalData, setCsvData, setDisplayData, validateCellData]);

  /**
   * 수정된 데이터 저장
   *
   * 편집·삭제는 이미 `csvData` 에 즉시 반영되어 있으므로 여기서는
   * 현재 상태를 그대로 영속화하고 편집 추적만 초기화한다.
   */
  const saveEditedData = useCallback(() => {
    // 유효성 검사 오류 확인
    if (Object.keys(validationErrors).length > 0) {
      alert(MESSAGES.ERROR_VALIDATION);
      return false;
    }

    const updatedCsvData = cloneRows(csvData);

    // 상태 업데이트
    setOriginalData(cloneRows(updatedCsvData));
    setCsvData(updatedCsvData);

    // 저장
    saveData(updatedCsvData);

    // 편집 상태 초기화
    setEditedData({});

    // 필터 조건에 맞춰 화면 데이터 재계산(편집·삭제 결과 반영)
    const normalizedFilterSets = buildNormalizedFilterSets(filters);
    setDisplayData(
      updatedCsvData.filter(row => isRowMatchingFilters(row, normalizedFilterSets))
    );

    alert(MESSAGES.SAVE_SUCCESS);
    return true;
  }, [validationErrors, csvData, setCsvData, setOriginalData, saveData, filters, setDisplayData]);

  /**
   * 변경사항 취소 (복원)
   */
  const revertChanges = useCallback(() => {
    if (confirm(MESSAGES.REVERT_CONFIRM)) {
      const originalDataCopy = assignRowIds(cloneRows(originalData));
      setCsvData(originalDataCopy);
      // 현재 필터 조건을 유지한 채 복원한다(필터가 걸린 상태에서 전체가
      // 노출되면 사용자가 보고 있던 맥락이 깨진다).
      const normalizedFilterSets = buildNormalizedFilterSets(filters);
      setDisplayData(
        originalDataCopy.filter(row => isRowMatchingFilters(row, normalizedFilterSets))
      );
      setEditedData({});
      setValidationErrors({});
      return true;
    }
    return false;
  }, [originalData, setCsvData, setDisplayData, filters]);

  return {
    editedData,
    setEditedData,
    validationErrors,
    setValidationErrors,
    showChanges,
    setShowChanges,
    handleCellChange,
    validateCellData,
    saveEditedData,
    revertChanges,
  };
};
