// src/components/Navbar.js
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCogs, faEye, faClipboardCheck, faBrain } from '@fortawesome/free-solid-svg-icons';

const Navbar = ({ isAuthenticated, user }) => {
  const menuItems = [
    { href: '/measset-generation', icon: faCogs, text: 'MeasSet Generation' },
    { href: '/viewer', icon: faEye, text: 'Viewer' },
    { href: '/verification-report', icon: faClipboardCheck, text: 'Verification Report' },
    { href: '/machine-learning', icon: faBrain, text: 'Machine Learning' },
  ];

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light">
      <div className="container-fluid">
        <Link href="/" className="navbar-brand">AOP Main</Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse justify-content-between" id="navbarNav">
          <ul className="navbar-nav">
            {menuItems.map((item, index) => (
              <li className="nav-item mx-3" key={index}>
                <Link href={item.href} className="nav-link">
                  <FontAwesomeIcon icon={item.icon} className="me-2" />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
          {/* 인증 상태에 따른 사용자 정보 표시 */}
          {isAuthenticated ? (
            <span className="navbar-text">Welcome, {user?.name}</span>
          ) : (
            <Link href="/login" className="btn btn-primary">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
