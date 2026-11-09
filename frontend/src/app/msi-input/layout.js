import PopupLayout from '../../components/PopupLayout';
import ThemeInit from '../../components/ThemeInit';

export const metadata = { title: 'AOP Web: measSetInput' };

export default function MsiInputLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('aop-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}` }} />
        <ThemeInit />
        <PopupLayout>{children}</PopupLayout>
      </body>
    </html>
  );
}
