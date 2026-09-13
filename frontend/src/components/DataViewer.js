"use client";
import { useState, useMemo, useCallback } from 'react';
import { ArrowUpDown, FileSpreadsheet } from 'lucide-react';
import { MultiSelectDropdown } from '../app/data-view/components/MultiSelectDropdown';
import { formatNumber, truncateText } from '../app/data-view/utils/dataFormatters';
import { escapeCSVValue } from '../app/data-view/utils/csvExport';
import {
  buildNormalizedFilterSets,
  buildCascadedOptions,
  normalizeFilterValue,
} from '../app/data-view/utils/filterHelpers';

export default function DataViewer({
  data = [],
  columns = [],
  title = '',
  onExport = null,
  showExport = true,
  minWidth = 800,
  style = {},
}) {
  const [filters,    setFilters]    = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // 컬럼 목록
  const columnList = useMemo(
    () => (columns && columns.length > 0 ? columns : Object.keys(data[0] || {})),
    [columns, data],
  );

  const normalizedFilterSets = useMemo(
    () => buildNormalizedFilterSets(filters),
    [filters],
  );

  // ── 연쇄 필터 옵션 (cascaded) ─────────────────────────────
  // 각 컬럼에 대해 "해당 컬럼을 제외한 나머지 필터를 적용한 결과"에서 고유값을 추출합니다.
  const cascadedOptions = useMemo(
    () => buildCascadedOptions(data, columnList, filters, normalizedFilterSets),
    [data, filters, columnList, normalizedFilterSets],
  );

  // ── 필터 적용 (컬럼 내 OR, 컬럼 간 AND) ─────────────────
  const filteredData = useMemo(() => {
    let result = data;
    Object.entries(normalizedFilterSets).forEach(([col, valSet]) => {
      if (!valSet || valSet.size === 0) return;
      result = result.filter(row => {
        const v = normalizeFilterValue(row[col]);
        return valSet.has(v);
      });
    });
    return result;
  }, [data, normalizedFilterSets]);

  // ── 정렬 적용 ────────────────────────────────────────────
  const displayData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    const key = sortConfig.key;
    const dir = sortConfig.direction;

    // 숫자 컬럼을 문자열로 비교하면 "100" < "2" 가 되어 순서가 어긋난다.
    const parseValue = (raw) => {
      if (raw === null || raw === undefined || raw === '') return null;
      if (typeof raw === 'number') return raw;
      const trimmed = String(raw).trim();
      if (trimmed === '') return null;
      const num = Number(trimmed);
      return Number.isNaN(num) ? trimmed.toLowerCase() : num;
    };

    return [...filteredData].sort((a, b) => {
      const aV = parseValue(a[key]);
      const bV = parseValue(b[key]);
      if (aV === null && bV === null) return 0;
      if (aV === null) return 1;
      if (bV === null) return -1;

      const aIsNum = typeof aV === 'number';
      const bIsNum = typeof bV === 'number';
      if (aIsNum !== bIsNum) return aIsNum ? -1 : 1;

      if (aV < bV) return dir === 'asc' ? -1 : 1;
      if (aV > bV) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // ── 핸들러 ───────────────────────────────────────────────
  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  // MultiSelectDropdown과 동일 인터페이스: (column, values[])
  const handleFilterChange = useCallback((column, values) => {
    setFilters(prev => {
      if (values && values.length > 0) return { ...prev, [column]: values };
      const next = { ...prev };
      delete next[column];
      return next;
    });
  }, []);

  const clearFilter = useCallback((column) => {
    setFilters(prev => {
      const next = { ...prev };
      delete next[column];
      return next;
    });
  }, []);

  // ── 엑셀 내보내기 ─────────────────────────────────────────
  const exportToExcel = useCallback(() => {
    try {
      if (!displayData.length) throw new Error('내보낼 데이터가 없습니다.');
      const csvContent = [
        columnList.map(escapeCSVValue).join(','),
        ...displayData.map(row =>
          columnList.map(h => escapeCSVValue(formatNumber(row[h], h))).join(','),
        ),
      ].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'data_export'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onExport?.();
    } catch (err) {
      alert('내보내기 실패: ' + err.message);
    }
  }, [displayData, columnList, title, onExport]);

  // ── 유틸 ─────────────────────────────────────────────────
  function renderCellContent(value, key) {
    if (value === null || value === undefined) return '';
    const formatted = formatNumber(value, key);
    return formatted === 0 ? '0' : truncateText(formatted);
  }

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <div className="table-container" style={style}>
      <div className="flex justify-between items-center mb-3">
        <h4 className="mb-0">{title}</h4>
        {showExport && (
          <button className="btn btn-primary" onClick={exportToExcel}>
            <FileSpreadsheet size={13} /> Export Excel
          </button>
        )}
      </div>

      <table className="w-full border-collapse" style={{ minWidth: `${minWidth}px` }}>
        <thead>
          {/* 헤더 행 */}
          <tr className="sticky-header">
            {columnList.map((header) => (
              <th key={header} className="border" style={{ padding: '2px 4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span
                    title={header}
                    style={{ textAlign: 'center', display: 'block', fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}
                  >
                    {truncateText(header)}
                  </span>
                  <button
                    style={{ padding: '1px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    className="hover:bg-gray-200 rounded transition-colors"
                    onClick={() => handleSort(header)}
                    title={`Sort ${sortConfig.key === header && sortConfig.direction === 'asc' ? 'Descending' : 'Ascending'}`}
                  >
                    <ArrowUpDown
                      size={9}
                      className={sortConfig.key === header ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}
                    />
                  </button>
                </div>
              </th>
            ))}
          </tr>

          {/* 필터 행 — MultiSelectDropdown (Portal 기반) */}
          <tr className="sticky-filter">
            {columnList.map((header) => (
              <th key={header} className="border" style={{ padding: '2px' }}>
                <MultiSelectDropdown
                  column={header}
                  options={cascadedOptions[header] ?? []}
                  selected={filters[header] ?? []}
                  onChange={handleFilterChange}
                  onClear={clearFilter}
                />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {displayData.length > 0 ? (
            displayData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columnList.map((col) => (
                  <td
                    key={col}
                    className="border"
                    style={{ padding: '4px', fontSize: '12px' }}
                    title={String(formatNumber(row[col], col))}
                  >
                    {renderCellContent(row[col], col)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columnList.length} className="text-center py-3 text-gray-500">
                No data to display. Please adjust your filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <style jsx>{`
        .table-container {
          width: 100%;
          overflow-x: auto;
          max-height: calc(100vh - 100px);
          white-space: nowrap;
          background-color: var(--surface);
          border-radius: 0.25rem;
          box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
        }
        table {
          border-collapse: collapse;
          border-spacing: 0;
          border: 1px solid var(--border);
        }
        .table-container th, .table-container td {
          font-size: 12px;
          text-align: left;
          border: 0.5px solid var(--border) !important;
          line-height: 1.2;
          box-sizing: border-box;
          color: var(--text);
        }
        .table-container tbody td {
          text-align: center;
        }
        .table-container tbody tr:hover td {
          background-color: var(--table-hover);
        }
        .sticky-header {
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .sticky-header th {
          background-color: var(--surface);
        }
        .sticky-filter {
          position: sticky;
          top: 38px;
          z-index: 9;
        }
        .sticky-filter th {
          background-color: var(--bg);
        }
        .table-container::-webkit-scrollbar { height: 8px; }
        .table-container::-webkit-scrollbar-track { background: var(--bg); }
        .table-container::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 4px; }
        .table-container::-webkit-scrollbar-thumb:hover { background: var(--text-sec); }
      `}</style>
    </div>
  );
}
