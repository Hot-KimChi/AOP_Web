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
        <title>AOP Database</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Database management application" />
      </Head>
      
      <Navbar />
      
      <div className="container-fluid">
        <main className="row">
          <div className="col-12 main-content">
            {children}
          </div>
        </main>
      </div>
    </>
  );
};

export default dynamic(() => Promise.resolve(Layout), { ssr: false });
