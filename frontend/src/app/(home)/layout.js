// frontend\src\app\(home)\layout.js
import Layout from "../../components/Layout";
import 'bootstrap/dist/css/bootstrap.css';

export default function HomeLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>AOP_Web</title>
      </head>
      <body>
        <Layout>
          {children}
        </Layout>
      </body>
    </html>    
  );  
}
