'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function MeasSetGen() {
  const [probeList, setProbeList] = useState([]);
  const [DBList, setDBList] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedProbe, setSelectedProbe] = useState(null);
  const [file, setFile] = useState(null);
  const [sqlFile, setSqlFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const sqlFileInputRef = useRef(null);
  const router = useRouter();

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchDatabases = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/get_list_database`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch databases');
        }

        const data = await response.json();
        setDBList(data.databases || []);
      } catch (error) {
        console.error('Failed to fetch databases:', error);
        setError('Failed to fetch databases');
        setDBList([]);
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
            {
              method: 'GET',
              credentials: 'include',
            }
          );

          if (!response.ok) {
            throw new Error('Failed to fetch probes');
          }

          const data = await response.json();
          setProbeList(data.probes || []);
        } catch (error) {
          console.error('Failed to fetch probes:', error);
          setError('Failed to fetch probes');
          setProbeList([]);
        } finally {
          setIsLoading(false);
        }
      };

      fetchProbes();
    } else {
      setProbeList([]);
    }
  }, [selectedDatabase]);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleSqlFileChange = (event) => {
    setSqlFile(event.target.files[0]);
  };

  const handleFileUpload = async () => {
    if (file && selectedDatabase && selectedProbe) {
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
        console.error(`Failed to process the file. Status: ${response.status}, Message: ${errorText}`);
        setError("Failed to process the files");
        } else {
          const data = await response.json();

          if (data.status === "success" && data.data) {
            // CSV 데이터를 localStorage에 저장 (객체로 변환)
            localStorage.setItem("csvData", JSON.stringify(data.data));
            console.log("CSV Data Saved:", data.data);

            // CSV 데이터를 표시하는 페이지로 이동
            router.push("/csv-viewer");
          } else {
            setError("CSV data is empty or invalid.");
          }
        y}
      } catch (error) {
        console.error("Error:", error);
        setError("An error occurred during file processing");
      } finally {
        setIsLoading(false);
      }
    } else {
      alert("Please select a database, probe, and file before uploading.");
    }
  };

  const parseDatabase = async () => {
    if (selectedDatabase && selectedProbe) {
      if (!sqlFile) {
        sqlFileInputRef.current.click();
        return;
      }

      setIsLoading(true);
      
      const formData = new FormData();
      formData.append('file', sqlFile);
      formData.append('database', selectedDatabase);

      try {
        const response = await fetch(`${API_BASE_URL}/api/insert-sql`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to insert SQL. Status: ${response.status}, Message: ${errorText}`);
          setError('Failed to insert SQL data');
        } else {
          const data = await response.json();
          alert('SQL data inserted successfully!');
          setSqlFile(null);
        }
      } catch (error) {
        console.error('Error:', error);
        setError('Failed to process SQL insertion');
      } finally {
        setIsLoading(false);
      }
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
            <div className="col-md-4">
              <label htmlFor="databaseSelect" className="form-label">
                Select Database
              </label>
              <select
                id="databaseSelect"
                className="form-select"
                value={selectedDatabase}
                onChange={(e) => setSelectedDatabase(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Select a database</option>
                {DBList.map((db, index) => (
                  <option key={index} value={db}>
                    {db}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label htmlFor="probeSelect" className="form-label">
                Select Probe
              </label>
              <select
                id="probeSelect"
                className="form-select"
                value={selectedProbe ? JSON.stringify(selectedProbe) : ''}
                onChange={(e) => setSelectedProbe(JSON.parse(e.target.value))}
                disabled={isLoading || !selectedDatabase}
              >
                <option value="">Select a probe</option>
                {probeList.map((probe) => (
                  <option key={probe.probeId} value={JSON.stringify({ id: probe.probeId, name: probe.probeName })}>
                    {probe.probeName} ({probe.probeId})
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label htmlFor="fileInput" className="form-label">
                Select File
              </label>
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

            <div className="col-6">
              <button
                className="btn btn-primary w-100"
                onClick={handleFileUpload}
                disabled={!selectedDatabase || !selectedProbe || !file || isLoading}
              >
                {isLoading ? 'Processing...' : 'Generate CSV File'}
              </button>
            </div>

            <div className="col-6">
              <button
                className="btn btn-primary w-100"
                onClick={parseDatabase}
                disabled={!selectedDatabase || !selectedProbe || isLoading}
              >
                {isLoading ? 'Processing...' : sqlFile ? 'Insert to SQL Database' : 'To SQL Database'}
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger mt-3">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}