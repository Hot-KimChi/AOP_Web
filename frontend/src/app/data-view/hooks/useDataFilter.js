/**
 * 데이터 필터링 Custom Hook
 *
 * @description
 * 멀티 선택 + 연쇄(Cascaded) 필터링을 지원합니다.
 *  - 컬럼 내  : OR  로직 — 선택한 값 중 하나라도 일치하면 표시
 *  - 컬럼 간  : AND 로직 — 모든 활성 필터를 동시에 만족해야 표시
 *  - 연쇄 필터: 컬럼 A를 선택하면 컬럼 B의 옵션은 A 결과 내에서만 표시
 *
 * @param {Array}    csvData       - 원본 CSV 데이터
 * @param {Function} setDisplayData - 화면 데이터 setter
 */

import { useState, useCallback, useMemo } from 'react';

export const useDataFilter = (csvData, setDisplayData) => {
  const [filters, setFilters] = useState({});

  /**
   * 필터 적용 (컬럼 내 OR, 컬럼 간 AND)
   */
  const applyFilters = useCallback((newFilters) => {
    let filteredData = [...csvData];

    Object.entries(newFilters).forEach(([column, filterValues]) => {
      if (!filterValues || filterValues.length === 0) return;
      filteredData = filteredData.filter(row => {
        const cellValue = String(row[column] ?? '').toLowerCase();
        // 컬럼 내 OR: 선택된 값 중 하나라도 일치하면 통과
        return filterValues.some(
          filter => cellValue === filter.toLowerCase().trim()
        );
      });
    });

    setDisplayData(filteredData);
  }, [csvData, setDisplayData]);

  /**
   * 연쇄 필터 옵션
   *
   * 각 컬럼에 대해 "해당 컬럼을 제외한 나머지 필터를 적용한 결과 데이터"를
   * 기준으로 선택 가능한 값 목록을 동적으로 계산합니다.
   * 현재 선택된 값은 목록에서 사라지지 않아 사용자가 언제든 해제할 수 있습니다.
   */
  const cascadedOptions = useMemo(() => {
    if (!csvData || csvData.length === 0) return {};
    const columns = Object.keys(csvData[0] || {});
    const result = {};

    columns.forEach(targetCol => {
      // targetCol을 제외한 나머지 필터만 적용
      let data = csvData;
      Object.entries(filters).forEach(([col, vals]) => {
        if (col === targetCol || !vals || vals.length === 0) return;
        data = data.filter(row => {
          const v = String(row[col] ?? '').toLowerCase();
          return vals.some(f => v === f.toLowerCase().trim());
        });
      });

      // 필터링 결과에서 고유값 추출
      const optionSet = new Set(data.map(row => String(row[targetCol] ?? '')));

      // 현재 선택된 값은 사라지지 않도록 보장
      (filters[targetCol] || []).forEach(v => optionSet.add(v));

      // 숫자 인식 정렬
      result[targetCol] = [...optionSet].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
    });

    return result;
  }, [csvData, filters]);

  /**
   * 필터 값 변경 핸들러 (멀티 선택)
   *
   * @param {string}   column - 컬럼명
   * @param {string[]} values - 선택된 값 배열 (빈 배열이면 해당 컬럼 필터 제거)
   */
  const handleComboBoxChange = useCallback((column, values) => {
    const newFilters = { ...filters };

    if (values && values.length > 0) {
      newFilters[column] = values;
    } else {
      delete newFilters[column];
    }

    setFilters(newFilters);
    applyFilters(newFilters);
  }, [filters, applyFilters]);

  /**
   * 특정 컬럼 필터 초기화
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
    cascadedOptions,
    applyFilters,
    handleComboBoxChange,
    clearFilter,
    clearAllFilters,
  };
};
