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
    <nav className="navbar navbar-expand-lg navbar-light bg-light">
      <div className="container-fluid">
        <Link href="/" className="navbar-brand">AOP Main</Link>
        <button 
          className="navbar-toggler" 
          type="button" 
          data-bs-toggle="collapse" 
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse justify-content-between" id="navbarNav">
          <ul className="navbar-nav">
            {menuItems.map((item, index) => (
              <li className="nav-item mx-3" key={index}>
                <Link 
                  href={item.href} 
                  className={`nav-link ${
                    isAuthenticated ? 'text-dark' : 'disabled text-muted'
                  }`}
                  onClick={(e) => !isAuthenticated && e.preventDefault()}
                >
                  <FontAwesomeIcon icon={item.icon} className="me-2" />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>

          {isAuthenticated ? (
            <div className="d-flex align-items-center">
              <div className="d-flex flex-column align-items-end me-3">
                <small className="text-muted">Log in:</small>
                <strong>{username}</strong>
              </div>
              <button
                className="btn btn-danger d-flex align-items-center"
                onClick={handleLogout}
              >
                <FontAwesomeIcon icon={faUserCircle} className="me-2" />
                Logout
              </button>
            </div>
          ) : (
            <Link 
              href="/auth/login" 
              className="btn btn-primary d-flex align-items-center"
            >
              <FontAwesomeIcon icon={faUserCircle} className="me-2" />
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
