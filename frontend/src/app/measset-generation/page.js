'use client';

import { useState, useEffect } from 'react';

export default function MeasSetGen() {
  const [probeList, setProbeList] = useState([]);
  const [ListDB, setListDB] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedProbe, setSelectedProbe] = useState('');
  const [file, setFile] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);


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
        setListDB(data.databases || []);
      } catch (error) {
        console.error('Failed to fetch databases:', error);
        setListDB([]);
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

          setProbeList(data.probes || []);
        } catch (error) {
          console.error('Failed to fetch probes:', error);
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

  const handleFileUpload = async () => {
    if (file && selectedDatabase && selectedProbe) {
      setIsLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('database', selectedDatabase);
      formData.append('probe', selectedProbe);

      try {
        const response = await fetch(`http://localhost:5000/api/measset-generation`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })

        if (response.ok) {
          const data = await response.json();
          setProcessedData(data.data)
        } else {
          console.error('Failed to process the file');
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      alert('Please select a database, probe, and file before uploading.');
    }
  };
  
  return (
    <div className="container mt-5">
      <h4 className="mb-4">MeasSet Generation</h4>
    
      <div className="row align-items-end">
        <div className="col-md-4 mb-3">
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
            {ListDB.map((db, index) => (
              <option key={index} value={db}>
                {db}
              </option>
            ))}
          </select>
        </div>
        
        <div className="col-md-4 mb-3">
          <label htmlFor="probeSelect" className="form-label">
            Select Probe
          </label>
          <select
            id="probeSelect"
            className="form-select"
            value={selectedProbe}
            onChange={(e) => setSelectedProbe(e.target.value)}
            disabled={isLoading || !selectedDatabase}
          >
            <option value="">Select a probe</option>
            {probeList.map((probe) => (
              <option key={probe.probeId} value={probe.probeId}>
                {probe.probeName} ({probe.probeId})
              </option>
            ))}
          </select>
        </div>

        <div className="col-md-4 mb-3">
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

        <div className="col-12 mb-3">
          <button 
            className="btn btn-primary w-100"
            onClick={handleFileUpload}
            disabled={!selectedDatabase || !selectedProbe || !file || isLoading}
          >
            {isLoading ? 'Processing...' : 'Upload & Process File'}
          </button>
        </div>
      </div>

      {processedData && (
        <div className="mt-4">
          <h3>Processed Data:</h3>
          <pre className="bg-light p-3 rounded">
            {JSON.stringify(processedData, null, 2)}
          </pre>
        </div>
      )}    
    </div>
  );
}