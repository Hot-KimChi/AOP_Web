'use client';

import { useState, useEffect } from 'react';

export default function VerificationReport() {
  // 기본 상태 변수 선언
  const [probeList, setProbeList] = useState([]);                // 프로브 목록
  const [softwareList, setSoftwareList] = useState([]);          // 소프트웨어 목록
  const [DBList, setDBList] = useState([]);                      // 데이터베이스 목록
  const [selectedDatabase, setSelectedDatabase] = useState('');  // 선택된 데이터베이스
  const [selectedProbe, setSelectedProbe] = useState(null);      // 선택된 프로브
  const [selectedSoftware, setSelectedSoftware] = useState(null); // 선택된 소프트웨어
  const [file, setFile] = useState(null);                        // 업로드된 파일
  const [isLoading, setIsLoading] = useState(false);             // 로딩 상태
  const [error, setError] = useState(null);                      // 오류 메시지
  const [summaryData, setSummaryData] = useState(null);          // 요약 테이블 데이터
  const [reportData, setReportData] = useState(null);            // 추출된 보고서 데이터
  const [dataWindowReference, setDataWindowReference] = useState(null); // 데이터 창 참조

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

  // 선택된 데이터베이스에 따른 프로브 목록 로딩
  useEffect(() => {
    if (selectedDatabase) {
      setIsLoading(true);
      
      const fetchProbes = async () => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/get_probes?database=${selectedDatabase}`,
            { method: 'GET', credentials: 'include' }
          );
          
          if (!response.ok) throw new Error('프로브 목록을 가져오는데 실패했습니다');
          
          const data = await response.json();
          setProbeList(data.probes || []);
        } catch (err) {
          console.error('프로브 목록 가져오기 실패:', err);
          setError('프로브 목록을 가져오는데 실패했습니다');
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchProbes();
    } else {
      setProbeList([]);
    }
  }, [selectedDatabase, API_BASE_URL]);

  // 선택된 데이터베이스에 따른 소프트웨어 목록 로딩
  useEffect(() => {
    if (selectedProbe) {
      setIsLoading(true);
      
      const fetchSoftware = async () => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/get_software?database=${selectedProbe}`,
            { method: 'GET', credentials: 'include' }
          );
          
          if (!response.ok) throw new Error('소프트웨어 목록을 가져오는데 실패했습니다');
          
          const data = await response.json();
          setSoftwareList(data.software || []);
        } catch (err) {
          console.error('소프트웨어 목록 가져오기 실패:', err);
          setError('소프트웨어 목록을 가져오는데 실패했습니다');
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchSoftware();
    } else {
      setSoftwareList([]);
    }
  }, [selectedProbe, API_BASE_URL]);

  // 파일 변경 핸들러
  const handleFileChange = (event) => setFile(event.target.files[0]);

  // 요약 테이블 추출 함수
  const extractSummaryTable = async () => {
    if (!selectedDatabase || !selectedProbe || !selectedSoftware) {
      alert('요약 테이블을 추출하기 전에 데이터베이스, 프로브, 소프트웨어를 선택해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSummaryData(null);

    try {
      const { id: probeId } = selectedProbe;
      const { id: softwareId } = selectedSoftware;
      
      const response = await fetch(`${API_BASE_URL}/api/extract-summary-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          database: selectedDatabase,
          probeId,
          softwareId
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`요약 테이블 추출 실패: ${errorText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'success' && data.summaryData) {
        setSummaryData(data.summaryData);
        
        // 세션 스토리지에 데이터 저장
        sessionStorage.setItem('summaryData', JSON.stringify(data.summaryData));
        
        // 데이터 창에서 보기
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
    if (!selectedDatabase || !selectedProbe || !selectedSoftware || !file) {
      alert('데이터를 추출하기 전에 데이터베이스, 프로브, 소프트웨어, 파일을 선택해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setReportData(null);

    const { id: probeId, name: probeName } = selectedProbe;
    const { id: softwareId, name: softwareName } = selectedSoftware;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('database', selectedDatabase);
    formData.append('probeId', probeId);
    formData.append('probeName', probeName);
    formData.append('softwareId', softwareId);
    formData.append('softwareName', softwareName);

    try {
      const response = await fetch(`${API_BASE_URL}/api/extract-report-data`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`데이터 추출 실패: ${errorText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'success' && data.reportData) {
        setReportData(data.reportData);
        
        // 세션 스토리지에 데이터 저장
        sessionStorage.setItem('reportData', JSON.stringify(data.reportData));
        
        // 데이터 창에서 보기
        openDataInNewWindow(data.reportData, 'report');
      } else {
        setError('보고서 데이터를 추출하는데 실패했습니다');
      }
    } catch (err) {
      console.error('오류:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 새 창에서 데이터 보기
  const openDataInNewWindow = (data, type) => {
    // 이미 열린 창이 있으면 닫기
    if (dataWindowReference && !dataWindowReference.closed) {
      dataWindowReference.close();
    }

    if (!data || data.length === 0) {
      alert('표시할 데이터가 없습니다.');
      return;
    }

    // 데이터 유형에 따라 다른 키 사용
    const dataKey = type === 'summary' ? 'summaryData' : 'reportData';
    
    // 세션 스토리지 설정
    sessionStorage.setItem(dataKey, JSON.stringify(data));
    sessionStorage.setItem('dataType', type);
    sessionStorage.setItem('dataWindowOpen', 'open');
    sessionStorage.setItem('parentWindowId', window.name || 'main');

    // 새 창 열기
    const windowTitle = type === 'summary' ? '요약 테이블' : '보고서 데이터';
    const newWindow = window.open('/data-view', windowTitle, 'width=1000,height=800');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      alert('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
      return;
    }

    // 창 참조 저장
    setDataWindowReference(newWindow);

    // 창이 로드된 후 메시지 전송
    newWindow.onload = () => {
      newWindow.postMessage({
        type: 'INIT_DATA',
        data: data,
        dataType: type
      }, '*');
    };

    // 창이 닫힐 때 이벤트 처리
    newWindow.onbeforeunload = () => {
      sessionStorage.setItem('dataWindowOpen', 'closed');
      setDataWindowReference(null);
    };
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">Verification Report</h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {/* 첫번째 줄: 1), 2), 3), 6) */}
            <div className="col-md-3">
              <label htmlFor="databaseSelect" className="form-label">
                데이터베이스 선택
              </label>
              <select
                id="databaseSelect"
                className="form-select"
                value={selectedDatabase}
                onChange={(e) => setSelectedDatabase(e.target.value)}
                disabled={isLoading}
              >
                <option value="">데이터베이스 선택</option>
                {DBList.map((db, index) => (
                  <option key={index} value={db}>
                    {db}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="col-md-3">
              <label htmlFor="probeSelect" className="form-label">
                프로브 선택
              </label>
              <select
                id="probeSelect"
                className="form-select"
                value={selectedProbe ? JSON.stringify(selectedProbe) : ''}
                onChange={(e) => setSelectedProbe(JSON.parse(e.target.value))}
                disabled={isLoading || !selectedDatabase}
              >
                <option value="">프로브 선택</option>
                {probeList.map((probe) => (
                  <option
                    key={probe.probeId}
                    value={JSON.stringify({ id: probe.probeId, name: probe.probeName })}
                  >
                    {probe.probeName} ({probe.probeId})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="col-md-3">
              <label htmlFor="softwareSelect" className="form-label">
                소프트웨어 선택
              </label>
              <select
                id="softwareSelect"
                className="form-select"
                value={selectedSoftware ? JSON.stringify(selectedSoftware) : ''}
                onChange={(e) => setSelectedSoftware(JSON.parse(e.target.value))}
                disabled={isLoading || !selectedDatabase}
              >
                <option value="">소프트웨어 선택</option>
                {softwareList.map((software) => (
                  <option
                    key={software.softwareId}
                    value={JSON.stringify({ id: software.softwareId, name: software.softwareName })}
                  >
                    {software.softwareName} ({software.softwareId})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="col-md-3">
              <label htmlFor="fileInput" className="form-label">
                파일 선택
              </label>
              <input
                type="file"
                id="fileInput"
                className="form-control"
                onChange={handleFileChange}
                disabled={isLoading}
              />
            </div>
            
            {/* 두번째 줄: 4), 5) */}
            <div className="col-md-6 mt-3">
              <button
                className="btn btn-primary w-100"
                onClick={extractSummaryTable}
                disabled={!selectedDatabase || !selectedProbe || !selectedSoftware || isLoading}
              >
                {isLoading ? '처리 중...' : 'Sumarry Table 추출'}
              </button>
            </div>
            
            <div className="col-md-6 mt-3">
              <button
                className="btn btn-success w-100"
                onClick={extractReportData}
                disabled={!selectedDatabase || !selectedProbe || !selectedSoftware || !file || isLoading}
              >
                {isLoading ? '처리 중...' : 'Report Table 추출'}
              </button>
            </div>
          </div>
          
          {error && <div className="alert alert-danger mt-3">{error}</div>}
          
          {/* 요약 테이블 데이터 미리보기 */}
          {summaryData && (
            <div className="mt-4">
              <h5>요약 테이블 미리보기</h5>
              <div className="table-responsive">
                <table className="table table-bordered table-hover">
                  <thead className="table-light">
                    {summaryData.length > 0 && (
                      <tr>
                        {Object.keys(summaryData[0]).map((key, index) => (
                          <th key={index}>{key}</th>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {summaryData.slice(0, 5).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {Object.values(row).map((value, cellIndex) => (
                          <td key={cellIndex}>{value}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {summaryData.length > 5 && (
                  <p className="text-muted">총 {summaryData.length}개 행 중 5개만 표시됩니다.</p>
                )}
              </div>
            </div>
          )}
          
          {/* 보고서 데이터 미리보기 */}
          {reportData && (
            <div className="mt-4">
              <h5>보고서 데이터 미리보기</h5>
              <div className="table-responsive">
                <table className="table table-bordered table-hover">
                  <thead className="table-light">
                    {reportData.length > 0 && (
                      <tr>
                        {Object.keys(reportData[0]).map((key, index) => (
                          <th key={index}>{key}</th>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {reportData.slice(0, 5).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {Object.values(row).map((value, cellIndex) => (
                          <td key={cellIndex}>{value}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportData.length > 5 && (
                  <p className="text-muted">총 {reportData.length}개 행 중 5개만 표시됩니다.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}