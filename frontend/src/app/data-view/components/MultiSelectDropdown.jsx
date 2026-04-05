/**
 * 멀티 선택 드롭다운 컴포넌트
 *
 * @description
 * 엑셀 스타일의 다중 선택 필터 드롭다운입니다.
 *
 * ─ 핵심 설계 ─
 *  - React Portal (createPortal → document.body) 사용:
 *    테이블 컨테이너의 `overflow: auto` 클리핑과
 *    `position: sticky`의 스태킹 컨텍스트 한계를 완전히 우회합니다.
 *  - position: fixed + getBoundingClientRect():
 *    뷰포트 기준으로 위치를 계산하여 어떤 스크롤/overflow 환경에서도 정확히 표시됩니다.
 *  - 외부 클릭/ESC/스크롤 시 자동 닫힘
 *  - 컬럼 내 OR 로직: 체크박스로 여러 값 동시 선택
 *  - 연쇄 필터 반영: options는 이미 cascadedOptions 기준으로 전달됨
 */

'use client';

import React, {
  useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, Search } from 'lucide-react';

export const MultiSelectDropdown = React.memo(({
  column,
  options,   // string[] — cascadedOptions 기준 선택 가능한 옵션
  selected,  // string[] — 현재 선택된 값들
  onChange,  // (column: string, values: string[]) => void
  onClear,   // (column: string) => void
}) => {
  const [isOpen,   setIsOpen]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 180 });
  const [mounted,  setMounted]  = useState(false);

  const triggerRef = useRef(null);
  const panelRef   = useRef(null);

  // Portal은 클라이언트에서만 마운트
  useEffect(() => { setMounted(true); }, []);

  // 드롭다운 열릴 때 트리거 위치 계산 (Fixed 포지셔닝 기준)
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      top:   rect.bottom + 2,
      left:  rect.left,
      width: Math.max(rect.width, 190),
    });
  }, [isOpen]);

  // 외부 클릭 → 닫힘
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPanel   = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen]);

  // 스크롤 → 닫힘 (Fixed 위치 어긋남 방지)
  // 단, 패널 내부(옵션 목록) 스크롤은 무시 — 목록 탐색 중 닫히지 않도록
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      setIsOpen(false);
      setSearch('');
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [isOpen]);

  // ESC 키 → 닫힘
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setIsOpen(false); setSearch(''); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // ── 파생 값 ─────────────────────────────────────────────
  const filteredOptions = useMemo(() =>
    options.filter(opt =>
      String(opt).toLowerCase().includes(search.toLowerCase())
    ),
    [options, search],
  );

  const hasSelection  = selected.length > 0;
  const isAllSelected = hasSelection && selected.length === options.length;

  // ── 핸들러 ───────────────────────────────────────────────
  const toggle = useCallback((value) => {
    const strVal = String(value);
    const next = selected.includes(strVal)
      ? selected.filter(v => v !== strVal)
      : [...selected, strVal];
    onChange(column, next);
  }, [selected, column, onChange]);

  const selectAll = useCallback(() => {
    const targets = (search ? filteredOptions : options).map(o => String(o));
    onChange(column, [...new Set([...selected, ...targets])]);
  }, [filteredOptions, options, selected, search, column, onChange]);

  const clearAll = useCallback(() => onClear(column), [column, onClear]);

  // ── 트리거 라벨 ──────────────────────────────────────────
  const triggerLabel = () => {
    if (!hasSelection)
      return <span style={ST.labelMuted}>필터...</span>;
    if (isAllSelected)
      return <span style={ST.labelAll}>전체</span>;
    if (selected.length === 1)
      return (
        <span style={ST.labelSingle} title={selected[0]}>
          {selected[0] === '' ? '(빈값)' : selected[0]}
        </span>
      );
    return <span style={ST.labelCount}>{selected.length}개 선택</span>;
  };

  // ── 드롭다운 패널 (Portal로 body에 렌더) ─────────────────
  const panel = (
    <div
      ref={panelRef}
      style={{
        position:        'fixed',
        top:             panelPos.top,
        left:            panelPos.left,
        minWidth:        panelPos.width,
        zIndex:          99999,
        background:      'var(--surface)',
        border:          '1px solid var(--border)',
        borderRadius:    6,
        boxShadow:       '0 10px 25px rgba(0,0,0,0.15)',
        maxHeight:       310,
        display:         'flex',
        flexDirection:   'column',
        overflow:        'hidden',
      }}
    >
      {/* 검색 */}
      <div style={ST.searchWrap}>
        <div style={ST.searchBox}>
          <Search size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            style={ST.searchInput}
            placeholder="검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={ST.iconBtn}>
              <X size={9} color="var(--text-muted)" />
            </button>
          )}
        </div>
      </div>

      {/* 전체 선택 / 해제 툴바 */}
      <div style={ST.toolbar}>
        <button onClick={selectAll} style={ST.btnBlue}>전체 선택</button>
        <span style={{ color: 'var(--border)', fontSize: 11 }}>|</span>
        <button onClick={clearAll}  style={ST.btnGray}>전체 해제</button>
        {hasSelection && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
            {selected.length}/{options.length}
          </span>
        )}
      </div>

      {/* 옵션 목록 */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filteredOptions.length === 0 ? (
          <div style={ST.empty}>
            {search ? '검색 결과 없음' : '옵션 없음'}
          </div>
        ) : (
          filteredOptions.map((option, idx) => {
            const strVal   = String(option);
            const isChecked = selected.includes(strVal);
            return (
              <div
                key={`${strVal}-${idx}`}
                onClick={() => toggle(option)}
                style={{
                  ...ST.optionRow,
                  background: isChecked ? 'var(--brand-light)' : 'var(--surface)',
                  color:      isChecked ? 'var(--brand)' : 'var(--text)',
                }}
                onMouseEnter={e => {
                  if (!isChecked) e.currentTarget.style.background = 'var(--bg)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = isChecked ? 'var(--brand-light)' : 'var(--surface)';
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  readOnly
                  style={ST.checkbox}
                />
                <span style={ST.optionText} title={strVal}>
                  {strVal === '' ? '(빈값)' : strVal}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%' }}>

      {/* 트리거 버튼 */}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            2,
          padding:        '1px 4px',
          minHeight:      22,
          border:         `1px solid ${hasSelection ? 'var(--border-focus)' : 'var(--border)'}`,
          borderRadius:   4,
          background:     hasSelection ? 'var(--brand-light)' : 'var(--surface)',
          cursor:         'pointer',
          userSelect:     'none',
          boxSizing:      'border-box',
          width:          '100%',
        }}
        title={hasSelection ? selected.join(', ') : undefined}
      >
        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {triggerLabel()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {hasSelection && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); clearAll(); }}
              title="필터 해제"
              style={ST.clearBtn}
            >
              <X size={9} color="var(--text-muted)" />
            </button>
          )}
          <ChevronDown
            size={10}
            color="var(--text-muted)"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
          />
        </div>
      </div>

      {/* Portal: body에 직접 렌더하여 overflow/z-index 제약 완전 우회 */}
      {mounted && isOpen && createPortal(panel, document.body)}
    </div>
  );
});

MultiSelectDropdown.displayName = 'MultiSelectDropdown';

// ── 스타일 상수 (인라인 스타일 재사용) ──────────────────────
const ST = {
  labelMuted:  { fontSize: 11, color: 'var(--text-muted)' },
  labelAll:    { fontSize: 11, fontWeight: 600, color: 'var(--brand)' },
  labelSingle: { fontSize: 11, fontWeight: 500, color: 'var(--brand)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  labelCount:  { fontSize: 11, fontWeight: 500, color: 'var(--brand)' },

  searchWrap:  { padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  searchBox:   { display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)' },
  searchInput: { flex: 1, fontSize: 11, border: 'none', background: 'transparent', outline: 'none', minWidth: 0 },
  iconBtn:     { display: 'flex', alignItems: 'center', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' },

  toolbar:     { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 },
  btnBlue:     { fontSize: 11, color: 'var(--brand)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 },
  btnGray:     { fontSize: 11, color: 'var(--text-sec)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 },

  empty:       { padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' },
  optionRow:   { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', userSelect: 'none' },
  optionText:  { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  checkbox:    { width: 12, height: 12, accentColor: 'var(--brand)', flexShrink: 0, cursor: 'pointer' },
  clearBtn:    { display: 'flex', alignItems: 'center', padding: 2, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 2 },
};
