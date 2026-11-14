// 레거시 intPower(frmPower.vb, "RFB Power Graph") 화면 이식. 좌표·크기는 frmPower.Designer.vb 값 그대로.
// 그래프(vbplot.vb)는 powerChart.js 의 PowerGraph 가 재현한다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiJson, query } from '../../lib/apiJson';
import { VbButton, VbCheck, VbCombo, VbForm, VbGrid, VbLabel, VbText, asGrid } from '../vb/Vb';
import PowerGraph, { CONTAINER, hitTest, plotColorVar, scaleOf, vbFormatE, yFromPixel } from './powerChart';
import { showAlert, showConfirm } from '../../lib/dialog';

const F8 = { size: 8, family: 'Arial' };
const F6 = { size: 6, family: 'Arial' };
const PT = 96 / 72;
const ROW_H = 15;
const LEGEND_Y = [157, 173, 188, 203, 219, 234];
const MARK_Y = [155, 170, 185, 201, 216, 231];
const ORDER_OPTIONS = ['', 'PmPulseType', 'measFmMHz', 'sysFmMHz', 'elAper'];
const EMPTY_GRID = { columns: [], rows: [] };
const API = '/api/interrogator/power';

const fmtE = (v) => vbFormatE(v, 6);
const csng = (t) => {
  const s = String(t ?? '').trim();
  if (s === '' || !Number.isFinite(Number(s))) return NaN;
  return Math.fround(Number(s));
};
const isNumeric = (t) => String(t ?? '').trim() !== '' && Number.isFinite(Number(String(t).trim()));

const itemText = (it) => ` ${it.pulseType} ${it.measFm} ${it.sysFm} ${it.elAper} ${it.mark}`;
const datasetText = (it) => `PMpulseType:  ${it.pulseType},   measFmMhz:  ${it.measFm},   sysFmMhz:  ${it.sysFm},   elAper:  ${it.elAper}`;
const datasetBody = (it) => ({ pulseType: it.pulseType, measFm: it.measFm, sysFm: it.sysFm, elAper: it.elAper });
const copyLines = (lines) => lines.map((l) => ({ color: l.color, points: l.points.map((p) => [p[0], p[1]]) }));

// frmGlobals PopColor/PushColor: 사용 중이 아닌 첫 색(1..20), 모두 쓰이면 21(Black)
function popColor(items) {
  const used = new Set(items.filter((i) => i.checked).map((i) => i.color));
  for (let c = 1; c <= 20; c += 1) if (!used.has(c)) return c;
  return 21;
}

// lstFreq_ItemCheck: 체크 시 색 할당·메뉴 끝에 추가, 해제 시 색 반납·메뉴에서 제거
function applyCheck(model, idx, checked) {
  const items = model.items.slice();
  let menu = model.menu.filter((i) => i !== idx);
  if (checked) {
    items[idx] = { ...items[idx], checked: true, color: popColor(model.items) };
    menu = [...menu, idx];
  } else {
    items[idx] = { ...items[idx], checked: false, color: 0 };
  }
  return { items, menu };
}

function syncLegend(items, top) {
  return LEGEND_Y.map((_, i) => {
    const it = items[top + i];
    return it && it.checked ? it.color : 0;
  });
}

// 편집 상자(ManualEdit*) 상태 전이와 TextChanged/CheckStateChanged 연쇄
const textNewX = (s, v) => ({ ...s, newX: v, applyEnabled: v.trim().length > 0, chkNewXEnabled: false });
const textNewY = (s, v) => ({ ...s, newY: v, applyEnabled: v.trim().length > 0 });
const checkNewX = (s, v) => ({ ...s, chkNewX: v, xEnabled: v });
const manualEditClear = (s) => checkNewX(textNewY(textNewX({ ...s, graphName: '', measFreq: '', selX: '', selY: '', chgX: '0', chgY: '0' }, ''), ''), false);
const manualEditOn = (s) => ({ ...s, yEnabled: true, chkNewXEnabled: true, xEnabled: s.chkNewX ? true : s.xEnabled, applyEnabled: true, cancelEnabled: true });
const manualEditOff = (s) => ({ ...s, xEnabled: false, yEnabled: false, chkNewXEnabled: false, applyEnabled: false, cancelEnabled: false });

const OFF_EDIT = {
  graphName: '', measFreq: '', selX: '', selY: '', chgX: '0', chgY: '0', newX: '', newY: '',
  chkNewX: false, chkNewXEnabled: false, xEnabled: false, yEnabled: false, applyEnabled: false, cancelEnabled: false,
};

function RedUpDown({ x, y, testId }) {
  return (
    <div data-testid={testId} aria-hidden="true"
      style={{ left: x, top: y, width: 16, height: 19, background: 'var(--vb-red)', border: '1px solid var(--vb-border)' }} />
  );
}

// props 의 rtpName 은 원본 intPower 가 쓰지 않으므로 받기만 한다.
export default function PowerForm({ database, probeId, onClose }) {
  const [swVersions, setSwVersions] = useState([' ']);
  const [swSel, setSwSel] = useState([]);
  const [model, setModel] = useState({ items: [], menu: [] });
  const modelRef = useRef(model);
  const [selIdx, setSelIdx] = useState(-1);
  const topRef = useRef(0);
  const [legend, setLegend] = useState([0, 0, 0, 0, 0, 0]);
  const [orders, setOrders] = useState(['', '', '', '']);
  const [grid, setGrid] = useState(EMPTY_GRID);
  const [gridOn, setGridOn] = useState(true);
  const [multiEdit, setMultiEdit] = useState(false);
  const [me, setMe] = useState(OFF_EDIT);
  const meRef = useRef(me);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [graph, setGraph] = useState({ range: null, lines: [], showNumbers: false });
  const graphRef = useRef(graph);
  const myDataRef = useRef([]);
  const idsRef = useRef([]);
  const editDatasetRef = useRef('');
  const editItemRef = useRef(null);
  const [editMode, setEditMode] = useState(false);
  const vpRef = useRef({ edit: false, selected: false, editPoint: false, mouseStatus: 0, editPos: -1, dragY: null });
  const [selDraw, setSelDraw] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [subOpen, setSubOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const gen = useRef(0);

  const commitModel = (m) => { modelRef.current = m; setModel(m); };
  const commitGraph = (gph) => { graphRef.current = gph; setGraph(gph); };
  const updateMe = (fn) => { const next = fn(meRef.current); meRef.current = next; setMe(next); };
  const fail = (e) => setError(e?.message || String(e));

  // vbplot.Edit 속성 + DataEdit 이벤트
  const setEdit = (flag) => {
    const vp = vpRef.current;
    vp.edit = flag;
    vp.editPoint = false;
    vp.selected = false;
    vp.dragY = null;
    setSelDraw(null);
    setEditMode(flag);
    if (!flag) updateMe(manualEditClear);
  };

  // ---------------------------------------------------------------- Load
  useEffect(() => {
    const my = ++gen.current;
    (async () => {
      try {
        const list = await apiJson(`${API}/sw-versions?${query({ database, probeId })}`);
        if (my === gen.current) setSwVersions([' ', ...(list || [])]);
      } catch (e) {
        if (my === gen.current) setError(e?.message || String(e));
      }
    })();
    meRef.current = manualEditOff(meRef.current);
    setMe(meRef.current);
    return () => { gen.current += 1; };
  }, [database, probeId]);

  const onSwClick = (i) => {
    if (swSel.includes(i)) { setSwSel(swSel.filter((s) => s !== i)); return; }
    if (swSel.length + 1 > 3) {
      showAlert("Please limit your selection of 'measImgSwVersion' values to a maximum of three (3).");
      return;
    }
    setSwSel([...swSel, i].sort((a, b) => a - b));
  };

  const loadItems = (list) => {
    const items = (list || []).map((it) => ({ ...it, checked: false, color: 0 }));
    commitModel({ items, menu: [] });
    setSelIdx(-1);
    setLegend(syncLegend(items, topRef.current));
  };

  // ---------------------------------------------------------------- 버튼
  const onGetRecords = async () => {
    const my = ++gen.current;
    setBusy('get');
    setError('');
    loadItems([]);
    try {
      const data = await apiJson(`${API}/records`, {
        method: 'POST', body: { database, probeId: Number(probeId), swVersions: swSel.map((i) => swVersions[i]) },
      });
      if (my !== gen.current) return;
      loadItems(data.items);
      setGrid(asGrid(data.grid));
    } catch (e) {
      if (my === gen.current) fail(e);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  const onUpdate = async () => {
    const my = ++gen.current;
    setBusy('update');
    setError('');
    loadItems([]);
    try {
      const list = await apiJson(`${API}/items`, { method: 'POST', body: { database, orders } });
      if (my === gen.current) loadItems(list);
    } catch (e) {
      if (my === gen.current) fail(e);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  const toggleItem = (idx) => {
    const cur = modelRef.current;
    const next = applyCheck(cur, idx, !cur.items[idx].checked);
    commitModel(next);
    setSelIdx(idx);
    setLegend(syncLegend(next.items, topRef.current));
  };

  // 체크된 항목은 해제 → 텍스트 갱신 → 재체크(메뉴 끝으로 이동, 색 재할당)
  const remark = (m, idx, mark) => {
    const it = m.items[idx];
    if (!it.checked) {
      const items = m.items.slice();
      items[idx] = { ...it, mark, text: itemText({ ...it, mark }) };
      return { ...m, items };
    }
    let next = applyCheck(m, idx, false);
    const items = next.items.slice();
    items[idx] = { ...items[idx], mark, text: itemText({ ...it, mark }) };
    next = applyCheck({ ...next, items }, idx, true);
    return next;
  };

  const onChkMark = async (i) => {
    const idx = topRef.current + i;
    const it = modelRef.current.items[idx];
    if (!it || busy) return;
    const mark = it.mark === 'checked' ? 'unchecked' : 'checked';
    if (!await showConfirm(`trtp_power 의 mark 를 '${mark}' 로 변경합니다.\n${datasetText(it)}\n계속할까요?`)) return;
    const my = ++gen.current;
    setBusy('mark');
    setError('');
    try {
      await apiJson(`${API}/mark`, { method: 'POST', body: { database, dataset: datasetBody(it), mark, confirm: true } });
      if (my !== gen.current) return;
      const next = remark(modelRef.current, idx, mark);
      commitModel(next);
      setLegend(syncLegend(next.items, topRef.current));
    } catch (e) {
      if (my === gen.current) fail(e);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  const onMarkAll = async () => {
    if (!await showConfirm("trtp_power 의 모든 mark 를 'checked' 로 변경합니다. 계속할까요?")) return;
    const my = ++gen.current;
    setBusy('markAll');
    setError('');
    try {
      await apiJson(`${API}/mark-all`, { method: 'POST', body: { database, confirm: true } });
      if (my !== gen.current) return;
      let next = modelRef.current;
      for (let i = 0; i < next.items.length; i += 1) next = remark(next, i, 'checked');
      commitModel(next);
      setLegend(syncLegend(next.items, topRef.current));
    } catch (e) {
      if (my === gen.current) fail(e);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  // DrawGraph
  const drawGraph = async () => {
    const checked = modelRef.current.items.filter((it) => it.checked);
    if (!checked.length) return;
    const my = ++gen.current;
    setBusy('plot');
    setError('');
    try {
      const res = await apiJson(`${API}/plot`, { method: 'POST', body: { database, datasets: checked.map(datasetBody) } });
      if (my !== gen.current) return;
      let range = null;
      const lines = [];
      res.forEach((d, i) => {
        if (d.range) {
          range = range ? {
            xMin: Math.min(range.xMin, d.range.xMin), xMax: Math.max(range.xMax, d.range.xMax),
            yMin: Math.min(range.yMin, d.range.yMin), yMax: Math.max(range.yMax, d.range.yMax),
          } : { ...d.range };
        }
        lines.push({ color: checked[i].color, points: d.points.map((p) => [Number(p[1]), Number(p[2])]) });
      });
      myDataRef.current = copyLines(lines);
      commitGraph({ range, lines, showNumbers: true });
      if (range && !(range.xMax > range.xMin && range.yMax > range.yMin)) {
        setError('X 또는 Y 값의 최소·최대가 같아 그래프 축을 만들 수 없습니다(원본은 0 나누기 오류).');
      }
    } catch (e) {
      if (my === gen.current) fail(e);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  // EditGraph
  const editGraph = async () => {
    const it = editItemRef.current;
    if (!it) return;
    updateMe((s) => ({ ...s, graphName: 'Power', measFreq: it.measFm }));
    const my = ++gen.current;
    setBusy('edit');
    setError('');
    try {
      const res = await apiJson(`${API}/plot`, { method: 'POST', body: { database, datasets: [datasetBody(it)] } });
      if (my !== gen.current) return;
      const d = res[0];
      if (!d || !d.range) { setError('선택한 데이터셋에 데이터가 없습니다.'); return; }
      idsRef.current = d.points.map((p) => p[0]);
      const lines = [{ color: it.color, points: d.points.map((p) => [Number(p[1]), Number(p[2])]) }];
      myDataRef.current = copyLines(lines);
      commitGraph({ range: { ...d.range }, lines, showNumbers: graphRef.current.showNumbers });
      setEdit(true);
      updateMe((s) => ({ ...s, graphName: 'Power', measFreq: it.measFm }));
    } catch (e) {
      if (my === gen.current) fail(e);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  // DrawNewData
  const drawNewData = () => {
    setEdit(false);
    commitGraph({ ...graphRef.current, lines: copyLines(myDataRef.current) });
  };

  // SaveEdit
  const saveEdit = async (pos, lines, askConfirm) => {
    const pt = lines[0]?.points[pos];
    const powerId = idsRef.current[pos];
    if (!pt || powerId == null) return;
    setEdit(false);
    if (multiEdit) setEdit(true);
    if (askConfirm && !await showConfirm(`trtp_power(PowerId=${powerId}) 값을 저장합니다.\npulseVoltageVolt=${pt[0]}, PowerData=${pt[1]}`)) return;
    try {
      await apiJson(`${API}/point`, { method: 'POST', body: { database, powerId, x: pt[0], y: pt[1], confirm: true } });
    } catch (e) {
      fail(e);
    }
  };

  const onMenuDataset = (idx) => {
    setCtxMenu(null);
    setSubOpen(false);
    if (idx == null) return;
    const it = modelRef.current.items[idx];
    if (!it) return;
    editDatasetRef.current = datasetText(it);
    editItemRef.current = it;
    setAutoEnabled(editDatasetRef.current.trim() !== '');
    editGraph();
  };

  const onMenuCancelEdit = () => {
    setCtxMenu(null);
    setEdit(false);
    updateMe(manualEditOff);
    drawNewData();
  };

  // cmdAutoCheck_Click + DrawAutoPowerCheck + SaveAutoCheck
  const onAutoCheck = async () => {
    const ds = editDatasetRef.current;
    const it = editItemRef.current;
    if (ds === '' || !it) return;
    const my = ++gen.current;
    setBusy('auto');
    setError('');
    let dip = 0;
    try {
      const r = await apiJson(`${API}/auto-check`, { method: 'POST', body: { database, dataset: datasetBody(it) } });
      if (my !== gen.current) return;
      dip = r.dip;
      if (dip > 2) showAlert(`There are multiple dips found in (${ds}). Please check the results carefully`);
      if (r.range) {
        const range = { ...r.range };
        const lines = [{ color: it.color, points: r.points.map((p) => [Number(p[1]), Number(p[2])]) }];
        if (dip > 0) {
          const fixed = r.points.map((p, j) => [Number(p[1]), Number(r.fixed[j])]);
          fixed.forEach(([, y]) => {
            if (y < range.yMin) range.yMin = y;
            if (y > range.yMax) range.yMax = y;
          });
          lines.push({ color: 'purple', points: fixed });
        }
        idsRef.current = r.points.map((p) => p[0]);
        myDataRef.current = copyLines(lines);
        commitGraph({ range, lines, showNumbers: true });
      }
      setEdit(false);
    } catch (e) {
      if (my === gen.current) fail(e);
      return;
    } finally {
      if (my === gen.current) setBusy('');
    }
    if (dip > 0) {
      if (await showConfirm(`Dips are found In Power vs. Voltage with (${ds}). Do you want To save fixes?`)) {
        try {
          await apiJson(`${API}/auto-save`, { method: 'POST', body: { database, dataset: datasetBody(it), confirm: true } });
        } catch (e) {
          fail(e);
        }
      }
      await drawGraph();
    }
  };

  const onApply = () => {
    const pos = vpRef.current.editPos;
    const x = csng(meRef.current.newX);
    const y = csng(meRef.current.newY);
    if (Number.isNaN(x) || Number.isNaN(y) || !myDataRef.current[0]?.points[pos]) {
      showAlert('New X / New Y 값이 숫자가 아닙니다.');
      return;
    }
    myDataRef.current[0].points[pos] = [x, y];
    drawNewData();
    saveEdit(pos, myDataRef.current, true);
    updateMe(manualEditOff);
  };

  const onCancelBtn = () => {
    drawNewData();
    updateMe(manualEditOff);
  };

  const onChangeKey = (axis) => (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const s = meRef.current;
    const chg = axis === 'x' ? s.chgX : s.chgY;
    if (!isNumeric(chg)) return;
    const dv = csng(axis === 'x' ? s.selX : s.selY);
    const pct = Math.fround(csng(chg) * 0.01);
    const v = fmtE(pct * Math.abs(dv) + dv);
    updateMe((st) => (axis === 'x' ? textNewX(st, v) : textNewY(st, v)));
  };

  // ---------------------------------------------------------------- 그래프 마우스(vbplot + frmPower 핸들러)
  const editLinePoints = () => graphRef.current.lines[0]?.points || [];

  const onPointerDown = (btn, px, py) => {
    const vp = vpRef.current;
    const { range } = graphRef.current;
    if (btn === 'right') return;
    if (btn !== 'left' || !vp.edit || vp.editPoint || !range || !scaleOf(range)) return;
    const pts = editLinePoints();
    if (vp.selected) {
      if (hitTest(range, [pts[vp.editPos]], px, py) === 0) vp.editPoint = true;
      return;
    }
    const i = hitTest(range, pts, px, py);
    if (i < 0) return;
    vp.editPos = i;
    vp.selected = true;
    vp.mouseStatus = 0;
    const [dx, dy] = pts[i];
    updateMe((s) => {
      const selX = fmtE(dx);
      const selY = fmtE(dy);
      return manualEditOn(textNewY(textNewX({ ...s, selX, selY }, selX), selY));
    });
    setSelDraw({ x: dx, y: dy, prev: pts[i - 1] || null, next: pts[i + 1] || null, dragging: false });
  };

  const onPointerMove = (btn, px, py) => {
    if (btn !== 'left') return;
    const vp = vpRef.current;
    const { range } = graphRef.current;
    if (!range || !scaleOf(range)) return;
    if (vp.editPoint) {
      vp.mouseStatus = 1;
      vp.selected = false;
      const pts = editLinePoints();
      const y = yFromPixel(range, py);
      vp.dragY = y;
      setSelDraw({ x: pts[vp.editPos][0], y, prev: pts[vp.editPos - 1] || null, next: pts[vp.editPos + 1] || null, dragging: true });
    }
    if (vp.edit) {
      const s = scaleOf(range);
      const dx = px / s.xs + range.xMin;
      const dy = yFromPixel(range, py);
      updateMe((st) => {
        let next = st;
        if (st.chkNewX) next = textNewX(next, fmtE(dx));
        return manualEditOff(textNewY(next, fmtE(dy)));
      });
    }
  };

  const onPointerUp = (btn, _px, py) => {
    if (btn !== 'left') return;
    const vp = vpRef.current;
    const { range } = graphRef.current;
    if (!vp.editPoint && vp.mouseStatus !== 1) return;
    if (!range || !scaleOf(range)) return;
    vp.mouseStatus = 2;
    const pos = vp.editPos;
    const lines = copyLines(graphRef.current.lines);
    if (!lines[0]?.points[pos]) return;
    lines[0].points[pos] = [lines[0].points[pos][0], yFromPixel(range, py)];
    commitGraph({ ...graphRef.current, lines });
    setSelDraw({ x: lines[0].points[pos][0], y: lines[0].points[pos][1], prev: null, next: null, dragging: false });
    // vbPowerGraph_DataChanged
    setTimeout(async () => {
      if (await showConfirm('The dataset has been modified. Do you want to save your changes?')) {
        saveEdit(pos, lines, false);
      } else {
        setEdit(false);
        drawNewData();
      }
    }, 300);
  };

  const onContextMenu = (cx, cy) => {
    if (!vpRef.current.edit) {
      if (!modelRef.current.items.some((it) => it.checked)) return;
      setCtxMenu({ x: CONTAINER.x + 1 + cx, y: CONTAINER.y + 1 + cy });
      if (editDatasetRef.current !== '') editGraph();
    } else {
      setCtxMenu({ x: CONTAINER.x + 1 + cx, y: CONTAINER.y + 1 + cy });
    }
  };

  const menuEntries = useMemo(() => model.menu.map((idx) => ({ idx, text: datasetText(model.items[idx]) })), [model]);
  const anyChecked = model.items.some((it) => it.checked);
  const legendColors = legend;

  return (
    <VbForm title="RFB Power Graph" width={1144} height={831} onClose={onClose} testId="int-power">
      <div className="vb-menubar" style={{ left: 0, top: 0, width: 1144, height: 24, fontSize: `${8 * PT}px`, fontFamily: 'Arial' }}>
        <button type="button" data-testid="pw-grid-onoff" onClick={() => setGridOn(!gridOn)}>{gridOn ? 'Grid Off' : 'Grid On'}</button>
      </div>

      <VbLabel x={3} y={32} font={{ size: 8.25, family: 'Calibri' }}>
        Have you selected tank data?  if yes, get temp record directly, or choose a swVersion.{' '}
      </VbLabel>
      <VbLabel x={3} y={62} font={F8}>PowerSwVersion</VbLabel>
      <VbLabel x={5} y={75} font={F8}>(Selection&lt;=3)</VbLabel>
      <div className="vb-list" role="listbox" aria-multiselectable="true" aria-label="PowerSwVersion" data-testid="pw-swversion"
        style={{ left: 92, top: 62, width: 202, height: 64, fontSize: `${6 * PT}px`, fontFamily: F6.family, opacity: swVersions.length > 1 ? 1 : 0.6 }}>
        {swVersions.map((v, i) => (
          <div key={`${i}-${v}`} role="option" aria-selected={swSel.includes(i)} tabIndex={-1}
            className={`vb-list-item${swSel.includes(i) ? ' selected' : ''}`}
            style={{ whiteSpace: 'pre' }}
            onClick={() => { if (swVersions.length > 1) onSwClick(i); }}>
            {v}
          </div>
        ))}
      </div>
      <VbButton x={300} y={73} w={85} h={38} font={F8} onClick={onGetRecords} busy={busy === 'get'} disabled={!!busy}
        testId="pw-get">Get Records</VbButton>

      <VbLabel x={3} y={133} font={F8}>Legd</VbLabel>
      <VbLabel x={40} y={134} font={F8}>PulseType</VbLabel>
      <VbLabel x={107} y={134} font={F8}>measFm</VbLabel>
      <VbLabel x={165} y={133} font={F8}>sysFm</VbLabel>
      <VbLabel x={225} y={134} font={F8}>elAper</VbLabel>
      <VbLabel x={287} y={134} font={F8}>Mark</VbLabel>
      <VbLabel x={360} y={129} font={F8}>Chg</VbLabel>

      <div className="vb-list" role="listbox" aria-label="lstFreq" data-testid="pw-freq"
        style={{ left: 23, top: 154, width: 337, height: 92, fontSize: `${8 * PT}px`, fontFamily: 'Arial' }}
        onScroll={(e) => { topRef.current = Math.round(e.currentTarget.scrollTop / ROW_H); }}
        onMouseEnter={() => setLegend(syncLegend(modelRef.current.items, topRef.current))}>
        {model.items.map((it, i) => (
          <label key={i} className={`vb-checklist-item${selIdx === i ? ' selected' : ''}`} data-testid={`pw-freq-${i}`}>
            <input type="checkbox" checked={it.checked} onChange={() => toggleItem(i)} />
            <span>{it.text}</span>
          </label>
        ))}
      </div>
      {legendColors.map((c, i) => (
        <div key={`lg${i}`} data-testid={`pw-legend-${i}`} aria-hidden="true"
          style={{ left: 7, top: LEGEND_Y[i], width: 11, height: 11, display: c ? 'block' : 'none', background: c ? `var(${plotColorVar(c)})` : undefined, border: '1px solid var(--vb-text)' }} />
      ))}
      {MARK_Y.map((y, i) => (
        <VbCheck key={`mk${i}`} x={366} y={y} w={13} h={14} checked={false} onChange={() => onChkMark(i)} testId={`pw-mark-${i}`} />
      ))}

      <VbButton x={42} y={258} w={81} h={25} font={F8} onClick={drawGraph} busy={busy === 'plot'} disabled={!anyChecked || !!busy}
        testId="pw-plot">Plot</VbButton>
      <VbButton x={153} y={258} w={81} h={25} font={F8} onClick={onMarkAll} busy={busy === 'markAll'} disabled={!!busy}
        testId="pw-markall">Mark All</VbButton>
      <VbButton x={260} y={258} w={81} h={25} font={F8} onClick={onClose} testId="pw-close">Close</VbButton>

      <VbLabel x={31} y={305} font={F8}>1st order:</VbLabel>
      <VbCombo x={81} y={300} w={92} h={20} font={F8} value={orders[0]} options={ORDER_OPTIONS} blank={false}
        onChange={(v) => setOrders([v, orders[1], orders[2], orders[3]])} testId="pw-order1" ariaLabel="1st order" />
      <VbLabel x={193} y={305} font={F8}>2nd order:</VbLabel>
      <VbCombo x={243} y={300} w={88} h={20} font={F8} value={orders[1]} options={ORDER_OPTIONS} blank={false}
        onChange={(v) => setOrders([orders[0], v, orders[2], orders[3]])} testId="pw-order2" ariaLabel="2nd order" />
      <VbLabel x={31} y={327} font={F8}>3rd order:</VbLabel>
      <VbCombo x={81} y={322} w={92} h={20} font={F8} value={orders[2]} options={ORDER_OPTIONS} blank={false}
        onChange={(v) => setOrders([orders[0], orders[1], v, orders[3]])} testId="pw-order3" ariaLabel="3rd order" />
      <VbLabel x={193} y={327} font={F8}>4th order:</VbLabel>
      <VbCombo x={243} y={322} w={88} h={20} font={F8} value={orders[3]} options={ORDER_OPTIONS} blank={false}
        onChange={(v) => setOrders([orders[0], orders[1], orders[2], v])} testId="pw-order4" ariaLabel="4th order" />
      <VbButton x={140} y={349} w={94} h={25} font={F8} onClick={onUpdate} busy={busy === 'update'} disabled={!!busy}
        testId="pw-update">Update Records</VbButton>

      <fieldset className="vb-group" data-testid="pw-editpoint"
        style={{ left: 58, top: 380, width: 285, height: 263, fontSize: `${9.75 * PT}px`, fontFamily: 'Arial' }}>
        <legend>Edit Point</legend>
        <VbCheck x={123} y={10} w={18} h={17} checked={multiEdit} onChange={setMultiEdit} testId="pw-multiedit" />
        <VbLabel x={147} y={10} font={F8}>Multi-point Edit</VbLabel>
        <VbLabel x={26} y={27} font={F8}>Graph</VbLabel>
        <VbLabel x={26} y={43} w={89} h={17} font={F8} align="center"
          style={{ border: '1px solid var(--vb-border)', background: 'var(--vb-window)' }} testId="pw-graphname">{me.graphName}</VbLabel>
        <VbLabel x={154} y={27} font={F8}>PMpulseType</VbLabel>
        <VbText x={154} y={43} w={97} h={20} font={F8} value={me.measFreq} readOnly testId="pw-measfreq" ariaLabel="PMpulseType" />
        <VbLabel x={20} y={66} w={239} h={15} font={{ size: 8.25, bold: true, family: 'Arial Narrow' }} color="var(--vb-red)">
          To enable auto editing, please select a set in graph
        </VbLabel>
        <VbButton x={28} y={85} w={226} h={25} font={F8} onClick={onAutoCheck} busy={busy === 'auto'}
          disabled={!autoEnabled || !!busy} testId="pw-autocheck">Auto Editing</VbButton>
        <VbLabel x={26} y={113} font={F8}>Selected X</VbLabel>
        <VbText x={26} y={129} w={97} h={20} font={F8} value={me.selX} readOnly testId="pw-selx" ariaLabel="Selected X" />
        <VbLabel x={154} y={113} font={F8}>Selected Y</VbLabel>
        <VbText x={154} y={129} w={97} h={20} font={F8} value={me.selY} readOnly testId="pw-sely" ariaLabel="Selected Y" />
        <VbLabel x={39} y={153} font={F8} color={me.xEnabled ? undefined : 'var(--vb-disabled)'}>% Chg</VbLabel>
        <div style={{ left: 74, top: 153, width: 17, height: 20 }} onKeyDown={onChangeKey('x')}>
          <VbText x={0} y={0} w={17} h={20} font={F8} value={me.chgX} readOnly={!me.xEnabled}
            onChange={(v) => updateMe((s) => ({ ...s, chgX: v }))} testId="pw-chgx" ariaLabel="% Chg X" />
        </div>
        <RedUpDown x={92} y={153} testId="pw-updnx" />
        <VbLabel x={167} y={153} font={F8} color={me.yEnabled ? undefined : 'var(--vb-disabled)'}>% Chg</VbLabel>
        <div style={{ left: 202, top: 153, width: 17, height: 20 }} onKeyDown={onChangeKey('y')}>
          <VbText x={0} y={0} w={17} h={20} font={F8} value={me.chgY} readOnly={!me.yEnabled}
            onChange={(v) => updateMe((s) => ({ ...s, chgY: v }))} testId="pw-chgy" ariaLabel="% Chg Y" />
        </div>
        <RedUpDown x={220} y={153} testId="pw-updny" />
        <VbLabel x={26} y={169} font={F8} color={me.xEnabled ? undefined : 'var(--vb-disabled)'}>New X</VbLabel>
        <VbText x={26} y={185} w={97} h={20} font={F8} value={me.newX} readOnly={!me.xEnabled}
          onChange={(v) => updateMe((s) => textNewX(s, v))} testId="pw-newx" ariaLabel="New X" />
        <VbLabel x={154} y={169} font={F8} color={me.yEnabled ? undefined : 'var(--vb-disabled)'}>New Y</VbLabel>
        <VbText x={154} y={185} w={97} h={20} font={F8} value={me.newY} readOnly={!me.yEnabled}
          onChange={(v) => updateMe((s) => textNewY(s, v))} testId="pw-newy" ariaLabel="New Y" />
        <div style={{ left: 34, top: 212, width: 81, height: 17, opacity: me.chkNewXEnabled ? 1 : 0.55, pointerEvents: me.chkNewXEnabled ? 'auto' : 'none' }}>
          <VbCheck x={0} y={0} w={81} h={17} checked={me.chkNewX} onChange={(v) => updateMe((s) => checkNewX(s, v))}
            font={F8} testId="pw-allownewx">Allow New X</VbCheck>
        </div>
        <VbButton x={26} y={230} w={97} h={25} font={F8} onClick={onApply} disabled={!me.applyEnabled}
          testId="pw-apply">Apply</VbButton>
        <VbButton x={154} y={230} w={97} h={25} font={F8} onClick={onCancelBtn} disabled={!me.cancelEnabled}
          testId="pw-cancel">Cancel</VbButton>
      </fieldset>

      <div data-testid="pw-tab" style={{ left: 27, top: 649, width: 345, height: 168, fontSize: `${8 * PT}px`, fontFamily: 'Arial' }}>
        <div style={{ position: 'absolute', left: 2, top: 2, height: 20, padding: '2px 6px', background: 'var(--vb-window)', border: '1px solid var(--vb-border)', borderBottom: 0 }}>
          trtp_power
        </div>
        <div style={{ position: 'absolute', left: 4, top: 22, width: 337, height: 142, background: 'var(--vb-window)', border: '1px solid var(--vb-border)' }}>
          <VbGrid x={3} y={3} w={330} h={136} font={F8} columns={grid.columns} rows={grid.rows} showNewRow={false}
            testId="pw-grid" />
        </div>
      </div>

      <PowerGraph
        range={graph.range}
        lines={graph.lines}
        showNumbers={graph.showNumbers}
        selection={selDraw}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        editLabel={(
          <div data-testid="pw-editmode" style={{
            position: 'absolute', left: 16, top: 8, display: editMode ? 'block' : 'none', color: 'var(--vb-red)',
            fontFamily: 'Arial', fontWeight: 700, fontSize: `${12 * PT}px`,
          }}>EDIT</div>
        )}
      />

      {ctxMenu && (
        <>
          <div aria-hidden="true" style={{ left: 0, top: 0, width: 1144, height: 831, zIndex: 19 }}
            onMouseDown={() => { setCtxMenu(null); setSubOpen(false); }}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); setSubOpen(false); }} />
          <div className="vb-ctxmenu" role="menu" data-testid="pw-ctxmenu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <div role="menuitem" aria-disabled={editMode} className={`vb-ctxmenu-item${editMode ? ' disabled' : ''}`}
              data-testid="pw-menu-edit"
              onMouseEnter={() => { if (!editMode) setSubOpen(true); }}
              onClick={() => { if (!editMode) { editDatasetRef.current = ''; setSubOpen(true); } }}>
              Edit ▸
              {subOpen && !editMode && (
                <div className="vb-ctxmenu" role="menu">
                  <div role="menuitem" className="vb-ctxmenu-item" onClick={(e) => { e.stopPropagation(); onMenuDataset(null); }}>Dataset</div>
                  {menuEntries.map((m) => (
                    <div key={m.idx} role="menuitem" className="vb-ctxmenu-item" data-testid={`pw-menu-ds-${m.idx}`}
                      onClick={(e) => { e.stopPropagation(); editDatasetRef.current = ''; onMenuDataset(m.idx); }}>
                      {m.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div role="menuitem" aria-disabled={!editMode} className={`vb-ctxmenu-item${editMode ? '' : ' disabled'}`}
              data-testid="pw-menu-cancel" onMouseEnter={() => setSubOpen(false)}
              onClick={() => { if (editMode) onMenuCancelEdit(); }}>
              Cancel Edit
            </div>
          </div>
        </>
      )}

      {busy && <div className="vb-busy" role="status">처리 중...</div>}
      {error && <VbLabel x={392} y={26} w={738} h={20} wrap style={{ overflow: 'auto' }}><span className="vb-msg">{error}</span></VbLabel>}
    </VbForm>
  );
}
