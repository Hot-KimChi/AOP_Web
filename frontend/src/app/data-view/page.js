//src/app/data-view/page.js
'use client';

import { useEffect, useState, Suspense } from 'react';
import { ArrowUpDown, X, FileSpreadsheet, Save, CheckCircle, AlertCircle } from 'lucide-react';

function DataViewContent() {
  const [csvData, setCsvData] = useState([]);
  const [originalData, setOriginalData] = useState([]); // 원본 데이터 저장
  const [displayData, setDisplayData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({});
  const [comboBoxOptions, setComboBoxOptions] = useState({});
  const [editableColumns, setEditableColumns] = useState({
    columns: [],
    editableIndices: [] // 수정 가능한 열의 인덱스
  });
  const [editedData, setEditedData] = useState({});  // 수정된 데이터를 추적하기 위한 상태
  const [validationErrors, setValidationErrors] = useState({}); // 유효성 검사 오류 추적
  const [showChanges, setShowChanges] = useState(false); // 변경 사항 하이라이트 토글

  useEffect(() => {
    // 페이지 로드 시 sessionStorage에서 데이터 가져오기 시도
    try {
      const storedData = sessionStorage.getItem('csvData');
      const storedEditableColumns = sessionStorage.getItem('editableColumns');
      
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setCsvData(parsedData);
        setOriginalData(JSON.parse(JSON.stringify(parsedData))); // 깊은 복사로 원본 보존
        setDisplayData(parsedData);
        setComboBoxOptions(generateComboBoxOptions(parsedData));
      } else {
        setError('데이터를 찾을 수 없습니다.');
      }
      
      if (storedEditableColumns) {
        setEditableColumns(JSON.parse(storedEditableColumns));
      }
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      setError('데이터 로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }

    // 창이 닫힐 때 데이터 동기화
    window.addEventListener('beforeunload', syncDataBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', syncDataBeforeUnload);
    };
  }, []);

  // 창이 닫히기 전에 데이터 동기화
  const syncDataBeforeUnload = () => {
    sessionStorage.setItem('dataWindowOpen', 'closed');
    if (Object.keys(editedData).length > 0) {
      // 수정된 데이터가 있으면 저장
      const updatedCsvData = [...csvData];
      sessionStorage.setItem('csvData', JSON.stringify(updatedCsvData));
    }
  };

  // 셀 값 변경 처리
  const handleCellChange = (rowIndex, columnName, value) => {
    // 현재 표시 중인 데이터 업데이트
    const updatedDisplayData = [...displayData];
    updatedDisplayData[rowIndex][columnName] = value;
    setDisplayData(updatedDisplayData);
    
    // 편집된 데이터 추적
    setEditedData(prev => ({
      ...prev,
      [`${rowIndex}-${columnName}`]: {
        rowIndex,
        columnName,
        value,
        originalValue: csvData[rowIndex][columnName]
      }
    }));

    // 데이터 유효성 검사
    validateCellData(rowIndex, columnName, value);
  };

  // 데이터 유효성 검사
  const validateCellData = (rowIndex, columnName, value) => {
    const errKey = `${rowIndex}-${columnName}`;
    const newValidationErrors = { ...validationErrors };
    
    // 숫자 형식 검사 (온도 값 등은 보통 숫자여야 함)
    if (value !== "" && isNaN(parseFloat(value))) {
      newValidationErrors[errKey] = '유효한 숫자를 입력하세요';
    } else {
      delete newValidationErrors[errKey];
    }
    
    setValidationErrors(newValidationErrors);
  };

  // 수정된 데이터 저장
  const saveEditedData = () => {
    // 유효성 검사 오류가 있으면 저장 불가
    if (Object.keys(validationErrors).length > 0) {
      alert('유효성 검사 오류가 있습니다. 모든 오류를 수정한 후 다시 시도하세요.');
      return;
    }
    
    // CSV 데이터 전체를 업데이트
    const updatedCsvData = [...csvData];
    
    // 수정된 모든 셀에 대해 원본 데이터 업데이트
    Object.values(editedData).forEach(edit => {
      const { rowIndex, columnName, value } = edit;
      updatedCsvData[rowIndex][columnName] = value;
    });
    
    setCsvData(updatedCsvData);
    sessionStorage.setItem('csvData', JSON.stringify(updatedCsvData));
    
    // 부모 창에 데이터가 수정되었음을 알림
    if (window.opener && !window.opener.closed) {
      // 세션 스토리지를 통한 데이터 공유
      window.opener.postMessage({ type: 'DATA_MODIFIED', data: updatedCsvData }, '*');
    }
    
    // 저장 후 편집 상태 초기화
    setEditedData({});
    
    alert('수정된 데이터가 저장되었습니다.');
  };

  // 데이터 복원 (수정 취소)
  const revertChanges = () => {
    if (confirm('모든 변경 사항을 취소하고 원래 데이터로 복원하시겠습니까?')) {
      const originalDataCopy = JSON.parse(JSON.stringify(originalData));
      setCsvData(originalDataCopy);
      setDisplayData(originalDataCopy);
      setEditedData({});
      setValidationErrors({});
    }
  };

  // CSV 다운로드 기능
  const downloadCSV = () => {
    if (!displayData || displayData.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    try {
      // 헤더 가져오기
      const headers = Object.keys(displayData[0]);
      
      // CSV 내용 생성
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
      const fileName = `측정_데이터_${new Date().toLocaleDateString()}.csv`;

      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('다운로드 중 오류가 발생했습니다. 다시 시도해주세요.');
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
    let filteredData = [...csvData];

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

  // 수정된 renderCellContent 함수 - 수정 가능한 셀 확인 및 오류 표시
  const renderCellContent = (value, rowIndex, columnIndex, columnName) => {
    // 수정 가능한 셀인지 확인
    const isEditable = editableColumns.editableIndices.includes(columnIndex);
    const cellKey = `${rowIndex}-${columnName}`;
    const hasError = validationErrors[cellKey];
    const isChanged = editedData[cellKey] !== undefined;
    
    if (isEditable) {
      return (
        <div className="relative">
          <input
            type="text"
            className={`w-full px-2 py-1 border rounded focus:outline-none ${
              hasError ? 'border-red-500 bg-red-50' : 
              isChanged ? 'border-yellow-400 bg-yellow-50' : 
              'focus:border-blue-400'
            }`}
            value={value || ''}
            onChange={(e) => handleCellChange(rowIndex, columnName, e.target.value)}
          />
          {hasError && (
            <div className="absolute right-0 top-0">
              <AlertCircle size={14} className="text-red-500" title={validationErrors[cellKey]} />
            </div>
          )}
          {isChanged && !hasError && (
            <div className="absolute right-0 top-0">
              <CheckCircle size={14} className="text-green-500" title="값이 수정되었습니다" />
            </div>
          )}
        </div>
      );
    }
    
    if (value === null || value === undefined) {
      return '';
    }
  
    const formattedValue = formatNumber(value);
    return formattedValue === 0 ? '0' : truncateText(formattedValue);
  };

  // 콤보박스 옵션을 생성하는 함수
  const generateComboBoxOptions = (data) => {
    if (!data || data.length === 0) return {};
    
    const options = {};
    const columns = Object.keys(data[0] || {});
    
    columns.forEach((column) => {
      options[column] = [...new Set(data.map(row => row[column]))];
    });

    return options;
  };

  // 콤보박스 값 변경 시 필터 적용
  const handleComboBoxChange = (column, value) => {
    const newFilters = { ...filters };
    
    if (value) {
      newFilters[column] = [value];
    } else {
      delete newFilters[column];
    }
    
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  // 변경 사항에 대한 요약 정보 생성
  const getChangeSummary = () => {
    const changedCount = Object.keys(editedData).length;
    const errorCount = Object.keys(validationErrors).length;
    
    if (changedCount === 0) return null;
    
    return (
      <div className={`p-2 rounded mb-3 ${errorCount > 0 ? 'bg-red-100' : 'bg-yellow-100'}`}>
        <p className="font-medium">
          {changedCount}개의 셀이 수정되었습니다. 
          {errorCount > 0 && <span className="text-red-600"> {errorCount}개의
          오류가 있습니다.</span>}
        </p>
      </div>
    );
  };

  // 부모 창에 변경 사항 알림
  useEffect(() => {
    if (Object.keys(editedData).length > 0) {
      sessionStorage.setItem('dataModified', 'true');
    }
  }, [editedData]);

  return (
    <div className="container-fluid p-4">
      {isLoading ? (
        <div className="text-center p-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">로딩 중...</span>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-danger">
          {error}
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-3">
            <h4 className="mb-0">CSV 데이터 표시 (7, 8번째 열 수정 가능)</h4>
            <div className="flex gap-2">
              <div className="form-check">
                <input 
                  type="checkbox" 
                  id="showChanges" 
                  className="form-check-input" 
                  checked={showChanges}
                  onChange={() => setShowChanges(!showChanges)}
                />
                <label htmlFor="showChanges" className="form-check-label">변경 사항 하이라이트</label>
              </div>
              
              {Object.keys(editedData).length > 0 && (
                <>
                  <button 
                    className="btn btn-success"
                    onClick={saveEditedData}
                    disabled={Object.keys(validationErrors).length > 0}
                  >
                    <Save size={16} className="mr-1" />
                    변경사항 저장
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={revertChanges}
                  >
                    <X size={16} className="mr-1" />
                    변경취소
                  </button>
                </>
              )}
              <button 
                className="btn btn-primary"
                onClick={downloadCSV}
                disabled={!displayData || displayData.length === 0}
              >
                <FileSpreadsheet size={16} className="mr-1" />
                CSV 다운로드
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => window.close()}
              >
                창 닫기
              </button>
            </div>
          </div>

          {getChangeSummary()}

          <div className="table-container">
            <table className="w-full min-w-[800px]">
              <thead>
                {/* 첫 번째 헤더(파라미터 이름) */}
                <tr className="bg-gray-100">
                  {Object.keys(displayData[0] || {}).map((header, index) => (
                    <th key={index} className="px-3 py-2 border">
                      <div className="flex items-center justify-between group">
                        <span title={header} className="font-medium text-gray-700">
                          {truncateText(header)}
                          {editableColumns.editableIndices.includes(index) && (
                            <span className="ml-1 text-blue-500 text-xs">(수정가능)</span>
                          )}
                        </span>
                        <button 
                          className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                          onClick={() => handleSort(header)}
                          title={`정렬 ${sortConfig.key === header && sortConfig.direction === 'asc' ? '내림차순' : '오름차순'}`}
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
                {/* 두 번째 헤더(필터 선택) */}
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
                            title="필터 지우기"
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
                      {Object.entries(row).map(([key, value], colIndex) => {
                        const columnName = Object.keys(row)[colIndex];
                        const cellKey = `${rowIndex}-${columnName}`;
                        const isChanged = editedData[cellKey] !== undefined;
                        const showHighlight = showChanges && isChanged;
                        
                        return (
                          <td 
                            key={colIndex} 
                            className={`px-3 py-2 border ${
                              editableColumns.editableIndices.includes(colIndex) ? 'bg-blue-50' : ''
                            } ${
                              showHighlight ? 'bg-yellow-100' : ''
                            }`}
                            title={formatNumber(value)}
                          >
                            {renderCellContent(value, rowIndex, colIndex, columnName)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={Object.keys(displayData[0] || {}).length} className="text-center py-3 text-gray-500">
                      필터 조건에 맞는 데이터가 없습니다. 필터를 조정해주세요.
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
            overflow: auto;       /* 세로/가로 스크롤 */
            max-height: 900px;    /* 스크롤 영역 높이 */
            white-space: nowrap;
            background-color: white;
            border-radius: 0.25rem;
            box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
        }

        table {
            border-collapse: collapse;
        }
        th, td {
            font-size: 13px;
            text-align: left;
            border: 1px solid #ddd;
        }

        /* 첫 번째 헤더(파라미터 이름) */
        .table-container thead tr:first-child th {
            position: sticky;
            top: 0;
            z-index: 20;             /* 두 번째 헤더보다 크게 */
            background-color: #f8f8f8;  /* 겹침 방지용 배경색 */
            height: 35px;
            line-height: 35px;
        }

        /* 두 번째 헤더(필터) */
        .table-container thead tr:nth-child(2) th {
            position: sticky;
            top: 40px;               /* 첫 번째 헤더 높이만큼 offset */
            z-index: 10;             /* 첫 번째 헤더보다 작게 */
            background-color: #fff;  /* 겹침 방지용 배경색 */
            height: 35px;
            line-height: 35px;
        }
        `}</style>
    </div>
  );
}

export default function DataView() {
  return (
    <Suspense fallback={
      <div className="text-center p-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">로딩 중...</span>
        </div>
      </div>
    }>
      <DataViewContent />
    </Suspense>
  );
}