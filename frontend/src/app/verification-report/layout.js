import Layout from "../../components/Layout";

export default function Template({ children }) {
  return (
    <html>
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}