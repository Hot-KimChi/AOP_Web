'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DataViewer from '../../../components/DataViewer';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

function DataViewContent() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
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

        const response = await fetch(
          `${API_BASE_URL}/api/get_viewer_data?database=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}`,
          { method: 'GET', credentials: 'include' }
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || `Server error: ${response.status}`);
        }

        const result = await response.json();
        setData(result.data || []);
        setColumns(result.columns || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="text-center p-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }
  if (error) {
    return <div className="alert alert-danger m-3">{error}</div>;
  }
  return (
    <DataViewer
      data={data}
      columns={columns}
      title={searchParams.get('database') && searchParams.get('table')
        ? `${searchParams.get('database')} / ${searchParams.get('table')}`
        : '데이터'}
      showExport={true}
      minWidth={800}
    />
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
