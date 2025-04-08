'use client';

import { useState, useEffect } from 'react';

export default function VerificationReport() {
  // 기본 상태 변수 선언
  const [probeList, setProbeList] = useState([]);                // 프로브 목록
  const [softwareList, setSoftwareList] = useState([]);            // 소프트웨어 목록
  const [DBList, setDBList] = useState([]);                        // 데이터베이스 목록
  const [selectedDatabase, setSelectedDatabase] = useState('');    // 선택된 데이터베이스
  const [selectedProbe, setSelectedProbe] = useState('');          // 선택된 프로브 (ProbeID 문자열)
  const [selectedSoftware, setSelectedSoftware] = useState('');    // 선택된 소프트웨어 (Software_version 문자열)
  const [file, setFile] = useState(null);                          // 업로드된 파일
  const [isLoading, setIsLoading] = useState(false);               // 로딩 상태
  const [error, setError] = useState(null);                        // 오류 메시지
  const [summaryData, setSummaryData] = useState(null);            // 요약 테이블 데이터
  const [reportData, setReportData] = useState(null);              // 추출된 보고서 데이터
  const [dataWindowReference, setDataWindowReference] = useState(null); // 데이터 창 참조
  const [hasSoftwareData, setHasSoftwareData] = useState(true);
  const [filteredSoftwareList, setFilteredSoftwareList] = useState([]);
  const [probeSoftwareMapping, setProbeSoftwareMapping] = useState({});

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
          // URL 객체 생성 및 파라미터 추가 (필드 선택)
          const url = new URL(`${API_BASE_URL}/api/get_table_data`);
          url.searchParams.append('database', selectedDatabase);
          url.searchParams.append('table', 'Tx_summary');
          url.searchParams.append('fields', 'ProbeID,Software_version');
          console.log('요청 URL:', url.toString());
          
          const response = await fetch(url, { 
            method: 'GET', 
            credentials: 'include' 
          });
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`에러 응답: ${response.status} - ${errorText}`);
            throw new Error(`데이터를 가져오는데 실패했습니다: ${response.status}`);
          }
          
          // 서버에서 반환하는 결과는 객체 형태임
          const data = await response.json();
          console.log('받은 데이터:', data);
          
          // 서버에서 이미 probes, software, mapping이 전달됨
          setProbeList(data.probes || []);
          setSoftwareList(data.software || []);
          setProbeSoftwareMapping(data.mapping || {});
          setHasSoftwareData(data.hasSoftwareData);
        } catch (err) {
          console.error('데이터 가져오기 실패:', err);
          setError('데이터를 가져오는데 실패했습니다');
        } finally {
          setIsLoading(false);
        }
      };
      fetchData();
    } else {
      setProbeList([]);
      setSoftwareList([]);
      setHasSoftwareData(true);
      setProbeSoftwareMapping({});
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
      const probeId = selectedProbe;
      const softwareVersion = selectedSoftware;
      const response = await fetch(`${API_BASE_URL}/api/extract-summary-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          database: selectedDatabase,
          probeId,
          softwareVersion
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
    if (!selectedDatabase || !selectedProbe || !selectedSoftware || !file) {
      alert('데이터를 추출하기 전에 데이터베이스, 프로브, 소프트웨어, 파일을 선택해주세요.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setReportData(null);
    const probeId = selectedProbe;
    const softwareVersion = selectedSoftware;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('database', selectedDatabase);
    formData.append('probeId', probeId);
    formData.append('softwareVersion', softwareVersion);
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
        sessionStorage.setItem('reportData', JSON.stringify(data.reportData));
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
    if (dataWindowReference && !dataWindowReference.closed) {
      dataWindowReference.close();
    }
    if (!data || data.length === 0) {
      alert('표시할 데이터가 없습니다.');
      return;
    }
    const dataKey = type === 'summary' ? 'summaryData' : 'reportData';
    sessionStorage.setItem(dataKey, JSON.stringify(data));
    sessionStorage.setItem('dataType', type);
    sessionStorage.setItem('dataWindowOpen', 'open');
    sessionStorage.setItem('parentWindowId', window.name || 'main');
    const windowTitle = type === 'summary' ? '요약 테이블' : '보고서 데이터';
    const newWindow = window.open('/data-view', windowTitle, 'width=1000,height=800');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      alert('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
      return;
    }
    setDataWindowReference(newWindow);
    newWindow.onload = () => {
      newWindow.postMessage({
        type: 'INIT_DATA',
        data: data,
        dataType: type
      }, '*');
    };
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
                value={selectedProbe}
                onChange={(e) => {
                  const probeId = e.target.value;
                  setSelectedProbe(probeId);
                  setSelectedSoftware('');
                }}
                disabled={isLoading || !selectedDatabase}
              >
                <option value="">프로브 선택</option>
                {probeList.map((probe) => (
                  <option
                    key={probe._id}
                    value={probe.probeId}
                  >
                    {probe.probeName} ({Number(probe.probeId).toString()})
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
                value={selectedSoftware}
                onChange={(e) => setSelectedSoftware(e.target.value)}
                disabled={isLoading || !selectedProbe || !hasSoftwareData}
              >
                <option value="">소프트웨어 선택</option>
                {filteredSoftwareList.map((software) => (
                  <option
                    key={software._id}
                    value={software.softwareVersion}
                  >
                    {software.softwareVersion}
                  </option>
                ))}
              </select>
              {!hasSoftwareData && selectedDatabase && (
                <small className="text-muted">
                  선택한 테이블에 소프트웨어 데이터가 없습니다.
                </small>
              )}
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
                disabled={!selectedDatabase || !selectedProbe || (!selectedSoftware && hasSoftwareData) || isLoading}
              >
                {isLoading ? '처리 중...' : 'Summary Table 추출'}
              </button>
            </div>
            
            <div className="col-md-6 mt-3">
              <button
                className="btn btn-success w-100"
                onClick={extractReportData}
                disabled={!selectedDatabase || !selectedProbe || (!selectedSoftware && hasSoftwareData) || !file || isLoading}
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
