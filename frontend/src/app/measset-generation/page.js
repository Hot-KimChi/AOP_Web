// src/app/measset-generation/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import DataTable from '../../components/DataTable';

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

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

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
    if (!csvData || csvData.length === 0) {
      alert('CSV 데이터가 없습니다.');
      return;
    }
  
    if (!selectedDatabase || !selectedProbe) {
      alert('데이터베이스와 프로브를 선택해주세요.');
      return;
    }
  
    setIsLoading(true);
    try {
      // csvData는 이미 DataFrame을 JSON으로 표현한(객체 배열) 상태입니다.
      const dataToSend = {
        database: selectedDatabase,
        table: 'meas_setting',
        data: csvData, // DataFrame의 JSON 직렬화된 형태 (예: [{...}, {...}, ...])
      };
  
      const response = await fetch(`${API_BASE_URL}/api/insert-sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(dataToSend),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SQL 삽입 실패: ${errorText}`);
      }
  
      const data = await response.json();
      alert('SQL 데이터가 성공적으로 삽입되었습니다!');
    } catch (error) {
      console.error('오류:', error);
      setError('SQL 삽입 처리에 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // openDataInNewWindow: 전달받은 data를 우선 사용하고, 없으면 csvData 사용
  const openDataInNewWindow = (data) => {
    const csvDataToUse = data || csvData;
    if (!csvDataToUse || csvDataToUse.length === 0) {
      alert('표시할 CSV 데이터가 없습니다.');
      return;
    }
    
    sessionStorage.setItem('csvData', JSON.stringify(csvDataToUse));
    const newWindow = window.open('/data-view', '측정 데이터', 'width=1000,height=800');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      alert('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.');
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
                <option value="">데이터베이스 선택</option>
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
                <option value="">프로브 선택</option>
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
                    openDataInNewWindow(parsedData);
                  });
                }}
                disabled={!selectedDatabase || !selectedProbe || !file || isLoading}
              >
                {isLoading ? '처리 중...' : 'CSV 파일 생성'}
              </button>
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-primary w-100"
                onClick={parseDatabase}
                disabled={!selectedDatabase || !selectedProbe || isLoading}
              >
                {isLoading ? '처리 중...' : sqlFile ? 'SQL 데이터베이스에 삽입' : 'SQL 데이터베이스로'}
              </button>
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-success w-100"
                onClick={() => openDataInNewWindow()}
                disabled={!csvData || csvData.length === 0}
              >
                데이터 새 창에서 보기
              </button>
            </div>
          </div>
          {error && <div className="alert alert-danger mt-3">{error}</div>}
        </div>
      </div>
    </div>
  );
}
