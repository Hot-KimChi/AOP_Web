// src/app/viewer/page.js

'use client';

import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';

export default function Viewer() {
  const [DBList, setDBList] = useState([]);                       // 데이터베이스 목록 상태
  const [selectedDatabase, setSelectedDatabase] = useState('');   // 선택된 데이터베이스 상태
  const [tableList, setTableList] = useState([]);                 // 테이블 목록 상태
  const [selectedTable, setSelectedTable] = useState('');         // 선택된 테이블 상태
  const [data, setData] = useState([]);                           // 데이터 상태
  const [isLoading, setIsLoading] = useState(false);              // 로딩 상태
  const [error, setError] = useState(null);                       // 오류 상태

  // 데이터베이스 목록을 가져오는 useEffect
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
        setDBList(data.databases || []);
      } catch (error) {
        console.error('Failed to fetch databases:', error);
        setError('Failed to fetch databases');
      }
    };

    fetchDatabases();
  }, []);

  // 데이터베이스가 선택되었을 때 테이블 목록을 가져오는 useEffect
  useEffect(() => {
    if (selectedDatabase) {
      const fetchTables = async () => {
        try {
          setIsLoading(true);
          const response = await fetch(`http://localhost:5000/api/get_list_table`, {
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

  // 테이블이 선택되었을 때 데이터를 가져오는 useEffect
  useEffect(() => {
    if (selectedTable) {
      const fetchData = async () => {
        try {
          setIsLoading(true);
          const response = await fetch(`/api/viewer/route?tableName=${selectedTable}`, {
            method: 'GET',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to fetch data');
          }

          const result = await response.json();
          setData(result.data || []);
        } catch (error) {
          console.error('Failed to fetch data:', error);
          setError('Failed to fetch data');
        } finally {
          setIsLoading(false);
        }
      };

      fetchData();
    }
  }, [selectedTable]);

  // 데이터베이스 선택 변경 시 처리
  const handleDatabaseChange = (event) => {
    setSelectedDatabase(event.target.value);
    setSelectedTable(''); // 테이블 선택 초기화
    setTableList([]); // 테이블 목록 초기화
    setData([]); // 이전 데이터 초기화
    setError(null); // 오류 상태 초기화
  };

  // 테이블 선택 변경 시 처리
  const handleTableChange = (event) => {
    setSelectedTable(event.target.value);
  };

  return (
    <Layout>
      <div className="container mt-5">
        <h4 className="mb-4">SQL Viewer</h4>
        <div className="row align-items-end">
          <div className="col-md-4 mb-3">
            <label htmlFor="databaseSelect" className="form-label">
              Select Database
            </label>
            <select
              id="databaseSelect"
              className="form-select"
              value={selectedDatabase}
              onChange={handleDatabaseChange}
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

          <div className="col-md-6 mb-3">
            <label htmlFor="tableSelect" className="form-label">
              Select Table
            </label>
            <select
              id="tableSelect"
              className="form-select"
              value={selectedTable}
              onChange={handleTableChange}
              disabled={isLoading || !selectedDatabase}
            >
              <option value="">Select a table</option>
              {tableList.map((table, index) => (
                <option key={index} value={table}>
                  {table}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && <p>Loading data...</p>}
        {error && <p>Error: {error}</p>}
        {!isLoading && !error && data.length === 0 && <p>No data available</p>}
        {!isLoading && !error && data.length > 0 && (
          <div className="mt-4">
            <h3>Data:</h3>
            <table className="table table-striped">
              <thead>
                <tr>
                  {Object.keys(data[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value, i) => (
                      <td key={i}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
