// frontend\src\app\(home)\page.js
'use client';

const WEEKLY_SCHEDULE_URL = 'https://healthineersapc.sharepoint.com/:x:/r/teams/SUSKOUE/Shared%20Documents/AOP/Z_UE_AOP%20weekly/AOP%20weekly%20schedule.xlsx?d=wdfdc89b1439d4600b6af66d46b91b13b&csf=1&web=1&e=2FAyYg';
const WEEKLY_SCHEDULE_FILE_URL = 'https://healthineersapc.sharepoint.com/teams/SUSKOUE/Shared%20Documents/AOP/Z_UE_AOP%20weekly/AOP%20weekly%20schedule.xlsx';
const WEEKLY_SCHEDULE_EMBED_URL = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(WEEKLY_SCHEDULE_FILE_URL)}`;

export default function HomePage() {
  return (
    <div className="page-wrapper" style={{ padding: '1rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div
          style={{
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1rem',
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
              height: '760px',
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
