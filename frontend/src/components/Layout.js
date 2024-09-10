// src/app/layout.js
'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { authenticateUser } from '../utils/authenticateUser'; // 사용자 인증 함수
import Navbar from '../components/Navbar'; // Navbar 컴포넌트 import

const Layout = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false); // 인증 상태
  const [user, setUser] = useState(null); // 사용자 정보

  // 페이지 로드 시 사용자 인증 처리
  useEffect(() => {
    authenticateUser(setUser, setIsAuthenticated); // 인증 함수 호출
  }, []);

  return (
    <html lang="en"> {/* HTML 태그 추가 */}
      <head> {/* Head 태그 추가 */}
        <title>AOP Application</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="An application with automatic login." />
      </head>
      <body> {/* Body 태그 추가 */}
        <Navbar isAuthenticated={isAuthenticated} user={user} /> {/* Navbar 컴포넌트 */}
        <main className="container-fluid">
          <div className="row">
            <div className="col-12 main-content">
              {children} {/* 페이지의 주요 콘텐츠 */}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
};

export default dynamic(() => Promise.resolve(Layout), { ssr: false }); // 서버사이드 렌더링 비활성화
