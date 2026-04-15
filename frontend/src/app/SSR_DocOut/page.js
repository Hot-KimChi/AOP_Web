// SSR_DocOut 페이지: DB/테이블 선택 후 Word로 내보내기
'use client';

import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { FileText, Download } from 'lucide-react';

export default function SSR_DocOut() {
  const [DBList, setDBList] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRowIdxs, setSelectedRowIdxs] = useState([]);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/get_list_database`, { credentials: 'include' });
        if (!response.ok) throw new Error('DB 목록 조회 실패');
        const data = await response.json();
        setDBList(data.databases || []);
      } catch (err) {
        console.error('DB 목록 조회 실패:', err);
        setError('DB 목록 조회 실패');
      }
    };
    fetchDatabases();
  }, [API_BASE_URL]);

  useEffect(() => {
    if (selectedDatabase) {
      const fetchTableData = async () => {
        try {
          setIsLoading(true);
          const url = `${API_BASE_URL}/api/get_table_data?database=${encodeURIComponent(selectedDatabase)}&table=meas_station_setup`;
          const response = await fetch(url, { credentials: 'include' });
          if (!response.ok) throw new Error('테이블 데이터 조회 실패');
          const result = await response.json();
          if (result.status === 'success' && result.data?.length > 0) {
            setTableData(result.data);
            setColumns(result.columns?.length ? result.columns : Object.keys(result.data[0]));
          } else {
            setTableData([]);
            setColumns([]);
          }
        } catch (err) {
          console.error('테이블 데이터 조회 실패:', err);
          setError('테이블 데이터 조회 실패');
          setTableData([]);
          setColumns([]);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTableData();
    } else {
      setTableData([]);
      setColumns([]);
    }
  }, [selectedDatabase, API_BASE_URL]);

  const handleExportWord = async () => {
    if (!selectedDatabase || selectedRowIdxs.length === 0) {
      setError('행을 선택하세요.');
      return;
    }
    const selectedIds = selectedRowIdxs.map(idx => tableData[idx]?.measSSId).filter(Boolean);
    if (selectedIds.length === 0) { setError('선택된 행에 measSSId 값이 없습니다.'); return; }
    try {
      const url = `${API_BASE_URL}/api/export_table_to_word?database=${encodeURIComponent(selectedDatabase)}&table=SSR_table&measSSIds=${encodeURIComponent(selectedIds.join(','))}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Word 파일 생성 실패');
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl; a.download = 'SSR_table_selected.docx';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Word 파일 다운로드 실패:', err);
      setError('Word 파일 다운로드 실패');
    }
  };

  const handleRowClick = (idx, event) => {
    if (event.ctrlKey) {
      setSelectedRowIdxs(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
    } else {
      setSelectedRowIdxs([idx]);
    }
  };

  return (
    <Layout>
      <div className="page-wrapper">
        <div className="card">

          {/* Header */}
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div className="card-title-row">
                <FileText size={16} color="#6366f1" />
                <h5>SSR DocOut</h5>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '400' }}>meas_station_setup</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto', minWidth: '180px' }}
                  value={selectedDatabase}
                  onChange={e => { setSelectedDatabase(e.target.value); setSelectedRowIdxs([]); setError(null); }}
                  disabled={isLoading}
                >
                  <option value="">Select database…</option>
                  {DBList.map((db) => <option key={db} value={db}>{db}</option>)}
                </select>
                <button
                  onClick={handleExportWord}
                  disabled={!selectedDatabase || selectedRowIdxs.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.375rem 0.875rem', borderRadius: '6px',
                    background: selectedDatabase && selectedRowIdxs.length > 0 ? 'var(--status-success-text)' : 'var(--border)',
                    color: 'white', border: 'none', fontWeight: '500', fontSize: '0.8125rem',
                    cursor: selectedDatabase && selectedRowIdxs.length > 0 ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Download size={13} />
                  Export Word{selectedRowIdxs.length > 0 ? ` (${selectedRowIdxs.length})` : ''}
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="card-body" style={{ padding: '1rem 1.25rem' }}>

            {isLoading && (
              <div className="spinner-center">
                <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                Loading…
              </div>
            )}

            {!isLoading && columns.length > 0 && (
              <>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
                  Click to select a row · Ctrl+Click to multi-select · {tableData.length} rows total
                </p>
                <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <table className="table table-sm mb-0" style={{ fontSize: '0.8rem' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                      <tr>
                        {columns.map(col => (
                          <th key={col} style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: 'var(--text-sec)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((row, idx) => (
                        <tr
                          key={idx}
                          onClick={e => handleRowClick(idx, e)}
                          style={{
                            cursor: 'pointer',
                            background: selectedRowIdxs.includes(idx) ? 'var(--brand-light)' : 'transparent',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => { if (!selectedRowIdxs.includes(idx)) e.currentTarget.style.background = 'var(--bg)'; }}
                          onMouseLeave={e => { if (!selectedRowIdxs.includes(idx)) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {columns.map(col => (
                            <td
                              key={col}
                              style={{ padding: '0.4rem 0.75rem', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid var(--border)' }}
                              title={typeof row[col] === 'string' ? row[col] : undefined}
                            >
                              {typeof row[col] === 'string' && row[col].length > 22 ? row[col].slice(0, 22) + '…' : row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {error && (
              <div className="alert alert-danger mt-3" style={{ fontSize: '0.875rem' }}>{error}</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
