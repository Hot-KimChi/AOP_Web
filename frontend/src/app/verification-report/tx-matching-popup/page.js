'use client';

import { useEffect, useState, Suspense } from 'react';

/* ─── 스타일 상수 ─── */
const HDR_BG  = '#1e3a5f';
const BORDER  = '#d1d5db';
const ROW_ODD = '#f9fafb';

const S = {
  page: {
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    background: '#f0f4f8',
    minHeight: '100vh',
    padding: '12px 16px',
    boxSizing: 'border-box',
  },
  /* ─ 상단 카드 ─ */
  headerCard: {
    background: '#fff',
    borderRadius: 8,
    padding: '12px 18px',
    marginBottom: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,.1)',
  },
  /* 첫 번째 줄: 제목 + 통계 칩 */
  headerRow1: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1e293b',
    marginRight: 4,
  },
  chip: (type) => {
    const map = {
      total:   ['#e2e8f0', '#334155'],
      rate:    ['#dbeafe', '#1d4ed8'],
      success: ['#dcfce7', '#166534'],
      danger:  ['#fee2e2', '#991b1b'],
    };
    const [bg, color] = map[type] || map.total;
    return {
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600,
      background: bg, color,
      whiteSpace: 'nowrap',
    };
  },
  /* 두 번째 줄: 메타 텍스트 */
  headerRow2: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 0,
    borderTop: '1px solid #f1f5f9',
    paddingTop: 8,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 1.7,
  },
  metaLabel: { color: '#94a3b8', marginRight: 3 },
  metaVal:   { fontWeight: 600, color: '#1e293b', marginRight: 18 },
  msgText: (isWarn) => ({
    fontSize: 12,
    color: isWarn ? '#b45309' : '#475569',
    fontStyle: 'italic',
    marginTop: 0,
  }),
  /* ─ 테이블 래퍼 ─ */
  tableWrap: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 4px rgba(0,0,0,.1)',
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 110px)',
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: 12,
    tableLayout: 'auto',
  },
  /* 헤더: 파라미터명 */
  th: {
    position: 'sticky', top: 0, zIndex: 10,
    background: HDR_BG, color: '#fff',
    padding: '8px 10px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    border: `1px solid rgba(255,255,255,.15)`,
    fontWeight: 600,
    fontSize: 12,
    minWidth: 90,
  },
  /* 데이터 셀 */
  td: (hasData, rowIdx) => ({
    padding: '7px 10px',
    textAlign: 'center',
    border: `1px solid ${BORDER}`,
    background: hasData
      ? (rowIdx % 2 === 0 ? '#fff' : ROW_ODD)
      : (rowIdx % 2 === 0 ? 'rgba(239,68,68,.06)' : 'rgba(239,68,68,.10)'),
    color: hasData ? '#1e293b' : '#dc2626',
    fontWeight: hasData ? 400 : 700,
    fontSize: hasData ? 12 : 13,
    whiteSpace: 'nowrap',
  }),
  /* 범례 */
  legend: {
    marginTop: 8, fontSize: 11, color: '#94a3b8',
    display: 'flex', gap: 16, flexWrap: 'wrap',
  },
};

/* ─── 메인 컴포넌트 ─── */
function TxMatchingContent() {
  const [pivot,    setPivot]    = useState(null);
  const [meta,     setMeta]     = useState(null);
  const [fallback, setFallback] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <span style={{ color: '#64748b', fontSize: 14 }}>불러오는 중…</span>
    </div>
  );
  if (error) return (
    <div style={{ margin: 24, padding: 16, background: '#fee2e2', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
      {error}
    </div>
  );

  /* ────────────── 피벗 테이블 뷰 ────────────── */
  if (pivot) {
    const { params, rows } = pivot;

    /* 매칭률 계산: Mode·TxSummaryID 제외 */
    const SKIP = new Set(['TxSummaryID', 'Mode']);
    const calcParams = params.filter(p => !SKIP.has(p));

    let totalCells = 0, matchedCells = 0;
    rows.forEach(row => {
      calcParams.forEach(p => {
        totalCells++;
        const cell = row[p];
        if (cell && cell.fileValue !== '—' && cell.fileValue !== '') matchedCells++;
      });
    });
    const matchRate = totalCells > 0 ? Math.round((matchedCells / totalCells) * 100) : 0;
    const paramCount = calcParams.length;   // 파라미터 개수 (TxSummaryID 제외)

    return (
      <div style={S.page}>

        {/* ── 상단 헤더 카드 ── */}
        <div style={S.headerCard}>
          {/* 줄 1: 제목 + 통계 칩 */}
          <div style={S.headerRow1}>
            <span style={S.pageTitle}>Tx Summary Parameter Matching</span>
            <span style={S.chip('total')}>총 {paramCount}개 parameter</span>
            <span style={S.chip(matchRate >= 80 ? 'success' : matchRate >= 50 ? 'rate' : 'danger')}>
              매칭률 {matchRate}%
            </span>
          </div>
          {/* 줄 2: ProbeID / SW version / 메시지 텍스트 */}
          <div style={S.headerRow2}>
            {meta && (
              <>
                <span style={S.metaLabel}>선택한 ProbeID</span>
                <span style={S.metaVal}>{meta.selectedProbeId || '—'}</span>
                <span style={S.metaLabel}>선택한 SW version</span>
                <span style={S.metaVal}>{meta.selectedSoftwareVersion || '—'}</span>
                {meta.message && (
                  <span style={S.msgText(meta.message.includes('경고') || meta.message.includes('없음'))}>
                    {meta.message}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── 테이블: 헤더=파라미터명, 행=실제 데이터 ── */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {params.map(p => (
                  <th key={p} style={S.th}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={row._rowNo ?? rowIdx}>
                  {params.map(p => {
                    // Mode 컬럼은 _modeStr(문자열)로 직접 표시
                    if (p === 'Mode') {
                      return (
                        <td key="Mode" style={{ ...S.td(true, rowIdx), fontWeight: 600 }}>
                          {row._modeStr || '—'}
                        </td>
                      );
                    }
                    const cell = row[p] || { fileValue: '—' };
                    const hasData = cell.fileValue !== '—' && cell.fileValue !== '' && cell.fileValue != null;
                    return (
                      <td key={p} style={S.td(hasData, rowIdx)}>
                        {hasData ? cell.fileValue : 'X'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── 범례 ── */}
        <div style={S.legend}>
          <span><span style={{ color: '#dc2626', fontWeight: 700 }}>X</span> = 파일에 데이터 없음 또는 매핑 불가</span>
          <span style={{ color: '#16a34a' }}>초록/흰 셀 = 데이터 존재</span>
        </div>
      </div>
    );
  }

  /* ────────────── 폴백 뷰 ────────────── */
  if (fallback && fallback.length > 0) {
    const cols = Object.keys(fallback[0]);
    return (
      <div style={S.page}>
        <div style={S.headerCard}>
          <div style={S.headerRow1}>
            <span style={S.pageTitle}>Tx Summary Parameter Matching</span>
          </div>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>{cols.map(c => <th key={c} style={S.th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {fallback.map((r, i) => (
                <tr key={i}>
                  {cols.map(c => (
                    <td key={c} style={{ ...S.td(true, i), textAlign: 'left' }}>
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

  return (
    <div style={{ textAlign: 'center', padding: 64, color: '#94a3b8', fontSize: 14 }}>
      표시할 데이터가 없습니다.
    </div>
  );
}

export default function TxMatchingPopup() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <span style={{ color: '#64748b', fontSize: 14 }}>불러오는 중…</span>
      </div>
    }>
      <TxMatchingContent />
    </Suspense>
  );
}
