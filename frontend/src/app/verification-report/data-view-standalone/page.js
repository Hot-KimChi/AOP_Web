//src/app/data-view/page.js
'use client';

import { useEffect, useState, Suspense } from 'react';
import { ArrowUpDown, FileSpreadsheet } from 'lucide-react';

function DataViewContent() {
  // 기본 상태 관리
  const [csvData, setCsvData] = useState([]);          // 원본 CSV 데이터
  const [displayData, setDisplayData] = useState([]);  // 화면에 표시할 데이터
  const [isLoading, setIsLoading] = useState(true);    // 로딩 상태
  const [error, setError] = useState(null);            // 오류 메시지
  
  // 정렬 설정 상태
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // 페이지 로드 시 데이터 가져오기
  useEffect(() => {
    try {
      // 쿼리스트링에서 storageKey, pageLabel 읽기
      const params = new URLSearchParams(window.location.search);
      const storageKey = params.get('storageKey') || 'reportData';
      const pageLabel = params.get('pageLabel') || '';

      const storedData = sessionStorage.getItem(storageKey);

      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setCsvData(parsedData);
        setDisplayData(parsedData);
        document.title = pageLabel ? `데이터(${pageLabel})` : 'CSV 데이터 표시';
      } else {
        setError('데이터를 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      setError('데이터 로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // CSV 파일 다운로드 함수
  const downloadCSV = () => {
    if (!displayData?.length) {
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
            // 쉼표가 포함된 문자열은 큰따옴표로 묶기
            return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
          }).join(',')
        )
      ].join('\n');

      // 파일 다운로드
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const fileName = `측정_데이터_${new Date().toLocaleDateString()}.csv`;
      
      const link = document.createElement('a');
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
    // 정렬 방향 결정 - 같은 키로 다시 정렬 시 방향 전환
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    // 데이터 정렬 로직
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

  // 숫자 형식화 함수
  const formatNumber = (value) => {
    if (typeof value === 'number') {
      return value % 1 === 0 ? value : parseFloat(value.toFixed(4));
    }
    return value?.toString() || '';
  };

  // 텍스트 길이 제한 함수
  const truncateText = (text, maxLength = 20) => {
    if (!text) return '';
    const str = text.toString();
    return str.length > maxLength ? `${str.substring(0, maxLength)}...` : str;
  };

  // 로딩 스피너 컴포넌트
  const LoadingSpinner = () => (
    <div className="text-center p-5">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">로딩 중...</span>
      </div>
    </div>
  );

  // 에러 메시지 컴포넌트
  const ErrorMessage = ({ message }) => (
    <div className="alert alert-danger">{message}</div>
  );

  // 테이블 헤더 렌더링
  const renderTableHeaders = () => {
    if (!displayData.length) return null;
    
    return (
      <tr className="bg-gray-100">
        {Object.keys(displayData[0]).map((header, index) => (
          <th key={index} className="px-3 py-2 border">
            <div className="flex items-center justify-between group">
              <span title={header} className="font-medium text-gray-700">
                {truncateText(header)}
              </span>
              <button 
                className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                onClick={() => handleSort(header)}
                title={`정렬 ${sortConfig.key === header && sortConfig.direction === 'asc' ? '내림차순' : '오름차순'}`}
              >
                <ArrowUpDown
                  size={12}
                  className={`transition-colors ${
                    sortConfig.key === header ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'
                  }`}
                />
              </button>
            </div>
          </th>
        ))}
      </tr>
    );
  };

  // 테이블 본문 렌더링
  const renderTableBody = () => {
    if (!displayData.length) {
      return (
        <tr>
          <td colSpan={Object.keys(displayData[0] || {}).length} className="text-center py-3 text-gray-500">
            데이터가 없습니다.
          </td>
        </tr>
      );
    }

    return displayData.map((row, rowIndex) => (
      <tr key={rowIndex} className="hover:bg-gray-50">
        {Object.entries(row).map(([key, value], colIndex) => (
          <td 
            key={colIndex} 
            className="px-3 py-2 border text-center"
            title={formatNumber(value)}
          >
            {value === null || value === undefined ? '' : 
             formatNumber(value) === 0 ? '0' : 
             truncateText(formatNumber(value))}
          </td>
        ))}
      </tr>
    ));
  };

  // 메인 콘텐츠 렌더링
  return (
    <div className="container-fluid p-4">
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <>
          <div className="flex justify-between items-center mb-3">
            <h4 className="mb-0">CSV 데이터 표시</h4>
            <div className="flex gap-2">
              <button 
                className="btn btn-primary"
                onClick={downloadCSV}
                disabled={!displayData?.length}
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

          <div className="table-container">
            <table className="w-full min-w-[800px]">
              <thead>
                {renderTableHeaders()}
              </thead>
              <tbody>
                {renderTableBody()}
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

        tbody td {
          text-align: center;
        }

        .table-container thead tr:first-child th {
          position: sticky;
          top: 0;
          z-index: 20;
          background-color: #f8f8f8;
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