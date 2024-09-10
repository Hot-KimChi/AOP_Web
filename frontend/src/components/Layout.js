'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { authenticateUser, fetchDatabases } from '../utils/authenticateUser';
import Navbar from '../components/Navbar';

const Layout = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [databases, setDatabases] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [windowsUsername, setWindowsUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await authenticateUser(
          setUser,
          setIsAuthenticated,
          setWindowsUsername,
          setFullName,
          setConnectionStatus
        );
      } catch (err) {
        console.error('Authentication error:', err);
        setError('인증 중 오류가 발생했습니다. 다시 시도해주세요.');
        setIsAuthenticated(false);
      }
    };
    initializeAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDatabases(setDatabases, setSelectedDatabase);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    console.log('User state:', { user, isAuthenticated, windowsUsername, fullName, connectionStatus });
  }, [user, isAuthenticated, windowsUsername, fullName, connectionStatus]);

  return (
    <>
      <Head>
        <title>AOP Database</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="An application with automatic login and database access." />
      </Head>

      <Navbar
        isAuthenticated={isAuthenticated}
        user={user}
        windowsUsername={windowsUsername}
        fullName={fullName}
        connectionStatus={connectionStatus}
      />

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="container-fluid">
        <main className="row">
          <div className="col-12 main-content">
            {children}
          </div>
        </main>
      </div>
    </>
  );
};

export default dynamic(() => Promise.resolve(Layout), { ssr: false });