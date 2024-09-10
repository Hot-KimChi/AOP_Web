import Layout from "../components/layout";

// src/app/layout.js
export default function AppLayout({ children }) {
  return (
    <html lang="en">
      <head>
      </head>
      <body>
        <Layout>
          {children}
        </Layout>
      </body>
    </html>    
  );  
}
