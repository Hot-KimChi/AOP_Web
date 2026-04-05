import '../../globals.css';
import ThemeInit from '../../components/ThemeInit';

export const metadata = { title: 'AOP Web: Viewer' };

export default function ViewerLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('aop-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}` }} />
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
