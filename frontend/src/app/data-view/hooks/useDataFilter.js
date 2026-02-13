/**
 * 데이터 필터링 Custom Hook
 * 
 * @description
 * 테이블 데이터의 필터링 로직을 관리합니다.
 * 콤보박스 필터 적용, 초기화 등의 기능을 제공합니다.
 * 
 * @param {Array} csvData - 원본 CSV 데이터
 * @param {Function} setDisplayData - 화면 데이터 setter
 */

import { useState, useCallback } from 'react';

export const useDataFilter = (csvData, setDisplayData) => {
  const [filters, setFilters] = useState({});

  /**
   * 필터 적용
   */
  const applyFilters = useCallback((newFilters) => {
    let filteredData = [...csvData];

    // 모든 활성 필터 적용
    Object.entries(newFilters).forEach(([column, filterValues]) => {
      if (filterValues && filterValues.length > 0) {
        filteredData = filteredData.filter(row => {
          const cellValue = (row[column]?.toString() || '').toLowerCase();
          return filterValues.every(filter => {
            const filterValue = filter.toLowerCase().trim();
            return cellValue === filterValue;
          });
        });
      }
    });

    setDisplayData(filteredData);
  }, [csvData, setDisplayData]);

  /**
   * 콤보박스 값 변경 핸들러
   */
  const handleComboBoxChange = useCallback((column, value) => {
    const newFilters = { ...filters };

    if (value) {
      newFilters[column] = [value];
    } else {
      delete newFilters[column];
    }

    setFilters(newFilters);
    applyFilters(newFilters);
  }, [filters, applyFilters]);

  /**
   * 필터 초기화
   */
  const clearFilter = useCallback((column) => {
    const newFilters = { ...filters };
    delete newFilters[column];
    setFilters(newFilters);
    applyFilters(newFilters);
  }, [filters, applyFilters]);

  /**
   * 모든 필터 초기화
   */
  const clearAllFilters = useCallback(() => {
    setFilters({});
    setDisplayData([...csvData]);
  }, [csvData, setDisplayData]);

  return {
    filters,
    applyFilters,
    handleComboBoxChange,
    clearFilter,
    clearAllFilters,
  };
};
