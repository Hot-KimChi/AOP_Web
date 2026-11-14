// frontend\src\components\Layout.js

import 'bootstrap/dist/css/bootstrap.min.css';
import '../globals.css';
import Navbar from '../components/Navbar';
import { AuthProvider, AuthGate } from './AuthContext';
import { APP_VERSION } from '../lib/loginPopup';

const Layout = ({ children }) => {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Navbar />
        <main>
          <AuthGate>{children}</AuthGate>
        </main>
        {/* 버전 정보 — 모든 페이지 우측 하단 고정 */}
        <div className="version-badge">v {APP_VERSION}</div>
      </div>
    </AuthProvider>
  );
};

export default Layout;
