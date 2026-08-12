'use client';

import { useEffect, useState, Suspense } from 'react';

/* ─────────── 스타일 상수 ─────────── */
const headerBg = '#1e3a5f';
const matchGreen = '#10b981';
const matchRed   = '#ef4444';
const borderClr  = '#e2e8f0';

const styles = {
  page: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: '#f0f4f8',
    minHeight: '100vh',
    padding: 16,
  },
  summaryCard: {
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
  pageTitle: {
    fontSize: 17,
    fontWeight: 700,
    margin: 0,
    color: '#1e293b',
    whiteSpace: 'nowrap',
  },
  info: {
    fontSize: 13,
    color: '#475569',
  },
  badgeGroup: {
    marginLeft: 'auto',
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: (type) => {
    const map = {
      neutral: ['#e2e8f0', '#334155'],
      success: ['#dcfce7', '#166534'],
      danger:  ['#fee2e2', '#991b1b'],
    };
    const [bg, color] = map[type] || map.neutral;
    return {
      padding: '3px 12px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
    };
  },
  message: {
    width: '100%',
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  tableWrap: {
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 150px)',
    borderRadius: 10,
    boxShadow: '0 1px 6px rgba(0,0,0,.1)',
    background: '#fff',
  },
  table: {
    borderCollapse: 'separate',
    borderSpacing: 0,
    width: '100%',
    fontSize: 12,
  },
  /* 헤더 행 1: 파라미터 이름 */
  thParam: {
    position: 'sticky',
    top: 0,
    background: headerBg,
    color: '#fff',
    padding: '8px 10px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    borderRight: '1px solid rgba(255,255,255,.15)',
    fontWeight: 600,
    zIndex: 10,
    minWidth: 100,
  },
  /* 헤더 행 1: Mode 고정셀 */
  thMode: {
    position: 'sticky',
    top: 0,
    left: 0,
    background: headerBg,
    color: '#fff',
    padding: '8px 16px',
    textAlign: 'left',
    borderRight: '2px solid rgba(255,255,255,.3)',
    fontWeight: 600,
    zIndex: 20,
    minWidth: 70,
  },
  /* 헤더 행 2: "DB | File" 부제목 */
  thSub: {
    position: 'sticky',
    top: 34,               // 첫 번째 헤더 높이만큼 offset
    background: '#2d4f7c',
    color: 'rgba(255,255,255,.8)',
    padding: '4px 10px',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 500,
    borderRight: '1px solid rgba(255,255,255,.1)',
    zIndex: 10,
  },
  thSubMode: {
    position: 'sticky',
    top: 34,
    left: 0,
    background: '#2d4f7c',
    color: 'rgba(255,255,255,.6)',
    padding: '4px 16px',
    fontSize: 10,
    fontWeight: 500,
    borderRight: '2px solid rgba(255,255,255,.2)',
    zIndex: 20,
  },
  tdMode: {
    position: 'sticky',
    left: 0,
    background: '#f8fafc',
    fontWeight: 700,
    padding: '0 16px',
    borderRight: '2px solid ' + borderClr,
    borderBottom: '1px solid ' + borderClr,
    color: '#1e293b',
    zIndex: 5,
    minWidth: 70,
    textAlign: 'center',
    fontSize: 13,
  },
  tdCell: (match) => ({
    padding: '8px 10px',
    textAlign: 'center',
    borderRight: '1px solid ' + borderClr,
    borderBottom: '1px solid ' + borderClr,
    background: match === 'O' ? 'rgba(16,185,129,.06)' : match === 'X' ? 'rgba(239,68,68,.06)' : 'transparent',
    verticalAlign: 'middle',
  }),
  matchDot: (match) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: '50%',
    fontSize: 12,
    fontWeight: 700,
    background: match === 'O' ? matchGreen : matchRed,
    color: '#fff',
    margin: '0 auto 3px',
  }),
  valRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  valLabel: {
    fontSize: 10,
    color: '#94a3b8',
    lineHeight: 1.2,
  },
  dbVal: {
    fontSize: 11,
    color: '#334155',
    fontWeight: 500,
    wordBreak: 'break-all',
  },
  fileVal: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: 500,
    wordBreak: 'break-all',
  },
};

/* ─────────── 메인 컴포넌트 ─────────── */
function TxMatchingContent() {
  const [pivot, setPivot] = useState(null);
  const [meta, setMeta]   = useState(null);
  const [fallback, setFallback] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const key = sp.get('storageKey');
      if (!key) { setError('storageKey 없음'); return; }

      const pivotRaw   = sessionStorage.getItem(`${key}_pivot`);
      const metaRaw    = sessionStorage.getItem(`${key}_meta`);
      const fallRaw    = sessionStorage.getItem(key);

      if (pivotRaw)          setPivot(JSON.parse(pivotRaw));
      if (metaRaw)           setMeta(JSON.parse(metaRaw));
      if (!pivotRaw && fallRaw) setFallback(JSON.parse(fallRaw));
      if (!pivotRaw && !fallRaw) setError('저장된 데이터가 없습니다.');
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

  /* ── 피벗 테이블 ── */
  if (pivot) {
    const { modes, params, rows } = pivot;
    return (
      <div style={styles.page}>

        {/* 상단 요약 */}
        <div style={styles.summaryCard}>
          <span style={styles.pageTitle}>Tx Summary Parameter Matching</span>
          {meta && (
            <>
              <span style={styles.info}>
                ProbeID: <strong>{meta.selectedProbeId}</strong>
                &nbsp;|&nbsp;SW: <strong>{meta.selectedSoftwareVersion}</strong>
              </span>
              <div style={styles.badgeGroup}>
                <span style={styles.badge('neutral')}>총 {meta.totalCount}</span>
                <span style={styles.badge('success')}>✓ 일치 {meta.matchCount}</span>
                <span style={styles.badge(meta.mismatchCount > 0 ? 'danger' : 'neutral')}>
                  ✗ 불일치 {meta.mismatchCount}
                </span>
              </div>
              {meta.message && <p style={styles.message}>{meta.message}</p>}
            </>
          )}
        </div>

        {/* 피벗 테이블 */}
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              {/* 행 1: 파라미터 이름 */}
              <tr>
                <th style={styles.thMode}>Mode</th>
                {params.map(p => (
                  <th key={p} style={styles.thParam}>{p}</th>
                ))}
              </tr>
              {/* 행 2: DB / File 부제목 */}
              <tr>
                <th style={styles.thSubMode}></th>
                {params.map(p => (
                  <th key={p} style={styles.thSub}>DB → File</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.Mode}>
                  <td style={styles.tdMode}>{row.Mode || '—'}</td>
                  {params.map(p => {
                    const cell = row[p] || { match: 'X', fileValue: '—', dbValue: '—' };
                    return (
                      <td key={p} style={styles.tdCell(cell.match)}>
                        <div style={styles.valRow}>
                          <div style={styles.matchDot(cell.match)}>{cell.match}</div>
                          <span style={styles.dbVal}>{cell.dbValue}</span>
                          <span style={styles.valLabel}>↓</span>
                          <span style={styles.fileVal}>{cell.fileValue}</span>
                        </div>
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
          <span><span style={{ color: '#334155', fontWeight: 600 }}>위 값</span>: DB 기준값</span>
          <span><span style={{ color: '#6366f1', fontWeight: 600 }}>아래 값</span>: 파일 실제값</span>
          <span style={{ marginLeft: 'auto' }}>
            <span style={{ background: matchGreen, color: '#fff', borderRadius: '50%', padding: '1px 6px', fontWeight: 700, fontSize: 11 }}>O</span>
            &nbsp;일치&nbsp;&nbsp;
            <span style={{ background: matchRed, color: '#fff', borderRadius: '50%', padding: '1px 6px', fontWeight: 700, fontSize: 11 }}>X</span>
            &nbsp;불일치 또는 데이터 없음
          </span>
        </div>
      </div>
    );
  }

  /* ── 폴백: 요약 테이블 ── */
  if (fallback && fallback.length > 0) {
    const cols = Object.keys(fallback[0]);
    return (
      <div style={styles.page}>
        <div style={styles.summaryCard}>
          <span style={styles.pageTitle}>Tx Summary Parameter Matching</span>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {cols.map(c => <th key={c} style={styles.thParam}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {fallback.map((r, i) => (
                <tr key={i}>
                  {cols.map(c => (
                    <td key={c} style={{ ...styles.tdCell(null), textAlign: 'left', padding: '8px 12px' }}>
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

