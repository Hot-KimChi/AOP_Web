/**
 * 행 조작 Custom Hook
 * 
 * @description
 * 행 삭제, 복원 등의 기능을 관리합니다.
 */

import { useState, useCallback } from 'react';
import { MESSAGES } from '../constants/messages';

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
  const [deletedRows, setDeletedRows] = useState([]);

  /**
   * 행 삭제 핸들러
   */
  const handleDeleteRow = useCallback((rowIndex) => {
    if (confirm(MESSAGES.DELETE_CONFIRM)) {
      // 삭제된 행 추적
      setDeletedRows(prev => [...prev, rowIndex]);

      // 화면에서 행 제거
      const updatedDisplayData = displayData.filter((_, idx) => idx !== rowIndex);
      setDisplayData(updatedDisplayData);

      // 삭제된 행과 관련된 편집 상태 제거
      const newEditedData = { ...editedData };
      Object.keys(newEditedData).forEach(key => {
        if (key.startsWith(`${rowIndex}-`)) {
          delete newEditedData[key];
        }
      });
      setEditedData(newEditedData);

      // 삭제된 행과 관련된 유효성 검사 오류 제거
      const newValidationErrors = { ...validationErrors };
      Object.keys(newValidationErrors).forEach(key => {
        if (key.startsWith(`${rowIndex}-`)) {
          delete newValidationErrors[key];
        }
      });
      setValidationErrors(newValidationErrors);
    }
  }, [displayData, setDisplayData, editedData, setEditedData, validationErrors, setValidationErrors]);

  /**
   * 삭제된 행 복원
   */
  const restoreDeletedRows = useCallback(() => {
    if (deletedRows.length === 0) return;

    if (confirm(MESSAGES.RESTORE_CONFIRM)) {
      const filteredData = csvData.filter(row => {
        return Object.entries(filters).every(([column, filterValues]) => {
          if (!filterValues || filterValues.length === 0) return true;
          const cellValue = (row[column]?.toString() || '').toLowerCase();
          return filterValues.some(filter => cellValue === filter.toLowerCase().trim());
        });
      });

      setDisplayData(filteredData);
      setDeletedRows([]);
    }
  }, [deletedRows, csvData, filters, setDisplayData]);

  return {
    deletedRows,
    setDeletedRows,
    handleDeleteRow,
    restoreDeletedRows,
  };
};
