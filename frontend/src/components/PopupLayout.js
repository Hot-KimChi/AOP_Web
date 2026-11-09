// 별도 브라우저 창(팝업)용 레이아웃: Navbar 없이 인증 게이트만 적용한다.
'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import '../globals.css';
import dynamic from 'next/dynamic';
import { AuthProvider, AuthGate } from './AuthContext';

const PopupLayout = ({ children }) => (
  <AuthProvider>
    <AuthGate>{children}</AuthGate>
  </AuthProvider>
);

export default dynamic(() => Promise.resolve(PopupLayout), { ssr: false });
