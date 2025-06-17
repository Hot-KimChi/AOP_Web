// src/app/viewer/data-view-standalone/layout.js
export const metadata = {
    title: 'Verification Report',
  }
  
  export default function StandaloneLayout({ children }) {
    return (
      <div className="standalone-viewer bg-light">
        <link 
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" 
          rel="stylesheet"
        />
        {children}
      </div>
    );
  }