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

    // 데이터 정렬 (숫자 컬럼은 숫자로 비교해야 "100" < "2" 오류가 없다)
    const parseValue = (raw) => {
      if (raw === null || raw === undefined || raw === '') return null;
      if (typeof raw === 'number') return raw;
      const trimmed = String(raw).trim();
      if (trimmed === '') return null;
      const num = Number(trimmed);
      return Number.isNaN(num) ? trimmed.toLowerCase() : num;
    };

    const sortedData = [...displayData].sort((a, b) => {
      const aVal = parseValue(a[key]);
      const bVal = parseValue(b[key]);

      // 빈 값은 방향과 무관하게 항상 뒤로 보낸다
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      const aIsNumber = typeof aVal === 'number';
      const bIsNumber = typeof bVal === 'number';

      // 숫자와 문자열이 섞이면 숫자를 앞에 둔다
      if (aIsNumber !== bIsNumber) return aIsNumber ? -1 : 1;

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
