// src/app/viewer/page.js
'use client';

import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { Database, Eye } from 'lucide-react';

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
        const response = await fetch(`${API_BASE_URL}/api/get_list_database`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch databases');
        const data = await response.json();
        setDBList(data.databases || []);
      } catch (err) {
        console.error('Failed to fetch databases:', err);
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
          const response = await fetch(`${API_BASE_URL}/api/get_list_table`, { credentials: 'include' });
          if (!response.ok) throw new Error('Failed to fetch tables');
          const result = await response.json();
          setTableList(result.tables || []);
        } catch (err) {
          console.error('Failed to fetch tables:', err);
          setError('Failed to fetch tables');
        }finally {
          setIsLoading(false);
        }
      };
      fetchTables();
    }
  }, [selectedDatabase]);

  const handleDatabaseChange = (e) => {
    setSelectedDatabase(e.target.value);
    setSelectedTable('');
    setTableList([]);
    setError(null);
  };

  const handleViewData = () => {
    if (selectedDatabase && selectedTable) {
      const url = `/viewer/data-view-standalone?database=${selectedDatabase}&table=${selectedTable}`;
      window.open(url, '_blank', 'width=2000,height=1200,menubar=no,toolbar=no,location=no,status=no');
    }
  };

  return (
    <Layout>
      <div className="page-wrapper">
        <div className="card">

          {/* Header */}
          <div className="card-header">
            <div className="card-title-row">
              <Database size={16} color="#6366f1" />
              <h5>Database Viewer</h5>
            </div>
          </div>

          {/* Body */}
          <div className="card-body" style={{ padding: '1.25rem' }}>
            <div className="row g-3 align-items-end">

              <div className="col-md-5">
                <label className="form-label">Database</label>
                <select
                  className="form-select"
                  value={selectedDatabase}
                  onChange={handleDatabaseChange}
                  disabled={isLoading}
                >
                  <option value="">Select database…</option>
                  {DBList.map((db) => <option key={db} value={db}>{db}</option>)}
                </select>
              </div>

              <div className="col-md-5">
                <label className="form-label">Table</label>
                <select
                  className="form-select"
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  disabled={!selectedDatabase || isLoading}
                >
                  <option value="">Select table…</option>
                  {tableList.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="col-md-2">
                <button
                  className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                  onClick={handleViewData}
                  disabled={!selectedDatabase || !selectedTable}
                  style={{ background: 'var(--brand)', border: 'none', borderRadius: '6px', fontWeight: '500', fontSize: '0.875rem' }}
                >
                  <Eye size={14} />
                  View
                </button>
              </div>
            </div>

            {error && (
              <div className="alert alert-danger mt-3" style={{ fontSize: '0.875rem' }}>{error}</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}