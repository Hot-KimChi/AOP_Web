// intPower 그래프(vbplot.vb) 재현. picPowerContainer(738x770) 안의 picPowerGraph(128,80,536x600) 영역을
// react-chartjs-2 Scatter 의 chartArea 와 일치시키고, 격자·눈금·축 숫자·제목·선택점은 플러그인으로 그린다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart as ChartJS, LinearScale, LineElement, PointElement } from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { useVbPixelRatio } from '../vb/Vb';

ChartJS.register(LinearScale, PointElement, LineElement);

export const CONTAINER = { x: 392, y: 48, w: 738, h: 770 };
export const PIC = { left: 128, top: 80, w: 536, h: 600 };
const HTICS = 6;
const VTICS = 6;
const RADIUS = Math.trunc(Math.abs(PIC.w + PIC.h) / 150);
const FONT_PX = (8 * 96) / 72;
const FONT = `bold ${FONT_PX}px Arial`;

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

export function scaleOf(range) {
  if (!range) return null;
  return { xs: PIC.w / (range.xMax - range.xMin), ys: PIC.h / (range.yMax - range.yMin) };
}

// vbplot: XPoint = Int((x - XAxisMin) * XScaleFactor), YPoint = H - Int((y - YAxisMin) * YScaleFactor)
export function toPixel(range, x, y) {
  const s = scaleOf(range);
  return { px: Math.trunc((x - range.xMin) * s.xs), py: PIC.h - Math.trunc((y - range.yMin) * s.ys) };
}

export function yFromPixel(range, py) {
  return (PIC.h - py) / scaleOf(range).ys + range.yMin;
}

export function hitTest(range, pts, px, py) {
  const rx = Math.abs(PIC.w / 50);
  const ry = Math.abs((PIC.h / PIC.w) * rx);
  for (let i = 0; i < pts.length; i += 1) {
    const p = toPixel(range, pts[i][0], pts[i][1]);
    if (px >= p.px - rx && px <= p.px + rx && py >= p.py - ry && py <= p.py + ry) return i;
  }
  return -1;
}

function cssColor(name) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function plotColorVar(c) {
  return c === 'purple' ? '--vb-plot-purple' : `--vb-plot-${c || 21}`;
}

// GDI+ MeasureString 은 글꼴 높이 + 좌우 여백(약 1/6 em)을 돌려준다.
function measure(ctx, text) {
  return { w: ctx.measureText(text).width + FONT_PX / 3, h: Math.round(FONT_PX * 1.15) };
}

function drawGrid(ctx, a) {
  const gx = PIC.w / (HTICS - 1);
  const gy = PIC.h / (VTICS - 1);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = cssColor('--vb-plot-grid');
  ctx.setLineDash([4, 4]);
  for (let i = 1; i < HTICS - 1; i += 1) {
    const x = a.left + Math.trunc(i * gx) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.top + PIC.h); ctx.stroke();
  }
  for (let i = 1; i < VTICS - 1; i += 1) {
    const y = a.top + Math.trunc(i * gy) + 0.5;
    ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.left + PIC.w, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = cssColor('--vb-plot-tick');
  const mx = gx / 5;
  const my = gy / 5;
  const tx = PIC.w / 50;
  const ty = PIC.h / 50;
  for (let i = 1; i < (HTICS - 1) * 5; i += 1) {
    const x = a.left + Math.trunc(i * mx) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, a.top + PIC.h); ctx.lineTo(x, a.top + PIC.h - ty); ctx.stroke();
  }
  for (let i = 1; i < (VTICS - 1) * 5; i += 1) {
    const y = a.top + Math.trunc(i * my) + 0.5;
    ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.left + tx, y); ctx.stroke();
  }
  ctx.restore();
}

function drawNumbersAndTitles(ctx, opts) {
  const { range, showNumbers, title, xLabel, yLabel } = opts;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = cssColor('--vb-plot-tick');
  let longest = 0;
  if (showNumbers && range) {
    const s = scaleOf(range);
    for (let i = 0; i < HTICS; i += 1) {
      const v = (i * (PIC.w / (HTICS - 1))) / s.xs + range.xMin;
      const t = vbFormatE(v, 2, true);
      const m = measure(ctx, t);
      ctx.fillText(t, PIC.left + i * (PIC.w / (HTICS - 1)) - 0.5 * m.w + FONT_PX / 6, PIC.h + PIC.top + 0.5 * m.h);
    }
    for (let i = 0; i < VTICS; i += 1) {
      const v = (PIC.h - i * (PIC.h / (VTICS - 1))) / s.ys + range.yMin;
      const t = vbFormatE(v, 2, true);
      const m = measure(ctx, t);
      if (m.w > longest) longest = m.w;
      ctx.fillText(t, PIC.left - m.w + FONT_PX / 6, PIC.top + i * (PIC.h / (VTICS - 1)) - 0.5 * m.h);
    }
  }
  ctx.fillStyle = cssColor('--vb-plot-title');
  let m = measure(ctx, xLabel);
  ctx.fillText(xLabel, PIC.left + (PIC.w - m.w) / 2 + FONT_PX / 6, PIC.h + PIC.top + 2 * 13.825);
  const ycenter = PIC.left - longest - 13;
  let th = 0;
  for (const ch of yLabel) th += Math.trunc(measure(ctx, ch).h + 0.5);
  let py = (PIC.h - th) / 2 + PIC.top;
  for (const ch of yLabel) {
    const cm = measure(ctx, ch);
    const px = ycenter + Math.trunc((13 - cm.w) / 2);
    py += Math.trunc(cm.h + 0.5);
    ctx.fillText(ch, px + FONT_PX / 6, py);
  }
  m = measure(ctx, title);
  ctx.fillText(title, PIC.left + (PIC.w - m.w) / 2 + FONT_PX / 6, PIC.top - 1.5 * m.h);
  ctx.restore();
}

// vbplot.DrawCirclePoint: 선택점(빨강)·드래그 중 점과 이웃점 연결 점선(CrossHairColor)
function drawSelection(ctx, a, opts) {
  const { range, selection } = opts;
  if (!range || !selection) return;
  const { prev, next, x, y } = selection;
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.left, a.top, PIC.w, PIC.h);
  ctx.clip();
  const p = toPixel(range, x, y);
  if (selection.dragging) {
    ctx.strokeStyle = cssColor('--vb-plot-cross');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    const pp = toPixel(range, prev[0], prev[1]);
    ctx.beginPath(); ctx.moveTo(a.left + pp.px, a.top + pp.py); ctx.lineTo(a.left + p.px, a.top + p.py); ctx.stroke();
    if (next) {
      const np = toPixel(range, next[0], next[1]);
      ctx.beginPath(); ctx.moveTo(a.left + p.px, a.top + p.py); ctx.lineTo(a.left + np.px, a.top + np.py); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.fillStyle = cssColor('--vb-plot-select');
  ctx.beginPath();
  ctx.arc(a.left + p.px, a.top + p.py, RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const vbPlotPlugin = {
  id: 'vbPowerPlot',
  beforeDatasetsDraw(chart, _args, opts) {
    if (opts.grid) drawGrid(chart.ctx, chart.chartArea);
  },
  afterDatasetsDraw(chart, _args, opts) {
    drawSelection(chart.ctx, chart.chartArea, opts);
  },
  afterDraw(chart, _args, opts) {
    drawNumbersAndTitles(chart.ctx, opts);
  },
};

/**
 * props
 *  range: {xMin,xMax,yMin,yMax} | null   lines: [{color, points:[[x,y],...]}]
 *  showNumbers: Plot 이 한 번이라도 호출됐는지   selection: {x,y,prev,next,dragging} | null
 *  onPointerDown/Move/Up(button, px, py): picPowerGraph 좌표(px)   onContextMenu(clientX, clientY, px, py)
 */
export default function PowerGraph({
  range, lines, showNumbers, selection, editLabel, onPointerDown, onPointerMove, onPointerUp, onContextMenu,
  title = 'Power', xLabel = 'Voltage', yLabel = 'PowerData', testId = 'power-graph',
}) {
  const wrapRef = useRef(null);
  const pixelRatio = useVbPixelRatio();
  const [colorsReady, setColorsReady] = useState(false);
  useEffect(() => { setColorsReady(true); }, []);

  const valid = range && range.xMax > range.xMin && range.yMax > range.yMin;
  const data = useMemo(() => ({
    datasets: valid ? (lines || []).map((l, i) => {
      const col = colorsReady ? cssColor(plotColorVar(l.color)) : undefined;
      return {
        label: `line${i}`,
        data: l.points.map(([x, y]) => ({ x, y })),
        showLine: true,
        borderColor: col,
        backgroundColor: col,
        pointBackgroundColor: col,
        pointBorderWidth: 0,
        pointRadius: RADIUS,
        pointHoverRadius: RADIUS,
        borderWidth: 1,
        tension: 0,
      };
    }) : [],
  }), [lines, valid, colorsReady]);

  const options = useMemo(() => ({
    responsive: false,
    maintainAspectRatio: false,
    devicePixelRatio: pixelRatio,
    animation: false,
    events: [],
    layout: { padding: { left: PIC.left, top: PIC.top, right: CONTAINER.w - 2 - PIC.left - PIC.w, bottom: CONTAINER.h - 2 - PIC.top - PIC.h } },
    scales: {
      x: { type: 'linear', display: false, min: valid ? range.xMin : 0, max: valid ? range.xMax : 1 },
      y: { type: 'linear', display: false, min: valid ? range.yMin : 0, max: valid ? range.yMax : 1 },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      vbPowerPlot: {
        grid: true, range: valid ? range : null, showNumbers: showNumbers && valid, selection, title, xLabel, yLabel,
      },
    },
  }), [range, valid, showNumbers, selection, title, xLabel, yLabel, pixelRatio]);

  const toPic = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const scale = rect.width / (CONTAINER.w - 2) || 1;
    return {
      px: (e.clientX - rect.left) / scale - PIC.left,
      py: (e.clientY - rect.top) / scale - PIC.top,
    };
  };
  const inPic = ({ px, py }) => px >= 0 && py >= 0 && px < PIC.w && py < PIC.h;
  const button = (e) => (e.button === 2 ? 'right' : e.button === 0 ? 'left' : 'other');

  return (
    <div
      className="vb-picture"
      data-testid={testId}
      style={{ left: CONTAINER.x, top: CONTAINER.y, width: CONTAINER.w, height: CONTAINER.h, overflow: 'hidden' }}
    >
      <div
        ref={wrapRef}
        style={{ position: 'absolute', left: 0, top: 0, width: CONTAINER.w - 2, height: CONTAINER.h - 2 }}
        onMouseDown={(e) => {
          const p = toPic(e);
          if (inPic(p)) onPointerDown?.(button(e), p.px, p.py);
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
          if (inPic(p)) {
            const rect = e.currentTarget.getBoundingClientRect();
            const scale = rect.width / (CONTAINER.w - 2) || 1;
            onContextMenu?.((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale, p.px, p.py);
          }
        }}
      >
        {/* 배율이 바뀌면 캔버스 해상도(devicePixelRatio)를 다시 잡도록 새로 만든다 */}
        <Scatter key={pixelRatio} data={data} options={options} plugins={[vbPlotPlugin]} width={CONTAINER.w - 2} height={CONTAINER.h - 2} />
      </div>
      {editLabel}
    </div>
  );
}
