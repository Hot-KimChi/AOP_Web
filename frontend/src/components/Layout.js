// frontend\src\components\Layout.js
'use client';

import 'bootstrap/dist/css/bootstrap.min.css';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Navbar from '../components/Navbar';

const Layout = ({ children }) => {
  return (
    <>
      <Head>
        <title>AOP Platform</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Advanced Operations Platform" />
      </Head>
      
      <div className="min-vh-100" style={{ background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
        <Navbar />
        
        <main className="w-100">
          {children}
        </main>
      </div>
    </>
  );
};

export default dynamic(() => Promise.resolve(Layout), { ssr: false });
