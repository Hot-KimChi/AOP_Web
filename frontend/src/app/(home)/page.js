// frontend\src\app\(home)\page.js
'use client';

const WEEKLY_SCHEDULE_URL = 'https://healthineersapc.sharepoint.com/:x:/r/teams/SUSKOUE/Shared%20Documents/AOP/Z_UE_AOP%20weekly/AOP%20weekly%20schedule.xlsx?d=wdfdc89b1439d4600b6af66d46b91b13b&csf=1&web=1&e=2FAyYg';
const WEEKLY_SCHEDULE_EMBED_URL = 'https://healthineersapc.sharepoint.com/teams/SUSKOUE/_layouts/15/Doc.aspx?sourcedoc=%7Bdfdc89b1-439d-4600-b6af-66d46b91b13b%7D&file=AOP%20weekly%20schedule.xlsx&action=embedview&mobileredirect=true';

export default function HomePage() {
  return (
    <div className="page-wrapper" style={{ padding: '0.5rem', height: 'calc(100vh - 1rem)' }}>
      <div style={{ width: '100%', height: '100%' }}>
        <div
          style={{
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1rem',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <h1 style={{ fontSize: '1rem', margin: 0, fontWeight: '700', color: 'var(--text)' }}>
              AOP Weekly Schedule
            </h1>
            <a
              href={WEEKLY_SCHEDULE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--text)',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.4rem 0.7rem',
                textDecoration: 'none',
                fontSize: '0.8rem',
                fontWeight: '600',
              }}
            >
              새 창에서 열기
            </a>
          </div>
          <iframe
            title="AOP Weekly Schedule"
            src={WEEKLY_SCHEDULE_EMBED_URL}
            style={{
              width: '100%',
              flex: 1,
              minHeight: '700px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: 'var(--bg)',
            }}
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
