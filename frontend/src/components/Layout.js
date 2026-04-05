// frontend\src\components\Layout.js
'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../globals.css';
import dynamic from 'next/dynamic';
import Navbar from '../components/Navbar';

const Layout = ({ children }) => {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <main>{children}</main>
      {/* 버전 정보 — 모든 페이지 우측 하단 고정 */}
      <div className="version-badge">v 0.9.20</div>
    </div>
  );
};

export default dynamic(() => Promise.resolve(Layout), { ssr: false });
