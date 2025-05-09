'use client';

import { useState, useEffect } from 'react';

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
      // URL 객체 생성 및 파라미터 추가 (필드 선택)
      const url = new URL(`${API_BASE_URL}/api/get_table_data`);
      url.searchParams.append('database', selectedDatabase);
      url.searchParams.append('table', 'Tx_summary');
      url.searchParams.append('fields', 'ProbeID,Software_version');
      console.log('소프트웨어 데이터 로딩 URL:', url.toString());
      
      const response = await fetch(url, { 
        method: 'GET', 
        credentials: 'include' 
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`에러 응답: ${response.status} - ${errorText}`);
        throw new Error(`소프트웨어 데이터를 가져오는데 실패했습니다: ${response.status}`);
      }
      
      // 서버에서 반환하는 결과는 객체 형태임
      const data = await response.json();
      console.log('받은 소프트웨어 데이터:', data);
      
      // 서버에서 이미 probes, software, mapping이 전달됨
      setProbeList(data.probes || []);
      setSoftwareList(data.software || []);
      setProbeSoftwareMapping(data.mapping || {});
      setHasSoftwareData(data.hasSoftwareData);
      
      // 현재 선택된 프로브가 있으면 해당 프로브의 소프트웨어를 필터링
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
      console.error('소프트웨어 데이터 가져오기 실패:', err);
      throw err; // 상위 함수에서 처리하도록 에러 전파
    }
  };

  // WCS 데이터 로딩 함수
  const loadWcsData = async () => {
    try {
      const url = new URL(`${API_BASE_URL}/api/get_table_data`);
      url.searchParams.append('database', selectedDatabase);
      url.searchParams.append('table', 'WCS');
      console.log('Loading WCS from:', url.toString());
  
      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`WCS fetch 실패: ${response.status} – ${txt}`);
      }
  
      const data = await response.json();
      console.log('WCS raw data:', data);
  
      // ✔️ 성공 시 항상 wcsVersionList 세팅
      const wcsData = Array.isArray(data.wcsVersions)
        ? data.wcsVersions.map(wcs => ({
            ...wcs,
            probeId: String(wcs.probeId),
            myVersion: String(wcs.myVersion),
          }))
        : [];
  
      setWcsVersionList(wcsData);
  
      // ✔️ 현재 선택 probe 기준으로도 필터링
      if (selectedProbe) {
        setFilteredWcsVersions(
          wcsData.filter(wcs => wcs.probeId === String(selectedProbe))
        );
      } else {
        setFilteredWcsVersions([]);
      }
      
      return data;
    } catch (err) {
      console.error('WCS 데이터 로딩 오류:', err);
      setWcsVersionList([]);
      setFilteredWcsVersions([]);
      throw err; // 상위 함수에서 처리하도록 에러 전파
    }
  };

  // ✔️ Probe 또는 WCS 리스트가 바뀔 때마다 필터링
  useEffect(() => {
    if (selectedProbe && wcsVersionList.length > 0) {
      const probeIdStr = String(selectedProbe);
      console.log("필터링 중: 선택된 probeId:", probeIdStr);
      console.log("필터링 대상 WCS 목록:", wcsVersionList);
      
      const filtered = wcsVersionList.filter(wcs => wcs.probeId === probeIdStr);
      console.log("필터링 결과:", filtered);
      
      setFilteredWcsVersions(filtered);
    } else {
      setFilteredWcsVersions([]);
    }
    // 새 WCS 목록이 들어오면 선택된 WCS 소프트웨어 초기화
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
    if (!selectedDatabase || !selectedProbe || !selectedTxSW || !selectedWcsSW || !MI || !temperature || !Ispta) {
      alert('데이터를 추출하기 전에 데이터베이스, 프로브, 소프트웨어, measSSId를 선택해주세요.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setReportData(null);
    
    const requestData = {
      database: selectedDatabase,
      probeId: probeList.find(probe => probe.probeId === selectedProbe)?.probeId || '',
      wcsSoftware: selectedWcsSW,
      TxSumSoftware: selectedTxSW,
      measSSId_Temp: temperature,
      measSSId_MI: MI,
      measSSId_Ispta: Ispta,
    };
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/run_tx_compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`데이터 추출 실패: ${errorText}`);
      }
  
      const data = await response.json();
      
      if (data.status === 'success' && data.reportData) {
        // 결과 데이터 처리
        setReportData(data.reportData);
        
        // 세션 스토리지에 저장
        sessionStorage.setItem('reportData', JSON.stringify(data.reportData));
        
        // 데이터 창에서 보기
        openDataInNewWindow(data.reportData, 'report');
      } else {
        setError(data.message || '보고서 데이터를 추출하는데 실패했습니다');
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
    const newWindow = window.open('/data-view', windowTitle, 'width=1000,height=800');
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
          editableColumns,
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
    <div className="container mt-4">
      {/* 첫 번째 카드: Verification Report 부분 */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">Verification Report</h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {/* 첫 번째 줄: 데이터베이스, 프로브, WCS_S/W, 소프트웨어 선택, 데이터 새로고침 버튼 */}
            <div className="col-md-2">
              <label htmlFor="databaseSelect" className="form-label">
                데이터베이스 선택
              </label>
              <select
                id="databaseSelect"
                className="form-select"
                value={selectedDatabase}
                onChange={(e) => {
                  const newDatabase = e.target.value;
                  setSelectedDatabase(newDatabase);
                  setSelectedProbe('');
                  setSelectedSoftware('');
                  setSelectedWcsSoftware('');
                }}
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
            
            <div className="col-md-2">
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
                  setSelectedWcsSoftware('');
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
            
            <div className="col-md-2">
              <label htmlFor="wcsSoftwareSelect" className="form-label">
                WCS_S/W 선택
              </label>
              <select
                id="wcsSoftwareSelect"
                className="form-select"
                value={selectedWcsSW}
                onChange={(e) => setSelectedWcsSoftware(e.target.value)}
                disabled={isLoading || !selectedProbe || filteredWcsVersions.length === 0}
              >
                <option value="">WCS_S/W 선택</option>
                {filteredWcsVersions.map((wcsVersion, index) => (
                  <option
                    key={`wcs_${index}`}
                    value={wcsVersion.myVersion}
                  >
                    {wcsVersion.myVersion}
                  </option>
                ))}
              </select>
              {selectedProbe && filteredWcsVersions.length === 0 && (
                <small className="text-muted">
                  선택한 프로브에 WCS_S/W 데이터가 없습니다.
                </small>
              )}
            </div>
            
            <div className="col-md-2">
              <label htmlFor="softwareSelect" className="form-label">
                소프트웨어 선택
              </label>
              <select
                id="softwareSelect"
                className="form-select"
                value={selectedTxSW}
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
            
            <div className="col-md-4 d-flex align-items-end mb-3">
              <button 
                className="btn btn-outline-secondary w-100" 
                onClick={refreshAllData}
                disabled={!selectedDatabase || isLoading}
              >
                데이터 새로고침
              </button>
            </div>
            
            {/* 두 번째 줄: Temperature, MI, Ispta 입력 필드 (같은 줄에 배치) */}
            <div className="col-md-4">
              <label htmlFor="temperatureInput" className="form-label">
                Temperature measSSid
              </label>
              <input
                type="text"
                id="temperatureInput"
                className="form-control"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={isLoading}
              />
            </div>
  
            <div className="col-md-4">
              <label htmlFor="MI_Input" className="form-label">
                MI measSSid
              </label>
              <input
                type="text"
                id="MI_Input"
                className="form-control"
                value={MI}
                onChange={(e) => setMI(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            <div className="col-md-4">
              <label htmlFor="IsptaInput" className="form-label">
                Ispta.3 measSSid
              </label>
              <input
                type="text"
                id="IsptaInput"
                className="form-control"
                value={Ispta}
                onChange={(e) => setIspta(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            {/* 세 번째 줄: Report Table 추출 버튼 */}
            <div className="col-md-12">
              <button
                className="btn btn-success w-100"
                onClick={extractReportData}
                disabled={!selectedDatabase || !selectedProbe || !selectedWcsSW || (!selectedTxSW && hasSoftwareData) || !MI || !temperature || isLoading}
              >
                {isLoading ? '처리 중...' : 'Report Table 추출'}
              </button>
            </div>
          </div>
        </div>
      </div>
  
      {/* 두 번째 카드: Tx summary Input 부분 */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-info text-white">
          <h5 className="mb-0">Tx summary Input</h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {/* 첫 번째 줄: 파일 선택 필드 */}
            <div className="col-md-12 mb-3">
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
            
            {/* 두 번째 줄: Summary Table 추출 버튼 */}
            <div className="col-md-12">
              <button
                className="btn btn-primary w-100"
                onClick={parsingTxSum}
                disabled={!selectedDatabase || !selectedProbe || (!selectedTxSW && hasSoftwareData) || isLoading}
              >
                {isLoading ? '처리 중...' : 'Summary Table 추출'}
              </button>
            </div>
          </div>
        </div>
      </div>
  
      {error && <div className="alert alert-danger mt-3">{error}</div>}
      
      {/* 이하 미리보기 부분은 동일하게 유지 */}
      {summaryData && (
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-light">
            <h5 className="mb-0">요약 테이블 미리보기</h5>
          </div>
          <div className="card-body">
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
        </div>
      )}
      
      {reportData && (
        <div className="card shadow-sm">
          <div className="card-header bg-light">
            <h5 className="mb-0">보고서 데이터 미리보기</h5>
          </div>
          <div className="card-body">
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
        </div>
      )}
    </div>
  );
}
