import 'bootstrap/dist/css/bootstrap.min.css';
import '../../../globals.css';

export const metadata = {
  title: 'Data View — Viewer',
}

export default function StandaloneLayout({ children }) {
  return (
    <div className="standalone-viewer">
      {children}
    </div>
  );
}