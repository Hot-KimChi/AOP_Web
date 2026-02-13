/**
 * 데이터 편집 Custom Hook
 * 
 * @description
 * 셀 편집, 유효성 검사, 저장/복원 로직을 관리합니다.
 */

import { useState, useCallback } from 'react';
import { MESSAGES } from '../constants/messages';
import { validateCellData as validateCell } from '../utils/dataValidation';
import { deepCopy } from '../utils/dataFormatters';

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
   * 셀 값 변경 핸들러
   */
  const handleCellChange = useCallback((rowIndex, columnName, value) => {
    // 화면 데이터 업데이트
    const updatedDisplayData = [...displayData];
    updatedDisplayData[rowIndex][columnName] = value;
    setDisplayData(updatedDisplayData);

    // 편집된 데이터 추적
    setEditedData(prev => ({
      ...prev,
      [`${rowIndex}-${columnName}`]: {
        rowIndex,
        columnName,
        value,
        originalValue: csvData[rowIndex][columnName]
      }
    }));

    // 데이터 유효성 검사
    validateCellData(rowIndex, columnName, value);
  }, [displayData, csvData, setDisplayData, editableColumns]);

  /**
   * 셀 데이터 유효성 검사
   */
  const validateCellData = useCallback((rowIndex, columnName, value) => {
    const errKey = `${rowIndex}-${columnName}`;
    const newValidationErrors = { ...validationErrors };

    const errorMessage = validateCell(columnName, value, editableColumns.editableKeys);

    if (errorMessage) {
      newValidationErrors[errKey] = errorMessage;
    } else {
      delete newValidationErrors[errKey];
    }

    setValidationErrors(newValidationErrors);
  }, [validationErrors, editableColumns]);

  /**
   * 수정된 데이터 저장
   */
  const saveEditedData = useCallback((deletedRows) => {
    // 유효성 검사 오류 확인
    if (Object.keys(validationErrors).length > 0) {
      alert(MESSAGES.ERROR_VALIDATION);
      return false;
    }

    // CSV 데이터 업데이트
    let updatedCsvData = [...csvData];

    // 수정된 모든 셀 업데이트
    Object.values(editedData).forEach(edit => {
      const { rowIndex, columnName, value } = edit;
      updatedCsvData[rowIndex][columnName] = value;
    });

    // 삭제된 행 제거
    if (deletedRows.length > 0) {
      const sortedDeletedIndices = [...deletedRows].sort((a, b) => b - a);
      sortedDeletedIndices.forEach(index => {
        updatedCsvData.splice(index, 1);
      });
    }

    // 상태 업데이트
    setOriginalData(deepCopy(updatedCsvData));
    setCsvData(updatedCsvData);

    // 저장
    saveData(updatedCsvData);

    // 편집 상태 초기화
    setEditedData({});

    // 삭제된 행이 있으면 필터링된 데이터도 업데이트
    if (deletedRows.length > 0) {
      const filteredData = updatedCsvData.filter(row => {
        return Object.entries(filters).every(([column, filterValues]) => {
          if (!filterValues || filterValues.length === 0) return true;
          const cellValue = (row[column]?.toString() || '').toLowerCase();
          return filterValues.some(filter => cellValue === filter.toLowerCase().trim());
        });
      });
      setDisplayData(filteredData);
    }

    alert(MESSAGES.SAVE_SUCCESS);
    return true;
  }, [validationErrors, csvData, editedData, setCsvData, setOriginalData, saveData, filters, setDisplayData]);

  /**
   * 변경사항 취소 (복원)
   */
  const revertChanges = useCallback(() => {
    if (confirm(MESSAGES.REVERT_CONFIRM)) {
      const originalDataCopy = deepCopy(originalData);
      setCsvData(originalDataCopy);
      setDisplayData(originalDataCopy);
      setEditedData({});
      setValidationErrors({});
      return true;
    }
    return false;
  }, [originalData, setCsvData, setDisplayData]);

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
