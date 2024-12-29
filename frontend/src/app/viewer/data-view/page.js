// src/app/viewer/data-view/page.js
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Layout from '../../../components/Layout';

export default function DataView() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const databaseName = searchParams.get('databaseName');
        const tableName = searchParams.get('tableName');

        if (!databaseName || !tableName) {
          throw new Error('Database name and table name are required');
        }

        const response = await fetch(`/api/viewer?databaseName=${databaseName}&tableName=${tableName}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch data');
        }

        const result = await response.json();
        if (!result.data) {
          throw new Error('No data received from server');
        }

        setData(result.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [searchParams]);

  if (isLoading) return (
    <Layout>
      <div className="container mt-5">
        <div className="d-flex justify-content-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    </Layout>
  );

  if (error) return (
    <Layout>
      <div className="container mt-5">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="container-fluid mt-5">
        <div className="d-flex justify-content-between mb-3">
          <h4>Data View</h4>
          <button 
            className="btn btn-secondary" 
            onClick={() => window.print()}
          >
            Print / Export PDF
          </button>
        </div>
        {data.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-striped table-bordered">
              <thead className="table-dark">
                <tr>
                  {Object.keys(data[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value, i) => (
                      <td key={i}>{value?.toString() || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="alert alert-info">No data available</div>
        )}
      </div>
    </Layout>
  );
}