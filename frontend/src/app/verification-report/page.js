'use client';

import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';

export default function VerificationReport() {
  // 기본 상태 변수 선언
  const [probeList, setProbeList] = useState([]);                       // 프로브 목록
  const [softwareList, setSoftwareList] = useState([]);                 // 소프트웨어 목록
  const [DBList, setDBList] = useState([]);                             // 데이터베이스 목록
  const [selectedDatabase, setSelectedDatabase] = useState('');         // 선택된 데이터베이스
  const [selectedProbe, setSelectedProbe] = useState('');               // 선택된 프로브 (ProbeID 문자열)
  const [selectedTxSW, setSelectedSoftware] = useState('');         // 선택된 소프트웨어 (Software_version 문자열)
  const [file, setFile] = useState(null);                               // 업로드된 파일
  const [isLoading, setIsLoading] = useState(false);                    // 로딩 상태
  const [error, setError] = useState(null);                             // 오류 메시지
  const [summaryData, setSummaryData] = useState(null);                 // 요약 테이블 데이터
  const [reportData, setReportData] = useState(null);                   // 추출된 보고서 데이터
  const [dataWindowReference, setDataWindowReference] = useState(null); // 데이터 창 참조
  const [hasSoftwareData, setHasSoftwareData] = useState(true);
  const [filteredSoftwareList, setFilteredSoftwareList] = useState([]);
  const [probeSoftwareMapping, setProbeSoftwareMapping] = useState({});
  const [temperature, setTemperature] = useState('');                   // 온도 입력값
  const [MI, setMI] = useState('');                                     // MI 입력값
  const [Ispta, setIspta] = useState('');                               // Ispta.3 입력값
  const [selectedWcsSW, setSelectedWcsSoftware] = useState('');
  const [wcsVersionList, setWcsVersionList] = useState([]);
  const [filteredWcsVersions, setFilteredWcsVersions] = useState([]);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  // 데이터베이스 목록 로딩
  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/get_list_database`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('데이터베이스 목록을 가져오는데 실패했습니다');
        const data = await response.json();
        setDBList(data.databases || []);
      } catch (err) {
        console.error('데이터베이스 목록 가져오기 실패:', err);
        setError('데이터베이스 목록을 가져오는데 실패했습니다');
      }
    };
    fetchDatabases();
  }, [API_BASE_URL]);
  
  // 선택된 데이터베이스에 따른 프로브 및 소프트웨어 데이터 로딩
  useEffect(() => {
    if (selectedDatabase) {
      setIsLoading(true);
      const fetchData = async () => {
        try {
          // 소프트웨어 데이터와 WCS 데이터를 병렬로 로드
          await Promise.all([
            loadSoftwareData(),
            loadWcsData()
          ]);
        } catch (err) {
          console.error('데이터 가져오기 실패:', err);
          setError('데이터를 가져오는데 실패했습니다');
        } finally {
          setIsLoading(false);
        }
      };
      
      // 데이터 가져오기
      fetchData();
    } else {
      setProbeList([]);
      setSoftwareList([]);
      setHasSoftwareData(true);
      setProbeSoftwareMapping({});
      setWcsVersionList([]); // 데이터베이스 선택 해제 시 WCS 목록도 초기화
    }
  }, [selectedDatabase, API_BASE_URL]);

  // 프로브 선택 시 해당 프로브에 맞는 소프트웨어 목록 필터링
  useEffect(() => {
    if (selectedProbe && Object.keys(probeSoftwareMapping).length > 0) {
      const softwareForProbe = probeSoftwareMapping[selectedProbe] || [];
      const softwareVersions = softwareForProbe.map(item => item.softwareVersion);
      const filteredSoftware = softwareList.filter(sw => 
        softwareVersions.includes(sw.softwareVersion)
      );
      setFilteredSoftwareList(filteredSoftware);
    } else {
      setFilteredSoftwareList([]);
    }
  }, [selectedProbe, probeSoftwareMapping, softwareList]);

  // WCS와 소프트웨어 데이터를 함께 새로고침하는 함수
  const refreshAllData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 두 데이터를 병렬로 로드
      await Promise.all([
        loadWcsData(),
        loadSoftwareData()
      ]);
    } catch (err) {
      console.error('데이터 새로고침 중 오류 발생:', err);
      setError('데이터 새로고침 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 소프트웨어 데이터 로딩 함수
  const loadSoftwareData = async () => {
    try {
      const url = new URL(`${API_BASE_URL}/api/get_table_data`);
      url.searchParams.append('database', selectedDatabase);
      url.searchParams.append('table', 'Tx_summary');
      url.searchParams.append('fields', 'ProbeID,Software_version');
      
      const response = await fetch(url, { 
        method: 'GET', 
        credentials: 'include' 
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`소프트웨어 데이터를 가져오는데 실패했습니다: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      setProbeList(data.probes || []);
      setSoftwareList(data.software || []);
      setProbeSoftwareMapping(data.mapping || {});
      setHasSoftwareData(data.hasSoftwareData);
      
      if (selectedProbe && data.mapping && data.mapping[selectedProbe]) {
        const softwareForProbe = data.mapping[selectedProbe] || [];
        const softwareVersions = softwareForProbe.map(item => item.softwareVersion);
        const filteredSoftware = (data.software || []).filter(sw => 
          softwareVersions.includes(sw.softwareVersion)
        );
        setFilteredSoftwareList(filteredSoftware);
      }
      
      return data;
    } catch (err) {
      throw err;
    }
  };

  // WCS 데이터 로딩 함수
  const loadWcsData = async () => {
    try {
      const url = new URL(`${API_BASE_URL}/api/get_table_data`);
      url.searchParams.append('database', selectedDatabase);
      url.searchParams.append('table', 'WCS');
  
      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`WCS fetch 실패: ${response.status} – ${txt}`);
      }
  
      const data = await response.json();
  
      const wcsData = Array.isArray(data.wcsVersions)
        ? data.wcsVersions.map(wcs => ({
            ...wcs,
            probeId: String(wcs.probeId),
            myVersion: String(wcs.myVersion),
          }))
        : [];
  
      setWcsVersionList(wcsData);
  
      if (selectedProbe) {
        setFilteredWcsVersions(
          wcsData.filter(wcs => wcs.probeId === String(selectedProbe))
        );
      } else {
        setFilteredWcsVersions([]);
      }
      
      return data;
    } catch (err) {
      setWcsVersionList([]);
      setFilteredWcsVersions([]);
      throw err;
    }
  };

  // ✔️ Probe 또는 WCS 리스트가 바뀔 때마다 필터링
  useEffect(() => {
    if (selectedProbe && wcsVersionList.length > 0) {
      const probeIdStr = String(selectedProbe);
      const filtered = wcsVersionList.filter(wcs => wcs.probeId === probeIdStr);
      setFilteredWcsVersions(filtered);
    } else {
      setFilteredWcsVersions([]);
    }
    setSelectedWcsSoftware('');
  }, [selectedProbe, wcsVersionList]);


  // 파일 변경 핸들러
  const handleFileChange = (event) => setFile(event.target.files[0]);

  // 요약 테이블 추출 함수
  const parsingTxSum = async () => {
    if (!selectedDatabase || !selectedProbe || !selectedTxSW) {
      alert('요약 테이블을 추출하기 전에 데이터베이스, 프로브, 소프트웨어를 선택해주세요.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setSummaryData(null);
    
    try {
      const probeId = selectedProbe;
      const softwareVersion = selectedTxSW;
      const response = await fetch(`${API_BASE_URL}/api/extract-summary-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          database: selectedDatabase,
          probeId,
          softwareVersion,
          intensity: MI,
          temperature
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`요약 테이블 추출 실패: ${errorText}`);
      }
      const data = await response.json();
      if (data.status === 'success' && data.summaryData) {
        setSummaryData(data.summaryData);
        sessionStorage.setItem('summaryData', JSON.stringify(data.summaryData));
        openDataInNewWindow(data.summaryData, 'summary');
      } else {
        setError('요약 테이블 데이터를 가져오는데 실패했습니다');
      }
    } catch (err) {
      console.error('오류:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  // 데이터 추출 함수
  const extractReportData = async () => {
    if (!selectedDatabase || !selectedProbe || !selectedTxSW || !selectedWcsSW) {
      alert('데이터베이스, 프로브, 소프트웨어, WCS_S/W를 선택하세요.');
      return;
    }

    // SSid별로 요청할 값이 있는지 확인
    const tasks = [];
    if (temperature) {
      tasks.push({
        label: `Temp:${temperature}`,
        requestData: {
          database: selectedDatabase,
          probeId: String(selectedProbe),
          wcsSoftware: selectedWcsSW,
          TxSumSoftware: selectedTxSW,
          measSSId_Temp: temperature,
          measSSId_MI: null,
          measSSId_Ispta: null,
        }
      });
    }
    if (MI) {
      tasks.push({
        label: `MI:${MI}`,
        requestData: {
          database: selectedDatabase,
          probeId: String(selectedProbe),
          wcsSoftware: selectedWcsSW,
          TxSumSoftware: selectedTxSW,
          measSSId_Temp: null,
          measSSId_MI: MI,
          measSSId_Ispta: null,
        }
      });
    }
    if (Ispta) {
      tasks.push({
        label: `Ispta:${Ispta}`,
        requestData: {
          database: selectedDatabase,
          probeId: String(selectedProbe),
          wcsSoftware: selectedWcsSW,
          TxSumSoftware: selectedTxSW,
          measSSId_Temp: null,
          measSSId_MI: null,
          measSSId_Ispta: Ispta,
        }
      });
    }

    if (tasks.length === 0) {
      alert('SSid 값을 입력하세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    for (const task of tasks) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/run_tx_compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task.requestData),
          credentials: 'include',
        });
        const data = await response.json();
        
        if (data.status === 'success' && data.reportData) {
          // 세션스토리지에 별도 key로 저장
          const storageKey = `reportData_${task.label}`;
          sessionStorage.setItem(storageKey, JSON.stringify(data.reportData));
          if (data.columns) {
            sessionStorage.setItem(`${storageKey}_columns`, JSON.stringify(data.columns));
          }
          // viewer와 동일하게 새 창 옵션 지정
          const windowFeatures = 'width=2000,height=800,menubar=no,toolbar=no,location=no,status=no';
          window.open(`/verification-report/data-view-standalone?pageLabel=${encodeURIComponent(task.label)}&storageKey=${encodeURIComponent(storageKey)}`, '_blank', windowFeatures);
        } else {
          alert(`${task.label} 데이터 없음`);
        }
      } catch (err) {
        alert(`${task.label} 요청 실패: ${err.message}`);
      }
    }
    setIsLoading(false);
  };

  // 새 창에서 데이터 보기
  const openDataInNewWindow = (data, type) => {
    // 기존 열린 창 닫기
    if (dataWindowReference && !dataWindowReference.closed) {
      dataWindowReference.close();
    }

    if (!data || data.length === 0) {
      alert('표시할 데이터가 없습니다.');
      return;
    }

    // 데이터 키 및 창 제목 결정
    const dataKey = type === 'summary' ? 'summaryData' : 'reportData';
    const windowTitle = type === 'summary' ? '요약 테이블' : '보고서 데이터';

    // 세션 스토리지에 원본 및 편집 정보 저장
    const originalSnapshot = JSON.stringify(data);
    sessionStorage.setItem(dataKey, originalSnapshot);
    sessionStorage.setItem('dataType', type);
    // if (editableColumns) {
    //   sessionStorage.setItem('editableColumns', JSON.stringify(editableColumns));
    // }
    sessionStorage.setItem('dataWindowOpen', 'open');
    sessionStorage.setItem('parentWindowId', window.name || 'main');

    // 새 창 열기
    const newWindow = window.open('/verification-report/data-view-standalone', windowTitle, 'width=1000,height=800');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      alert('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
      return;
    }
    setDataWindowReference(newWindow);

    // 초기화 메시지 전송
    newWindow.onload = () => {
      newWindow.postMessage(
        {
          type: 'INIT_DATA',
          data,
          dataType: type,
          // editableColumns,
        },
        '*'
      );
    };

    // 창 닫힘 이벤트 처리: 변경 여부 확인 후 업데이트
    newWindow.onbeforeunload = () => {
      sessionStorage.setItem('dataWindowOpen', 'closed');
      setDataWindowReference(null);

      try {
        const updated = sessionStorage.getItem(dataKey);
        if (updated && updated !== originalSnapshot) {
          const parsed = JSON.parse(updated);
          // 요약은 handleCSVUpdate, 보고서는 handleReportUpdate 호출
          if (type === 'summary') {
            handleCSVUpdate(parsed);
          } else {
            // 보고서 전용 업데이트 처리 함수
            handleReportUpdate(parsed);
          }
        } else {
          // 변경 없으면 상태 초기화
          setDataModified(false);
        }
      } catch (err) {
        console.error('창 닫힘 처리 중 오류:', err);
      }
    };
  };

  return (
    <Layout>
      <div className="page-wrapper">

        {/* Card 1: Verification Report */}
        <div className="card mb-3">
          <div className="card-header">
            <div className="card-title-row">
              <span style={{ fontSize: '1rem' }}>📋</span>
              <h5>Verification Report</h5>
            </div>
          </div>
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div className="row g-3">

              <div className="col-md-2">
                <label htmlFor="databaseSelect" className="form-label">Database</label>
                <select
                  id="databaseSelect"
                  className="form-select"
                  value={selectedDatabase}
                  onChange={(e) => {
                    setSelectedDatabase(e.target.value);
                    setSelectedProbe('');
                    setSelectedSoftware('');
                    setSelectedWcsSoftware('');
                  }}
                  disabled={isLoading}
                >
                  <option value="">Select database…</option>
                  {DBList.map((db, i) => <option key={i} value={db}>{db}</option>)}
                </select>
              </div>

              <div className="col-md-2">
                <label htmlFor="probeSelect" className="form-label">Probe</label>
                <select
                  id="probeSelect"
                  className="form-select"
                  value={selectedProbe}
                  onChange={(e) => {
                    setSelectedProbe(e.target.value);
                    setSelectedSoftware('');
                    setSelectedWcsSoftware('');
                  }}
                  disabled={isLoading || !selectedDatabase}
                >
                  <option value="">Select probe…</option>
                  {probeList.map((probe) => (
                    <option key={probe._id} value={probe.probeId}>
                      {probe.probeName} ({Number(probe.probeId).toString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-2">
                <label htmlFor="wcsSoftwareSelect" className="form-label">WCS S/W</label>
                <select
                  id="wcsSoftwareSelect"
                  className="form-select"
                  value={selectedWcsSW}
                  onChange={(e) => setSelectedWcsSoftware(e.target.value)}
                  disabled={isLoading || !selectedProbe || filteredWcsVersions.length === 0}
                >
                  <option value="">Select WCS S/W…</option>
                  {filteredWcsVersions.map((w, i) => <option key={i} value={w.myVersion}>{w.myVersion}</option>)}
                </select>
                {selectedProbe && filteredWcsVersions.length === 0 && (
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No WCS S/W for this probe</small>
                )}
              </div>

              <div className="col-md-2">
                <label htmlFor="softwareSelect" className="form-label">TX Software</label>
                <select
                  id="softwareSelect"
                  className="form-select"
                  value={selectedTxSW}
                  onChange={(e) => setSelectedSoftware(e.target.value)}
                  disabled={isLoading || !selectedProbe || !hasSoftwareData}
                >
                  <option value="">Select software…</option>
                  {filteredSoftwareList.map((sw) => (
                    <option key={sw._id} value={sw.softwareVersion}>{sw.softwareVersion}</option>
                  ))}
                </select>
                {!hasSoftwareData && selectedDatabase && (
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No software data</small>
                )}
              </div>

              <div className="col-md-4 d-flex align-items-end">
                <button
                  className="btn w-100"
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-sec)', borderRadius: '6px', fontWeight: '500', fontSize: '0.875rem' }}
                  onClick={refreshAllData}
                  disabled={!selectedDatabase || isLoading}
                >
                  ↻ Refresh Data
                </button>
              </div>

              <div className="col-md-4">
                <label htmlFor="temperatureInput" className="form-label">Temperature measSSid</label>
                <input type="text" id="temperatureInput" className="form-control" value={temperature} onChange={(e) => setTemperature(e.target.value)} disabled={isLoading} placeholder="e.g. 1001" />
              </div>

              <div className="col-md-4">
                <label htmlFor="MI_Input" className="form-label">MI measSSid</label>
                <input type="text" id="MI_Input" className="form-control" value={MI} onChange={(e) => setMI(e.target.value)} disabled={isLoading} placeholder="e.g. 1002" />
              </div>

              <div className="col-md-4">
                <label htmlFor="IsptaInput" className="form-label">Ispta.3 measSSid</label>
                <input type="text" id="IsptaInput" className="form-control" value={Ispta} onChange={(e) => setIspta(e.target.value)} disabled={isLoading} placeholder="e.g. 1003" />
              </div>

              <div className="col-md-12">
                <button
                  className="btn w-100"
                  style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500', fontSize: '0.875rem' }}
                  onClick={extractReportData}
                  disabled={!selectedDatabase || !selectedProbe || !selectedWcsSW || (!selectedTxSW && hasSoftwareData) || !MI || !temperature || isLoading}
                >
                  {isLoading ? 'Processing…' : '📊 Extract Report Table'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Tx Summary Input */}
        <div className="card mb-3">
          <div className="card-header">
            <div className="card-title-row">
              <span style={{ fontSize: '1rem' }}>📑</span>
              <h5>Tx Summary Input</h5>
            </div>
          </div>
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div className="row g-3">
              <div className="col-md-12">
                <label htmlFor="fileInput" className="form-label">Input File</label>
                <input type="file" id="fileInput" className="form-control" onChange={handleFileChange} disabled={isLoading} />
              </div>
              <div className="col-md-12">
                <button
                  className="btn w-100"
                  style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '500', fontSize: '0.875rem' }}
                  onClick={parsingTxSum}
                  disabled={!selectedDatabase || !selectedProbe || (!selectedTxSW && hasSoftwareData) || isLoading}
                >
                  {isLoading ? 'Processing…' : '📥 Extract Summary Table'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-danger" style={{ fontSize: '0.875rem' }}>{error}</div>}

        {/* Summary preview */}
        {summaryData && (
          <div className="card mb-3">
            <div className="card-header">
              <div className="card-title-row">
                <h5>Summary Table Preview</h5>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>showing first 5 rows</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
              <div className="table-responsive">
                <table className="table table-sm" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ background: 'var(--bg)' }}>
                    {summaryData.length > 0 && (
                      <tr>{Object.keys(summaryData[0]).map((k, i) => <th key={i} style={{ fontWeight: '600', color: 'var(--text-sec)', padding: '0.5rem 0.75rem' }}>{k}</th>)}</tr>
                    )}
                  </thead>
                  <tbody>
                    {summaryData.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {Object.values(row).map((v, ci) => <td key={ci} style={{ padding: '0.4rem 0.75rem' }}>{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {summaryData.length > 5 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>{summaryData.length} total rows — showing first 5</p>}
              </div>
            </div>
          </div>
        )}

        {/* Report preview */}
        {reportData && (
          <div className="card">
            <div className="card-header">
              <div className="card-title-row">
                <h5>Report Data Preview</h5>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>showing first 5 rows</span>
              </div>
            </div>
            <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
              <div className="table-responsive">
                <table className="table table-sm" style={{ fontSize: '0.8rem' }}>
                  <thead style={{ background: 'var(--bg)' }}>
                    {reportData.length > 0 && (
                      <tr>{Object.keys(reportData[0]).map((k, i) => <th key={i} style={{ fontWeight: '600', color: 'var(--text-sec)', padding: '0.5rem 0.75rem' }}>{k}</th>)}</tr>
                    )}
                  </thead>
                  <tbody>
                    {reportData.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {Object.values(row).map((v, ci) => <td key={ci} style={{ padding: '0.4rem 0.75rem' }}>{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportData.length > 5 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>{reportData.length} total rows — showing first 5</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
