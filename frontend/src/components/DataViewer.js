"use client";
import { useState, useMemo, useCallback } from 'react';
import { ArrowUpDown, FileSpreadsheet } from 'lucide-react';
import { MultiSelectDropdown } from '../app/data-view/components/MultiSelectDropdown';

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

  // ── 연쇄 필터 옵션 (cascaded) ─────────────────────────────
  // 각 컬럼에 대해 "해당 컬럼을 제외한 나머지 필터를 적용한 결과"에서 고유값을 추출합니다.
  const cascadedOptions = useMemo(() => {
    if (!data.length) return {};
    const result = {};
    columnList.forEach(targetCol => {
      let subset = data;
      Object.entries(filters).forEach(([col, vals]) => {
        if (col === targetCol || !vals || vals.length === 0) return;
        subset = subset.filter(row => {
          const v = String(row[col] ?? '').toLowerCase();
          return vals.some(f => v === f.toLowerCase().trim());
        });
      });
      const optionSet = new Set(subset.map(row => String(row[targetCol] ?? '')));
      // 현재 선택된 값은 목록에서 사라지지 않도록 유지
      (filters[targetCol] || []).forEach(v => optionSet.add(v));
      result[targetCol] = [...optionSet].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
      );
    });
    return result;
  }, [data, filters, columnList]);

  // ── 필터 적용 (컬럼 내 OR, 컬럼 간 AND) ─────────────────
  const filteredData = useMemo(() => {
    let result = data;
    Object.entries(filters).forEach(([col, vals]) => {
      if (!vals || vals.length === 0) return;
      result = result.filter(row => {
        const v = String(row[col] ?? '').toLowerCase();
        return vals.some(f => v === f.toLowerCase().trim());
      });
    });
    return result;
  }, [data, filters]);

  // ── 정렬 적용 ────────────────────────────────────────────
  const displayData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    const key = sortConfig.key;
    const dir = sortConfig.direction;
    return [...filteredData].sort((a, b) => {
      if (a[key] == null) return 1;
      if (b[key] == null) return -1;
      const aV = typeof a[key] === 'string' ? a[key].toLowerCase() : a[key];
      const bV = typeof b[key] === 'string' ? b[key].toLowerCase() : b[key];
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
        columnList.join(','),
        ...displayData.map(row =>
          columnList.map(h => formatNumber(row[h], h)).join(','),
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
  function formatNumber(value, key) {
    const float2Pattern = /^(XP_Value_\d+|reportValue_\d+|Difference_\d+|Ambient_Temp_\d+|MaxReportValue)$/;
    if (typeof value === 'number') {
      if (key && float2Pattern.test(key)) return value.toFixed(2);
      return value % 1 === 0 ? value : parseFloat(value.toFixed(4));
    }
    return value?.toString() || '';
  }
  function truncateText(text) {
    if (!text) return '';
    const str = text.toString();
    return str.length > 16 ? `${str.substring(0, 16)}...` : str;
  }
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

      <table className={`w-full min-w-[${minWidth}px] border-collapse`}>
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
