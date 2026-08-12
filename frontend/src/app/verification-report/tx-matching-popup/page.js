'use client';

import { useEffect, useState, Suspense } from 'react';

/* ── 스타일 (인라인 CSS-in-JS) ── */
const S = {
  page: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: 'var(--bg-primary, #f0f2f5)',
    minHeight: '100vh',
    padding: '16px',
    color: 'var(--text-primary, #1a1a2e)',
  },
  header: {
    background: 'var(--card-bg, #ffffff)',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    margin: 0,
    color: 'var(--text-primary, #1a1a2e)',
  },
  badge: (color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 600,
    background: color === 'success' ? '#d1fae5' : color === 'danger' ? '#fee2e2' : '#e5e7eb',
    color: color === 'success' ? '#065f46' : color === 'danger' ? '#991b1b' : '#374151',
  }),
  tableWrap: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 160px)',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    background: 'var(--card-bg, #ffffff)',
  },
  table: {
    borderCollapse: 'separate',
    borderSpacing: 0,
    width: '100%',
    fontSize: 13,
  },
  th: {
    position: 'sticky',
    top: 0,
    background: 'var(--table-header-bg, #1e3a5f)',
    color: '#ffffff',
    padding: '10px 10px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    borderRight: '1px solid rgba(255,255,255,.15)',
    fontWeight: 600,
    zIndex: 10,
  },
  thFirst: {
    position: 'sticky',
    top: 0,
    left: 0,
    background: 'var(--table-header-bg, #1e3a5f)',
    color: '#ffffff',
    padding: '10px 14px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderRight: '1px solid rgba(255,255,255,.25)',
    fontWeight: 600,
    zIndex: 20,
    minWidth: 80,
  },
  tdMode: {
    position: 'sticky',
    left: 0,
    background: 'var(--card-bg, #fff)',
    fontWeight: 700,
    padding: '8px 14px',
    borderRight: '2px solid #e5e7eb',
    borderBottom: '1px solid #f0f0f0',
    color: 'var(--text-primary, #1a1a2e)',
    zIndex: 5,
    minWidth: 80,
  },
  tdCell: (match) => ({
    padding: '6px 8px',
    textAlign: 'center',
    borderRight: '1px solid #f0f0f0',
    borderBottom: '1px solid #f0f0f0',
    background: match === 'O'
      ? 'rgba(16,185,129,.08)'
      : match === 'X'
      ? 'rgba(239,68,68,.08)'
      : 'transparent',
    minWidth: 90,
  }),
  matchIcon: (match) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: '50%',
    fontSize: 13,
    fontWeight: 700,
    background: match === 'O' ? '#10b981' : '#ef4444',
    color: '#fff',
    marginBottom: 2,
  }),
  fileVal: {
    fontSize: 11,
    color: 'var(--text-secondary, #6b7280)',
    marginTop: 2,
    wordBreak: 'break-all',
  },
  noData: {
    textAlign: 'center',
    padding: 48,
    color: 'var(--text-secondary, #6b7280)',
    fontSize: 15,
  },
};

function TxMatchingContent() {
  const [pivot, setPivot] = useState(null);   // { modes, params, rows }
  const [meta, setMeta] = useState(null);
  const [fallbackRows, setFallbackRows] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const storageKey = sp.get('storageKey');
      if (!storageKey) { setError('storageKey 파라미터가 없습니다.'); return; }

      const pivotRaw = sessionStorage.getItem(`${storageKey}_pivot`);
      const metaRaw = sessionStorage.getItem(`${storageKey}_meta`);
      const fallbackRaw = sessionStorage.getItem(storageKey);

      if (pivotRaw) setPivot(JSON.parse(pivotRaw));
      if (metaRaw) setMeta(JSON.parse(metaRaw));
      if (!pivotRaw && fallbackRaw) setFallbackRows(JSON.parse(fallbackRaw));
      if (!pivotRaw && !fallbackRaw) setError('데이터가 없습니다.');
    } catch (e) {
      setError('데이터 로드 오류: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="spinner-border text-primary" role="status" />
    </div>
  );
  if (error) return <div className="alert alert-danger m-3">{error}</div>;

  /* ── 피벗 테이블 ── */
  if (pivot) {
    const { modes, params, rows } = pivot;
    return (
      <div style={S.page}>
        {/* 헤더 요약 */}
        <div style={S.header}>
          <h1 style={S.title}>Tx Summary Parameter Matching</h1>
          {meta && (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-secondary,#6b7280)' }}>
                ProbeID: <strong>{meta.selectedProbeId}</strong>
                &nbsp;|&nbsp;SW: <strong>{meta.selectedSoftwareVersion}</strong>
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <span style={S.badge('default')}>총 {meta.totalCount}개</span>
                <span style={S.badge('success')}>✓ 일치 {meta.matchCount}</span>
                <span style={S.badge(meta.mismatchCount > 0 ? 'danger' : 'default')}>
                  ✗ 불일치 {meta.mismatchCount}
                </span>
              </div>
            </>
          )}
          {meta?.message && (
            <div style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary,#6b7280)', marginTop: 2 }}>
              {meta.message}
            </div>
          )}
        </div>

        {/* 피벗 테이블 */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {/* 첫 번째 헤더: Mode */}
                <th style={S.thFirst}>Mode</th>
                {/* X축: 파라미터 이름 */}
                {params.map(p => (
                  <th key={p} style={S.th}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.Mode}>
                  {/* Mode 고정 열 */}
                  <td style={S.tdMode}>{row.Mode || '—'}</td>
                  {/* 각 파라미터 셀 */}
                  {params.map(p => {
                    const cell = row[p] || { match: 'X', fileValue: '—', dbValue: '—' };
                    const match = cell.match;
                    return (
                      <td key={p} style={S.tdCell(match)}>
                        <div style={S.matchIcon(match)}>{match}</div>
                        <div style={S.fileVal}>{cell.fileValue}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ── 피벗 없을 때 폴백: 단순 요약 테이블 ── */
  if (fallbackRows && fallbackRows.length > 0) {
    const cols = Object.keys(fallbackRows[0]);
    return (
      <div style={S.page}>
        <div style={S.header}>
          <h1 style={S.title}>Tx Summary Parameter Matching</h1>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {cols.map(c => <th key={c} style={S.th}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {fallbackRows.map((row, i) => (
                <tr key={i}>
                  {cols.map(c => (
                    <td key={c} style={{ ...S.tdCell(null), textAlign: 'left', padding: '8px 12px' }}>
                      {String(row[c] ?? '—')}
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

  return <div style={S.noData}>표시할 데이터가 없습니다.</div>;
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
