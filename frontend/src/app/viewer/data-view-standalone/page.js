'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function DataViewContent() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
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
      } catch (error) {
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [searchParams]);

  // 숫자 포맷팅 함수
  const formatNumber = (value) => {
    if (typeof value === 'number') {
      // 소수점 이하가 있으면 5자리까지 표시
      return value % 1 === 0 ? value : parseFloat(value.toFixed(4));
    }
    return value?.toString() || '';
  };

  // 문자열을 10자로 제한하는 함수
  const truncateText = (text) => {
    if (!text) return '';
    const str = text.toString();
    return str.length > 20 ? `${str.substring(0, 10)}...` : str;
  };

  // 셀 데이터 표시 함수
  const renderCellContent = (value) => {
    const formattedValue = formatNumber(value);
    return truncateText(formattedValue);
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
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4 className="mb-0">
              {searchParams.get('database')} / {searchParams.get('table')}
            </h4>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => window.print()}
            >
              Print
            </button>
          </div>

          {data.length > 0 ? (
            <div className="table-container">
              <table className="table table-striped table-hover mb-0">
                <thead>
                  <tr>
                    {Object.keys(data[0]).map((header, index) => (
                      <th key={index} className="px-3" title={header}>
                        {truncateText(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Object.values(row).map((value, colIndex) => (
                        <td 
                          key={colIndex} 
                          className="px-3"
                          title={formatNumber(value)}
                        >
                          {renderCellContent(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert alert-info">
              No data available
            </div>
          )}
        </>
      )}
      <style jsx>{`
        .table-container {
          width: 100%;
          overflow-x: auto;
          white-space: nowrap;
          background-color: white;
          border-radius: 0.25rem;
          box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
        }
        
        .table-container table {
          margin: 0;
          min-width: 800px;
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
      <style jsx global>{`
        @media print {
          .btn-secondary {
            display: none;
          }
        }
      `}</style>
    </Suspense>
  );
}