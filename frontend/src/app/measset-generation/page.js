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
  const [filterCsvData, setFilterCsvData] = useState(null);      // CSV 데이터 (필터링된)
  const [fullCsvData, setFullCsvData] = useState(null);          // 전체 CSV 데이터
  const [dataModified, setDataModified] = useState(false);       // 데이터 수정 여부
  const [dataWindowReference, setDataWindowReference] = useState(null); // 데이터 창 참조
  const [updatedCount, setUpdatedCount] = useState(0);           // 업데이트된 데이터 수

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
        console.log('필터링된 데이터 업데이트됨:', parsedData);
        
        // 전체 데이터에 업데이트 적용
        if (fullCsvData) {
          // 세션 스토리지에서 최신 전체 데이터 가져오기
          const storedFullData = sessionStorage.getItem('fullCsvData');
          const currentFullData = storedFullData ? JSON.parse(storedFullData) : fullCsvData;
          
          const updatedFullData = updateFullData(currentFullData, parsedData);
          setFullCsvData(updatedFullData);
          
          // 세션 스토리지에 전체 데이터 저장
          sessionStorage.setItem('fullCsvData', JSON.stringify(updatedFullData));
          
          // 필터링된 데이터도 업데이트
          setFilterCsvData(parsedData);
          sessionStorage.setItem('csvData', JSON.stringify(parsedData));
        } else {
          // 전체 데이터가 없는 경우 (비정상 상황)
          setFilterCsvData(parsedData);
          sessionStorage.setItem('csvData', JSON.stringify(parsedData));
        }
        
        setDataModified(true);
      }
    } catch (err) {
      console.error('CSV 데이터 파싱 실패:', err);
    }
  };

  // updateFullData 함수 수정 - 새로운 행은 전체 데이터에 반영하지 않음
  const updateFullData = (fullData, updatedFilteredData) => {
    if (!fullData || !updatedFilteredData) {
      console.error('updateFullData: 데이터가 없습니다.', { fullData, updatedFilteredData });
      return fullData;
    }
    
    // 깊은 복사 생성
    const newFullData = JSON.parse(JSON.stringify(fullData));
    let updateCount = 0;
    
    // 인덱스 키를 정규화하는 함수
    const normalizeKey = (obj) => {
      // 가능한 인덱스 키 변형들
      const possibleKeys = ['groupIndex', 'GroupIndex', 'groupindex', 'GROUPINDEX'];
      
      // 객체에 존재하는 키 찾기
      for (const key of possibleKeys) {
        if (obj[key] !== undefined) {
          return { key, value: obj[key] };
        }
      }
      return null;
    };
    
    // 전체 행 동등성 비교 함수
    const isRowEqual = (row1, row2) => {
      const keys1 = Object.keys(row1);
      const keys2 = Object.keys(row2);
      if (keys1.length !== keys2.length) return false;
      return keys1.every(key => row1[key] === row2[key]);
    };
    
    // 전체 데이터에 존재하는 행인지 확인하는 함수
    const existsInFullData = (filteredRow) => {
      return newFullData.some(fullRow => {
        // groupIndex가 같고, 전체 행이 동일한지 확인
        const filteredIndexInfo = normalizeKey(filteredRow);
        const fullIndexInfo = normalizeKey(fullRow);
        
        if (!filteredIndexInfo || !fullIndexInfo) return false;
        
        // groupIndex가 같은 행들 중에서 전체 내용이 일치하는 행이 있는지 확인
        return filteredIndexInfo.value === fullIndexInfo.value && 
               Object.keys(filteredRow).every(key => 
                 key === 'maxTxVoltageVolt' || key === 'ceilTxVoltageVolt' || 
                 filteredRow[key] === fullRow[key]
               );
      });
    };
    
    // 디버깅을 위해 필터링된 데이터 샘플 출력
    console.log('필터링된 데이터 샘플:', updatedFilteredData.slice(0, 2));
    
    // 기존 행만 업데이트 맵에 포함 (새로운 행은 제외)
    const updatedMap = new Map();
    updatedFilteredData.forEach(filteredRow => {
      const indexInfo = normalizeKey(filteredRow);
      
      if (indexInfo && existsInFullData(filteredRow)) {
        updatedMap.set(indexInfo.value, filteredRow);
      } else if (!indexInfo) {
        console.warn('groupIndex가 없는 필터링된 행:', filteredRow);
      } else {
        console.log('새로운 행이므로 전체 데이터 업데이트에서 제외:', filteredRow);
      }
    });
    
    console.log(`업데이트 맵 크기 (기존 행만): ${updatedMap.size}`);
    
    // 전체 데이터 순회하며 기존 행만 업데이트
    newFullData.forEach((fullRow, index) => {
      const indexInfo = normalizeKey(fullRow);
      
      if (!indexInfo) {
        console.warn(`전체 데이터 행 ${index}에 groupIndex가 없습니다:`, fullRow);
        return; // 이 행은 건너뜀
      }
      
      // 정규화된 인덱스 값으로 맵에서 찾기
      const updatedRow = updatedMap.get(indexInfo.value);
      
      if (updatedRow) {
        let rowUpdated = false;
        
        // 수정 가능한 열을 maxTxVoltageVolt와 ceilTxVoltageVolt로 제한
        const editableKeys = ['maxTxVoltageVolt', 'ceilTxVoltageVolt'];
        
        // 특별히 수정 가능한 열에 대해서만 업데이트
        editableKeys.forEach(key => {
          if (updatedRow[key] !== undefined && fullRow[key] !== updatedRow[key]) {
            console.log(`행 ${index}의 ${key} 열 업데이트: '${fullRow[key]}' -> '${updatedRow[key]}'`);
            fullRow[key] = updatedRow[key];
            rowUpdated = true;
          }
        });
        
        if (rowUpdated) {
          updateCount++;
        }
      }
    });
    
    // 업데이트 수 설정
    console.log(`총 ${updateCount}개의 기존 데이터가 업데이트되었습니다.`);
    
    return newFullData;
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
          // URL 객체를 사용하여 더 안전하게 URL과 파라미터 구성
          const url = new URL(`${API_BASE_URL}/api/get_probes`);
          url.searchParams.append('database', selectedDatabase);
          url.searchParams.append('table', 'probe_geo');

          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`에러 응답: ${response.status} - ${errorText}`);
            throw new Error(`프로브 목록을 가져오는데 실패했습니다: ${response.status}`);
          }
          
          const data = await response.json();
          console.log('받은 데이터:', data); // 디버깅용 로그
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

  // 파일 업로드 및 CSV 데이터 생성을 위한 공통 함수
  const processFileUpload = async (file, selectedDatabase, selectedProbe) => {
    if (!file || !selectedDatabase || !selectedProbe) {
      throw new Error('파일 업로드 전에 데이터베이스, 프로브, 파일을 선택해주세요.');
    }

    const { id: probeId, name: probeName } = selectedProbe;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('database', selectedDatabase);
    formData.append('probeId', probeId);
    formData.append('probeName', probeName);

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
    
    if (data.status === 'success' && data.data) {
      return data.data;
    } else if (data.status === 'success' && data.csv_key) {
      // CSV 데이터 요청
      const csvResponse = await fetch(`${API_BASE_URL}/api/csv-data?csv_key=${data.csv_key}`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!csvResponse.ok) throw new Error('CSV 데이터를 가져오는데 실패했습니다');
      
      const csvResult = await csvResponse.json();
      if (csvResult.status === 'success' && csvResult.data) {
        return csvResult.data;
      }
    }
    
    throw new Error('잘못된 CSV 데이터가 수신되었습니다');
  };

  // 데이터 필터링 및 저장 공통 함수
  const processAndSaveData = (csvData) => {
    const parsedData = parseCSV(csvData);
    
    // 전체 데이터 저장
    setFullCsvData(parsedData);
    sessionStorage.setItem('fullCsvData', JSON.stringify(parsedData));
    
    // 필터링된 데이터 생성
    const firstColumnName = Object.keys(parsedData[0])[1];
    const filteredData = parsedData.filter(row => {
      const firstColumnValue = String(row[firstColumnName] || '').toLowerCase();
      return firstColumnValue.includes('temperature');
    });
    
    // 필터링된 데이터 저장
    setFilterCsvData(filteredData);
    sessionStorage.setItem('csvData', JSON.stringify(filteredData));
    
    setDataModified(false);
    setUpdatedCount(0);
    
    return { parsedData, filteredData };
  };

  // CSV 파일 업로드 및 처리
  const handleFileUpload = async () => {
    if (!file || !selectedDatabase || !selectedProbe) {
      alert('파일 업로드 전에 데이터베이스, 프로브, 파일을 선택해주세요.');
      return;
    }

    setIsLoading(true);
    
    try {
      const csvData = await processFileUpload(file, selectedDatabase, selectedProbe);
      const { parsedData, filteredData } = processAndSaveData(csvData);
      setError(null);
      return filteredData; // 필터링된 데이터 반환
    } catch (err) {
      console.error('오류:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // 최신 데이터를 세션 스토리지에서 가져오기
  const getLatestData = () => {
    // 세션 스토리지에서 최신 데이터 가져오기
    const storedFullData = sessionStorage.getItem('fullCsvData');
    
    if (storedFullData) {
      try {
        return JSON.parse(storedFullData);
      } catch (err) {
        console.error('세션 스토리지 데이터 파싱 실패:', err);
      }
    }
    
    // 저장된 데이터가 없으면 현재 state의 데이터를 사용
    return fullCsvData;
  };

  // SQL 데이터를 데이터베이스에 삽입
  const parseDatabase = async () => {
    if (!selectedDatabase || !selectedProbe) {
      alert('데이터베이스와 프로브를 선택해주세요.');
      return;
    }

    // 1. 팝업 창이 열려있다면 최신 데이터 요청 및 대기
    if (dataWindowReference && !dataWindowReference.closed) {
      try {
        console.log('팝업 창에 최신 데이터 요청 중...');
        dataWindowReference.postMessage({ type: 'REQUEST_LATEST_DATA' }, '*');
        
        // 데이터 동기화를 위한 충분한 대기 시간
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.error('팝업 창 데이터 요청 중 오류:', err);
      }
    }

    // 2. 세션 스토리지에서 최신 데이터 가져오기
    const storedFilteredData = sessionStorage.getItem('csvData');
    const storedFullData = sessionStorage.getItem('fullCsvData');
    
    console.log('세션 스토리지 데이터 확인:', {
      storedFilteredData: storedFilteredData ? '있음' : '없음',
      storedFullData: storedFullData ? '있음' : '없음'
    });
    
    // 3. 데이터 변수 초기화
    let latestFilteredData = null;
    let latestFullData = null;
    
    try {
      // 세션 스토리지의 필터링된 데이터가 있으면 파싱
      if (storedFilteredData) {
        latestFilteredData = JSON.parse(storedFilteredData);
        console.log(`세션 스토리지에서 ${latestFilteredData.length}개의 필터링 데이터 로드됨`);
      } else if (filterCsvData) {
        latestFilteredData = filterCsvData;
        console.log(`상태에서 ${latestFilteredData.length}개의 필터링 데이터 로드됨`);
      }
      
      // 세션 스토리지의 전체 데이터가 있으면 파싱
      if (storedFullData) {
        latestFullData = JSON.parse(storedFullData);
        console.log(`세션 스토리지에서 ${latestFullData.length}개의 전체 데이터 로드됨`);
      } else if (fullCsvData) {
        latestFullData = fullCsvData;
        console.log(`상태에서 ${latestFullData.length}개의 전체 데이터 로드됨`);
      }
    } catch (err) {
      console.error('세션 스토리지 데이터 파싱 오류:', err);
      alert('데이터 파싱 중 오류가 발생했습니다.');
      return;
    }

    // 4. 데이터 체크 및 필요시 파일 업로드
    if (!latestFilteredData || !latestFullData) {
      if (!file) {
        alert('파일을 업로드하거나 데이터를 먼저 생성해주세요.');
        return;
      }
      
      // 파일 업로드 처리
      const uploadedData = await handleFileUpload();
      if (!uploadedData) {
        alert('데이터 생성에 실패했습니다.');
        return;
      }
      
      // 새로운 데이터 로드
      latestFilteredData = uploadedData;
      latestFullData = fullCsvData;
    }

    // 5. 필터링된 데이터의 변경사항을 전체 데이터에 동기화 - 기존 행만 업데이트, 새로운 행은 제외
  if (latestFilteredData && latestFilteredData.length > 0 && latestFullData && latestFullData.length > 0) {
    console.log('필터링된 데이터를 전체 데이터에 반영하는 중...');
    
    // 인덱스 키를 정규화하는 함수
    const normalizeKey = (obj) => {
      // 가능한 인덱스 키 변형들
      const possibleKeys = ['groupIndex', 'GroupIndex', 'groupindex', 'GROUPINDEX'];
      
      // 객체에 존재하는 키 찾기
      for (const key of possibleKeys) {
        if (obj[key] !== undefined) {
          return { key, value: obj[key] };
        }
      }
      return null;
    };
    
    // 전체 데이터에 존재하는 행인지 확인하는 함수
    const existsInFullData = (filteredRow) => {
      return latestFullData.some(fullRow => {
        // groupIndex가 같고, 전체 행이 동일한지 확인 (편집 가능한 열 제외)
        const filteredIndexInfo = normalizeKey(filteredRow);
        const fullIndexInfo = normalizeKey(fullRow);
        
        if (!filteredIndexInfo || !fullIndexInfo) return false;
        
        // groupIndex가 같은 행들 중에서 편집 불가능한 열들이 모두 일치하는 행이 있는지 확인
        return filteredIndexInfo.value === fullIndexInfo.value && 
               Object.keys(filteredRow).every(key => 
                 key === 'maxTxVoltageVolt' || key === 'ceilTxVoltageVolt' || 
                 filteredRow[key] === fullRow[key]
               );
      });
    };
    
    // 기존 행만 업데이트 맵에 포함 (새로운 행은 제외)
    const updatedMap = new Map();
    
    // 디버깅을 위해 필터링된 데이터 샘플 출력
    console.log('필터링된 데이터 샘플:', latestFilteredData.slice(0, 2));
    
    latestFilteredData.forEach(filteredRow => {
      const indexInfo = normalizeKey(filteredRow);
      
      if (indexInfo && existsInFullData(filteredRow)) {
        updatedMap.set(indexInfo.value, filteredRow);
      } else if (!indexInfo) {
        console.warn('groupIndex가 없는 필터링된 행:', filteredRow);
      } else {
        console.log('새로운 행이므로 전체 데이터 업데이트에서 제외:', filteredRow);
      }
    });
    
    console.log(`업데이트 맵 크기 (기존 행만): ${updatedMap.size}`);
    
    // 전체 데이터 순회하며 기존 행만 업데이트
    let updateCount = 0;
    const updatedFullData = latestFullData.map(fullRow => {
      const indexInfo = normalizeKey(fullRow);
      
      if (!indexInfo) {
        console.warn(`전체 데이터 행에 groupIndex가 없습니다:`, fullRow);
        return fullRow;
      }
      
      // 정규화된 인덱스 값으로 맵에서 찾기
      const updatedRow = updatedMap.get(indexInfo.value);
      
      if (updatedRow) {
        let rowUpdated = false;
        
        // 수정 가능한 열을 maxTxVoltageVolt와 ceilTxVoltageVolt로 제한
        const editableKeys = ['maxTxVoltageVolt', 'ceilTxVoltageVolt'];
        
        // 수정된 행 복사본 생성
        const newRow = { ...fullRow };
        
        // 특별히 수정 가능한 열에 대해서만 업데이트
        editableKeys.forEach(key => {
          if (updatedRow[key] !== undefined && fullRow[key] !== updatedRow[key]) {
            console.log(`행의 ${key} 열 업데이트: '${fullRow[key]}' -> '${updatedRow[key]}'`);
            newRow[key] = updatedRow[key];
            rowUpdated = true;
          }
        });
        
        if (rowUpdated) {
          updateCount++;
          return newRow;
        }
      }
      
      return fullRow;
    });
    
    console.log(`총 ${updateCount}개의 기존 데이터 행이 동기화되었습니다.`);
    setUpdatedCount(updateCount);
    
    // 업데이트된 전체 데이터를 사용
    latestFullData = updatedFullData;
    
    // 업데이트된 데이터를 상태와 세션 스토리지에 저장
    setFullCsvData(updatedFullData);
    sessionStorage.setItem('fullCsvData', JSON.stringify(updatedFullData));
  }

      // 6. 최종적으로 SQL에 저장
    setIsLoading(true);
    try {
      if (!latestFullData || latestFullData.length === 0) {
        throw new Error('저장할 데이터가 없습니다.');
      }
      
      // 신규행: filteredData에서 전체데이터에 존재하지 않는 행
      // 행 동등성 비교 함수 (편집 가능한 열 제외)
      const isRowEqual = (row1, row2) => {
        const keys1 = Object.keys(row1);
        const keys2 = Object.keys(row2);
        if (keys1.length !== keys2.length) return false;
        
        // maxTxVoltageVolt와 ceilTxVoltageVolt를 제외한 모든 열이 같은지 확인
        return keys1.every(key => {
          if (key === 'maxTxVoltageVolt' || key === 'ceilTxVoltageVolt') {
            return true; // 이 열들은 비교에서 제외
          }
          return row1[key] === row2[key];
        });
      };
      
      // 필터링된 데이터에서 새로운 행 찾기
      const newRows = latestFilteredData 
        ? latestFilteredData.filter(fRow => !latestFullData.some(fullRow => isRowEqual(fRow, fullRow)))
        : [];
      
      console.log(`발견된 새로운 행 수: ${newRows.length}`);
      if (newRows.length > 0) {
        console.log('새로운 행들:', newRows);
      }
      
      // 전체데이터 + 신규행만 DB에 저장
      // 신규행은 groupIndex 중복과 상관없이 모두 추가됨
      const mergedData = [...latestFullData, ...newRows];
      console.log('SQL에 저장할 데이터(최종, 전체데이터+신규행, 신규행 내 groupIndex 중복 허용):', mergedData);
      const requestData = {
        database: selectedDatabase,
        table: 'meas_setting',
        data: mergedData,
      };
      const sqlResponse = await fetch(`${API_BASE_URL}/api/insert-sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestData),
      });
      if (!sqlResponse.ok) {
        const text = await sqlResponse.text();
        throw new Error(`SQL 삽입 실패: ${text}`);
      }
      const result = await sqlResponse.json();
      console.log('SQL 삽입 결과:', result);
      setError(null);
      setDataModified(false);
      alert('SQL 데이터가 성공적으로 삽입되었습니다!');
    } catch (err) {
      console.error('SQL 삽입 오류:', err);
      setError(err.message);
      alert(`SQL 삽입 오류: ${err.message}`);
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

    // 최신 세션 스토리지 데이터 사용
    const latestSessionData = sessionStorage.getItem('csvData');
    const filteredDataToUse = data || 
                           (latestSessionData ? JSON.parse(latestSessionData) : filterCsvData);
                           
    if (!filteredDataToUse || filteredDataToUse.length === 0) {
      alert('표시할 CSV 데이터가 없습니다.');
      return;
    }

    // 수정 가능한 열 설정 (2번째, 7번째, 8번째 열)
    const editableColumns = {
      columns: Object.keys(filteredDataToUse[0]),
      editableIndices: [1, 7, 8, 14],
    };

    // 세션 스토리지 설정
    sessionStorage.setItem('csvData', JSON.stringify(filteredDataToUse));
    sessionStorage.setItem('editableColumns', JSON.stringify(editableColumns));
    sessionStorage.setItem('dataWindowOpen', 'open');
    sessionStorage.setItem('parentWindowId', window.name || 'main');

    // 현재 데이터를 별도로 저장 (창 닫힘 시 비교용)
    const originalDataSnapshot = JSON.stringify(filteredDataToUse);

    // 새 창 열기
    const newWindow = window.open('/data-view', '측정 데이터', 'width=2000,height=800');
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
        data: filteredDataToUse,
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
            handleCSVUpdate(parsedData);
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
          <strong>데이터가 수정되었습니다.</strong> 총 {updatedCount}개의 데이터가 변경되었습니다.
          SQL로 저장하기 전에 변경 사항을 확인하세요.
        </div>
      );
    }
    return null;
  };

  // 데이터 새로고침
  const refreshData = () => {
    const storedData = sessionStorage.getItem('csvData');
    const storedFullData = sessionStorage.getItem('fullCsvData');
    
    if (storedData && storedFullData) {
      try {
        const parsedData = JSON.parse(storedData);
        const parsedFullData = JSON.parse(storedFullData);
        
        setFilterCsvData(parsedData);
        setFullCsvData(parsedFullData);
        
        alert(`데이터가 새로고침되었습니다. ${updatedCount}개의 데이터가 수정되었습니다.`);
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
                {isLoading ? '처리 중...' : 'Generation & CSV 파일 생성'}
              </button>
            </div>
            
            {/* CSV 데이터 새 창에서 보기 버튼 */}
            <div className="col-md-4">
              <button
                className="btn btn-success w-100"
                onClick={() => openDataInNewWindow()}
                disabled={!filterCsvData || filterCsvData.length === 0}
              >
                {isLoading ? '처리 중...' : `데이터 새 창에서 보기`}
              </button>
            </div>
            
            {/* SQL 데이터 삽입 버튼 */}
            <div className="col-md-4">
              <button
                className="btn btn-primary w-100"
                onClick={parseDatabase}
                disabled={!selectedDatabase || !selectedProbe || (!fullCsvData && !file) || isLoading}
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