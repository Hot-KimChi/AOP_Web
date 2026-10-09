'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Lock, WifiOff, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../lib/apiBase';
import { openLoginPopup } from '../lib/loginPopup';

// 로그인 상태에서는 창 포커스마다 서버를 두드리지 않도록 재확인 간격을 둔다.
const AUTHED_RECHECK_MS = 60_000;

const AuthContext = createContext(null);

/**
 * 인증 상태를 한 번만 조회해 Navbar·페이지가 공유한다.
 * status: 'loading' | 'authenticated' | 'unauthenticated' | 'offline'
 * 프론트 게이트는 UX 용도일 뿐이며, 실제 권한 판정은 백엔드 require_auth 가 한다.
 */
export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'loading', username: '' });
  // 한 번이라도 인증된 화면은 세션 만료가 감지돼도 언마운트하지 않는다(작성 중 데이터 보존).
  const [everAuthed, setEverAuthed] = useState(false);
  const lastCheckRef = useRef(0);
  const inflightRef = useRef(null);
  const statusRef = useRef('loading');
  // 로그아웃 시 증가시켜, 그 전에 시작된 상태 조회 응답이 로그아웃 상태를 덮어쓰지 못하게 한다.
  const genRef = useRef(0);

  const refresh = useCallback(() => {
    if (inflightRef.current) return inflightRef.current;
    lastCheckRef.current = Date.now();
    const gen = genRef.current;
    const request = (async () => {
      let next;
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        // JWT 는 유효해도 서버 세션에 DB 자격증명이 없으면 재로그인이 필요하다.
        next = res.ok && data.authenticated && data.has_credentials !== false
          ? { status: 'authenticated', username: data.username || '' }
          : { status: 'unauthenticated', username: '' };
      } catch {
        // 일시적 네트워크 오류로 작업 중인 화면을 지우지 않는다.
        next = statusRef.current === 'authenticated' ? null : { status: 'offline', username: '' };
      } finally {
        if (inflightRef.current === request) inflightRef.current = null;
      }
      if (gen !== genRef.current) return;
      if (next) {
        statusRef.current = next.status;
        if (next.status === 'authenticated') setEverAuthed(true);
        setAuth(next);
      }
    })();
    inflightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => {
      const stale = Date.now() - lastCheckRef.current > AUTHED_RECHECK_MS;
      if (statusRef.current !== 'authenticated' || stale) refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const markLoggedOut = useCallback(() => {
    genRef.current += 1;
    inflightRef.current = null;
    statusRef.current = 'unauthenticated';
    setEverAuthed(false);
    setAuth({ status: 'unauthenticated', username: '' });
  }, []);

  const value = useMemo(
    () => ({ ...auth, gateOpen: auth.status === 'authenticated' || everAuthed, refresh, markLoggedOut }),
    [auth, everAuthed, refresh, markLoggedOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** 인증된 경우에만 children 을 렌더한다. 비로그인 직접 접근 시 API 오류 대신 안내를 보여준다. */
export function AuthGate({ children }) {
  const { status, gateOpen, refresh } = useAuth();
  const pathname = usePathname();

  if (gateOpen) return children;

  if (status === 'loading') {
    return (
      <div className="empty-state-wrap">
        <div className="spinner-center" role="status">
          <Loader2 size={16} className="spin" />
          인증 상태 확인 중...
        </div>
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="empty-state-wrap">
        <section className="empty-state">
          <div className="empty-state-icon empty-state-icon-warn"><WifiOff size={20} /></div>
          <h1 className="empty-state-title">서버에 연결할 수 없습니다</h1>
          <p className="empty-state-desc">백엔드 서버가 실행 중인지 확인한 뒤 다시 시도해 주세요.</p>
          <button onClick={refresh} className="btn-app btn-app-secondary btn-app-block">다시 시도</button>
        </section>
      </div>
    );
  }

  return (
    <div className="empty-state-wrap">
      <section className="empty-state">
        <div className="empty-state-icon"><Lock size={20} /></div>
        <h1 className="empty-state-title">로그인이 필요합니다</h1>
        <p className="empty-state-desc">
          {pathname === '/'
            ? '로그인 후 메인페이지에서 주간 엑셀 일정을 확인할 수 있습니다.'
            : '로그인 후 이 기능을 사용할 수 있습니다.'}
        </p>
        <button onClick={openLoginPopup} className="btn-app btn-app-primary btn-app-block">로그인</button>
      </section>
    </div>
  );
}
