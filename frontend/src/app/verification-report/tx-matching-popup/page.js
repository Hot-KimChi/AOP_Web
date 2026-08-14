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
    padding: '10px 10px',
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
  headerRow3: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    borderTop: '1px dashed #e2e8f0',
    marginTop: 8,
    paddingTop: 8,
    fontSize: 12,
    color: '#64748b',
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
    overflowX: 'hidden',
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 110px)',
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: 11,
    tableLayout: 'fixed',
  },
  /* 헤더: 파라미터명 */
  th: {
    position: 'sticky', top: 0, zIndex: 10,
    background: HDR_BG, color: '#fff',
    padding: '6px 6px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    border: `1px solid rgba(255,255,255,.15)`,
    fontWeight: 600,
    fontSize: 10,
    minWidth: 0,
  },
  /* 데이터 셀 — 상태별 스타일 */
  td: (val, rowIdx) => {
    const isUnmatched = val === 'UNMATCHED';
    const isNull      = val === 'NULL';
    const isMissing   = isUnmatched || isNull;
    return {
      padding: '6px 6px',
      textAlign: 'center',
      border: `1px solid ${BORDER}`,
      background: isMissing
        ? (rowIdx % 2 === 0 ? 'rgba(239,68,68,.07)' : 'rgba(239,68,68,.12)')
        : (rowIdx % 2 === 0 ? '#fff' : ROW_ODD),
      color: isMissing ? '#dc2626' : '#1e293b',
      fontWeight: isMissing ? 700 : 400,
      fontSize: 10,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    };
  },
  tdMode: (rowIdx) => ({
    padding: '7px 12px',
    textAlign: 'center',
    border: `1px solid ${BORDER}`,
    background: rowIdx % 2 === 0 ? '#f8fafc' : '#f1f5f9',
    color: '#1e293b',
    fontWeight: 600,
    fontSize: 12,
    whiteSpace: 'nowrap',
  }),
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
    const toDisplay = (raw) => {
      const val = (raw !== null && typeof raw === 'object')
        ? (raw.fileValue ?? 'UNMATCHED')
        : (raw ?? 'UNMATCHED');
      return (val === '—' || val === 'UNMATCHED') ? 'UNMATCHED'
           : (val === 'NULL' || val === '') ? 'NULL'
           : val;
    };

    /* 파라미터 수 및 매칭률 계산 제외 */
    const SKIP = new Set([
      'txsummaryid',
      'probeid',
      'software_version',
      'probename',
      'isprocessed',
      'combined_mode',
    ]);
    const calcParams = params.filter((p) => !SKIP.has(String(p).toLowerCase()));
    const paramCount = calcParams.length;

    let totalCells = 0, matchedCells = 0;
    rows.forEach(row => {
      calcParams.forEach(p => {
        totalCells++;
        const val = toDisplay(row[p]);
        if (val !== 'UNMATCHED' && val !== '—' && val !== 'NULL' && val !== '') matchedCells++;
      });
    });
    const matchRate = totalCells > 0 ? Math.round((matchedCells / totalCells) * 100) : 0;
    const excludedForRate = new Set([
      'txsummaryid',
      'probeid',
      'software_version',
      'probename',
      'isprocessed',
      'combined_mode',
    ]);
    const paramMatchStatus = {};
    params.forEach((p) => {
      const lower = String(p).toLowerCase();
      if (excludedForRate.has(lower)) {
        paramMatchStatus[p] = '-';
        return;
      }
      // 포함 컬럼은 "컬럼 매핑 여부" 기준:
      // 하나라도 UNMATCHED가 아닌 값이 있으면 O, 전부 UNMATCHED면 X
      let mapped = false;
      for (const row of rows) {
        const val = toDisplay(row[p]);
        if (val !== 'UNMATCHED') {
          mapped = true;
          break;
        }
      }
      paramMatchStatus[p] = mapped ? 'O' : 'X';
    });

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
              </>
            )}
          </div>
          <div style={S.headerRow3}>
            <span><span style={{ color: '#86efac', fontWeight: 700 }}>O</span> : 매칭률 포함 + txt 컬럼 매핑됨</span>
            <span><span style={{ color: '#fecaca', fontWeight: 700 }}>X</span> : 매칭률 포함 + txt 컬럼 매핑 안됨</span>
            <span><span style={{ color: '#cbd5e1', fontWeight: 700 }}>-</span> : 매칭률 제외(TxSummaryID/ProbeID/SW/ProbeName/IsProcessed/Combined_mode)</span>
            <span><span style={{ color: '#dc2626', fontWeight: 700 }}>NULL</span> : 데이터 셀의 실제 값 없음</span>
          </div>
        </div>

        {/* ── 테이블: 헤더=파라미터명, 행=실제 데이터 ── */}
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {params.map(p => (
                  <th key={p} style={S.th}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15 }}>
                      <span>{p}</span>
                      <span
                        style={{
                          color:
                            paramMatchStatus[p] === 'O'
                              ? '#86efac'
                              : paramMatchStatus[p] === '-'
                                ? '#cbd5e1'
                                : '#fecaca',
                          fontWeight: 700,
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {paramMatchStatus[p]}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={row._rowNo ?? rowIdx}>
                  {params.map(p => {
                    const display = toDisplay(row[p]);
                    const isTxSummaryId = String(p).toLowerCase() === 'txsummaryid';
                    return (
                      <td key={p} style={S.td(display, rowIdx)}>
                        {(display === 'UNMATCHED' || display === 'NULL')
                          ? (isTxSummaryId ? '' : 'NULL')
                          : display}
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
