'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import "../../../globals.css";

// Windows SSO 는 Next.js 와 같은 Node 서버(Express Custom Server)의 /auth/sso 가 처리한다.
// 브라우저는 Negotiate(Kerberos/NTLM) 협상만 수행하며, 사용자명·비밀번호를 보내지 않는다.
const SSO_LOGIN_PATH = '/auth/sso';

const LoginPage = () => {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const attempted = useRef(false);

  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(SSO_LOGIN_PATH, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.message || `Windows sign-in failed (HTTP ${response.status})`);
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
      setError('Unable to connect to the sign-in server.');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    handleLogin();
  }, [handleLogin]);

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-icon">A</div>
          <div className="login-brand-title">AOP Web</div>
          <div className="login-brand-subtitle">Sign in with your Windows account</div>
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

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="btn-app btn-app-primary btn-app-block"
        >
          {isLoading ? 'Signing in…' : 'Sign in with Windows'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
