// intTank·frmDetail 그래프(vbplot.vb) 재현. 컨테이너(Panel) 안 PictureBox 영역을 react-chartjs-2 Scatter 의
// chartArea 와 일치시키고 격자·작은 눈금·축 숫자("0.00E+00")·제목(DarkBlue)·선택점은 플러그인으로 그린다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart as ChartJS, LinearScale, LineElement, PointElement } from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { useVbPixelRatio } from '../vb/Vb';

ChartJS.register(LinearScale, PointElement, LineElement);

const HTICS = 6;
const VTICS = 6;
const FONT_PX = (8 * 96) / 72;
const FONT = `bold ${FONT_PX}px Arial`;

// 컨테이너·PictureBox 배치(Designer 좌표)
export const GEO_SMALL = { cw: 401, ch: 269, left: 64, top: 27, w: 300, h: 200 };
// ViewGraph: 컨테이너 폭×2·높이×3, 그래프 left×2·top×2·폭×2·높이×3
export const GEO_LARGE = { cw: 802, ch: 807, left: 128, top: 54, w: 600, h: 600 };
export const GEO_DETAIL = { cw: 911, ch: 551, left: 128, top: 64, w: 667, h: 416 };

const radiusOf = (g) => Math.trunc(Math.abs(g.w + g.h) / 150);

// VB6 Format(v, "0.######E+00") / "0.00E+00"
export function vbFormatE(v, decimals, fixed = false) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n === 0) return fixed ? `${(0).toFixed(decimals)}E+00` : '0E+00';
  let [mant, exp] = n.toExponential(decimals).split('e');
  if (!fixed) mant = mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '') : mant;
  const e = Number(exp);
  return `${mant}E${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
}

function scaleOf(g, range) {
  return { xs: g.w / (range.xMax - range.xMin), ys: g.h / (range.yMax - range.yMin) };
}

// vbplot: XPoint = Int((x - XAxisMin) * XScaleFactor), YPoint = H - Int((y - YAxisMin) * YScaleFactor)
export function toPixel(g, range, x, y) {
  const s = scaleOf(g, range);
  return { px: Math.trunc((x - range.xMin) * s.xs), py: g.h - Math.trunc((y - range.yMin) * s.ys) };
}

export function yFromPixel(g, range, py) {
  return (g.h - py) / scaleOf(g, range).ys + range.yMin;
}

// vbplot.Picture_MouseDown 의 반경 판정(RadiusX = W/50, RadiusY = H/W*RadiusX)
export function hitPoint(g, range, pt, px, py) {
  const rx = Math.abs(g.w / 50);
  const ry = Math.abs((g.h / g.w) * rx);
  const p = toPixel(g, range, pt[0], pt[1]);
  return px >= p.px - rx && px <= p.px + rx && py >= p.py - ry && py <= p.py + ry;
}

export function hitTest(g, range, pts, px, py) {
  for (let i = 0; i < pts.length; i += 1) if (hitPoint(g, range, pts[i], px, py)) return i;
  return -1;
}

function cssColor(name) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// gColorArray 인덱스(1~21) 또는 'purple'(crrPurple=DarkViolet)
export function plotColorVar(c) {
  return c === 'purple' ? '--vb-plot-purple' : `--vb-plot-${c || 21}`;
}

function measure(ctx, text) {
  return { w: ctx.measureText(text).width + FONT_PX / 3, h: Math.round(FONT_PX * 1.15) };
}

function drawGrid(ctx, a, g) {
  const gx = g.w / (HTICS - 1);
  const gy = g.h / (VTICS - 1);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = cssColor('--vb-plot-grid');
  ctx.setLineDash([4, 4]);
  for (let i = 1; i < HTICS - 1; i += 1) {
    const x = a.left + Math.trunc(i * gx) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.top + g.h); ctx.stroke();
  }
  for (let i = 1; i < VTICS - 1; i += 1) {
    const y = a.top + Math.trunc(i * gy) + 0.5;
    ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.left + g.w, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = cssColor('--vb-plot-tick');
  const tx = g.w / 50;
  const ty = g.h / 50;
  for (let i = 1; i < (HTICS - 1) * 5; i += 1) {
    const x = a.left + Math.trunc((i * gx) / 5) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, a.top + g.h); ctx.lineTo(x, a.top + g.h - ty); ctx.stroke();
  }
  for (let i = 1; i < (VTICS - 1) * 5; i += 1) {
    const y = a.top + Math.trunc((i * gy) / 5) + 0.5;
    ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.left + tx, y); ctx.stroke();
  }
  ctx.restore();
}

function drawNumbersAndTitles(ctx, g, opts) {
  const { range, showNumbers, title, xLabel, yLabel } = opts;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = cssColor('--vb-plot-tick');
  let longest = 0;
  if (showNumbers && range) {
    const s = scaleOf(g, range);
    for (let i = 0; i < HTICS; i += 1) {
      const v = (i * (g.w / (HTICS - 1))) / s.xs + range.xMin;
      const t = vbFormatE(v, 2, true);
      const m = measure(ctx, t);
      ctx.fillText(t, g.left + i * (g.w / (HTICS - 1)) - 0.5 * m.w + FONT_PX / 6, g.h + g.top + 0.5 * m.h);
    }
    for (let i = 0; i < VTICS; i += 1) {
      const v = (g.h - i * (g.h / (VTICS - 1))) / s.ys + range.yMin;
      const t = vbFormatE(v, 2, true);
      const m = measure(ctx, t);
      if (m.w > longest) longest = m.w;
      ctx.fillText(t, g.left - m.w + FONT_PX / 6, g.top + i * (g.h / (VTICS - 1)) - 0.5 * m.h);
    }
  }
  ctx.fillStyle = cssColor('--vb-plot-title');
  let m = measure(ctx, xLabel);
  ctx.fillText(xLabel, g.left + (g.w - m.w) / 2 + FONT_PX / 6, g.h + g.top + 2 * 13.825);
  const ycenter = g.left - longest - 13;
  let th = 0;
  for (const ch of yLabel) th += Math.trunc(measure(ctx, ch).h + 0.5);
  let py = (g.h - th) / 2 + g.top;
  for (const ch of yLabel) {
    const cm = measure(ctx, ch);
    const px = ycenter + Math.trunc((13 - cm.w) / 2);
    py += Math.trunc(cm.h + 0.5);
    ctx.fillText(ch, px + FONT_PX / 6, py);
  }
  m = measure(ctx, title);
  ctx.fillText(title, g.left + (g.w - m.w) / 2 + FONT_PX / 6, g.top - 1.5 * m.h);
  ctx.restore();
}

// vbplot.DrawCirclePoint: 선택점(빨강), 드래그 중이면 이웃점과 점선 연결
function drawSelection(ctx, a, g, opts) {
  const { range, selection } = opts;
  if (!range || !selection) return;
  const { prev, next, x, y } = selection;
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.left, a.top, g.w, g.h);
  ctx.clip();
  const p = toPixel(g, range, x, y);
  if (selection.dragging) {
    ctx.strokeStyle = cssColor('--vb-plot-cross');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    if (prev) {
      const pp = toPixel(g, range, prev[0], prev[1]);
      ctx.beginPath(); ctx.moveTo(a.left + pp.px, a.top + pp.py); ctx.lineTo(a.left + p.px, a.top + p.py); ctx.stroke();
    }
    if (next) {
      const np = toPixel(g, range, next[0], next[1]);
      ctx.beginPath(); ctx.moveTo(a.left + p.px, a.top + p.py); ctx.lineTo(a.left + np.px, a.top + np.py); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.fillStyle = cssColor('--vb-plot-select');
  ctx.beginPath();
  ctx.arc(a.left + p.px, a.top + p.py, radiusOf(g), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const vbPlotPlugin = {
  id: 'vbTankPlot',
  beforeDatasetsDraw(chart, _args, opts) {
    const a = chart.chartArea;
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = cssColor('--vb-paper');
    ctx.fillRect(a.left, a.top, opts.geo.w, opts.geo.h);
    ctx.restore();
    if (opts.grid) drawGrid(ctx, a, opts.geo);
  },
  afterDatasetsDraw(chart, _args, opts) {
    drawSelection(chart.ctx, chart.chartArea, opts.geo, opts);
  },
  afterDraw(chart, _args, opts) {
    drawNumbersAndTitles(chart.ctx, opts.geo, opts);
  },
};

/**
 * props
 *  geo: GEO_SMALL | GEO_LARGE | GEO_DETAIL   x,y: 폼 안 컨테이너 위치   hidden
 *  range {xMin,xMax,yMin,yMax}|null   lines [{color, points:[[x,y],...]}]   grid   showCircle
 *  showNumbers   selection {x,y,prev,next,dragging}|null   editLabel: 컨테이너 안 EDIT 라벨 노드
 *  onPointerDown/Move/Up(button, px, py): PictureBox 좌표   onContextMenu(cx, cy, px, py): 컨테이너 좌표
 *  onContainerClick / onContainerDoubleClick: Panel Click·DoubleClick
 */
export default function TankGraph({
  geo = GEO_SMALL, x, y, hidden, range, lines, grid = true, showCircle = true, showNumbers, selection, editLabel,
  onPointerDown, onPointerMove, onPointerUp, onContextMenu, onContainerClick, onContainerDoubleClick,
  title = '', xLabel = '', yLabel = '', testId,
}) {
  const wrapRef = useRef(null);
  const pixelRatio = useVbPixelRatio();
  const [colorsReady, setColorsReady] = useState(false);
  useEffect(() => { setColorsReady(true); }, []);
  const radius = radiusOf(geo);

  const valid = !!range && range.xMax > range.xMin && range.yMax > range.yMin;
  const data = useMemo(() => ({
    datasets: valid ? (lines || []).map((l, i) => {
      const col = colorsReady ? cssColor(plotColorVar(l.color)) : undefined;
      return {
        label: `line${i}`,
        data: l.points.filter((p) => p[1] !== null && p[1] !== undefined).map(([px, py]) => ({ x: px, y: py })),
        showLine: true,
        borderColor: col,
        backgroundColor: col,
        pointBackgroundColor: col,
        pointBorderWidth: 0,
        pointRadius: showCircle ? radius : 0,
        pointHoverRadius: showCircle ? radius : 0,
        borderWidth: 1,
        tension: 0,
      };
    }) : [],
  }), [lines, valid, colorsReady, showCircle, radius]);

  const options = useMemo(() => ({
    responsive: false,
    maintainAspectRatio: false,
    devicePixelRatio: pixelRatio,
    animation: false,
    events: [],
    layout: {
      padding: { left: geo.left, top: geo.top, right: geo.cw - 2 - geo.left - geo.w, bottom: geo.ch - 2 - geo.top - geo.h },
    },
    scales: {
      x: { type: 'linear', display: false, min: valid ? range.xMin : 0, max: valid ? range.xMax : 1 },
      y: { type: 'linear', display: false, min: valid ? range.yMin : 0, max: valid ? range.yMax : 1 },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      vbTankPlot: {
        geo, grid, range: valid ? range : null, showNumbers: showNumbers && valid, selection, title, xLabel, yLabel,
      },
    },
  }), [geo, grid, range, valid, showNumbers, selection, title, xLabel, yLabel, pixelRatio]);

  const toPic = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const scale = rect.width / (geo.cw - 2) || 1;
    const cx = (e.clientX - rect.left) / scale;
    const cy = (e.clientY - rect.top) / scale;
    return { cx, cy, px: cx - geo.left, py: cy - geo.top };
  };
  const inPic = ({ px, py }) => px >= 0 && py >= 0 && px < geo.w && py < geo.h;
  const button = (e) => (e.button === 2 ? 'right' : e.button === 0 ? 'left' : 'other');

  return (
    <div
      className="vb-picture"
      data-testid={testId}
      style={{ left: x, top: y, width: geo.cw, height: geo.ch, overflow: 'hidden', display: hidden ? 'none' : undefined }}
    >
      <div
        ref={wrapRef}
        style={{ position: 'absolute', left: 0, top: 0, width: geo.cw - 2, height: geo.ch - 2 }}
        onClick={(e) => { if (!inPic(toPic(e))) onContainerClick?.(); }}
        onDoubleClick={(e) => { if (!inPic(toPic(e))) onContainerDoubleClick?.(); }}
        onMouseDown={(e) => {
          const p = toPic(e);
          if (inPic(p)) onPointerDown?.(button(e), p.px, p.py, p.cx, p.cy);
        }}
        onMouseMove={(e) => {
          const p = toPic(e);
          onPointerMove?.(e.buttons & 1 ? 'left' : 'none', p.px, p.py);
        }}
        onMouseUp={(e) => {
          const p = toPic(e);
          onPointerUp?.(button(e), p.px, p.py);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const p = toPic(e);
          if (inPic(p)) onContextMenu?.(p.cx, p.cy, p.px, p.py);
        }}
      >
        <Scatter key={`${geo.cw}x${geo.ch}@${pixelRatio}`} data={data} options={options} plugins={[vbPlotPlugin]} width={geo.cw - 2} height={geo.ch - 2} />
      </div>
      {editLabel}
    </div>
  );
}
