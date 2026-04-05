// frontend\src\app\(home)\page.js
'use client';

import Link from 'next/link';

const features = [
  {
    icon: '⚙️',
    title: 'MeasSet Generation',
    desc: 'Generate measurement setting data from probe configurations and upload to the SQL database.',
    href: '/measset-generation',
    accent: '#6366f1',
  },
  {
    icon: '🔍',
    title: 'Viewer',
    desc: 'Browse and inspect any database table with real-time data exploration.',
    href: '/viewer',
    accent: '#0ea5e9',
  },
  {
    icon: '📋',
    title: 'Verification Report',
    desc: 'Extract and compare TX summary tables for acoustic output power verification.',
    href: '/verification-report',
    accent: '#10b981',
  },
  {
    icon: '📄',
    title: 'SSR DocOut',
    desc: 'Export station setup records to Word document format for compliance reporting.',
    href: '/SSR_DocOut',
    accent: '#f59e0b',
  },
  {
    icon: '🧠',
    title: 'Machine Learning',
    desc: 'Train and evaluate predictive models to estimate acoustic output power intensity.',
    href: '/machine-learning',
    accent: '#8b5cf6',
  },
];

export default function HomePage() {
  return (
    <div className="page-wrapper">

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '3rem 1rem 2rem' }}>
        <div style={{
          width: '68px', height: '68px', borderRadius: '16px',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: '800', fontSize: '1.75rem',
          boxShadow: '0 8px 24px rgba(99,102,241,0.28)',
          marginBottom: '1.25rem',
        }}>A</div>

        <h1 className="home-hero-title" style={{ fontSize: '1.875rem', fontWeight: '800', color: 'var(--text)', margin: '0 0 0.75rem' }}>
          AOP Web Platform
        </h1>
        <p className="home-hero-desc" style={{
          fontSize: '0.9375rem', color: 'var(--text-sec)',
          maxWidth: '500px', margin: '0 auto',
          lineHeight: '1.65',
        }}>
          Acoustic Output Power management platform — measurement generation,
          verification reporting, and ML-powered analysis.
        </p>
      </div>

      {/* Feature Grid — 5개 카드, 항상 1줄 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '1rem',
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '0 1rem',
      }}>
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="home-feature-card"
            style={{
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.25rem',
              textDecoration: 'none',
              display: 'block',
              transition: 'box-shadow 0.18s, transform 0.18s, border-color 0.18s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = f.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '';
            }}
          >
            <div style={{ fontSize: '1.625rem', marginBottom: '0.75rem', lineHeight: 1 }}>{f.icon}</div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text)', margin: '0 0 0.5rem' }}>
              {f.title}
            </h3>
            <p style={{ fontSize: '0.775rem', color: 'var(--text-sec)', lineHeight: '1.55', margin: 0 }}>
              {f.desc}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}


