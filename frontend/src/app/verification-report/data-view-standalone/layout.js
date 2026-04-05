import 'bootstrap/dist/css/bootstrap.min.css';
import '../../../globals.css';

export const metadata = {
  title: 'Data View — Verification Report',
}

export default function StandaloneLayout({ children }) {
  return (
    <div className="standalone-viewer">
      {children}
    </div>
  );
}