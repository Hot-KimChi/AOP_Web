'use client';

// 레거시 VB WinForms 화면을 원본 좌표(px) 그대로 재현하기 위한 공용 컨트롤.
// 좌표·크기는 VB Designer 의 Location/Size 값을 그대로 넘긴다.

import { useEffect, useId, useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/apiBase';

const PT = 96 / 72;
// 폭이 다른 글꼴(좁은·고정폭)만 원본 그대로 두고, 나머지는 사이트 글꼴(--font-sans)을 상속한다.
const KEEP_FAMILY = /narrow|courier|consolas|mono/i;

function box(x, y, w, h, font, extra) {
  const s = { left: x, top: y, width: w, height: h, ...extra };
  if (font) {
    s.fontSize = `${(font.size ?? 8.25) * PT}px`;
    if (font.bold) s.fontWeight = 700;
    if (font.family && KEEP_FAMILY.test(font.family)) s.fontFamily = font.family;
  }
  return s;
}

// fill: 가용 폭에 맞춰 확대까지 허용(전체 화면 모달용, 최대 maxZoom 배).
// toolbar: 타이틀바 아래 카드 안에 들어가는 웹 전용 영역(DB 선택 등).
export function VbForm({ title, width, height, children, onClose, testId, zoom, fill = false, maxZoom = 1.6, toolbar }) {
  const outerRef = useRef(null);
  const [scale, setScale] = useState(zoom ?? 1);

  useEffect(() => {
    if (zoom) return undefined;
    const el = outerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const avail = el.clientWidth;
      // fit-content 모달에서는 avail 이 자기 폭이므로 분모를 width+2 로 고정해야 배율이 수렴한다.
      const fit = avail / (width + (fill ? 4 : 2));
      setScale(avail > 0 ? Math.min(fill ? maxZoom : 1, fit) : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, zoom, fill, maxZoom]);

  return (
    <div ref={outerRef} className={fill ? 'vb-outer vb-outer-fill' : 'vb-outer'} data-testid={testId}>
      <div className="vb-window" style={{ width: width + 2, zoom: scale }}>
        <div className="vb-titlebar">
          <span className="vb-title-icon" aria-hidden="true" />
          <span className="vb-title-text">{title}</span>
          {onClose && (
            <button type="button" className="vb-title-close" onClick={onClose} aria-label="닫기">✕</button>
          )}
        </div>
        {toolbar && <div className="vb-toolbar">{toolbar}</div>}
        <div className="vb-client" style={{ width, height }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function VbLabel({ x, y, w, h, children, font, color, align, wrap, hidden, style, testId, className }) {
  if (hidden) return null;
  return (
    <div
      className={className ? `vb-label ${className}` : 'vb-label'}
      data-testid={testId}
      style={box(x, y, wrap ? w : undefined, wrap ? h : undefined, font, {
        color,
        textAlign: align,
        whiteSpace: wrap ? 'normal' : 'nowrap',
        ...style,
      })}
    >
      {children}
    </div>
  );
}

export function VbButton({ x, y, w, h, children, onClick, disabled, font, testId, busy, color }) {
  return (
    <button
      type="button"
      className="vb-button"
      data-testid={testId}
      style={box(x, y, w, h, font, disabled || busy ? undefined : { color })}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}

export function VbText({ x, y, w, h, value, onChange, readOnly, font, onDoubleClick, testId, hidden, title, ariaLabel }) {
  if (hidden) return null;
  return (
    <input
      type="text"
      className="vb-text"
      style={box(x, y, w, h, font)}
      value={value ?? ''}
      readOnly={readOnly}
      title={title}
      aria-label={ariaLabel}
      data-testid={testId}
      onChange={(e) => onChange?.(e.target.value)}
      onDoubleClick={onDoubleClick}
    />
  );
}

// DropDownList 는 <select>, DropDown(편집 가능) 은 datalist 입력으로 재현.
export function VbCombo({ x, y, w, h, value, onChange, options, editable, font, testId, hidden, disabled, ariaLabel, blank = true }) {
  const listId = `vbc-${useId().replace(/:/g, '')}`;
  if (hidden) return null;
  const opts = (options || []).map((o) => (typeof o === 'object' && o !== null ? o : { value: String(o), label: String(o) }));
  if (editable) {
    return (
      <>
        <input
          className="vb-combo"
          list={listId}
          style={box(x, y, w, h, font)}
          value={value ?? ''}
          data-testid={testId}
          aria-label={ariaLabel}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
        />
        <datalist id={listId}>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </datalist>
      </>
    );
  }
  return (
    <select
      className="vb-combo"
      style={box(x, y, w, h, font)}
      value={value ?? ''}
      data-testid={testId}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {blank && <option value="" />}
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function VbCheck({ x, y, w, h, checked, onChange, children, font, testId }) {
  return (
    <label className="vb-check" style={box(x, y, w, h, font)}>
      <input type="checkbox" checked={!!checked} data-testid={testId} onChange={(e) => onChange?.(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function VbList({ x, y, w, h, items, value, onChange, onDoubleClick, font, testId }) {
  return (
    <div className="vb-list" style={box(x, y, w, h, font)} role="listbox" data-testid={testId}>
      {(items || []).map((it, i) => {
        const obj = typeof it === 'object' && it !== null;
        const key = obj ? it.value : String(it);
        const label = obj ? it.label : String(it);
        return (
          <div
            key={`${key}-${i}`}
            role="option"
            aria-selected={value === key}
            className={`vb-list-item${value === key ? ' selected' : ''}`}
            onClick={() => onChange?.(key)}
            onDoubleClick={() => onDoubleClick?.(key)}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

// DataGridView 재현: 행 헤더(▶/*), 열 헤더 색, 셀 색, 행 헤더 더블클릭,
// 셀 편집(F2·타이핑·현재 셀 재클릭, Enter 확정·Esc 취소).
export function VbGrid({
  x, y, w, h, columns, rows, testId,
  onRowHeaderDoubleClick, onCellDoubleClick, onCellChange, onRowAdd, onRowDelete,
  headerColor, cellColor, editable, showNewRow = true, backColor, font, maxRows = 2000,
}) {
  const [cur, setCur] = useState(null);
  const [edit, setEdit] = useState(null);
  const cols = columns || [];
  const data = rows || [];
  const shown = data.length > maxRows ? data.slice(0, maxRows) : data;
  // DataGridView AllowUserToAddRows: '*' 행에 입력하면 새 행이 추가된다.
  const canAdd = !!(editable && onRowAdd && showNewRow);
  const newRowIndex = data.length;

  useEffect(() => {
    if (cur && (cur.r > data.length || (cur.r === data.length && !canAdd) || cur.c >= cols.length)) setCur(null);
    if (edit && (edit.r > data.length || (edit.r === data.length && !canAdd) || edit.c >= cols.length)) setEdit(null);
  }, [data.length, cols.length, cur, edit, canAdd]);

  const commit = () => {
    if (edit) {
      if (edit.r === newRowIndex) {
        if (edit.value !== '') onRowAdd?.(edit.c, edit.value);
      } else {
        onCellChange?.(edit.r, edit.c, edit.value);
      }
    }
    setEdit(null);
  };

  const startEdit = (r, c, initial) => {
    if (!editable) return;
    if (r === newRowIndex ? !canAdd : !onCellChange) return;
    setEdit({ r, c, value: initial ?? cellText(data[r]?.[c]) });
  };

  return (
    <div
      className="vb-grid"
      style={box(x, y, w, h, font, { background: backColor })}
      data-testid={testId}
      tabIndex={0}
      onKeyDown={(e) => {
        if (edit || !cur) return;
        if (e.key === 'F2') { e.preventDefault(); startEdit(cur.r, cur.c); }
        else if (e.key === 'Delete' && onRowDelete && cur.r < data.length) {
          // DataGridView AllowUserToDeleteRows: 현재 행 삭제
          e.preventDefault();
          onRowDelete(cur.r);
          setCur(null);
        }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); startEdit(cur.r, cur.c, e.key); }
      }}
    >
      <table>
        <thead>
          <tr>
            <th className="vb-rowhead" />
            {cols.map((c, ci) => (
              <th key={`${c}-${ci}`} style={{ background: headerColor?.(c, ci) }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, ri) => (
            <tr key={ri} className={cur?.r === ri ? 'current' : undefined}>
              <th
                className="vb-rowhead"
                data-testid={testId ? `${testId}-rowhead-${ri}` : undefined}
                onClick={() => setCur({ r: ri, c: cur?.c ?? 0 })}
                onDoubleClick={() => onRowHeaderDoubleClick?.(ri)}
              >
                {cur?.r === ri ? '▶' : ''}
              </th>
              {cols.map((_, ci) => {
                const isCur = cur?.r === ri && cur?.c === ci;
                const isEdit = edit?.r === ri && edit?.c === ci;
                return (
                  <td
                    key={ci}
                    className={isCur ? 'cur' : undefined}
                    style={{ background: isCur ? undefined : cellColor?.(ri, ci) }}
                    onClick={() => {
                      if (isCur && !isEdit) startEdit(ri, ci);
                      else setCur({ r: ri, c: ci });
                    }}
                    onDoubleClick={() => { setCur({ r: ri, c: ci }); onCellDoubleClick?.(ri, ci); }}
                  >
                    {isEdit ? (
                      <input
                        autoFocus
                        className="vb-cell-edit"
                        value={edit.value}
                        onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commit(); }
                          if (e.key === 'Escape') { e.preventDefault(); setEdit(null); }
                        }}
                      />
                    ) : cellText(row[ci])}
                  </td>
                );
              })}
            </tr>
          ))}
          {showNewRow && cols.length > 0 && (
            <tr className="vb-newrow">
              <th className="vb-rowhead">*</th>
              {cols.map((_, ci) => {
                const isCur = canAdd && cur?.r === newRowIndex && cur?.c === ci;
                const isEdit = canAdd && edit?.r === newRowIndex && edit?.c === ci;
                return (
                  <td
                    key={ci}
                    className={isCur ? 'cur' : undefined}
                    data-testid={testId && canAdd ? `${testId}-newrow-${ci}` : undefined}
                    onClick={() => {
                      if (!canAdd) return;
                      if (isCur && !isEdit) startEdit(newRowIndex, ci, '');
                      else setCur({ r: newRowIndex, c: ci });
                    }}
                  >
                    {isEdit ? (
                      <input
                        autoFocus
                        className="vb-cell-edit"
                        value={edit.value}
                        onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commit(); }
                          if (e.key === 'Escape') { e.preventDefault(); setEdit(null); }
                        }}
                      />
                    ) : null}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
      {data.length > maxRows && (
        <div className="vb-grid-more">{maxRows}행까지만 표시합니다(전체 {data.length}행).</div>
      )}
    </div>
  );
}

// 레코드 배열(객체) → { columns, rows }
export function toGrid(records) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return { columns: [], rows: [] };
  const columns = Object.keys(list[0]);
  return { columns, rows: list.map((r) => columns.map((c) => r[c])) };
}

// 서버 응답 { columns, rows } 또는 레코드 배열 모두 허용
export function asGrid(data) {
  if (data && Array.isArray(data.columns) && Array.isArray(data.rows)) return data;
  return toGrid(data);
}

const modalStack = [];

// 하위 폼(ShowDialog)을 화면 위에 띄운다. closeOnEsc 이면 Esc 로 가장 위 폼만 닫는다
// (WinForms 는 CancelButton 이 지정된 폼만 Esc 로 닫히므로 기본값은 false).
export function VbModal({ children, onClose, testId, closeOnEsc = false, full = false }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const onKey = (e) => {
      if (!closeOnEsc || e.key !== 'Escape' || e.defaultPrevented || modalStack[modalStack.length - 1] !== token) return;
      e.preventDefault();
      closeRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, [closeOnEsc]);
  return (
    <div className={full ? 'vb-modal vb-modal-full' : 'vb-modal'} role="dialog" aria-modal="true" data-testid={testId}>
      {children}
    </div>
  );
}

// 원본은 실행 시 연결 DB 가 정해져 있었다. 웹은 여러 DB 를 쓰므로 폼 위에 최소한의 DB 선택만 둔다.
export function useDatabaseList() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE_URL}/api/get_list_database`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('데이터베이스 목록을 가져오지 못했습니다.'))))
      .then((d) => { if (alive) setList(d.databases || []); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);
  return { list, error };
}

// inline: 카드(VbForm toolbar) 안에 넣을 때 별도 카드 테두리 없이 표시
export function VbDbBar({ value, onChange, testId = 'vb-db', inline = false }) {
  const { list, error } = useDatabaseList();
  return (
    <div className={inline ? 'vb-dbbar vb-dbbar-inline' : 'vb-dbbar'}>
      <label htmlFor={testId}>Database</label>
      <select id={testId} data-testid={testId} className="form-select form-select-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select database…</option>
        {list.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      {error && <span className="vb-msg">{error}</span>}
    </div>
  );
}
