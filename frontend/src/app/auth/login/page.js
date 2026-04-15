'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import "../../../globals.css";

const LoginPage = () => {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  const handleLogin = useCallback(async () => {
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data?.message || 'Login failed');
        return;
      }
      // 팝업으로 열린 경우: 부모 창 새로고침 후 팝업 닫기
      if (typeof window !== 'undefined' && window.opener) {
        window.opener.location.reload();
        window.close();
      } else {
        router.push('/');
      }
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  }, [username, password, router, API_BASE_URL]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && username && password && !isLoading) handleLogin();
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-icon">A</div>
          <div className="login-brand-title">AOP Web</div>
          <div className="login-brand-subtitle">Sign in to your account</div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)',
            borderRadius: '8px', padding: '0.75rem 1rem',
            marginBottom: '1.25rem', fontSize: '0.8125rem', color: 'var(--status-error-text)',
          }}>
            {error}
          </div>
        )}

        {/* Username */}
        <div style={{ marginBottom: '1rem' }}>
          <label className="form-label" htmlFor="usernameInput">Username</label>
          <input
            type="text"
            id="usernameInput"
            className="form-control"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            autoFocus
            placeholder="Enter username"
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label className="form-label" htmlFor="passwordInput">Password</label>
          <input
            type="password"
            id="passwordInput"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Enter password"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleLogin}
          disabled={isLoading || !username || !password}
          style={{
            width: '100%', padding: '0.625rem',
            borderRadius: '8px', border: 'none',
            background: isLoading || !username || !password ? 'var(--brand-light)' : 'var(--brand)',
            color: 'white', fontWeight: '600', fontSize: '0.9375rem',
            cursor: isLoading || !username || !password ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { if (!isLoading && username && password) e.currentTarget.style.background = 'var(--brand-dark)'; }}
          onMouseLeave={(e) => { if (!isLoading && username && password) e.currentTarget.style.background = 'var(--brand)'; }}
        >
          {isLoading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
