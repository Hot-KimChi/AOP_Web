// src/app/viewer/data-view-standalone/page.js
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function DataViewStandalone() {
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
            <div className="table-responsive bg-white rounded shadow-sm">
              <table className="table table-striped table-hover mb-0">
                <thead>
                  <tr>
                    {Object.keys(data[0]).map((header, index) => (
                      <th key={index} className="px-3">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Object.values(row).map((value, colIndex) => (
                        <td key={colIndex} className="px-3">
                          {value?.toString() || ''}
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

      <style jsx global>{`
        @media print {
          .btn-secondary {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}