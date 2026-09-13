// frontend\src\app\(home)\page.js
'use client';

import { useEffect, useState } from 'react';

const WEEKLY_SCHEDULE_URL = 'https://healthineersapc.sharepoint.com/:x:/r/teams/SUSKOUE/Shared%20Documents/AOP/Z_UE_AOP%20weekly/AOP%20weekly%20schedule.xlsx?d=wdfdc89b1439d4600b6af66d46b91b13b&csf=1&web=1&e=2FAyYg';
const WEEKLY_SCHEDULE_EMBED_URL = 'https://healthineersapc.sharepoint.com/teams/SUSKOUE/_layouts/15/Doc.aspx?sourcedoc=%7Bdfdc89b1-439d-4600-b6af-66d46b91b13b%7D&file=AOP%20weekly%20schedule.xlsx&action=embedview&mobileredirect=true';

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  const checkAuthStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.authenticated && data.has_credentials !== false) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, [API_BASE_URL]);

  const handleLogin = () => {
    const w = 480;
    const h = 420;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    window.open(
      '/auth/login',
      'login',
      `width=${w},height=${h},left=${left},top=${top},resizable=no,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`
    );
  };

  useEffect(() => {
    const onFocus = () => {
      checkAuthStatus();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [API_BASE_URL]);

  if (isLoading) {
    return (
      <div className="page-wrapper" style={{ height: 'calc(100vh - 1rem)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-sec)' }}>인증 상태 확인 중...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="page-wrapper" style={{ height: 'calc(100vh - 1rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1.25rem',
            textAlign: 'center',
            maxWidth: '360px',
            width: '100%',
          }}
        >
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--text)' }}>로그인이 필요합니다</h1>
          <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-sec)' }}>
            로그인 후 메인페이지에서 주간 엑셀 일정을 확인할 수 있습니다.
          </p>
          <button
            onClick={handleLogin}
            className="btn-app btn-app-primary btn-app-block"
          >
            로그인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ padding: '0.5rem', height: 'calc(100vh - 1rem)' }}>
      <div style={{ width: '100%', height: '100%' }}>
        <div
          style={{
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1rem',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <h1 style={{ fontSize: '1rem', margin: 0, fontWeight: '700', color: 'var(--text)' }}>
              AOP Weekly Schedule
            </h1>
            <a
              href={WEEKLY_SCHEDULE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--text)',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.4rem 0.7rem',
                textDecoration: 'none',
                fontSize: '0.8rem',
                fontWeight: '600',
              }}
            >
              새 창에서 열기
            </a>
          </div>
          <iframe
            title="AOP Weekly Schedule"
            src={WEEKLY_SCHEDULE_EMBED_URL}
            style={{
              width: '100%',
              flex: 1,
              minHeight: '700px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--bg)',
            }}
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
