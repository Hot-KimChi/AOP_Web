'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCogs, 
  faEye, 
  faClipboardCheck, 
  faBrain, 
  faUserCircle
} from '@fortawesome/free-solid-svg-icons';

const Navbar = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');

  const menuItems = [
    { href: '/measset-generation', icon: faCogs, text: 'MeasSet Generation' },
    { href: '/viewer', icon: faEye, text: 'Viewer' },
    { href: '/verification-report', icon: faClipboardCheck, text: 'Verification Report' },
    { href: '/SSR_DocOut', icon: faClipboardCheck, text: 'SSR_DocOut' }, // SSR_DocOut 메뉴 추가
    { href: '/machine-learning', icon: faBrain, text: 'Machine Learning' },
  ];

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
        method: 'GET',
        credentials: 'include',
      });
  
      const data = await response.json();
  
      if (response.ok && data.authenticated) {
        setIsAuthenticated(true);
        setUsername(data.username);
      } else {
        setIsAuthenticated(false);
        setUsername('');
        console.warn(data.message); // 인증 실패 메시지 로깅
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      setIsAuthenticated(false);
      setUsername('');
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        setIsAuthenticated(false);
        setUsername('');
        router.push('/');
      } else {
        console.error('Logout failed:', await response.text());
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <nav className="navbar navbar-expand-lg bg-white shadow-sm border-bottom">
      <div className="container-fluid px-4">
        {/* Logo */}
        <Link href="/" className="navbar-brand d-flex align-items-center">
          <div className="bg-gradient rounded-3 p-2 me-2" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <span className="text-white fw-bold fs-5">A</span>
          </div>
          <span className="fw-bold" style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            AOP Web
          </span>
        </Link>

        <button 
          className="navbar-toggler" 
          type="button" 
          data-bs-toggle="collapse" 
          data-bs-target="#navbarNav"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarNav">
          {/* Desktop Menu */}
          <ul className="navbar-nav me-auto">
            {menuItems.map((item, index) => (
              <li className="nav-item" key={index}>
                <Link
                  href={item.href}
                  className={`nav-link px-3 py-2 rounded ${
                    isAuthenticated
                      ? 'text-dark'
                      : 'text-muted disabled'
                  }`}
                  style={isAuthenticated ? { transition: 'all 0.2s' } : {}}
                  onClick={(e) => !isAuthenticated && e.preventDefault()}
                >
                  <FontAwesomeIcon icon={item.icon} className="me-2" />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>

          {/* Auth Section */}
          <div className="d-flex align-items-center">
            {isAuthenticated ? (
              <>
                <div className="d-none d-md-flex flex-column align-items-end me-3">
                  <small className="text-muted">Logged in as</small>
                  <strong className="text-dark">{username}</strong>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn btn-danger shadow-sm"
                  style={{ transition: 'all 0.2s' }}
                >
                  <FontAwesomeIcon icon={faUserCircle} className="me-2" />
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="btn btn-primary shadow-sm"
                style={{ transition: 'all 0.2s' }}
              >
                <FontAwesomeIcon icon={faUserCircle} className="me-2" />
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
