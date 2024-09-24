'use client';

import { useState, useEffect } from 'react';

export default function MeasSetGen() {
  const [probes, setProbes] = useState([]); // Probe 목록 상태
  const [selectedProbe, setSelectedProbe] = useState(''); // 선택된 Probe 상태
  const [databases, setDatabases] = useState([]); // Database 목록 상태
  const [selectedDatabase, setSelectedDatabase] = useState(''); // 선택된 Database 상태

  // 처음 컴포넌트가 렌더링될 때 Database 목록을 가져오는 함수
  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/get_list_database', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch databases');
        }

        const data = await response.json();
        setDatabases(data.databases || []); // 데이터가 없으면 빈 배열로 설정
      } catch (error) {
        console.error('Failed to fetch databases:', error);
        setDatabases([]); // 에러 발생 시에도 빈 배열로 설정하여 에러 방지
      }
    };

    fetchDatabases();
  }, []);

  // selectedDatabase가 변경될 때마다 Probe 목록을 가져오는 함수
  useEffect(() => {
    if (selectedDatabase) {
      const fetchProbes = async () => {
        try {
          const response = await fetch(
            `http://localhost:5000/api/get_probes?database=${selectedDatabase}`,
            {
              method: 'GET',
              credentials: 'include',
            }
          );

          if (!response.ok) {
            throw new Error('Failed to fetch probes');
          }

          const data = await response.json();

          setProbes(data.probes || []); // 데이터가 없으면 빈 배열로 설정
        } catch (error) {
          console.error('Failed to fetch probes:', error);
          setProbes([]); // 에러 발생 시 빈 배열로 설정하여 안정성 유지
        }
      };

      fetchProbes();
    } else {
      setProbes([]); // Database가 선택되지 않았을 경우 Probe 목록을 비웁니다.
    }
  }, [selectedDatabase]);

  return (
    <div className="container mt-5">
      <h4 className="mb-4">MeasSet Generation</h4>
    
        <div className="row align-items-end">
          {/* Database 선택 */}
          <div className="col-md-5 mb-3">
            <label htmlFor="databaseSelect" className="form-label">
              Select Database
            </label>
            <select
              id="databaseSelect"
              className="form-select"
              value={selectedDatabase}
              onChange={(e) => setSelectedDatabase(e.target.value)}
            >
              <option value="">Select a database</option>
              {databases.map((db, index) => (
                <option key={index} value={db}>
                  {db}
                </option>
              ))}
            </select>
        </div>
        
        {/* Probe 선택 */}
        <div className="col-md-5 mb-3">
          <label htmlFor="probeSelect" className="form-label">
            Select Probe
          </label>
          <select
            id="probeSelect"
            className="form-select"
            value={selectedProbe}
            onChange={(e) => setSelectedProbe(e.target.value)}
          >
            <option value="">Select a probe</option>
            {probes.map((probe) => (
              <option key={probe.probeId} value={probe.probeId}>
                {probe.probeName} ({probe.probeId})
              </option>
            ))}
          </select>
        </div>

        <div className="col-md-2 mb-3">
          <button className="btn btn-primary w-100">File Upload</button>
        </div>

    </div>
  </div>
  );
}