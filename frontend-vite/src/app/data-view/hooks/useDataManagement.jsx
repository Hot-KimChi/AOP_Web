/**
 * 데이터 관리 Custom Hook
 * 
 * @description
 * CSV 데이터의 로드, 저장, 복원 등 데이터 생명주기를 관리합니다.
 * sessionStorage와의 동기화, 부모 창과의 통신도 담당합니다.
 */

import { useState, useCallback, useRef } from 'react';
import { STORAGE_KEYS, WINDOW_STATUS } from '../constants/storageKeys';
import { MESSAGES } from '../constants/messages';
import { assignRowIds, cloneRows } from '../utils/rowIdentity';

export const useDataManagement = () => {
  const [csvData, setCsvData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [displayData, setDisplayData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editableColumns, setEditableColumns] = useState({ columns: [], editableKeys: [] });
  const activeStorageKeyRef = useRef(null);

  /**
   * sessionStorage에서 데이터 로드
   */
  const loadDataFromStorage = useCallback(() => {
    try {
      // 다양한 소스에서 데이터 찾기 (읽은 키를 기억해 저장 시 동일 키를 갱신)
      const candidateKeys = [
        STORAGE_KEYS.REPORT_DATA,
        STORAGE_KEYS.SUMMARY_DATA,
        STORAGE_KEYS.CSV_DATA,
      ];
      const sourceKey = candidateKeys.find(key => sessionStorage.getItem(key));
      const storedData = sourceKey ? sessionStorage.getItem(sourceKey) : null;
      activeStorageKeyRef.current = sourceKey || STORAGE_KEYS.CSV_DATA;

      const storedEditableColumns = sessionStorage.getItem(STORAGE_KEYS.EDITABLE_COLUMNS);

      if (storedData) {
        const parsedData = assignRowIds(JSON.parse(storedData));
        setCsvData(parsedData);
        setOriginalData(cloneRows(parsedData));
        setDisplayData(parsedData);
      } else {
        setError(MESSAGES.ERROR_NO_DATA_FOUND);
      }

      if (storedEditableColumns) {
        setEditableColumns(JSON.parse(storedEditableColumns));
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
      const withIds = assignRowIds(freshData);
      setCsvData(withIds);
      setOriginalData(cloneRows(withIds));
      setDisplayData(withIds);
    }
  }, []);

  /**
   * 데이터 저장 (sessionStorage 및 부모 창에 전달)
   */
  const saveData = useCallback((updatedData) => {
    const payload = JSON.stringify(updatedData);
    // 로드한 키가 CSV_DATA 가 아니면(REPORT/SUMMARY) 그 키도 함께 갱신해야
    // 다시 열었을 때 수정 이전 데이터가 되살아나지 않는다.
    sessionStorage.setItem(STORAGE_KEYS.CSV_DATA, payload);
    const activeKey = activeStorageKeyRef.current;
    if (activeKey && activeKey !== STORAGE_KEYS.CSV_DATA) {
      sessionStorage.setItem(activeKey, payload);
    }
    sessionStorage.setItem(STORAGE_KEYS.DATA_MODIFIED, 'true');

    // 부모 창에 메시지 전송 (같은 origin만 허용)
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'DATA_MODIFIED',
        data: updatedData,
        timestamp: Date.now()
      }, window.location.origin);
    }
  }, []);

  /**
   * 창 닫기 전 데이터 동기화
   *
   * 편집·삭제는 이미 `csvData` 에 반영되어 있으므로, 미저장 변경이 있을 때
   * 현재 상태를 그대로 영속화한다.
   */
  const syncDataBeforeUnload = useCallback((editedData, deletedRows) => {
    sessionStorage.setItem(STORAGE_KEYS.DATA_WINDOW_OPEN, WINDOW_STATUS.CLOSED);

    if (Object.keys(editedData).length > 0 || deletedRows.length > 0) {
      saveData(csvData);
    }
  }, [csvData, saveData]);

  return {
    // 상태
    csvData,
    originalData,
    displayData,
    isLoading,
    error,
    editableColumns,
    
    // 상태 업데이트 함수
    setCsvData,
    setDisplayData,
    setOriginalData,
    
    // 액션
    loadDataFromStorage,
    refreshData,
    saveData,
    syncDataBeforeUnload,
  };
};
