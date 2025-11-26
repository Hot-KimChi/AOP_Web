/**
 * 데이터 정렬 Custom Hook
 * 
 * @description
 * 테이블 데이터의 정렬 로직을 관리합니다.
 * 오름차순/내림차순 토글 기능을 제공합니다.
 */

import { useState, useCallback } from 'react';

export const useDataSort = (displayData, setDisplayData) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  /**
   * 정렬 핸들러
   */
  const handleSort = useCallback((key) => {
    // 정렬 방향 결정
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    // 데이터 정렬
    const sortedData = [...displayData].sort((a, b) => {
      if (a[key] === null) return 1;
      if (b[key] === null) return -1;

      const aVal = typeof a[key] === 'string' ? a[key].toLowerCase() : a[key];
      const bVal = typeof b[key] === 'string' ? b[key].toLowerCase() : b[key];

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    setDisplayData(sortedData);
  }, [sortConfig, displayData, setDisplayData]);

  return {
    sortConfig,
    handleSort,
  };
};
