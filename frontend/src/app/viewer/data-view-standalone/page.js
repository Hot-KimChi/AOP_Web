'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DataViewer from '../../../components/DataViewer';

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
    return <div className="alert alert-danger">{error}</div>;
  }
  return (
    <DataViewer
      data={data}
      title={searchParams.get('database') && searchParams.get('table') ? `${searchParams.get('database')} / ${searchParams.get('table')}` : '데이터'}
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
