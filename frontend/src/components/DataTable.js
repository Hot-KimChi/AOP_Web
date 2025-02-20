'use client';

import { useState } from 'react';
import { ArrowUpDown, X } from 'lucide-react';

export default function DataTable({ data }) {
  const [displayData, setDisplayData] = useState(data || []);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({});

  // 정렬 함수
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    const sortedData = [...displayData].sort((a, b) => {
      const aVal = typeof a[key] === 'string' ? a[key].toLowerCase() : a[key];
      const bVal = typeof b[key] === 'string' ? b[key].toLowerCase() : b[key];
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    setDisplayData(sortedData);
  };

  // 필터 적용 함수
  const applyFilters = (newFilters) => {
    let filteredData = [...data];
    Object.entries(newFilters).forEach(([column, filterValues]) => {
      if (filterValues && filterValues.length > 0) {
        filteredData = filteredData.filter(row =>
          filterValues.includes(row[column]?.toString())
        );
      }
    });
    setDisplayData(filteredData);
  };

  const handleFilterChange = (column, value) => {
    const newFilters = { ...filters, [column]: value ? [value] : [] };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const clearFilter = (column) => {
    const newFilters = { ...filters };
    delete newFilters[column];
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const truncateText = (text) => {
    if (!text) return '';
    const str = text.toString();
    return str.length > 20 ? `${str.substring(0, 20)}...` : str;
  };

  if (!data || data.length === 0) {
    return <p>표시할 데이터가 없습니다.</p>;
  }

  const headers = Object.keys(data[0] || {});

  return (
    <div className="table-container">
      <table className="w-full min-w-[800px] border-collapse">
        <thead>
          <tr className="bg-gray-100 sticky-header">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 border">
                <div className="flex items-center justify-between group">
                  <span title={header}>{truncateText(header)}</span>
                  <button onClick={() => handleSort(header)}>
                    <ArrowUpDown
                      size={12}
                      className={sortConfig.key === header ? 'text-blue-500' : 'text-gray-400'}
                    />
                  </button>
                </div>
              </th>
            ))}
          </tr>
          <tr className="sticky-filter">
            {headers.map((header) => (
              <th key={header} className="px-2 py-1 border bg-gray-50">
                <div className="relative">
                  <select
                    className="w-full px-2 py-1 text-sm border rounded"
                    value={filters[header]?.[0] || ''}
                    onChange={(e) => handleFilterChange(header, e.target.value)}
                  >
                    <option value="">선택...</option>
                    {[...new Set(data.map(row => row[header]))].map((option) => (
                      <option key={option} value={option}>
                        {truncateText(option)}
                      </option>
                    ))}
                  </select>
                  {filters[header] && (
                    <button
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => clearFilter(header)}
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
          {displayData.map((row, index) => (
            <tr key={index} className="hover:bg-gray-50">
              {headers.map((header) => (
                <td key={header} className="px-3 py-2 border" title={row[header]?.toString()}>
                  {truncateText(row[header])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <style jsx>{`
        .table-container {
          overflow-x: auto;
          max-height: 500px;
          background-color: white;
          border-radius: 0.25rem;
          box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
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
      `}</style>
    </div>
  );
}