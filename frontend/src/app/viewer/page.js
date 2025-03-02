// src/app/viewer/page.js
'use client';

import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';

export default function Viewer() {
  const [DBList, setDBList] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [tableList, setTableList] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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
      }
    };

    fetchDatabases();
  }, []);

  useEffect(() => {
    if (selectedDatabase) {
      const fetchTables = async () => {
        try {
          setIsLoading(true);
          const response = await fetch(`${API_BASE_URL}/api/get_list_table`, {
            method: 'GET',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to fetch tables');
          }

          const result = await response.json();
          setTableList(result.tables || []);
        } catch (error) {
          console.error('Failed to fetch tables:', error);
          setError('Failed to fetch tables');
        } finally {
          setIsLoading(false);
        }
      };

      fetchTables();
    }
  }, [selectedDatabase]);

  const handleDatabaseChange = (event) => {
    setSelectedDatabase(event.target.value);
    setSelectedTable('');
    setTableList([]);
    setError(null);
  };

  const handleTableChange = (event) => {
    setSelectedTable(event.target.value);
  };

  const handleViewData = () => {
    if (selectedDatabase && selectedTable) {
      const url = `/viewer/data-view-standalone?database=${selectedDatabase}&table=${selectedTable}`;
      const windowFeatures = 'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no';
      window.open(url, '_blank', windowFeatures);
    }
  };

  return (
    <Layout>
      <div className="container mt-4">
        <div className="card shadow-sm">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">Database Viewer</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-5">
                <label htmlFor="database" className="form-label">데이터베이스 선택</label>
                <select
                  id="database"
                  className="form-select"
                  value={selectedDatabase}
                  onChange={handleDatabaseChange}
                  disabled={isLoading}
                >
                  <option value="">Select Database</option>
                  {DBList.map((db, index) => (
                    <option key={index} value={db}>{db}</option>
                  ))}
                </select>
              </div>

              <div className="col-md-5">
                <label htmlFor="table" className="form-label">SQL 테이블 선택</label>
                <select
                  id="table"
                  className="form-select"
                  value={selectedTable}
                  onChange={handleTableChange}
                  disabled={!selectedDatabase || isLoading}
                >
                  <option value="">Select Table</option>
                  {tableList.map((table, index) => (
                    <option key={index} value={table}>{table}</option>
                  ))}
                </select>
              </div>

              <div className="col-md-2 d-flex align-items-end">
                <button
                  className="btn btn-primary w-100"
                  onClick={handleViewData}
                  disabled={!selectedDatabase || !selectedTable}
                >
                  View Data
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
    </Layout>
  );
}