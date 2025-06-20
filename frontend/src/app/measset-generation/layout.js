// app/measset-generation/layout.js
import Layout from "../../components/Layout";

export const metadata = {
  title: "AOP WEB: Measset Generation",
};

export default function Template({ children }) {
  return (
    <html>
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}