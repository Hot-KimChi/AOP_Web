import 'bootstrap/dist/css/bootstrap.min.css';
import '../../globals.css';
import ThemeInit from '../../components/ThemeInit';

export const metadata = {
  title: 'AOP Web: Login',
}

export default function AuthLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}