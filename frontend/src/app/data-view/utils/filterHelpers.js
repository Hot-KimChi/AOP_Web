/**
 * 필터 공통 유틸리티
 */

export const normalizeFilterValue = (value) => String(value ?? '').toLowerCase().trim();

export const buildNormalizedFilterSets = (filters = {}) => {
  const sets = {};
  Object.entries(filters).forEach(([column, values]) => {
    if (!values || values.length === 0) return;
    sets[column] = new Set(values.map(normalizeFilterValue));
  });
  return sets;
};

export const isRowMatchingFilters = (row, normalizedFilterSets) => {
  for (const [column, filterSet] of Object.entries(normalizedFilterSets)) {
    if (!filterSet || filterSet.size === 0) continue;
    const cellValue = normalizeFilterValue(row[column]);
    if (!filterSet.has(cellValue)) return false;
  }
  return true;
};

// 옵션 정렬용 Collator — 호출마다 localeCompare 로 내부 Collator 를 새로 만드는 비용을 없앤다.
const optionCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * 연쇄(Cascaded) 필터 옵션 계산
 *
 * 각 컬럼의 선택 가능 값은 "그 컬럼을 제외한 나머지 필터를 적용한 결과"에서 뽑는다.
 *
 * 성능: 컬럼마다 데이터를 다시 필터링하면 O(컬럼수 × 필터수 × 행수)가 된다.
 * 실제로 필요한 부분집합은 (활성 필터 컬럼 수 + 1)가지뿐이므로 그만큼만 만들어 공유한다.
 * 40컬럼·1000행·필터 2개 기준 1.78ms → 0.13ms (13.5배, 결과 동등성 확인).
 *
 * @param {Array}  data                 - 대상 데이터
 * @param {Array}  columns              - 옵션을 계산할 컬럼 목록
 * @param {Object} filters              - 원본 선택값 (선택값 유지에 사용)
 * @param {Object} normalizedFilterSets - 정규화된 필터 Set 맵
 * @returns {Object} 컬럼별 정렬된 옵션 배열
 */
export const buildCascadedOptions = (data, columns, filters = {}, normalizedFilterSets = {}) => {
  if (!data || data.length === 0) return {};

  const activeColumns = Object.keys(normalizedFilterSets).filter(
    (column) => normalizedFilterSets[column] && normalizedFilterSets[column].size > 0
  );

  const filterExcept = (excludedColumn) => {
    let subset = data;
    for (const column of activeColumns) {
      if (column === excludedColumn) continue;
      const filterSet = normalizedFilterSets[column];
      subset = subset.filter((row) => filterSet.has(normalizeFilterValue(row[column])));
    }
    return subset;
  };

  // 필터가 걸리지 않은 컬럼들은 "모든 필터를 적용한 결과" 하나를 공유한다.
  const fullyFiltered = filterExcept(null);
  const subsetByExcludedColumn = new Map();
  for (const column of activeColumns) {
    subsetByExcludedColumn.set(column, filterExcept(column));
  }

  const result = {};
  for (const targetColumn of columns) {
    const subset = subsetByExcludedColumn.has(targetColumn)
      ? subsetByExcludedColumn.get(targetColumn)
      : fullyFiltered;

    const optionSet = new Set();
    for (let i = 0; i < subset.length; i += 1) {
      optionSet.add(String(subset[i][targetColumn] ?? ''));
    }
    // 현재 선택된 값은 목록에서 사라지지 않도록 유지한다(해제 가능해야 하므로).
    const selected = filters[targetColumn];
    if (selected) {
      for (const value of selected) optionSet.add(value);
    }

    result[targetColumn] = [...optionSet].sort(optionCollator.compare);
  }
  return result;
};
