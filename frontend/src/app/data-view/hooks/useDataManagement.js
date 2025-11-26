/**
 * 데이터 관리 Custom Hook
 * 
 * @description
 * CSV 데이터의 로드, 저장, 복원 등 데이터 생명주기를 관리합니다.
 * sessionStorage와의 동기화, 부모 창과의 통신도 담당합니다.
 */

import { useState, useCallback } from 'react';
import { STORAGE_KEYS, WINDOW_STATUS } from '../constants/storageKeys';
import { MESSAGES } from '../constants/messages';
import { deepCopy } from '../utils/dataFormatters';
import { generateComboBoxOptions } from '../utils/comboBoxHelpers';

export const useDataManagement = () => {
  const [csvData, setCsvData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [displayData, setDisplayData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comboBoxOptions, setComboBoxOptions] = useState({});
  const [editableColumns, setEditableColumns] = useState({ columns: [], editableKeys: [] });
  const [dataViewSource, setDataViewSource] = useState('');

  /**
   * sessionStorage에서 데이터 로드
   */
  const loadDataFromStorage = useCallback(() => {
    try {
      // 다양한 소스에서 데이터 찾기
      const storedData = sessionStorage.getItem(STORAGE_KEYS.REPORT_DATA) ||
        sessionStorage.getItem(STORAGE_KEYS.SUMMARY_DATA) ||
        sessionStorage.getItem(STORAGE_KEYS.CSV_DATA);

      const storedEditableColumns = sessionStorage.getItem(STORAGE_KEYS.EDITABLE_COLUMNS);

      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setCsvData(parsedData);
        setOriginalData(deepCopy(parsedData));
        setDisplayData(parsedData);
        setComboBoxOptions(generateComboBoxOptions(parsedData));
      } else {
        setError(MESSAGES.ERROR_NO_DATA_FOUND);
      }

      if (storedEditableColumns) {
        setEditableColumns(JSON.parse(storedEditableColumns));
      }

      // 출처 정보 로드
      const source = sessionStorage.getItem(STORAGE_KEYS.DATA_VIEW_SOURCE);
      if (source) {
        setDataViewSource(source);
      }

      // 창이 열렸음을 표시
      sessionStorage.setItem(STORAGE_KEYS.DATA_WINDOW_OPEN, WINDOW_STATUS.OPEN);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      setError(MESSAGES.ERROR_DATA_LOAD);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 데이터 새로고침 (부모 창에서 전달된 새 데이터)
   */
  const refreshData = useCallback((freshData) => {
    if (freshData) {
      setCsvData(freshData);
      setOriginalData(deepCopy(freshData));
      setDisplayData(freshData);
      setComboBoxOptions(generateComboBoxOptions(freshData));
    }
  }, []);

  /**
   * 데이터 저장 (sessionStorage 및 부모 창에 전달)
   */
  const saveData = useCallback((updatedData) => {
    sessionStorage.setItem(STORAGE_KEYS.CSV_DATA, JSON.stringify(updatedData));
    sessionStorage.setItem(STORAGE_KEYS.DATA_MODIFIED, 'true');

    // 부모 창에 메시지 전송
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'DATA_MODIFIED',
        data: updatedData,
        timestamp: Date.now()
      }, '*');
    }
  }, []);

  /**
   * 창 닫기 전 데이터 동기화
   */
  const syncDataBeforeUnload = useCallback((editedData, deletedRows) => {
    sessionStorage.setItem(STORAGE_KEYS.DATA_WINDOW_OPEN, WINDOW_STATUS.CLOSED);

    if (Object.keys(editedData).length > 0 || deletedRows.length > 0) {
      let updatedCsvData = [...csvData];

      // 모든 편집 내용 적용
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

      saveData(updatedCsvData);
    }
  }, [csvData, saveData]);

  return {
    // 상태
    csvData,
    originalData,
    displayData,
    isLoading,
    error,
    comboBoxOptions,
    editableColumns,
    dataViewSource,
    
    // 상태 업데이트 함수
    setCsvData,
    setDisplayData,
    setOriginalData,
    setComboBoxOptions,
    
    // 액션
    loadDataFromStorage,
    refreshData,
    saveData,
    syncDataBeforeUnload,
  };
};
