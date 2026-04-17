'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Settings, Eye, ClipboardCheck, FileOutput, Brain, User, LogOut, Menu, X, Sun, Moon } from 'lucide-react';
import '../globals.css';

const menuItems = [
  { href: '/measset-generation',  icon: Settings,       text: 'MeasSet Generation' },
  { href: '/viewer',              icon: Eye,            text: 'Viewer' },
  { href: '/verification-report', icon: ClipboardCheck, text: 'Verification Report' },
  { href: '/SSR_DocOut',          icon: FileOutput,     text: 'SSR DocOut' },
  { href: '/machine-learning',    icon: Brain,          text: 'Machine Learning' },
];

const Navbar = () => {
  const router   = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username,        setUsername]        = useState('');
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [isDark,          setIsDark]          = useState(false);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  // ThemeInit에서 이미 data-theme을 설정하므로, DOM 상태만 읽어서 동기화
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setIsDark(current === 'dark');
  }, []);

  // 페이지 이동 시 모바일 메뉴 닫기
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // 창 크기 변경 시 모바일 메뉴 닫기 (데스크톱으로 전환 시)
  useEffect(() => {
    const handleResize = () => { if (window.innerWidth > 900) setMenuOpen(false); };
    if (window.innerWidth > 900) setMenuOpen(false);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { checkAuthStatus(); }, []);

  const checkAuthStatus = async () => {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        if (data.has_credentials === false) {
          // JWT는 유효하지만 세션 자격증명이 없음 → 재로그인 필요
          setIsAuthenticated(false);
          setUsername('');
        } else {
          setIsAuthenticated(true);
          setUsername(data.username);
        }
      } else {
        setIsAuthenticated(false);
        setUsername('');
      }
    } catch (err) {
      console.error('Auth status check failed:', err);
      setIsAuthenticated(false);
      setUsername('');
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setIsAuthenticated(false);
        setUsername('');
        router.push('/');
      }
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('aop-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('aop-theme', 'light');
    }
  };

  return (
    <header className="navbar-root">
      {/* ── 메인 바 ── */}
      <div className="navbar-inner">

        {/* 로고 — 항상 맨 왼쪽 */}
        <Link href="/" className="navbar-logo">
          <div className="navbar-logo-icon">A</div>
          <span className="navbar-logo-text">AOP Web</span>
        </Link>

        <div className="navbar-divider" />

        {/* 메뉴 링크 — 중앙 (남은 공간 차지) */}
        <nav className="navbar-links">
          {menuItems.map((item) => {
            const Icon     = item.icon;
            const isActive = pathname?.startsWith(item.href);
            const disabled = !isAuthenticated;
            const cls      = ['navbar-link', isActive ? 'active' : '', disabled ? 'disabled' : ''].join(' ').trim();
            return (
              <Link
                key={item.href}
                href={disabled ? '#' : item.href}
                className={cls}
                onClick={(e) => disabled && e.preventDefault()}
                aria-disabled={disabled}
              >
                <Icon size={14} />
                <span className="navbar-link-text">{item.text}</span>
              </Link>
            );
          })}
        </nav>

        {/* Auth + 테마 토글 — 항상 맨 오른쪽 */}
        <div className="navbar-auth">

          {/* 다크/라이트 토글 */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {isAuthenticated ? (
            <>
              <span className="navbar-username">
                <span style={{ color: 'var(--text-muted)' }}>as </span>
                <strong style={{ color: 'var(--text)' }}>{username}</strong>
              </span>
              <button
                onClick={handleLogout}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.375rem 0.75rem', borderRadius: '6px',
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--status-error-text)', fontSize: '0.8125rem', fontWeight: '500',
                  cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--status-error-bg)'; e.currentTarget.style.borderColor = 'var(--status-error-border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <LogOut size={13} />
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                const w = 480, h = 420;
                const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
                const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
                window.open(
                  '/auth/login',
                  'login',
                  `width=${w},height=${h},left=${left},top=${top},resizable=no,scrollbars=no,menubar=no,toolbar=no,location=no,status=no`
                );
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.375rem 0.875rem', borderRadius: '6px',
                background: 'var(--brand)', color: 'white',
                border: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: '500',
                whiteSpace: 'nowrap', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--brand-dark)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--brand)'; }}
            >
              <User size={13} />
              Login
            </button>
          )}

          {/* 햄버거 — 모바일 전용 (CSS로 표시/숨김) */}
          <button
            className="navbar-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* ── 모바일 드롭다운 ── */}
      <nav className={`navbar-mobile-menu${menuOpen ? ' open' : ''}`}>
        {menuItems.map((item) => {
          const Icon     = item.icon;
          const isActive = pathname?.startsWith(item.href);
          const disabled = !isAuthenticated;
          const cls      = ['navbar-mobile-link', isActive ? 'active' : '', disabled ? 'disabled' : ''].join(' ').trim();
          return (
            <Link
              key={item.href}
              href={disabled ? '#' : item.href}
              className={cls}
              onClick={(e) => { if (disabled) e.preventDefault(); }}
            >
              <Icon size={15} />
              {item.text}
            </Link>
          );
        })}
      </nav>
    </header>
  );
};

export default Navbar;
