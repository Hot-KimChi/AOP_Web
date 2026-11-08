import Layout from "../../components/Layout";
import ThemeInit from '../../components/ThemeInit';

export const metadata = { title: 'AOP Web: Interrogator' };

export default function InterrogatorLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('aop-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}` }} />
        <ThemeInit />
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
