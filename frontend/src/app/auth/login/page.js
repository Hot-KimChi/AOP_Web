'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import "../../../globals.css";
import { API_BASE_URL } from '../../../lib/apiBase';

const LoginPage = () => {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        const data = await response.json().catch(() => null);
        setError(data?.message || `Login failed (HTTP ${response.status})`);
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
      // 어느 주소로 요청했는지 함께 보여준다. 주소가 잘못되어 연결이 안 되는
      // 경우(예: 다른 PC 에서 접속) 원인을 바로 알 수 있다.
      setError(`Unable to connect to the server (${API_BASE_URL}).`);
    } finally {
      setIsLoading(false);
    }
  }, [username, password, router]);

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
          className="btn-app btn-app-primary btn-app-block"
        >
          {isLoading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
