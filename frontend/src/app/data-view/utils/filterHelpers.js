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
