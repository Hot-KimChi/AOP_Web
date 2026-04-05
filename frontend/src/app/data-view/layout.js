import 'bootstrap/dist/css/bootstrap.min.css';
import '../../globals.css';
import ThemeInit from '../../components/ThemeInit';

export const metadata = {
  title: 'Data View — MeasSet',
}

export default function DataViewLayout({ children }) {
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
