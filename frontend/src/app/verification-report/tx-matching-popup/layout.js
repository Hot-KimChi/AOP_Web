import 'bootstrap/dist/css/bootstrap.min.css';
import '../../../globals.css';

export const metadata = {
  title: 'Tx Summary Parameter Matching',
};

export default function TxMatchingPopupLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: 'var(--bg-primary, #f8f9fa)' }}>
        {children}
      </body>
    </html>
  );
}
