'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpDown, X, FileSpreadsheet } from 'lucide-react';

function DataViewContent() {
  const [data, setData] = useState([]);
  const [displayData, setDisplayData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({});
  const [comboBoxOptions, setComboBoxOptions] = useState({});
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const database = searchParams.get('database');
        const table = searchParams.get('table');

        if (!database || !table) {
          throw new Error('Database and table parameters are required');
        }

        const response = await fetch(`/api/viewer?databaseName=${database}&tableName=${table}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const result = await response.json();
        setData(result.data || []);
        setDisplayData(result.data || []);
        setComboBoxOptions(generateComboBoxOptions(result.data || []));
      } catch (error) {
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [searchParams]);

  // Excel 내보내기 함수
  const exportToExcel = () => {
    try {
      const headers = Object.keys(displayData[0]);
      const csvContent = [
        headers.join(','),
        ...displayData.map(row =>
          headers.map(header => {
            const value = row[header];
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const database = searchParams.get('database');
      const table = searchParams.get('table');
      const fileName = `${database}_${table}_${new Date().toISOString().split('T')[0]}.csv`;

      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
    }
  };

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
    setComboBoxOptions(generateComboBoxOptions(filteredData)); // 필터링된 데이터로 콤보박스 옵션 갱신
  };

  const handleFilterChange = (column, value) => {
    const filterValues = value.split(',').map(v => v.trim()).filter(v => v !== '');
    const newFilters = {
      ...filters,
      [column]: filterValues
    };

    if (filterValues.length === 0) {
      delete newFilters[column];
    }

    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const clearFilter = (column) => {
    const newFilters = { ...filters };
    delete newFilters[column];
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const formatNumber = (value) => {
    if (typeof value === 'number') {
      return value % 1 === 0 ? value : parseFloat(value.toFixed(4));
    }
    return value?.toString() || '';
  };

  const truncateText = (text) => {
    if (!text) return '';
    const str = text.toString();
    return str.length > 20 ? `${str.substring(0, 20)}...` : str;
  };

  const renderCellContent = (value) => {
    const formattedValue = formatNumber(value);
    return truncateText(formattedValue);
  };

  // 콤보박스 옵션을 생성하는 함수
  const generateComboBoxOptions = (data) => {
    const options = {};
    const columns = Object.keys(data[0] || {});
    
    columns.forEach((column) => {
      options[column] = [...new Set(data.map(row => row[column]))]; // 중복을 제거하여 유니크한 값만 저장
    });

    return options;
  };

  // 콤보박스 값 변경 시 다른 콤보박스 업데이트
  const handleComboBoxChange = (column, value) => {
    const newFilters = { ...filters, [column]: [value] };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  return (
    <div className="container-fluid p-4">
      {isLoading ? (
        <div className="text-center p-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-danger">
          {error}
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-3">
            <h4 className="mb-0">
              {searchParams.get('database')} / {searchParams.get('table')}
              <div className="col-md-2 d-flex align-items-end">
                <button 
                  className="btn btn-primary w-100"
                  onClick={exportToExcel}
                >
                  <FileSpreadsheet size={13} />
                  Export Excel
                </button>
              </div>
            </h4>
          </div>

          <div className="table-container">
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr className="bg-gray-100 sticky-header">
                  {Object.keys(displayData[0] || {}).map((header, index) => (
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
                  {Object.keys(displayData[0] || {}).map((header, index) => (
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
                      {Object.values(row).map((value, colIndex) => (
                        <td 
                          key={colIndex} 
                          className="px-3 py-2 border"
                          title={formatNumber(value)}
                        >
                          {renderCellContent(value)}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={Object.keys(displayData[0] || {}).length} className="text-center py-3 text-gray-500">
                      No data to display. Please adjust your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
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
          top: 40px; /* Adjust to position it below the header */
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

export default function DataViewStandalone() {
  return (
    <Suspense fallback={
      <div className="text-center p-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    }>
      <DataViewContent />
    </Suspense>
  );
}
