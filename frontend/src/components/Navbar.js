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
  faUser,
  faSignOutAlt,
  faUserCircle
} from '@fortawesome/free-solid-svg-icons';

const Navbar = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState({
    windowsUsername: '',
    fullName: '',
    connectionStatus: 'Connected'
  });
  const [showDropdown, setShowDropdown] = useState(false);

  const menuItems = [
    { href: '/measset-generation', icon: faCogs, text: 'MeasSet Generation' },
    { href: '/viewer', icon: faEye, text: 'Viewer' },
    { href: '/verification-report', icon: faClipboardCheck, text: 'Verification Report' },
    { href: '/machine-learning', icon: faBrain, text: 'Machine Learning' },
  ];

  useEffect(() => {
    // Check authentication status on component mount
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include' // Important for cookies
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setUserData({
          windowsUsername: data.windowsUsername,
          fullName: data.fullName,
          connectionStatus: data.connectionStatus || 'Connected'
        });
      } else {
        setIsAuthenticated(false);
        setUserData({
          windowsUsername: '',
          fullName: '',
          connectionStatus: 'Disconnected'
        });
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      setIsAuthenticated(false);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        setIsAuthenticated(false);
        setUserData({
          windowsUsername: '',
          fullName: '',
          connectionStatus: 'Disconnected'
        });
        router.push('/login');
      }
    } catch (error) {
      console.error('Logout failed:', error);
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
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse justify-content-between" id="navbarNav">
          <ul className="navbar-nav">
            {menuItems.map((item, index) => (
              <li className="nav-item mx-3" key={index}>
                <Link 
                  href={item.href} 
                  className={`nav-link ${!isAuthenticated ? 'disabled' : ''}`}
                  onClick={(e) => !isAuthenticated && e.preventDefault()}
                >
                  <FontAwesomeIcon icon={item.icon} className="me-2" />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
          
          {isAuthenticated ? (
            <div className="dropdown">
              <button
                className="btn btn-light dropdown-toggle d-flex align-items-center"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <FontAwesomeIcon icon={faUserCircle} className="me-2" />
                <span className="me-2">{userData.fullName || userData.windowsUsername || 'User'}</span>
                <span className={`badge ${userData.connectionStatus === 'Connected' ? 'bg-success' : 'bg-danger'}`}>
                  {userData.connectionStatus}
                </span>
              </button>
              
              {showDropdown && (
                <div className="dropdown-menu show position-absolute">
                  <div className="dropdown-header">
                    <small className="text-muted">Signed in as</small>
                    <div>{userData.fullName}</div>
                  </div>
                  <div className="dropdown-divider"></div>
                  <button 
                    className="dropdown-item text-danger"
                    onClick={handleLogout}
                  >
                    <FontAwesomeIcon icon={faSignOutAlt} className="me-2" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link 
              href="/auth/login" 
              className="btn btn-primary d-flex align-items-center"
            >
              <FontAwesomeIcon icon={faUser} className="me-2" />
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;