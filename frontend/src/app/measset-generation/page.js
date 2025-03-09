//src/app/measset-geneation/page.js
'use client';

import { useState, useEffect, useRef } from 'react';

export default function MeasSetGen() {
  // 기본 상태 변수 선언
  const [probeList, setProbeList] = useState([]);                // 프로브 목록
  const [DBList, setDBList] = useState([]);                      // 데이터베이스 목록
  const [selectedDatabase, setSelectedDatabase] = useState('');  // 선택된 데이터베이스
  const [selectedProbe, setSelectedProbe] = useState(null);      // 선택된 프로브
  const [file, setFile] = useState(null);                        // 업로드된 파일
  const [isLoading, setIsLoading] = useState(false);             // 로딩 상태
  const [error, setError] = useState(null);                      // 오류 메시지
  const [csvData, setCsvData] = useState(null);                  // CSV 데이터
  const [dataModified, setDataModified] = useState(false);       // 데이터 수정 여부
  const [dataWindowReference, setDataWindowReference] = useState(null); // 데이터 창 참조

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  // CSV 데이터 파싱 함수
  const parseCSV = (text) => {
    const lines = text.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || '';
        return obj;
      }, {});
    });
  };

  // CSV 데이터 업데이트 처리 함수
  const handleCSVUpdate = (updatedData) => {
    try {
      const parsedData = typeof updatedData === 'string' 
        ? JSON.parse(updatedData) 
        : updatedData;
        
      if (parsedData) {
        console.log('데이터 업데이트됨:', parsedData);
        setCsvData(parsedData);
        setDataModified(true);
        
        // 세션 스토리지 업데이트
        sessionStorage.setItem('csvData', JSON.stringify(parsedData));
      }
    } catch (err) {
      console.error('CSV 데이터 파싱 실패:', err);
    }
  };

  // 팝업 창 상태 확인 함수
  const checkPopupStatus = () => {
    if (dataWindowReference && dataWindowReference.closed) {
      console.log('팝업 창이 닫힘 감지됨');
      const updatedData = sessionStorage.getItem('csvData');
      if (updatedData) {
        handleCSVUpdate(updatedData);
      }
      setDataWindowReference(null);
      sessionStorage.removeItem('dataWindowOpen');
    }
  };

  // 이벤트 리스너 설정 및 해제
  useEffect(() => {
    // 스토리지 변경 이벤트 리스너
    const handleStorageChange = (event) => {
      if (event && event.key === 'csvData') {
        console.log('스토리지 변경 감지됨:', event.newValue);
        handleCSVUpdate(event.newValue);
      }
    };
    
    // 메시지 이벤트 리스너
    const handleMessageEvent = (event) => {
      if (event.data && event.data.type === 'DATA_MODIFIED') {
        console.log('메시지 이벤트 감지됨:', event.data.data);
        handleCSVUpdate(event.data.data);
      }
    };
    
    // 팝업 창 상태 확인 인터벌
    const popupCheckInterval = setInterval(checkPopupStatus, 500);

    // 이벤트 리스너 등록
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('message', handleMessageEvent);

    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('message', handleMessageEvent);
      clearInterval(popupCheckInterval);
    };
  }, [dataWindowReference]);

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

  // 파일 변경 핸들러
  const handleFileChange = (event) => setFile(event.target.files[0]);

  // CSV 파일 업로드 및 처리
  const handleFileUpload = async () => {
    if (!file || !selectedDatabase || !selectedProbe) {
      alert('파일 업로드 전에 데이터베이스, 프로브, 파일을 선택해주세요.');
      return;
    }

    setIsLoading(true);
    const { id: probeId, name: probeName } = selectedProbe;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('database', selectedDatabase);
    formData.append('probeId', probeId);
    formData.append('probeName', probeName);

    try {
      // 파일 업로드 및 처리 요청
      const response = await fetch(`${API_BASE_URL}/api/measset-generation`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`파일 처리 실패: ${errorText}`);
      }

      const data = await response.json();
      if (data.status === 'success' && data.csv_key) {
        // CSV 데이터 요청
        const csvResponse = await fetch(`${API_BASE_URL}/api/csv-data?csv_key=${data.csv_key}`, {
          method: 'GET',
          credentials: 'include',
        });
        
        if (!csvResponse.ok) throw new Error('CSV 데이터를 가져오는데 실패했습니다');
        
        const csvResult = await csvResponse.json();
        if (csvResult.status === 'success' && csvResult.data) {
          const parsedData = parseCSV(csvResult.data);
          setCsvData(parsedData);
          
          // 세션 스토리지 초기화
          sessionStorage.setItem('csvData', JSON.stringify(parsedData));
          setDataModified(false);
          setError(null);
          return parsedData;
        } else {
          setError('잘못된 CSV 데이터가 수신되었습니다');
        }
      } else {
        setError('CSV 생성에 실패했습니다');
      }
    } catch (err) {
      console.error('오류:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // CSV 데이터를 데이터베이스에 삽입
  const parseDatabase = async () => {
    if (!csvData || csvData.length === 0) {
      alert('CSV 데이터가 없습니다.');
      return;
    }
    
    if (!selectedDatabase || !selectedProbe) {
      alert('데이터베이스와 프로브를 선택해주세요.');
      return;
    }

    // 데이터가 수정되었다면 세션 스토리지에서 최신 데이터 가져오기
    if (dataModified) {
      const latestData = sessionStorage.getItem('csvData');
      if (latestData) {
        try {
          const parsedData = JSON.parse(latestData);
          setCsvData(parsedData);
        } catch (err) {
          console.error('최신 데이터 파싱 오류:', err);
        }
      }
    }

    setIsLoading(true);
    
    try {
      const requestData = {
        database: selectedDatabase,
        table: 'meas_setting',
        data: csvData,
      };
      
      const response = await fetch(`${API_BASE_URL}/api/insert-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SQL 삽입 실패: ${errorText}`);
      }
      
      await response.json();
      alert('SQL 데이터가 성공적으로 삽입되었습니다!');
      setDataModified(false);
    } catch (err) {
      console.error('오류:', err);
      setError('SQL 삽입 처리에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // 새 창에서 CSV 데이터 보기
  const openDataInNewWindow = (data) => {
    // 이미 열린 창이 있으면 닫기
    if (dataWindowReference && !dataWindowReference.closed) {
      dataWindowReference.close();
    }

    const csvDataToUse = data || csvData;
    if (!csvDataToUse || csvDataToUse.length === 0) {
      alert('표시할 CSV 데이터가 없습니다.');
      return;
    }

    // temperature가 포함된 데이터 필터링
    const firstColumnName = Object.keys(csvDataToUse[0])[1];
    const filteredData = csvDataToUse.filter(row => {
      const firstColumnValue = String(row[firstColumnName] || '').toLowerCase();
      return firstColumnValue.includes('temperature');
    });
    
    if (filteredData.length === 0) {
      alert('temperature가 포함된 데이터가 없습니다.');
      return;
    }

    // 수정 가능한 열 설정 (2번째, 7번째, 8번째 열)
    const editableColumns = {
      columns: Object.keys(filteredData[0]),
      editableIndices: [1, 7, 8],
    };

    // 세션 스토리지 설정
    sessionStorage.setItem('csvData', JSON.stringify(filteredData));
    sessionStorage.setItem('editableColumns', JSON.stringify(editableColumns));
    sessionStorage.setItem('dataWindowOpen', 'open');
    sessionStorage.setItem('parentWindowId', window.name || 'main');

    // 현재 데이터를 별도로 저장 (창 닫힘 시 비교용)
    const originalDataSnapshot = JSON.stringify(filteredData);

    // 새 창 열기
    const newWindow = window.open('/data-view', '측정 데이터', 'width=1000,height=800');
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
        data: filteredData,
        editableColumns: editableColumns
      }, '*');
    };

    // 창이 닫힐 때 이벤트 처리
    newWindow.onbeforeunload = () => {
      sessionStorage.setItem('dataWindowOpen', 'closed');
      setDataWindowReference(null);
      
      // 창이 닫힐 때 최신 데이터 확인
      const updatedData = sessionStorage.getItem('csvData');
      if (updatedData) {
        // 데이터가 변경되었는지 비교
        if (updatedData !== originalDataSnapshot) {
          try {
            const parsedData = JSON.parse(updatedData);
            setCsvData(parsedData);
            setDataModified(true);
          } catch (err) {
            console.error('창 닫힘 처리 중 데이터 파싱 오류:', err);
          }
        } else {
          // 변경이 없으면 dataModified를 false로 유지
          setDataModified(false);
        }
      }
    };
  };

  // 데이터 수정 메시지 표시
  const renderModifiedMessage = () => {
    if (dataModified) {
      return (
        <div className="alert alert-info mt-3">
          <strong>데이터가 수정되었습니다.</strong> SQL로 저장하기 전에 변경 사항을 확인하세요.
        </div>
      );
    }
    return null;
  };

  // 데이터 새로고침
  const refreshData = () => {
    const storedData = sessionStorage.getItem('csvData');
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        setCsvData(parsedData);
        setDataModified(true);
        alert('데이터가 새로고침되었습니다.');
      } catch (err) {
        console.error('데이터 새로고침 오류:', err);
        alert('데이터 새로고침 중 오류가 발생했습니다.');
      }
    } else {
      alert('새로고침할 데이터가 없습니다.');
    }
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">MeasSet Generation</h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {/* 데이터베이스 선택 */}
            <div className="col-md-4">
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
                <option value="">Select Database</option>
                {DBList.map((db, index) => (
                  <option key={index} value={db}>
                    {db}
                  </option>
                ))}
              </select>
            </div>
            
            {/* 프로브 선택 */}
            <div className="col-md-4">
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
                <option value="">Select Transducer</option>
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
            
            {/* 파일 선택 */}
            <div className="col-md-4">
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
            
            {/* CSV 파일 생성 버튼 */}
            <div className="col-md-4">
              <button
                className="btn btn-primary w-100"
                onClick={() => {
                  handleFileUpload().then((parsedData) => {
                    if (parsedData) {
                      openDataInNewWindow(parsedData);
                    }
                  });
                }}
                disabled={!selectedDatabase || !selectedProbe || !file || isLoading}
              >
                {isLoading ? '처리 중...' : 'CSV 파일 생성'}
              </button>
            </div>
            
            {/* CSV 데이터 새 창에서 보기 버튼 */}
            <div className="col-md-4">
              <button
                className="btn btn-success w-100"
                onClick={() => openDataInNewWindow()}
                disabled={!csvData || csvData.length === 0}
              >
                {isLoading ? '처리 중...' : `데이터 ${dataModified ? '(수정됨)' : ''} 새 창에서 보기`}
              </button>
            </div>
            
            {/* SQL 데이터 삽입 버튼 */}
            <div className="col-md-4">
              <button
                className="btn btn-primary w-100"
                onClick={parseDatabase}
                disabled={!selectedDatabase || !selectedProbe || !csvData || isLoading}
              >
                {isLoading ? '처리 중...' : 'SQL 데이터베이스로'}
              </button>
            </div>
            
            {/* 데이터 새로고침 버튼 */}
            {dataModified && (
              <div className="col-md-12 mt-2">
                <button
                  className="btn btn-outline-primary"
                  onClick={refreshData}
                >
                  데이터 새로고침
                </button>
              </div>
            )}
          </div>
          {renderModifiedMessage()}
          {error && <div className="alert alert-danger mt-3">{error}</div>}
        </div>
      </div>
    </div>
  );
}