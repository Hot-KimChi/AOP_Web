// SSR_DocOut 페이지: DB/테이블 선택 후 Word로 내보내기
'use client';

import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';

export default function SSR_DocOut() {
  const [DBList, setDBList] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [probeList, setProbeList] = useState([]);
  const [selectedProbe, setSelectedProbe] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRowIdxs, setSelectedRowIdxs] = useState([]); // 여러 행 선택 상태 추가

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/get_list_database`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('DB 목록 조회 실패');
        const data = await response.json();
        setDBList(data.databases || []);
      } catch (error) {
        setError('DB 목록 조회 실패');
      }
    };
    fetchDatabases();
  }, []);

  useEffect(() => {
    if (selectedDatabase) {
      const fetchTableData = async () => {
        try {
          setIsLoading(true);
          const url = `${API_BASE_URL}/api/get_table_data?database=${encodeURIComponent(selectedDatabase)}&table=meas_station_setup`;
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
          });
          if (!response.ok) throw new Error('테이블 데이터 조회 실패');
          const result = await response.json();
          if (result.status === 'success' && result.data && result.data.length > 0) {
            setTableData(result.data);
            // columns 우선순위: result.columns → result.data[0]의 key
            if (result.columns && Array.isArray(result.columns) && result.columns.length > 0) {
              setColumns(result.columns);
            } else {
              setColumns(Object.keys(result.data[0]));
            }
            // probeId/measComments 추출 (probeName 대신 measComments 사용)
            const probes = result.data
              .map(row => {
                const probeId = row.probeId;
                const probeName = row.measComments;
                return (probeId && probeName) ? { probeId, probeName } : null;
              })
              .filter(Boolean);
            // 중복 제거
            const uniqueProbes = Array.from(new Map(probes.map(p => [p.probeId, p])).values());
            setProbeList(uniqueProbes);
          } else {
            setTableData([]);
            setColumns([]);
            setProbeList([]);
          }
        } catch (error) {
          setError('테이블 데이터 조회 실패');
          setTableData([]);
          setColumns([]);
          setProbeList([]);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTableData();
    } else {
      setTableData([]);
      setColumns([]);
      setProbeList([]);
    }
  }, [selectedDatabase]);

  // Word 내보내기: 선택된 measSSId만 전달
  const handleExportWord = async () => {
    if (selectedDatabase && selectedRowIdxs.length > 0) {
      // 선택된 measSSId 값 추출
      const selectedIds = selectedRowIdxs.map(idx => tableData[idx]?.measSSId).filter(Boolean);
      if (selectedIds.length === 0) {
        setError('선택된 행에 measSSId 값이 없습니다.');
        return;
      }
      // SSR_table에서 선택된 measSSId만 워드로 요청
      const url = `${API_BASE_URL}/api/export_table_to_word?database=${encodeURIComponent(selectedDatabase)}&table=SSR_table&measSSIds=${encodeURIComponent(selectedIds.join(','))}`;
      try {
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Word 파일 생성 실패');
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `SSR_table_selected.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } catch (err) {
        setError('Word 파일 다운로드 실패');
      }
    } else {
      setError('행을 선택하세요.');
    }
  };

  // 행 클릭 핸들러 (ctrlKey 지원)
  const handleRowClick = (idx, event) => {
    if (event.ctrlKey) {
      setSelectedRowIdxs(prev =>
        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      );
    } else {
      setSelectedRowIdxs([idx]);
    }
  };

  return (
    <Layout>
      <div className="container mt-4">
        <div className="card shadow-sm">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">SSR_DocOut - meas_station_setup 테이블 미리보기</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-5">
                <label htmlFor="database" className="form-label">데이터베이스 선택</label>
                <select
                  id="database"
                  className="form-select"
                  value={selectedDatabase}
                  onChange={e => { setSelectedDatabase(e.target.value); setSelectedProbe(''); setError(null); }}
                  disabled={isLoading}
                >
                  <option value="">Select Database</option>
                  {DBList.map((db, idx) => (
                    <option key={idx} value={db}>{db}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-7 d-flex align-items-end">
                <button
                  className="btn btn-outline-success w-100"
                  onClick={handleExportWord}
                  disabled={!selectedDatabase || tableData.length === 0}
                >
                  Word로 내보내기
                </button>
              </div>
            </div>
            <hr />
            {isLoading && <div>로딩 중...</div>}
            {!isLoading && columns.length > 0 && (
              <div className="table-responsive mt-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table table-bordered table-sm" style={{ fontSize: '0.85rem' }}>
                  <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8f9fa' }}>
                    <tr>
                      {columns.map(col => <th key={col}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, idx) => (
                      <tr
                        key={idx}
                        onClick={e => handleRowClick(idx, e)}
                        className={selectedRowIdxs.includes(idx) ? 'table-primary' : ''}
                        style={{ cursor: 'pointer' }}
                      >
                        {columns.map(col => (
                          <td
                            key={col}
                            style={{ maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            title={typeof row[col] === 'string' ? row[col] : undefined}
                          >
                            {typeof row[col] === 'string' && row[col].length > 20
                              ? row[col].slice(0, 20) + '...'
                              : row[col]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {error && (
              <div className="alert alert-danger mt-3">{error}</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
