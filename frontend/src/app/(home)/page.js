// frontend\src\app\(home)\page.js
export default function HomePage() {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center position-relative">
        <div className="text-center px-4">
          <div className="mb-4">
            <div className="d-inline-flex align-items-center justify-content-center rounded-4 shadow-lg mb-4" 
                 style={{ 
                   width: '100px', 
                   height: '100px',
                   background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                 }}>
              <span className="text-white fw-bold" style={{ fontSize: '3rem' }}>A</span>
            </div>
          </div>
          <h1 className="display-3 fw-bold mb-3">
            <span style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              AOP
            </span>
          </h1>
          <p className="fs-5 text-secondary mb-4">
            Acoustic Output Power Web-Server powered by Next.js 14
          </p>
          <div className="d-flex flex-wrap align-items-center justify-content-center gap-3">
            <span className="badge bg-primary-subtle text-primary px-3 py-2 fs-6">
              🚀 Next.js 14
            </span>
            <span className="badge bg-info-subtle text-info px-3 py-2 fs-6">
              ⚡ React 18
            </span>
            <span className="badge bg-success-subtle text-success px-3 py-2 fs-6">
              🎨 Bootstrap 5
            </span>
          </div>
        </div>
        
        {/* Version Info - Bottom Right */}
        <div className="position-fixed bottom-0 end-0 m-3" 
             style={{ 
               fontSize: '0.85rem',
               color: '#0d0d0e',
               opacity: 0.7,
               userSelect: 'none'
             }}>
          v 0.9.10
        </div>
      </div>
    );
  }
  
