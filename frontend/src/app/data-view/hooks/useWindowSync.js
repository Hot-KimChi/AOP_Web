/**
 * 윈도우 동기화 Custom Hook
 * 
 * @description
 * 부모 창과의 메시지 통신 및 창 닫기 이벤트를 관리합니다.
 */

import { useEffect, useCallback } from 'react';

export const useWindowSync = (refreshData, syncDataBeforeUnload, editedData, deletedRows) => {
  /**
   * 메시지 수신 핸들러
   */
  const receiveMessage = useCallback((event) => {
    if (event.data && event.data.type === 'REFRESH_DATA') {
      const freshData = event.data.data;
      if (freshData) {
        refreshData(freshData);
      }
    }
  }, [refreshData]);

  /**
   * 창 닫기 전 핸들러
   */
  const handleBeforeUnload = useCallback(() => {
    syncDataBeforeUnload(editedData, deletedRows);
  }, [syncDataBeforeUnload, editedData, deletedRows]);

  /**
   * 이벤트 리스너 등록
   */
  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('message', receiveMessage);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('message', receiveMessage);
    };
  }, [handleBeforeUnload, receiveMessage]);

  return null;
};
