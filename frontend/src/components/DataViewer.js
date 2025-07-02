"use client";
import { useState } from 'react';
import { ArrowUpDown, X, FileSpreadsheet } from 'lucide-react';

export default function DataViewer({
  data = [],
  columns = [], // 추가: 컬럼 순서 정보
  title = '',
  onExport = null,
  showExport = true,
  minWidth = 800,
  style = {},
}) {
  const [displayData, setDisplayData] = useState(data);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({});
  const [comboBoxOptions, setComboBoxOptions] = useState(generateComboBoxOptions(data));

  // 정렬
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
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
  };

  // 필터
  const applyFilters = (newFilters) => {
    let filteredData = [...data];
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
    setComboBoxOptions(generateComboBoxOptions(filteredData));
  };

  const handleComboBoxChange = (column, value) => {
    const newFilters = { ...filters, [column]: [value] };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const clearFilter = (column) => {
    const newFilters = { ...filters };
    delete newFilters[column];
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  // 엑셀 내보내기
  const exportToExcel = () => {
    try {
      if (!displayData.length) throw new Error('내보낼 데이터가 없습니다.');
      // Object.keys 대신 columnList 사용 (화면 표시 순서와 동일하게)
      const headers = columnList;
      const csvContent = [
        headers.join(','),
        ...displayData.map(row =>
          headers.map(header => {
            const value = row[header];
            // 소수점 2자리 적용 컬럼이면 반올림 적용
            return formatNumber(value, header);
          }).join(',')
        )
      ].join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const fileName = `${title || 'data_export'}_${new Date().toISOString().split('T')[0]}.csv`;
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (onExport) onExport();
    } catch (error) {
      alert('내보내기 실패: ' + error.message);
    }
  };

  // 유틸
  function formatNumber(value, key) {
    // 소수점 2자리까지 표시할 컬럼명 패턴 (MaxReportValue 추가)
    const float2Pattern = /^(XP_Value_\d+|reportValue_\d+|Difference_\d+|Ambient_Temp_\d+|MaxReportValue)$/;
    if (typeof value === 'number') {
      if (key && float2Pattern.test(key)) {
        return value.toFixed(2);
      }
      return value % 1 === 0 ? value : parseFloat(value.toFixed(4));
    }
    return value?.toString() || '';
  }
  function truncateText(text) {
    if (!text) return '';
    const str = text.toString();
    return str.length > 30 ? `${str.substring(0, 30)}...` : str;
  }
  function renderCellContent(value, key) {
    if (value === null || value === undefined) {
      return '';
    }
    const formattedValue = formatNumber(value, key);
    return formattedValue === 0 ? '0' : truncateText(formattedValue);
  }
  function generateComboBoxOptions(data) {
    const options = {};
    const columns = Object.keys(data[0] || {});
    columns.forEach((column) => {
      options[column] = [...new Set(data.map(row => row[column]))];
    });
    return options;
  }

  // 컬럼 정보 결정
  const columnList = columns && columns.length > 0 ? columns : Object.keys(displayData[0] || {});

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
          <tr className="bg-gray-100 sticky-header">
            {columnList.map((header, index) => (
              <th key={index} className="px-3 py-2 border">
                <div className="flex items-center justify-between group">
                  <span title={header} className="font-medium text-gray-700">
                    {truncateText(header)}
                  </span>
                  <button
                    className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                    onClick={() => handleSort(header)}
                    title={`Sort ${sortConfig.key === header && sortConfig.direction === 'asc' ? 'Descending' : 'Ascending'}`}
                  >
                    <ArrowUpDown
                      size={12}
                      className={`transition-colors ${sortConfig.key === header ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}`}
                    />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <thead className="sticky-filter">
          <tr>
            {columnList.map((header, index) => (
              <th key={index} className="px-2 py-1 border bg-gray-50">
                <div className="relative">
                  <select
                    className="w-full px-2 py-1 pr-6 text-sm border rounded focus:outline-none focus:border-blue-400"
                    value={filters[header]?.[0] || ''}
                    onChange={(e) => handleComboBoxChange(header, e.target.value)}
                  >
                    <option value="">Select...</option>
                    {comboBoxOptions[header]?.map((option, idx) => (
                      <option key={idx} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {filters[header] && (
                    <button
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded"
                      onClick={() => clearFilter(header)}
                      title="Clear filter"
                    >
                      <X size={12} className="text-gray-400" />
                    </button>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayData.length > 0 ? (
            displayData.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {columnList.map((col, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-3 py-2 border"
                    title={formatNumber(row[col], col)}
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
          max-height: 900px;
          white-space: nowrap;
          background-color: white;
          border-radius: 0.25rem;
          box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
        }
        .table-container th, .table-container td {
          font-size: 12px;
          text-align: left;
          border: 1px solid #ddd;
        }
        .sticky-header {
          position: sticky;
          top: 0;
          z-index: 10;
          background-color: white;
        }
        .sticky-filter {
          position: sticky;
          top: 40px;
          z-index: 9;
          background-color: white;
        }
        .table-container::-webkit-scrollbar {
          height: 8px;
        }
        .table-container::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .table-container::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }
        .table-container::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </div>
  );
}
