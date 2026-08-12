'use client';

import { useEffect, useState, Suspense } from 'react';

const C = {
  page: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: '#f0f4f8',
    minHeight: '100vh',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 10,
    padding: '14px 20px',
    marginBottom: 14,
    boxShadow: '0 1px 6px rgba(0,0,0,.1)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
  },
  title: { fontSize: 17, fontWeight: 700, margin: 0, color: '#1e293b' },
  info:  { fontSize: 13, color: '#475569' },
  badges: { marginLeft: 'auto', display: 'flex', gap: 8 },
  badge: (t) => {
    const m = { neutral:['#e2e8f0','#334155'], success:['#dcfce7','#166534'], danger:['#fee2e2','#991b1b'] };
    const [bg, color] = m[t] || m.neutral;
    return { padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: bg, color };
  },
  msg: { width:'100%', fontSize:12, color:'#64748b', marginTop:4 },
  wrap: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 150px)',
    borderRadius: 10,
    boxShadow: '0 1px 6px rgba(0,0,0,.1)',
    background: '#fff',
  },
  table: { borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 13 },
  /* 헤더: 파라미터명 행 */
  th: {
    position: 'sticky', top: 0,
    background: '#1e3a5f', color: '#fff',
    padding: '9px 12px',
    textAlign: 'center', whiteSpace: 'nowrap',
    borderRight: '1px solid rgba(255,255,255,.15)',
    fontWeight: 600, zIndex: 10, minWidth: 100,
  },
  thMode: {
    position: 'sticky', top: 0, left: 0,
    background: '#1e3a5f', color: '#fff',
    padding: '9px 16px',
    textAlign: 'center',
    borderRight: '2px solid rgba(255,255,255,.3)',
    fontWeight: 600, zIndex: 20, minWidth: 70,
  },
  /* 데이터 행 */
  tdMode: {
    position: 'sticky', left: 0,
    background: '#f1f5f9',
    fontWeight: 700, fontSize: 14,
    padding: '10px 16px',
    textAlign: 'center',
    borderRight: '2px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
    color: '#1e293b', zIndex: 5,
  },
  td: (hasData) => ({
    padding: '10px 12px',
    textAlign: 'center',
    borderRight: '1px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
    background: hasData ? 'rgba(16,185,129,.05)' : 'rgba(239,68,68,.05)',
    color: hasData ? '#1e293b' : '#ef4444',
    fontWeight: hasData ? 400 : 700,
    fontSize: hasData ? 13 : 15,
    minWidth: 100,
  }),
};

function TxMatchingContent() {
  const [pivot, setPivot] = useState(null);
  const [meta, setMeta]   = useState(null);
  const [fallback, setFallback] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    try {
      const sp  = new URLSearchParams(window.location.search);
      const key = sp.get('storageKey');
      if (!key) { setError('storageKey 없음'); return; }
      const pRaw = sessionStorage.getItem(`${key}_pivot`);
      const mRaw = sessionStorage.getItem(`${key}_meta`);
      const fRaw = sessionStorage.getItem(key);
      if (pRaw) setPivot(JSON.parse(pRaw));
      if (mRaw) setMeta(JSON.parse(mRaw));
      if (!pRaw && fRaw) setFallback(JSON.parse(fRaw));
      if (!pRaw && !fRaw) setError('저장된 데이터가 없습니다.');
    } catch (e) {
      setError('데이터 로드 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh' }}>
      <div className="spinner-border text-primary" role="status" />
    </div>
  );
  if (error) return <div className="alert alert-danger m-3">{error}</div>;

  /* ── 피벗 테이블: 파라미터명 1행 + 데이터 행 ── */
  if (pivot) {
    const { modes, params, rows } = pivot;
    return (
      <div style={C.page}>

        {/* 요약 카드 */}
        <div style={C.card}>
          <span style={C.title}>Tx Summary Parameter Matching</span>
          {meta && (
            <>
              <span style={C.info}>
                ProbeID: <strong>{meta.selectedProbeId}</strong>
                &nbsp;|&nbsp;SW: <strong>{meta.selectedSoftwareVersion}</strong>
              </span>
              <div style={C.badges}>
                <span style={C.badge('neutral')}>총 {meta.totalCount}</span>
                <span style={C.badge('success')}>✓ {meta.matchCount}</span>
                <span style={C.badge(meta.mismatchCount > 0 ? 'danger' : 'neutral')}>
                  ✗ {meta.mismatchCount}
                </span>
              </div>
              {meta.message && <p style={C.msg}>{meta.message}</p>}
            </>
          )}
        </div>

        {/* 테이블: 1행=파라미터명, 이후=실제 데이터 */}
        <div style={C.wrap}>
          <table style={C.table}>
            <thead>
              <tr>
                {/* 1행: 파라미터명 헤더 */}
                <th style={C.thMode}>Mode</th>
                {params.map(p => (
                  <th key={p} style={C.th}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.Mode}>
                  {/* Mode 열 */}
                  <td style={C.tdMode}>{row.Mode || '—'}</td>
                  {/* 각 파라미터 셀: 실제 파일 데이터 또는 X */}
                  {params.map(p => {
                    const cell = row[p] || { match: 'X', fileValue: '—', dbValue: '—' };
                    const hasData = cell.fileValue !== '—' && cell.fileValue !== '';
                    return (
                      <td key={p} style={C.td(hasData)}>
                        {hasData ? cell.fileValue : 'X'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 범례 */}
        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', display: 'flex', gap: 16 }}>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>X</span>
          <span>= 파일에 데이터 없음 또는 매핑 불가</span>
          <span style={{ color: '#10b981', fontWeight: 600, marginLeft: 8 }}>초록 셀</span>
          <span>= 데이터 존재</span>
        </div>
      </div>
    );
  }

  /* ── 폴백 ── */
  if (fallback && fallback.length > 0) {
    const cols = Object.keys(fallback[0]);
    return (
      <div style={C.page}>
        <div style={C.card}>
          <span style={C.title}>Tx Summary Parameter Matching</span>
        </div>
        <div style={C.wrap}>
          <table style={C.table}>
            <thead>
              <tr>{cols.map(c => <th key={c} style={C.th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {fallback.map((r, i) => (
                <tr key={i}>
                  {cols.map(c => (
                    <td key={c} style={{ ...C.td(true), textAlign: 'left', padding: '8px 12px' }}>
                      {String(r[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>표시할 데이터가 없습니다.</div>;
}

export default function TxMatchingPopup() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    }>
      <TxMatchingContent />
    </Suspense>
  );
}
