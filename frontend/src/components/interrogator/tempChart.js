'use client';

// frmTemp/frmTemp10/frmWobbler 의 vbplot 그래프 대체(SVG). 축·눈금·격자·선·원 마커와
// 편집 모드의 점 선택/드래그를 원본 동작대로 재현한다.

import { useRef, useState } from 'react';

export const TEMP_COLORS = {
  darkblue: '#00008b', cyan: '#00c0c0', lightcyan: '#9be7ff', blue: '#0000ff', red: '#ff0000',
  black: '#000000', darkmagenta: '#8b008b', medyellow: '#c8c800', purple: '#800080',
  medgreen: '#00a000', medgrey: '#808080',
};

// lstFreq 체크 시 할당되는 색상 풀(원본 SyncColors 순서).
export const ITEM_COLORS = ['#0000ff', '#ff0000', '#00a000', '#ff00ff', '#c08000', '#008080', '#800080',
  '#808000', '#000080', '#800000'];

const PAD = { l: 70, r: 14, t: 28, b: 40 };

function ticks(min, max, n = 5) {
  const out = [];
  for (let i = 0; i <= n; i += 1) out.push(min + ((max - min) * i) / n);
  return out;
}

export function fmtTick(v) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2);
  return Number(v.toPrecision(4)).toString();
}

// VB Format(v, "0.######E+00")
export function fmtE(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '0E+00';
  const [m, e] = n.toExponential(6).split('e');
  const mant = m.replace(/0+$/, '').replace(/\.$/, '');
  const ex = Math.abs(Number(e));
  return `${mant}E${Number(e) < 0 ? '-' : '+'}${String(ex).padStart(2, '0')}`;
}

// fraEditPoint 상태(Selected/New X·Y, %Chg, Allow New X, ManualEditOn/Off).
export function useEditPoint() {
  const [s, setS] = useState({ selX: '', selY: '', newX: '', newY: '', chgX: '', chgY: '', allowX: false,
    manual: false, multi: false, selected: -1, graphName: '', measFreq: '' });
  const set = (patch) => setS((o) => ({ ...o, ...patch }));
  return {
    s,
    set,
    select: (i, x, y) => set({ selected: i, selX: fmtE(x), selY: fmtE(y), newX: fmtE(x), newY: fmtE(y), manual: true }),
    drag: (x, y) => setS((o) => ({ ...o, newX: o.allowX ? fmtE(x) : o.newX, newY: fmtE(y), manual: false })),
    pct: (axis, delta = 0) => setS((o) => {
      const base = Number(axis === 'X' ? o.selX : o.selY);
      const pct = Number(axis === 'X' ? o.chgX : o.chgY) + delta;
      if (!Number.isFinite(base) || !Number.isFinite(pct)) return o;
      const out = fmtE(pct * 0.01 * Math.abs(base) + base);
      return axis === 'X' ? { ...o, chgX: String(pct), newX: out } : { ...o, chgY: String(pct), newY: out };
    }),
    off: () => set({ manual: false }),
    reset: () => set({ selX: '', selY: '', newX: '', newY: '', manual: false, selected: -1 }),
  };
}

// ContextMenuStrip(mnuEditGraph) 대체.
export function PopupMenu({ menu, onPick, onClose }) {
  if (!menu) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onMouseDown={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div role="menu" className="vb-list" style={{ position: 'fixed', left: menu.x, top: menu.y, minWidth: 180,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', padding: 4, font: '8pt var(--font-sans)', zIndex: 51 }}
        onMouseDown={(e) => e.stopPropagation()}>
        {menu.items.map((it) => (
          <div key={it.key} role="menuitem" tabIndex={-1} className="vb-list-item"
            style={{ padding: '2px 8px', opacity: it.disabled ? 0.5 : 1, whiteSpace: 'nowrap' }}
            onClick={() => { if (!it.disabled) { onClose(); onPick(it.key); } }}
            onKeyDown={() => {}}>
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function color(c) {
  return TEMP_COLORS[c] || c || '#0000ff';
}

/**
 * props: x,y,w,h(컨테이너 절대 위치), data {title,xLabel,yLabel,xMin,xMax,yMin,yMax,lines:[{points,color,showLine}]},
 * grid, edit {points:[[id,x,y]], selected, onSelect(i), onDrag(i,x,y), onDragEnd(i,x,y)}, onContextMenu(e), editLabel
 */
export default function TempChart({ x, y, w, h, data, grid = true, edit, onContextMenu, editLabel, testId }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const pw = w - PAD.l - PAD.r;
  const ph = h - PAD.t - PAD.b;
  const range = edit?.range || data;
  const ok = range && Number.isFinite(range.xMin) && Number.isFinite(range.xMax) && range.xMax !== range.xMin
    && Number.isFinite(range.yMin) && Number.isFinite(range.yMax) && range.yMax !== range.yMin;
  const sx = (v) => PAD.l + ((v - range.xMin) / (range.xMax - range.xMin)) * pw;
  const sy = (v) => PAD.t + ph - ((v - range.yMin) / (range.yMax - range.yMin)) * ph;
  const inv = (px, py) => [
    range.xMin + ((px - PAD.l) / pw) * (range.xMax - range.xMin),
    range.yMin + ((PAD.t + ph - py) / ph) * (range.yMax - range.yMin),
  ];

  const toLocal = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const scale = r.width / w || 1;
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };

  const onDown = (e) => {
    if (e.button !== 0 || !edit || !ok) return;
    const [px, py] = toLocal(e);
    let best = -1;
    let bd = 64;
    edit.points.forEach((p, i) => {
      const d = (sx(p[1]) - px) ** 2 + (sy(p[2]) - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    edit.onSelect?.(best);
    setDrag({ i: best, moved: false });
  };
  const onMove = (e) => {
    if (!drag || !edit) return;
    const [nx, ny] = inv(...toLocal(e));
    setDrag({ ...drag, moved: true, x: nx, y: ny });
    edit.onDrag?.(drag.i, nx, ny);
  };
  const onUp = () => {
    if (drag?.moved) edit?.onDragEnd?.(drag.i, drag.x, drag.y);
    setDrag(null);
  };

  const lines = edit
    ? [{ points: edit.points.map((p, i) => (drag?.moved && drag.i === i ? [drag.x, drag.y] : [p[1], p[2]])),
      color: 'red', showLine: true, selected: edit.selected }]
    : (data?.lines || []);
  const xt = ok ? ticks(range.xMin, range.xMax) : [];
  const yt = ok ? ticks(range.yMin, range.yMax) : [];

  return (
    <div className="vb-picture" style={{ position: 'absolute', left: x, top: y, width: w, height: h }}
      data-testid={testId} onContextMenu={(e) => { if (onContextMenu) { e.preventDefault(); onContextMenu(e); } }}>
      {editLabel && (
        <span style={{ position: 'absolute', left: 8, top: 8, color: 'red', font: 'bold 12pt Arial' }}>EDIT</span>
      )}
      <svg ref={svgRef} width={w} height={h} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
        onMouseLeave={onUp} style={{ display: 'block', userSelect: 'none' }}>
        {data?.title && <text x={w / 2} y={16} textAnchor="middle" fontSize="12" fontWeight="bold">{data.title}</text>}
        {ok && (
          <>
            <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill="none" stroke="#000" />
            {xt.map((t) => (
              <g key={`x${t}`}>
                {grid && <line x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={PAD.t + ph} stroke="#ccc" strokeDasharray="2 2" />}
                <text x={sx(t)} y={PAD.t + ph + 13} textAnchor="middle" fontSize="9">{fmtTick(t)}</text>
              </g>
            ))}
            {yt.map((t) => (
              <g key={`y${t}`}>
                {grid && <line x1={PAD.l} x2={PAD.l + pw} y1={sy(t)} y2={sy(t)} stroke="#ccc" strokeDasharray="2 2" />}
                <text x={PAD.l - 4} y={sy(t) + 3} textAnchor="end" fontSize="9">{fmtTick(t)}</text>
              </g>
            ))}
            {data?.xLabel && <text x={PAD.l + pw / 2} y={h - 6} textAnchor="middle" fontSize="10">{data.xLabel}</text>}
            {data?.yLabel && (
              <text x={12} y={PAD.t + ph / 2} textAnchor="middle" fontSize="10"
                transform={`rotate(-90 12 ${PAD.t + ph / 2})`}>{data.yLabel}</text>
            )}
            <svg x={PAD.l} y={PAD.t} width={pw} height={ph} overflow="hidden">
              <g transform={`translate(${-PAD.l} ${-PAD.t})`}>
                {lines.map((ln, li) => {
                  const pts = (ln.points || []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
                  const c = color(ln.color);
                  const showLine = ln.showLine ?? data?.showLine ?? true;
                  return (
                    // eslint-disable-next-line react/no-array-index-key
                    <g key={li}>
                      {showLine && pts.length > 1 && (
                        <polyline fill="none" stroke={c} strokeWidth="1"
                          points={pts.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} />
                      )}
                      {ln.marker !== false && pts.map((p, pi) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <circle key={pi} cx={sx(p[0])} cy={sy(p[1])} r={ln.selected === pi ? 4 : 2.5}
                          fill={ln.selected === pi ? c : 'none'} stroke={c} />
                      ))}
                    </g>
                  );
                })}
              </g>
            </svg>
          </>
        )}
      </svg>
    </div>
  );
}

// txtChange + UpDown(%Chg): Enter 또는 화살표로 New 값을 다시 계산한다.
export function ChgBox({ x, y, value, disabled, onChange, onCommit }) {
  return (
    <>
      <input className="vb-text" aria-label="%Chg" disabled={disabled} value={value}
        style={{ position: 'absolute', left: x, top: y, width: 17, height: 20, padding: 0 }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (value === '' || !Number.isFinite(Number(value))) return;
          onCommit(0);
        }} />
      <span style={{ position: 'absolute', left: x + 18, top: y, width: 16, height: 19, display: 'flex',
        flexDirection: 'column' }}>
        <button type="button" disabled={disabled} aria-label="up" style={{ height: 9, padding: 0, fontSize: 6 }}
          onClick={() => onCommit(1)}>▲</button>
        <button type="button" disabled={disabled} aria-label="down" style={{ height: 9, padding: 0, fontSize: 6 }}
          onClick={() => onCommit(-1)}>▼</button>
      </span>
    </>
  );
}
