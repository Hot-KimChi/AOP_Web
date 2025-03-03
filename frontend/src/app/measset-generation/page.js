// src/app/measset-generation/page.js
'use client';

import { useState, useEffect, useRef } from 'react';

export default function MeasSetGen() {
  const [probeList, setProbeList] = useState([]);
  const [DBList, setDBList] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedProbe, setSelectedProbe] = useState(null);
  const [file, setFile] = useState(null);
  const [sqlFile, setSqlFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const sqlFileInputRef = useRef(null);
  const [csvKey, setCsvKey] = useState(null);
  const [dataModified, setDataModified] = useState(false); // 데이터 수정 여부를 추적하는 상태

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

// 수정된 useEffect 훅 - 데이터 수정 감지를 위한 이벤트 핸들러
useEffect(() => {
  const handleStorageChange = (event) => {
    // storage 이벤트가 발생했을 때만 처리
    if (event && event.key === 'csvData') {
      try {
        const updatedData = JSON.parse(event.newValue);
        if (updatedData) {
          setCsvData(updatedData);
          setDataModified(true); // 데이터가 수정되었음을 표시
        }
      } catch (error) {
        console.error('수정된 데이터 파싱 실패:', error);
      }
    }
  };

  // 스토리지 변경 이벤트 리스너 등록
  window.addEventListener('storage', handleStorageChange);

  // 팝업 창이 닫힐 때 이벤트 처리
  const checkPopupClosed = setInterval(() => {
    if (sessionStorage.getItem('dataWindowOpen') === 'closed') {
      // 팝업 창이 닫혔으면 sessionStorage에서 최신 데이터를 가져옴
      const updatedData = sessionStorage.getItem('csvData');
      if (updatedData) {
        try {
          const parsedData = JSON.parse(updatedData);
          setCsvData(parsedData);
          setDataModified(true); // 데이터가 수정되었음을 표시
        } catch (error) {
          console.error('수정된 데이터 파싱 실패:', error);
        }
      }
      sessionStorage.removeItem('dataWindowOpen');
      clearInterval(checkPopupClosed);
    }
  }, 500);

  // window 메시지 이벤트 리스너 추가
  const handleMessageEvent = (event) => {
    if (event.data && event.data.type === 'DATA_MODIFIED') {
      setCsvData(event.data.data);
      setDataModified(true);
    }
  };
  window.addEventListener('message', handleMessageEvent);

  // 클린업 함수
  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('message', handleMessageEvent);
    clearInterval(checkPopupClosed);
  };
}, []);

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
      } catch (error) {
        console.error('데이터베이스 목록 가져오기 실패:', error);
        setError('데이터베이스 목록을 가져오는데 실패했습니다');
      }
    };
    fetchDatabases();
  }, []);

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
        } catch (error) {
          console.error('프로브 목록 가져오기 실패:', error);
          setError('프로브 목록을 가져오는데 실패했습니다');
        } finally {
          setIsLoading(false);
        }
      };
      fetchProbes();
    } else {
      setProbeList([]);
    }
  }, [selectedDatabase]);

  const handleFileChange = (event) => setFile(event.target.files[0]);
  const handleSqlFileChange = (event) => setSqlFile(event.target.files[0]);

  // handleFileUpload: CSV 데이터를 파싱한 후 반환하도록 수정
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
        setCsvKey(data.csv_key);
        const csvResponse = await fetch(`${API_BASE_URL}/api/csv-data?csv_key=${data.csv_key}`, {
          method: 'GET',
          credentials: 'include',
        });
  
        if (!csvResponse.ok) throw new Error('CSV 데이터를 가져오는데 실패했습니다');
        const csvResult = await csvResponse.json();
        if (csvResult.status === 'success' && csvResult.data) {
          const parsedData = parseCSV(csvResult.data);
          setCsvData(parsedData);
          setDataModified(false); // 새로운 데이터를 받았으므로 수정 상태 초기화
          setError(null);
          return parsedData; // 파싱된 데이터를 반환
        } else {
          setError('잘못된 CSV 데이터가 수신되었습니다');
        }
      } else {
        setError('CSV 생성에 실패했습니다');
      }
    } catch (error) {
      console.error('오류:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

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

  const parseDatabase = async () => {
    // 수정된 데이터가 있는지 확인하고 해당 데이터를 사용
    const dataToSend = csvData;
    
    if (!dataToSend || dataToSend.length === 0) {
      alert('CSV 데이터가 없습니다.');
      return;
    }
  
    if (!selectedDatabase || !selectedProbe) {
      alert('데이터베이스와 프로브를 선택해주세요.');
      return;
    }
  
    setIsLoading(true);
    try {
      // 데이터 전송
      const requestData = {
        database: selectedDatabase,
        table: 'meas_setting',
        data: dataToSend,
      };
  
      const response = await fetch(`${API_BASE_URL}/api/insert-sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestData),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SQL 삽입 실패: ${errorText}`);
      }
  
      const data = await response.json();
      alert('SQL 데이터가 성공적으로 삽입되었습니다!');
      setDataModified(false); // 데이터가 저장되었으므로 수정 상태 초기화
    } catch (error) {
      console.error('오류:', error);
      setError('SQL 삽입 처리에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // 수정된 openDataInNewWindow: 팝업 창 열기 전에 sessionStorage 상태 설정
  const openDataInNewWindow = (data) => {
    // 데이터가 명시적으로 전달되지 않았다면 현재 상태의 csvData 사용
    // 이미 수정된 데이터가 csvData에 반영되어 있다면 그것을 사용
    const csvDataToUse = data || csvData;
    if (!csvDataToUse || csvDataToUse.length === 0) {
      alert('표시할 CSV 데이터가 없습니다.');
      return;
    }
    
    // 데이터의 첫 번째 열에 'temperature'가 포함된 항목만 필터링
    const firstColumnName = Object.keys(csvDataToUse[0])[0]; // 첫 번째 열 이름 가져오기
    const filteredData = csvDataToUse.filter(row => {
      const firstColumnValue = String(row[firstColumnName] || '').toLowerCase();
      return firstColumnValue.includes('temperature');
    });
    
    if (filteredData.length === 0) {
      alert('temperature가 포함된 데이터가 없습니다.');
      return;
    }
    
    // 열 인덱스를 저장하여 7번째, 8번째 열을 표시할 때 수정 가능하게 함
    const editableColumns = {
      columns: Object.keys(filteredData[0]),
      editableIndices: [6, 7] // 0-based 인덱스, 7번째와 8번째 열
    };
    
    // 세션 스토리지에 데이터 저장
    sessionStorage.setItem('csvData', JSON.stringify(filteredData));
    sessionStorage.setItem('editableColumns', JSON.stringify(editableColumns));
    sessionStorage.setItem('dataWindowOpen', 'open'); // 팝업 창 상태 추적
    
    const newWindow = window.open('/data-view', '측정 데이터', 'width=1000,height=800');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      alert('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
    }
  
    // 팝업 창이 닫힐 때 이벤트 처리
    if (newWindow) {
      newWindow.onbeforeunload = () => {
        sessionStorage.setItem('dataWindowOpen', 'closed');
      };
    }
  };

  // 수정된 데이터가 있는지 확인하는 메시지 표시
  const renderModifiedMessage = () => {
    if (dataModified) {
      return (
        <div className="alert alert-info mt-3">
          <strong>데이터가 수정되었습니다.</strong> 수정된 데이터를 데이터베이스에 저장하려면 'SQL 데이터베이스로' 버튼을 클릭하세요.
        </div>
      );
    }
    return null;
  };

  return (
    <div className="container mt-4">
      <div className="card shadow-sm">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">MeasSet Generation</h5>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {/* 데이터베이스, 프로브, 파일 입력 UI */}
            <div className="col-md-4">
              <label htmlFor="databaseSelect" className="form-label">데이터베이스 선택</label>
              <select
                id="databaseSelect"
                className="form-select"
                value={selectedDatabase}
                onChange={(e) => setSelectedDatabase(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Select Database</option>
                {DBList.map((db, index) => (
                  <option key={index} value={db}>{db}</option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label htmlFor="probeSelect" className="form-label">프로브 선택</label>
              <select
                id="probeSelect"
                className="form-select"
                value={selectedProbe ? JSON.stringify(selectedProbe) : ''}
                onChange={(e) => setSelectedProbe(JSON.parse(e.target.value))}
                disabled={isLoading || !selectedDatabase}
              >
                <option value="">Select Transducer</option>
                {probeList.map((probe) => (
                  <option key={probe.probeId} value={JSON.stringify({ id: probe.probeId, name: probe.probeName })}>
                    {probe.probeName} ({probe.probeId})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label htmlFor="fileInput" className="form-label">파일 선택</label>
              <input
                type="file"
                id="fileInput"
                className="form-control"
                onChange={handleFileChange}
                disabled={isLoading}
              />
            </div>
            <input
              type="file"
              ref={sqlFileInputRef}
              style={{ display: 'none' }}
              onChange={handleSqlFileChange}
            />
            <div className="col-md-4">
              <button
                className="btn btn-primary w-100"
                onClick={() => {
                  handleFileUpload().then((parsedData) => {
                    // 전달받은 parsedData가 존재하면 새 창에서 데이터를 보여줌
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
            <div className="col-md-4">
              <button
                className="btn btn-success w-100"
                onClick={() => openDataInNewWindow()}
                disabled={!csvData || csvData.length === 0}
              >
                {isLoading ? '처리 중...' : `데이터 ${dataModified ? '(수정됨) ' : ''}새 창에서 보기`}
              </button>
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-primary w-100"
                onClick={parseDatabase}
                disabled={!selectedDatabase || !selectedProbe || !csvData || isLoading}
              >
                {isLoading ? '처리 중...' : 'SQL 데이터베이스로'}
              </button>
            </div>
          </div>
          {renderModifiedMessage()}
          {error && <div className="alert alert-danger mt-3">{error}</div>}
        </div>
      </div>
    </div>
  );
}