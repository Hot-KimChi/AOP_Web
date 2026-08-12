//src/app/data-view/page.js
'use client';

import { useEffect, useState, Suspense } from 'react';
import DataViewer from '../../../components/DataViewer';

function DataViewContent() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [meta, setMeta] = useState(null);
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
        const storedMeta = sessionStorage.getItem(`${storageKey}_meta`);
        if (storedData) {
          setData(JSON.parse(storedData));
          if (storedColumns) {
            setColumns(JSON.parse(storedColumns));
          }
          if (storedMeta) {
            setMeta(JSON.parse(storedMeta));
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
    <div>
      {meta && (
        <div className="card mb-3 mx-2 mt-2">
          <div className="card-body py-2">
            <div className="d-flex flex-wrap align-items-center gap-3">
              <div>
                <span className="text-muted small me-1">ProbeID:</span>
                <strong>{meta.selectedProbeId}</strong>
              </div>
              <div>
                <span className="text-muted small me-1">SW Version:</span>
                <strong>{meta.selectedSoftwareVersion}</strong>
              </div>
              <div className="ms-auto d-flex gap-2 align-items-center">
                <span className="badge bg-secondary fs-6">총 {meta.totalCount}개</span>
                <span className="badge bg-success fs-6">일치 (O): {meta.matchCount}</span>
                <span className={`badge fs-6 ${meta.mismatchCount > 0 ? 'bg-danger' : 'bg-secondary'}`}>
                  불일치 (X): {meta.mismatchCount}
                </span>
              </div>
            </div>
            {meta.message && (
              <div className="mt-1 text-muted small">{meta.message}</div>
            )}
          </div>
        </div>
      )}
      <DataViewer
        data={data}
        columns={columns}
        title={title}
        showExport={true}
        minWidth={800}
      />
    </div>
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