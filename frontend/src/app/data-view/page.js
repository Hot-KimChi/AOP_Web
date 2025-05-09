//src/app/data-view/page.js
'use client';

import { useEffect, useState, Suspense } from 'react';
import { ArrowUpDown, X, FileSpreadsheet, Save, CheckCircle, AlertCircle, Trash2, Copy } from 'lucide-react';

function DataViewContent() {
  // 기본 상태 관리
  const [csvData, setCsvData] = useState([]);                                     // 원본 CSV 데이터
  const [originalData, setOriginalData] = useState([]);                           // 변경 전 원본 데이터 (복원용)
  const [displayData, setDisplayData] = useState([]);                             // 화면에 표시할 데이터
  const [isLoading, setIsLoading] = useState(true);                               // 로딩 상태
  const [error, setError] = useState(null);                                       // 오류 메시지
  
  // 데이터 조작 관련 상태
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });  // 정렬 설정
  const [filters, setFilters] = useState({});                                     // 필터 설정
  const [comboBoxOptions, setComboBoxOptions] = useState({});                     // 필터 콤보박스 옵션
  
  // 편집 관련 상태
  const [editableColumns, setEditableColumns] = useState({
    columns: [],
    editableIndices: []                                                           // 수정 가능한 열 인덱스
  });
  const [editedData, setEditedData] = useState({});                               // 수정된 데이터 추적
  const [validationErrors, setValidationErrors] = useState({});                   // 유효성 검사 오류
  const [showChanges, setShowChanges] = useState(false);                          // 변경 사항 하이라이트 토글
  const [deletedRows, setDeletedRows] = useState([]);                             // 삭제된 행 인덱스 추적

  useEffect(() => {
    // 페이지 로드 시 sessionStorage에서 데이터 가져오기
    try {
      // const storedData = sessionStorage.getItem('csvData');

      // 부모에서 INIT_DATA 못 받을 경우를 대비해
      // reportData / summaryData 키를 뒤져 본다
      const storedData = sessionStorage.getItem('reportData') ||  
      sessionStorage.getItem('summaryData') || sessionStorage.getItem('csvData');

      const storedEditableColumns = sessionStorage.getItem('editableColumns');
      
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setCsvData(parsedData);
        setOriginalData(JSON.parse(JSON.stringify(parsedData)));                  // 깊은 복사로 원본 보존
        setDisplayData(parsedData);
        setComboBoxOptions(generateComboBoxOptions(parsedData));
      } else {
        setError('데이터를 찾을 수 없습니다.');
      }
      
      if (storedEditableColumns) {
        setEditableColumns(JSON.parse(storedEditableColumns));
      }
      
      // 창이 열렸음을 표시
      sessionStorage.setItem('dataWindowOpen', 'open');
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      setError('데이터 로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  
    // 이벤트 리스너 등록
    window.addEventListener('beforeunload', syncDataBeforeUnload);
    window.addEventListener('message', receiveMessage);
    
    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      window.removeEventListener('beforeunload', syncDataBeforeUnload);
      window.removeEventListener('message', receiveMessage);
    };
  }, []);

  // 메시지 수신 핸들러 - 부모 창에서 데이터 새로고침 요청 처리
  const receiveMessage = (event) => {
    if (event.data && event.data.type === 'REFRESH_DATA') {
      const freshData = event.data.data;
      if (freshData) {
        setCsvData(freshData);
        setOriginalData(JSON.parse(JSON.stringify(freshData)));
        setDisplayData(freshData);
        setComboBoxOptions(generateComboBoxOptions(freshData));
        setEditedData({});  // 편집 상태 초기화
        setDeletedRows([]);  // 삭제된 행 초기화
      }
    }
  };    

  // 창이 닫히기 전에 데이터 동기화
  const syncDataBeforeUnload = () => {
    sessionStorage.setItem('dataWindowOpen', 'closed');
    
    // 수정된 데이터가 있거나 삭제된 행이 있으면 저장
    if (Object.keys(editedData).length > 0 || deletedRows.length > 0) {
      let updatedCsvData = [...csvData];
      
      // 모든 편집 내용 적용
      Object.values(editedData).forEach(edit => {
        const { rowIndex, columnName, value } = edit;
        updatedCsvData[rowIndex][columnName] = value;
      });
      
      // 삭제된 행 제거 (인덱스가 큰 것부터 제거해야 인덱스 변경 문제 방지)
      if (deletedRows.length > 0) {
        const sortedDeletedIndices = [...deletedRows].sort((a, b) => b - a);
        sortedDeletedIndices.forEach(index => {
          updatedCsvData.splice(index, 1);
        });
      }
      
      // sessionStorage 업데이트
      sessionStorage.setItem('csvData', JSON.stringify(updatedCsvData));
      sessionStorage.setItem('dataModified', 'true');
      
      // 부모 창에 메시지 전송
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ 
          type: 'DATA_MODIFIED', 
          data: updatedCsvData,
          timestamp: Date.now()
        }, '*');
      }
    }
  };

  // 셀 값 변경 핸들러
  const handleCellChange = (rowIndex, columnName, value) => {
    // 화면 데이터 업데이트
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

  // 셀 데이터 유효성 검사
  const validateCellData = (rowIndex, columnName, value) => {
    const errKey = `${rowIndex}-${columnName}`;
    const newValidationErrors = { ...validationErrors };
    
    // 열 인덱스 찾기
    const columnIndex = Object.keys(csvData[0] || {}).findIndex(key => key === columnName);
    
    // 열 타입에 따른 유효성 검사
    if (columnIndex === 1) {
      // 2번째 열(인덱스 1)은 텍스트 데이터이므로 별도의 유효성 검사가 필요하지 않음
      delete newValidationErrors[errKey];
    } else if (editableColumns.editableIndices.includes(columnIndex)) {
      // 수정 가능한 열(7, 8번째 열)에 대해서는 숫자 형식 검사 적용
      if (value !== "" && isNaN(parseFloat(value))) {
        newValidationErrors[errKey] = '유효한 숫자를 입력하세요';
      } else {
        delete newValidationErrors[errKey];
      }
    } else {
      // 그 외 열은 기본적으로 오류 없음
      delete newValidationErrors[errKey];
    }
    
    setValidationErrors(newValidationErrors);
  };

  // 수정된 데이터 저장
  const saveEditedData = () => {
    // 유효성 검사 오류 확인
    if (Object.keys(validationErrors).length > 0) {
      alert('유효성 검사 오류가 있습니다. 모든 오류를 수정한 후 다시 시도하세요.');
      return;
    }
    
    // CSV 데이터 업데이트
    let updatedCsvData = [...csvData];
    
    // 수정된 모든 셀 업데이트
    Object.values(editedData).forEach(edit => {
      const { rowIndex, columnName, value } = edit;
      updatedCsvData[rowIndex][columnName] = value;
    });
    
    // 삭제된 행 제거 (인덱스가 큰 것부터 제거해야 인덱스 변경 문제 방지)
    if (deletedRows.length > 0) {
      const sortedDeletedIndices = [...deletedRows].sort((a, b) => b - a);
      sortedDeletedIndices.forEach(index => {
        updatedCsvData.splice(index, 1);
      });
    }
    
    // 상태 업데이트
    setOriginalData(JSON.parse(JSON.stringify(updatedCsvData)));
    setCsvData(updatedCsvData);
    
    // 세션 스토리지 업데이트
    sessionStorage.setItem('csvData', JSON.stringify(updatedCsvData));
    sessionStorage.setItem('dataModified', 'true');
  
    // 부모 창에 메시지 전송
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ 
        type: 'DATA_MODIFIED', 
        data: updatedCsvData,
        timestamp: Date.now()
      }, '*');
    }
    
    // 편집 상태 초기화
    setEditedData({});
    setDeletedRows([]);
    
    // 삭제된 행이 있으면 필터링된 데이터도 업데이트
    if (deletedRows.length > 0) {
      // 기존 필터 적용
      const filteredData = updatedCsvData.filter(row => {
        return Object.entries(filters).every(([column, filterValues]) => {
          if (!filterValues || filterValues.length === 0) return true;
          const cellValue = (row[column]?.toString() || '').toLowerCase();
          return filterValues.some(filter => cellValue === filter.toLowerCase().trim());
        });
      });
      setDisplayData(filteredData);
    }
    
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
      setDeletedRows([]);
    }
  };

  // 행 삭제 핸들러
  const handleDeleteRow = (rowIndex) => {
    if (confirm('정말로 이 행을 삭제하시겠습니까? 이 작업은 저장 전까지 취소할 수 있습니다.')) {
      // 삭제된 행 추적
      setDeletedRows(prev => [...prev, rowIndex]);
      
      // 화면에서 행 제거
      const updatedDisplayData = displayData.filter((_, idx) => idx !== rowIndex);
      setDisplayData(updatedDisplayData);
      
      // 삭제된 행과 관련된 편집 상태 제거
      const newEditedData = { ...editedData };
      Object.keys(newEditedData).forEach(key => {
        if (key.startsWith(`${rowIndex}-`)) {
          delete newEditedData[key];
        }
      });
      setEditedData(newEditedData);
      
      // 삭제된 행과 관련된 유효성 검사 오류 제거
      const newValidationErrors = { ...validationErrors };
      Object.keys(newValidationErrors).forEach(key => {
        if (key.startsWith(`${rowIndex}-`)) {
          delete newValidationErrors[key];
        }
      });
      setValidationErrors(newValidationErrors);
    }
  };

  // **행 복사 및 추가 핸들러**
  const handleCopyRow = (rowIndex) => {
    // 복사할 행 가져오기 (현재 화면에 표시된 데이터 기준)
    const rowToCopy = displayData[rowIndex];
    // 새로운 행 생성 (얕은 복사 - 원시값만 있다면 충분합니다)
    const newRow = { ...rowToCopy };
    // csvData에 복사된 행 추가
    const updatedCsvData = [...csvData, newRow];
    setCsvData(updatedCsvData);

    // 활성 필터가 있을 경우, 필터를 재적용하여 displayData 업데이트
    if (Object.keys(filters).length > 0) {
      let filteredData = [...updatedCsvData];
      Object.entries(filters).forEach(([column, filterValues]) => {
        if (filterValues && filterValues.length > 0) {
          filteredData = filteredData.filter(row => {
            const cellValue = (row[column]?.toString() || '').toLowerCase();
            return filterValues.every(filter => cellValue === filter.toLowerCase().trim());
          });
        }
      });
      setDisplayData(filteredData);
    } else {
      // 필터가 없으면 단순히 displayData에 추가
      setDisplayData(updatedCsvData);
    }
  };

  // 삭제 취소 (모든 행 복원)
  const restoreDeletedRows = () => {
    if (deletedRows.length === 0) return;
    
    if (confirm('삭제된 모든 행을 복원하시겠습니까?')) {
      // 원본 데이터 필터링
      const filteredData = csvData.filter(row => {
        return Object.entries(filters).every(([column, filterValues]) => {
          if (!filterValues || filterValues.length === 0) return true;
          const cellValue = (row[column]?.toString() || '').toLowerCase();
          return filterValues.some(filter => cellValue === filter.toLowerCase().trim());
        });
      });
      
      setDisplayData(filteredData);
      setDeletedRows([]);
    }
  };

  // CSV 파일 다운로드
  const downloadCSV = () => {
    if (!displayData || displayData.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    try {
      // 헤더 가져오기
      const headers = Object.keys(displayData[0] || {});
      
      // CSV 내용 생성
      const csvContent = [
        headers.join(','),
        ...displayData.map(row =>
          headers.map(header => {
            const value = row[header];
            return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
          }).join(',')
        )
      ].join('\n');

      // 파일 다운로드
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
      console.error('내보내기 실패:', error);
      alert('다운로드 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  // 데이터 정렬 핸들러
  const handleSort = (key) => {
    // 정렬 방향 결정
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    // 데이터 정렬
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

  // 필터 적용
  const applyFilters = (newFilters) => {
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
    // 행 삭제 상태 초기화 (필터가 변경되면 삭제 추적이 복잡해짐)
    setDeletedRows([]);
  };

  // 필터 변경 핸들러
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

  // 필터 초기화
  const clearFilter = (column) => {
    const newFilters = { ...filters };
    delete newFilters[column];
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  // 숫자 형식화
  const formatNumber = (value) => {
    if (typeof value === 'number') {
      return value % 1 === 0 ? value : parseFloat(value.toFixed(4));
    }
    return value?.toString() || '';
  };

  // 텍스트 길이 제한
  const truncateText = (text) => {
    if (!text) return '';
    const str = text.toString();
    return str.length > 20 ? `${str.substring(0, 20)}...` : str;
  };

  // 셀 내용 렌더링
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
    
    // 일반 셀 렌더링
    if (value === null || value === undefined) {
      return '';
    }
  
    const formattedValue = formatNumber(value);
    return formattedValue === 0 ? '0' : truncateText(formattedValue);
  };

  // 콤보박스 옵션 생성
  const generateComboBoxOptions = (data) => {
    if (!data || data.length === 0) return {};
    
    const options = {};
    const columns = Object.keys(data[0] || {});
    
    columns.forEach((column) => {
      options[column] = [...new Set(data.map(row => row[column]))];
    });

    return options;
  };

  // 콤보박스 값 변경 핸들러
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

  // 변경 요약 정보 생성
  const getChangeSummary = () => {
    const changedCount = Object.keys(editedData).length;
    const errorCount = Object.keys(validationErrors).length;
    const deletedCount = deletedRows.length;
    
    if (changedCount === 0 && deletedCount === 0) return null;
    
    return (
      <div className={`p-2 rounded mb-3 ${errorCount > 0 ? 'bg-red-100' : 'bg-yellow-100'}`}>
        <p className="font-medium">
          {changedCount > 0 && `${changedCount}개의 셀이 수정되었습니다. `}
          {deletedCount > 0 && `${deletedCount}개의 행이 삭제 대기 중입니다. `}
          {errorCount > 0 && <span className="text-red-600"> {errorCount}개의 오류가 있습니다.</span>}
        </p>
        {deletedCount > 0 && (
          <button 
            className="text-blue-600 text-sm underline hover:text-blue-800 mt-1"
            onClick={restoreDeletedRows}
          >
            삭제된 행 복원하기
          </button>
        )}
      </div>
    );
  };

  // 편집 상태 변경 시 부모 창에 알림
  useEffect(() => {
    if (Object.keys(editedData).length > 0 || deletedRows.length > 0) {
      sessionStorage.setItem('dataModified', 'true');
    }
  }, [editedData, deletedRows]);

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
              
              {(Object.keys(editedData).length > 0 || deletedRows.length > 0) && (
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
                  <th className="px-3 py-2 border text-center" style={{ width: '60px' }}>
                    <span title="행 복사/삭제" className="font-medium text-gray-700">복사/삭제</span>
                  </th>
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
                  <th className="px-2 py-1 border bg-gray-50"></th>
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
                      <td className="px-1 py-2 border text-center">
                        <button
                          className="p-1 text-green-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          onClick={() => handleCopyRow(rowIndex)}
                          title="행 복사"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          onClick={() => handleDeleteRow(rowIndex)}
                          title="행 삭제"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
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
                    <td colSpan={Object.keys(displayData[0] || {}).length + 1} className="text-center py-3 text-gray-500">
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
            overflow: auto;
            max-height: 900px;
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

        /* tbody의 모든 td를 가운데 정렬로 변경 */
        tbody td {
          text-align: center;
        }

        /* 첫 번째 헤더(파라미터 이름) */
        .table-container thead tr:first-child th {
            position: sticky;
            top: 0;
            z-index: 20;
            background-color: #f8f8f8;
            height: 35px;
            line-height: 35px;
        }

        /* 두 번째 헤더(필터) */
        .table-container thead tr:nth-child(2) th {
            position: sticky;
            top: 40px;
            z-index: 10;
            background-color: #fff;
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
