import Layout from "../../components/Layout";

export default function HomeLayout({ children }) {
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
