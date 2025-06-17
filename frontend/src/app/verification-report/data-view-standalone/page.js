//src/app/data-view/page.js
'use client';

import { useEffect, useState, Suspense } from 'react';
import DataViewer from '../../../components/DataViewer';

function DataViewContent() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('검증 결과');

  useEffect(() => {
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const storageKey = params?.get('storageKey');
      const pageLabel = params?.get('pageLabel') || '검증 결과';
      setTitle(pageLabel);
      if (storageKey) {
        const storedData = sessionStorage.getItem(storageKey);
        const storedColumns = sessionStorage.getItem(`${storageKey}_columns`);
        if (storedData) {
          setData(JSON.parse(storedData));
          if (storedColumns) {
            setColumns(JSON.parse(storedColumns));
          }
        } else {
          setError('세션 데이터가 없습니다.');
        }
      } else {
        setError('storageKey 파라미터가 없습니다.');
      }
    } catch (e) {
      setError('데이터 로드 오류');
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="text-center p-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">로딩 중...</span>
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
      columns={columns}
      title={title}
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
          <span className="visually-hidden">로딩 중...</span>
        </div>
      </div>
    }>
      <DataViewContent />
    </Suspense>
  );
}