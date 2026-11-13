'use client';

// 레거시 intTank(frmTank) "Acoustic Graphs"(1151x833, Interrogator 의 Tank Data Analysis) 이식.

import { Fragment, useEffect, useRef, useState } from 'react';
import { VbButton, VbCheck, VbCombo, VbForm, VbGrid, VbLabel, VbModal, asGrid } from '../vb/Vb';
import { apiJson, query } from '../../lib/apiJson';
import TankGraph, { GEO_LARGE, GEO_SMALL, hitTest, plotColorVar, vbFormatE, yFromPixel } from './tankChart';
import TankDetailForm from './TankDetailForm';
import TankVoltageSForm from './TankVoltageSForm';
import { showAlert, showAlerts, showConfirm, showError } from '../../lib/dialog';

const API = '/api/interrogator/tank';
const PT = 96 / 72;
const F = (size, extra) => ({ size, family: 'Microsoft Sans Serif', ...extra });
const ARIAL6 = { size: 6, family: 'Arial' };
const ZLOCS = ['ztsii31Cm', 'ztsii32Cm', 'zmpii3Cm', 'zmpiiCm', 'zb3Cm', 'z1Cm', 'ztsii1Cm', 'ztsii2Cm', 'zmiCm'];
const ORDER_OPTS = ['PmPulseType', 'azApodType', 'elAperType', 'FmMHz', 'FocusPCm', 'FocusQCm', 'azFnum', 'elFnum', 'ePulseDurUs'];
const ORDER_POS = [
  ['1st', 58, 166], ['2nd', 220, 166], ['3rd', 58, 188], ['4th', 220, 188], ['5th', 58, 209], ['6th', 220, 209],
];
const GRAPHS = [
  { name: 'Lateral', x: 328, y: 24, title: 'Lateral Profile', xl: 'xDistanceCm', yl: 'PII' },
  { name: 'Elevation', x: 729, y: 24, title: 'Elevation Profile', xl: 'yDistanceCm', yl: 'PII' },
  { name: 'Z', x: 328, y: 292, title: 'Z Profile', xl: 'zDistanceCm', yl: 'PII' },
  { name: 'Voltage', x: 729, y: 292, title: 'Voltage', xl: 'TxGain', yl: 'PII' },
  { name: 'MI', x: 328, y: 560, title: 'MI', xl: 'TxGain', yl: 'MI' },
  { name: 'MIF', x: 729, y: 560, title: 'MIF', xl: 'TxGain', yl: 'MI' },
];
const NAMES = GRAPHS.map((g) => g.name);
const TABS = ['Lateral', 'Elevation', '  Z  ', 'Voltage', 'MI', 'MIF'];
const VIEW_MENU = ['Composite', ...NAMES];
const ROW_H = 12;
const DGV = [[8, 5, 270], [3, 3, 268], [8, 6, 270], [6, 7, 272], [4, 3, 277], [3, 3, 276]];
const MARK_Y = [294, 306, 319, 332, 345, 358];
const EMPTY = { columns: [], rows: [] };
const NO_EDIT = { yOn: false, xOn: false, chkEn: false, applyEn: false, cancelEn: false };

const itemText = (it) => ` ${it.fields.join(' ')}`;
const menuText = (it) => `MRI:  ${it.fields[0]},   mark:  ${it.fields[8]}`;
const blankFlag = (v) => v === null || v === undefined || v === '';

function Txt({ x, y, w, h, value, onChange, readOnly, disabled, onKeyDown, testId, align }) {
  return (
    <input
      type="text"
      className="vb-text"
      data-testid={testId}
      style={{ left: x, top: y, width: w, height: h, textAlign: align,
        background: readOnly || disabled ? 'var(--vb-face)' : undefined }}
      value={value ?? ''}
      readOnly={readOnly}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

// GroupBox: 자식 좌표는 그룹 원점 기준(fieldset 은 legend 만큼 자식이 밀려 div 로 재현)
function Group({ x, y, w, h, text, children }) {
  return (
    <div className="vb-group" style={{ left: x, top: y, width: w, height: h, border: 0 }}>
      <div style={{ left: 0, top: 7, width: w, height: h - 7, border: '1px solid var(--vb-border-light)' }} />
      <span style={{ left: 6, top: 0, padding: '0 2px', background: 'var(--vb-face)', lineHeight: '14px' }}>{text}</span>
      {children}
    </div>
  );
}

function UpDown({ x, y, disabled, onUp, onDown, testId }) {
  const s = { display: 'block', width: 16, height: 9, padding: 0, fontSize: 6, lineHeight: '7px' };
  return (
    <div style={{ left: x, top: y, width: 16, height: 19 }}>
      <button type="button" className="vb-button" style={s} disabled={disabled} onClick={onUp} data-testid={`${testId}-up`}>▲</button>
      <button type="button" className="vb-button" style={s} disabled={disabled} onClick={onDown} data-testid={`${testId}-down`}>▼</button>
    </div>
  );
}

export default function TankForm({ database, probeId, rtpName, onClose }) {
  const [swList, setSwList] = useState([]);
  const [swSel, setSwSel] = useState([]);
  const [zloc, setZloc] = useState('ztsii31Cm');
  const [zmin, setZmin] = useState(0.5);
  const [orders, setOrders] = useState(['', '', '', '', '', '']);
  const [items, setItems] = useState([]);
  const [pool, setPool] = useState(() => Array(22).fill(false));
  const [menuMri, setMenuMri] = useState([]);
  const [selIdx, setSelIdx] = useState(-1);
  const [topIndex, setTopIndex] = useState(0);
  const [grids, setGrids] = useState({});
  const [tab, setTab] = useState(0);
  const [graphs, setGraphs] = useState({});
  const [view, setView] = useState('Composite');
  const [gridOn, setGridOn] = useState(true);
  const [viewMenu, setViewMenu] = useState(false);
  const [en, setEn] = useState({ plot: false, markAll: false, autoAllMri: false, auto: false });
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [subOpen, setSubOpen] = useState(false);
  // 편집 상태(vbplot Edit/EditPoint, frmTank 전역 gEdit*)
  const [edit, setEdit] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ graphName: '', mri: '', zdi: '', selX: '', selY: '', newX: '', newY: '',
    chgX: '0', chgY: '0', chkNewX: false, multi: false });
  const [ctl, setCtl] = useState(NO_EDIT);
  const gEdit = useRef({ dataset: '', mri: '', color: 21, zloc: null });
  const gen = useRef(0);
  const busyRef = useRef(false);
  const S = useRef({});
  S.current = { items, zloc, zmin, edit, sel, form, view };

  useEffect(() => () => { gen.current += 1; }, []);

  useEffect(() => {
    gen.current += 1;
    const my = gen.current;
    setSwList([]);
    setSwSel([]);
    if (!database || blankFlag(probeId)) return;
    apiJson(`${API}/sw-versions?${query({ database, probeId })}`)
      .then((d) => { if (my === gen.current) setSwList(d || []); })
      .catch((e) => showError(e));
  }, [database, probeId]);

  const get = (path, params) => apiJson(`${API}${path}?${query({ database, ...params })}`);
  const post = (path, body) => apiJson(`${API}${path}`, { method: 'POST', body: { database, ...body } });

  const run = async (label, fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    const my = gen.current;
    try {
      await fn(() => my === gen.current);
    } catch (e) {
      showError(e);
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };

  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));
  const checkedItems = (list = S.current.items) => list.filter((it) => it.checked);

  // ---------------------------------------------------------------- DrawGraph
  const drawGraph = async (names, list = S.current.items) => {
    const checked = checkedItems(list);
    if (checked.length === 0) return;
    const res = await post('/graphs', {
      graphs: names, resIds: checked.map((it) => Number(it.fields[0])), zloc: S.current.zloc, zmin: S.current.zmin,
    });
    setGraphs((prev) => {
      const next = { ...prev };
      (res || []).forEach((r) => {
        next[r.graph] = r.aborted ? null : {
          range: r.range,
          lines: r.lines.map((l, i) => ({ color: checked[i]?.color ?? 21, points: l.points })),
        };
      });
      return next;
    });
  };

  // ---------------------------------------------------------------- 편집(DataEdit/ManualEdit*)
  const manualEditClear = () => {
    setF({ graphName: '', mri: '', zdi: '', selX: '', selY: '', newX: '', newY: '', chgX: '0', chgY: '0', chkNewX: false });
    setCtl(NO_EDIT);
  };
  const manualEditOn = (chkNewX = S.current.form.chkNewX) => setCtl({
    yOn: true, xOn: chkNewX, chkEn: true, applyEn: true, cancelEn: true,
  });
  const manualEditOff = () => setCtl(NO_EDIT);

  const endEdit = (e, points) => {
    setEdit(null);
    setSel(null);
    manualEditClear();
    if (e) setGraphs((g) => ({ ...g, [e.graph]: { range: e.range, lines: [{ color: e.color, points }] } }));
  };

  const editGraph = async (graph) => {
    const g = gEdit.current;
    const r = await post('/edit-graph', { graph, resId: Number(g.mri), zloc: S.current.zloc, editZloc: g.zloc });
    if (r.aborted) return;
    setSel(null);
    setEdit({ graph, color: g.color, range: r.range, points: r.points, original: r.points, bookmarks: r.bookmarks });
  };

  const cancelEdit = () => {
    const e = S.current.edit;
    endEdit(e, e?.original);
    manualEditOff();
  };

  const saveEdit = async (e, idx, points) => {
    const [x, y] = points[idx];
    await post('/save-edit', { graph: e.graph, bookmark: e.bookmarks[idx], x, y });
    if (!S.current.form.multi) {
      endEdit(e, points);
    } else {
      setEdit({ ...e, points, original: points });
      setSel(null);
    }
  };

  const selectPoint = (e, idx) => {
    const [x, y] = e.points[idx];
    setSel({ idx, dragging: false });
    setF({ selX: vbFormatE(x, 6), selY: vbFormatE(y, 6), newX: vbFormatE(x, 6), newY: vbFormatE(y, 6) });
    manualEditOn();
  };

  const onGraphDown = (graph) => (button, px, py) => {
    const e = S.current.edit;
    if (button !== 'left' || !e || e.graph !== graph) return;
    const geo = S.current.view === 'Composite' ? GEO_SMALL : GEO_LARGE;
    const idx = hitTest(geo, e.range, e.points, px, py);
    if (idx < 0) return;
    if (S.current.sel && S.current.sel.idx === idx) setSel({ idx, dragging: true });
    else selectPoint(e, idx);
  };

  const onGraphMove = (graph) => (buttons, _px, py) => {
    const e = S.current.edit;
    const s = S.current.sel;
    if (!e || e.graph !== graph || !s?.dragging || buttons !== 'left') return;
    const geo = S.current.view === 'Composite' ? GEO_SMALL : GEO_LARGE;
    const y = yFromPixel(geo, e.range, py);
    const points = e.points.map((p, i) => (i === s.idx ? [p[0], y] : p));
    setEdit({ ...e, points });
    setF({ newY: vbFormatE(y, 6), ...(S.current.form.chkNewX ? { newX: vbFormatE(points[s.idx][0], 6) } : {}) });
    manualEditOff();
  };

  const onGraphUp = (graph) => async (button) => {
    const e = S.current.edit;
    const s = S.current.sel;
    if (!e || e.graph !== graph || !s?.dragging || button !== 'left') return;
    setSel({ idx: s.idx, dragging: false });
    if (await showConfirm('The dataset has been modified. Do you want to save your changes?')) {
      run('SaveEdit', () => saveEdit(e, s.idx, e.points));
    } else {
      cancelEdit();
    }
  };

  const applyEdit = () => {
    const e = S.current.edit;
    const s = S.current.sel;
    if (!e || !s) return;
    const f = S.current.form;
    const nx = Number(f.newX);
    const ny = Number(f.newY);
    if (f.newX.trim() === '' || f.newY.trim() === '' || !Number.isFinite(nx) || !Number.isFinite(ny)) {
      showAlert('Type mismatch');
      return;
    }
    const points = e.points.map((p, i) => (i === s.idx ? [nx, ny] : p));
    setEdit({ ...e, points });
    run('SaveEdit', async () => {
      await saveEdit(e, s.idx, points);
      manualEditOff();
    });
  };

  const changePct = (axis, pctText) => {
    const pct = Number(pctText);
    const base = Number(axis === 'X' ? S.current.form.selX : S.current.form.selY);
    if (pctText.trim() === '' || !Number.isFinite(pct) || !Number.isFinite(base)) return false;
    setF({ [`new${axis}`]: vbFormatE(base + pct * 0.01 * Math.abs(base), 6) });
    return true;
  };
  const stepPct = (axis, d) => {
    const v = (Number(S.current.form[`chg${axis}`]) || 0) + d;
    setF({ [`chg${axis}`]: String(v) });
    changePct(axis, String(v));
  };

  // ---------------------------------------------------------------- 컨텍스트 메뉴(mnuEdit*)
  const openContext = (graph) => (cx, cy) => {
    const g = GRAPHS.find((x) => x.name === graph);
    const base = S.current.view === 'Composite' ? g : { x: 328, y: 24 };
    const pos = { x: base.x + cx, y: base.y + cy };
    setSubOpen(false);
    if (S.current.edit) { setCtx(pos); return; }
    if (checkedItems().length < 1) return;
    setF({ graphName: graph });
    setCtx(pos);
    if (gEdit.current.dataset !== '') {
      const ge = gEdit.current;
      setF({ graphName: graph, mri: ge.mri, zdi: blankFlag(ge.zloc) ? '' : String(ge.zloc) });
      run('EditGraph', () => editGraph(graph));
    }
  };

  const onMenuMri = (entry) => {
    setCtx(null);
    const graph = S.current.form.graphName;
    run('EditGraph', async () => {
      const ge = gEdit.current;
      ge.dataset = entry.text;
      ge.mri = entry.resId;
      ge.color = entry.color;
      const z = await get('/edit-zloc', { resId: entry.resId, zloc: S.current.zloc });
      if (!blankFlag(z)) ge.zloc = z;
      setF({ mri: ge.mri, zdi: blankFlag(ge.zloc) ? '' : String(ge.zloc) });
      setEn((x) => ({ ...x, auto: ge.mri !== '' }));
      await editGraph(graph);
    });
  };

  // ---------------------------------------------------------------- 자동 보정(DrawAutoMiPiiCheck)
  const autoCheckOne = async (graph, key, prompt, alive) => {
    const ge = gEdit.current;
    const r = await post('/auto-check', {
      graph, resId: Number(ge.mri), key, editZloc: ge.zloc, zloc: S.current.zloc, zmin: S.current.zmin,
    });
    if (!alive()) return;
    if (!r.aborted) {
      const lines = [{ color: ge.color, points: r.points }];
      if (r.corrected) lines.push({ color: 'purple', points: r.corrected });
      setGraphs((g) => ({ ...g, [graph]: { range: r.range, lines } }));
    }
    if (r.multiDipMessage) showAlert(r.multiDipMessage);
    setEdit(null);
    setSel(null);
    manualEditClear();
    if (r.dip > 0 && await showConfirm(`Dips are found In ${prompt} vs. Voltage at z=${key}. Do you want To save fixes?`)) {
      await post('/auto-check/save', { graph, resId: Number(ge.mri), key, confirm: true });
    }
    await drawGraph([graph]);
  };

  const cmdAutoCheck = () => {
    const ge = gEdit.current;
    if (ge.mri === '') return;
    run('Auto Editing', async (alive) => {
      const steps = [['zloc', 'Voltage', 'Intensity'], ['zmi', 'MI', 'MI'], ['focus', 'MIF', 'MIF']];
      let zRequest = ge.zloc;
      for (let i = 0; i < steps.length; i += 1) {
        const [kind, graph, prompt] = steps[i];
        const z = await get('/zdis', { resId: ge.mri, kind, zloc: S.current.zloc });
        if (!alive()) return;
        if (blankFlag(z)) {
          showAlert(`No specified zDistance is found for resId =${ge.mri}`);
          continue;
        }
        ge.zloc = z;
        if (i === 0) zRequest = z;
        await autoCheckOne(graph, z, prompt, alive);
      }
      ge.zloc = zRequest;
      await drawGraph(['Voltage']);
    });
  };

  const cmdAutoCheckAll = () => {
    const ge = gEdit.current;
    if (ge.mri === '') { showAlert('Please select an edit MRI'); return; }
    run('Auto Editing', async (alive) => {
      const zRequest = await get('/zdis', { resId: ge.mri, kind: 'zloc', zloc: S.current.zloc });
      const zs = await get('/z-locations', { resId: ge.mri });
      for (const z of zs || []) {
        if (!alive()) return;
        if (blankFlag(z)) continue;
        setBusy(`Check resId = ${ge.mri}\nzLoc = ${z}`);
        ge.zloc = z;
        await autoCheckOne('Voltage', z, 'Intensity', alive);
        await autoCheckOne('MI', z, 'MI', alive);
      }
      ge.zloc = zRequest;
      await drawGraph(['Voltage']);
    });
  };

  const cmdAutoCheckAllMri = async () => {
    if (!await showConfirm('모든 MRI 의 Voltage/MI dip 을 자동 보정해 ws_voltage_dep 에 저장합니다. 계속할까요?')) return;
    run('AutoEdit all MRI Volt-dep', async (alive) => {
      const r = await post('/auto-check-all-mri', { zloc: S.current.zloc, zmin: S.current.zmin, confirm: true });
      if (!alive()) return;
      await showAlerts(r.messages);
      await drawGraph(NAMES);
    });
  };

  // ---------------------------------------------------------------- 목록(lstMRI)
  const resetList = (rows) => {
    setItems((rows || []).map((fields) => ({ fields, checked: false, color: 0 })));
    setPool(Array(22).fill(false));
    setMenuMri([]);
    setSelIdx(-1);
    setTopIndex(0);
    setEn((x) => ({ ...x, plot: false }));
  };

  const popColor = (p) => {
    for (let i = 1; i <= 21; i += 1) if (!p[i]) { p[i] = true; return i; }
    return 21;
  };

  const checkItem = (list, p, menu, i, on) => {
    const it = { ...list[i] };
    if (on) {
      it.color = popColor(p);
      it.checked = true;
      menu.push({ resId: it.fields[0], text: menuText(it), color: it.color });
    } else {
      if (it.color) p[it.color] = false;
      it.checked = false;
      const k = menu.findIndex((m) => m.resId === it.fields[0]);
      if (k >= 0) menu.splice(k, 1);
    }
    list[i] = it;
  };

  const toggleItem = (i) => {
    setSelIdx(i);
    const list = [...items];
    const p = [...pool];
    const menu = [...menuMri];
    const on = !list[i].checked;
    checkItem(list, p, menu, i, on);
    setItems(list);
    setPool(p);
    setMenuMri(menu);
    setEn((x) => ({ ...x, plot: list.some((it) => it.checked) }));
    if (on) {
      const pulse = list[i].fields[1];
      get('/voltage-grid', { probeId, pulseType: pulse })
        .then((exists) => { if (!exists) setModal({ kind: 'voltage', pulseType: pulse }); })
        .catch((e) => showError(e));
    }
  };

  // 체크된 항목의 mark 텍스트를 바꾼 뒤 해제→재체크(색 재할당, 메뉴 끝에 재추가)
  const remark = (idxs, mark) => {
    const list = [...S.current.items];
    const p = [...pool];
    const menu = [...menuMri];
    idxs.forEach((i) => {
      const was = list[i].checked;
      if (was) checkItem(list, p, menu, i, false);
      list[i] = { ...list[i], fields: [...list[i].fields.slice(0, 8), mark] };
      if (was) checkItem(list, p, menu, i, true);
    });
    setItems(list);
    setPool(p);
    setMenuMri(menu);
  };

  const chkMark = (k) => {
    const i = topIndex + k;
    const it = items[i];
    if (!it) return;
    const m = it.fields[8];
    const mark = m === 'checked' || m === 'c' ? 'unchecked' : 'checked';
    run('Mark', async () => {
      await post('/mark', { resId: Number(it.fields[0]), mark, confirm: true });
      remark([i], mark.charAt(0));
    });
  };

  const cmdMarkAll = async () => {
    if (!await showConfirm("trtp_measurement 의 모든 mark 를 'checked' 로 바꿉니다. 계속할까요?")) return;
    run('Mark All', async () => {
      await post('/mark-all', { confirm: true });
      remark(S.current.items.map((_, i) => i), 'c');
    });
  };

  // ---------------------------------------------------------------- 버튼
  const onSwClick = (v) => {
    if (swSel.includes(v)) { setSwSel(swSel.filter((x) => x !== v)); return; }
    if (swSel.length >= 3) {
      showAlert("Please limit your selection of 'measImgSwVersion' values to a maximum of three (3).");
      return;
    }
    setSwSel([...swSel, v]);
  };

  const applyRecords = (d) => {
    resetList(d.items);
    setGrids(d.grids || {});
    setZmin(d.zmin ?? 0.5);
    setTab(0);
    setGraphs({});
  };

  const cmdGetRecords = async () => {
    if (!await showConfirm('pre_RTP_tank 프로시저로 작업 테이블을 다시 만듭니다. 계속할까요?')) return;
    run('Pre_RTP_tank\nRetrieving records ...', async (alive) => {
      const d = await post('/records', { probeId, rtpName, swVersions: swSel, zloc, confirm: true });
      if (!alive()) return;
      applyRecords(d);
      setEn((x) => ({ ...x, markAll: true, autoAllMri: true }));
    });
  };

  const cmdOk = () => run('Pre_Rtp_Generation\nRetrieving records ...', async (alive) => {
    const d = await post('/ok', { zloc, zmin });
    if (!alive()) return;
    applyRecords(d);
    setEn((x) => ({ ...x, markAll: true }));
  });

  const cmdUpdate = () => run('Update Records', async (alive) => {
    const d = await post('/mri-list', { orders });
    if (alive()) resetList(d);
  });

  const cmdPlot = () => run('Plot', () => drawGraph(NAMES));

  const cmdDetail = () => setModal({
    kind: 'detail', resIds: checkedItems().map((it) => Number(it.fields[0])), selectAll: isSelectAll,
  });

  // ---------------------------------------------------------------- View 메뉴(ViewGraph/ViewComposite)
  const changeView = (v) => {
    setViewMenu(false);
    if (v === view) return;
    setView(v);
    if (v === 'Composite') setTab(0);
    else setTab(NAMES.indexOf(v));
    if (checkedItems().length > 0) run('DrawGraph', () => drawGraph(v === 'Composite' ? NAMES : [v]));
  };

  const onContainerDouble = (name) => changeView(view === 'Composite' ? name : 'Composite');

  const tabGrid = asGrid(grids[NAMES[tab]] || EMPTY);
  const legend = [0, 1, 2, 3, 4, 5].map((k) => items[topIndex + k]).map((it) => (it?.checked ? it.color : 0));
  const editing = !!edit;

  const graphView = (g) => {
    if (edit && edit.graph === g.name) {
      const s = sel ? { x: edit.points[sel.idx][0], y: edit.points[sel.idx][1], dragging: sel.dragging,
        prev: edit.points[sel.idx - 1], next: edit.points[sel.idx + 1] } : null;
      return { range: edit.range, lines: [{ color: edit.color, points: edit.points }], selection: s };
    }
    return { range: graphs[g.name]?.range ?? null, lines: graphs[g.name]?.lines ?? [], selection: null };
  };

  return (
    <VbForm title="Acoustic Graphs" width={1151} height={833} onClose={onClose} testId="int-tank">
      <div className="vb-menubar" style={{ left: 0, top: 0, width: 1151, height: 24, fontSize: `${8.25 * PT}px` }}>
        <button type="button" data-testid="tk-view" onClick={() => setViewMenu(!viewMenu)}><u>V</u>iew</button>
        <button type="button" data-testid="tk-grid-onoff" onClick={() => setGridOn(!gridOn)}>{gridOn ? 'Grid Off' : 'Grid On'}</button>
      </div>
      {viewMenu && (
        <div className="vb-ctxmenu" role="menu" data-testid="tk-view-menu" style={{ left: 2, top: 22 }}>
          {VIEW_MENU.map((v) => (
            <div key={v} role="menuitemcheckbox" aria-checked={view === v} className="vb-ctxmenu-item"
              data-testid={`tk-view-${v}`} onClick={() => changeView(v)}>
              <span style={{ position: 'absolute', left: 6 }}>{view === v ? '✓' : ''}</span>{v}
            </div>
          ))}
        </div>
      )}

      <Group x={10} y={26} w={308} h={134} text="Data Information">
        <VbLabel x={21} y={15}>Use checked MRI?</VbLabel>
        <VbButton x={131} y={9} w={41} h={25} onClick={cmdOk} busy={!!busy} testId="tk-ok">OK</VbButton>
        <VbLabel x={8} y={32}>MeasSwVersion</VbLabel>
        <VbLabel x={8} y={48} color="var(--vb-maroon)">(Selection&lt;=3)</VbLabel>
        <div className="vb-list" role="listbox" aria-multiselectable="true" data-testid="tk-sw"
          style={{ left: 89, top: 31, width: 206, height: 56, fontSize: `${6 * PT}px`, fontFamily: 'Arial' }}>
          {swList.map((v) => (
            <div key={v} role="option" aria-selected={swSel.includes(v)}
              className={`vb-list-item${swSel.includes(v) ? ' selected' : ''}`} onClick={() => onSwClick(v)}>{v}</div>
          ))}
        </div>
        <VbLabel x={7} y={86} color="rgb(255,128,128)">Profile z loc:</VbLabel>
        <VbCombo x={15} y={106} w={89} h={24} value={zloc} onChange={setZloc} options={ZLOCS} blank={false} testId="tk-zloc" />
        <VbButton x={117} y={103} w={81} h={25} onClick={cmdGetRecords} busy={!!busy}
          disabled={swSel.length === 0 || blankFlag(probeId)} testId="tk-get">Get Records</VbButton>
        <VbButton x={213} y={103} w={81} h={25} onClick={() => onClose?.()} testId="tk-close">Close</VbButton>
      </Group>

      {ORDER_POS.map(([lbl, x, y], i) => (
        <Fragment key={lbl}>
          <VbLabel x={x - 50} y={y + 5} font={F(6.75, { family: 'Arial' })}>{lbl} order:</VbLabel>
          <VbCombo x={x} y={y} w={i % 2 ? 88 : 92} h={22} value={orders[i]} options={ORDER_OPTS}
            font={F(6.75, { family: 'Arial' })} testId={`tk-order-${i}`}
            onChange={(v) => setOrders(orders.map((o, k) => (k === i ? v : o)))} />
        </Fragment>
      ))}
      <VbButton x={122} y={235} w={94} h={25} onClick={cmdUpdate} busy={!!busy} testId="tk-update">Update Records</VbButton>

      <VbLabel x={-2} y={269} font={ARIAL6}>Ledg   MRI   PulsT  aApdT  eApdT  Fm   Foc   aF#   eF#   Mrk   Ch</VbLabel>
      <VbLabel x={3} y={282} font={{ size: 6, family: 'Microsoft Sans Serif' }} color="rgb(192,0,0)">
        Black legend isn&apos;t allowed. Please re-select the black resId.
      </VbLabel>
      <div className="vb-list" data-testid="tk-mri"
        style={{ left: 18, top: 294, width: 287, height: 86, fontSize: `${6 * PT}px`, fontFamily: 'Arial' }}
        onScroll={(e) => setTopIndex(Math.floor(e.currentTarget.scrollTop / ROW_H))}>
        {items.map((it, i) => (
          <label key={`${it.fields[0]}-${i}`} className={`vb-checklist-item${selIdx === i ? ' selected' : ''}`}
            style={{ height: ROW_H }} data-testid={`tk-mri-${i}`}>
            <input type="checkbox" checked={it.checked} onChange={() => toggleItem(i)} />
            <span>{itemText(it)}</span>
          </label>
        ))}
      </div>
      {legend.map((c, k) => (c ? (
        <div key={k} data-testid={`tk-legend-${k}`}
          style={{ left: 4, top: 293 + 12 * k, width: 10, height: 10, background: `var(${plotColorVar(c)})`, border: '1px solid var(--vb-border)' }} />
      ) : null))}
      {MARK_Y.map((y, k) => (
        <label key={k} className="vb-check" style={{ left: 305, top: y, width: 17, height: 17 }}>
          <input type="checkbox" checked={false} data-testid={`tk-mark-${k}`} disabled={!!busy} onChange={() => chkMark(k)} />
        </label>
      ))}

      <VbButton x={18} y={386} w={81} h={25} onClick={cmdPlot} disabled={!en.plot} busy={!!busy} testId="tk-plot">Plot</VbButton>
      <VbButton x={117} y={386} w={81} h={25} onClick={cmdMarkAll} disabled={!en.markAll} busy={!!busy} testId="tk-markall">Mark All</VbButton>
      <VbButton x={220} y={386} w={81} h={25} onClick={() => {}} testId="tk-refresh">Refresh</VbButton>
      <VbButton x={61} y={417} w={200} h={25} onClick={cmdAutoCheckAllMri} disabled={!en.autoAllMri} busy={!!busy}
        testId="tk-autoallmri">AutoEdit all MRI Volt-dep</VbButton>
      <VbCheck x={61} y={452} w={90} h={17} checked={isSelectAll} onChange={setIsSelectAll} testId="tk-selectall">Select All</VbCheck>
      <VbButton x={180} y={448} w={81} h={25} onClick={cmdDetail} busy={!!busy} testId="tk-detail">Get Details</VbButton>

      <Group x={16} y={472} w={285} h={238} text="Edit Point">
        <VbLabel x={9} y={15}>Graph</VbLabel>
        <VbLabel x={50} y={14} w={97} h={17} wrap style={{ border: '1px solid var(--vb-border)' }} testId="tk-graphname">
          {form.graphName}
        </VbLabel>
        <VbLabel x={175} y={13}>MRI</VbLabel>
        <Txt x={199} y={13} w={54} h={23} value={form.mri} readOnly testId="tk-txtmri" />
        <VbLabel x={144} y={37}>zDistance</VbLabel>
        <Txt x={199} y={37} w={54} h={23} value={form.zdi} readOnly testId="tk-txtzdi" />
        <label className="vb-check" style={{ left: 29, top: 38, width: 15, height: 15 }}>
          <input type="checkbox" checked={form.multi} data-testid="tk-multi" onChange={(e) => setF({ multi: e.target.checked })} />
        </label>
        <VbLabel x={43} y={42}>Multi-Points Edit</VbLabel>
        <VbLabel x={6} y={60} color="var(--vb-red)" font={{ size: 8.25, bold: true, family: 'Arial Narrow' }}>
          To enable auto editing, please select a MRI in graph
        </VbLabel>
        <VbButton x={20} y={78} w={115} h={34} onClick={cmdAutoCheckAll} disabled={!en.auto} busy={!!busy}
          testId="tk-autoall">Auto Editing all z</VbButton>
        <VbButton x={147} y={78} w={115} h={34} onClick={cmdAutoCheck} disabled={!en.auto} busy={!!busy}
          testId="tk-autoabove">Auto Editing above z</VbButton>
        <VbLabel x={26} y={116}>Selected X</VbLabel>
        <VbLabel x={156} y={116}>Selected Y</VbLabel>
        <Txt x={30} y={132} w={97} h={20} value={form.selX} readOnly testId="tk-selx" />
        <Txt x={158} y={132} w={97} h={20} value={form.selY} readOnly testId="tk-sely" />
        <VbLabel x={22} y={152} color={ctl.xOn ? undefined : 'var(--vb-disabled)'}>New X</VbLabel>
        <VbLabel x={59} y={150} color={ctl.xOn ? undefined : 'var(--vb-disabled)'}>% Chg</VbLabel>
        <Txt x={94} y={150} w={17} h={18} value={form.chgX} disabled={!ctl.xOn} readOnly={!ctl.xOn} testId="tk-chgx"
          onChange={(v) => setF({ chgX: v })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); changePct('X', form.chgX); } }} />
        <UpDown x={112} y={150} disabled={!ctl.xOn} testId="tk-updnx" onUp={() => stepPct('X', 1)} onDown={() => stepPct('X', -1)} />
        <VbLabel x={149} y={152} color={ctl.yOn ? undefined : 'var(--vb-disabled)'}>New Y</VbLabel>
        <VbLabel x={187} y={150} color={ctl.yOn ? undefined : 'var(--vb-disabled)'}>% Chg</VbLabel>
        <Txt x={222} y={150} w={17} h={18} value={form.chgY} disabled={!ctl.yOn} readOnly={!ctl.yOn} testId="tk-chgy"
          onChange={(v) => setF({ chgY: v })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); changePct('Y', form.chgY); } }} />
        <UpDown x={240} y={150} disabled={!ctl.yOn} testId="tk-updny" onUp={() => stepPct('Y', 1)} onDown={() => stepPct('Y', -1)} />
        <Txt x={30} y={168} w={97} h={20} value={form.newX} disabled={!ctl.xOn} readOnly={!ctl.xOn} testId="tk-newx"
          onChange={(v) => { setF({ newX: v }); if (v !== '') setCtl((c) => ({ ...c, applyEn: true, chkEn: false })); }} />
        <Txt x={158} y={168} w={97} h={20} value={form.newY} disabled={!ctl.yOn} readOnly={!ctl.yOn} testId="tk-newy"
          onChange={(v) => { setF({ newY: v }); setCtl((c) => ({ ...c, applyEn: v !== '' })); }} />
        <label className="vb-check" style={{ left: 30, top: 194, width: 100, height: 17,
          color: ctl.chkEn ? undefined : 'var(--vb-disabled)' }}>
          <input type="checkbox" checked={form.chkNewX} disabled={!ctl.chkEn} data-testid="tk-chknewx"
            onChange={(e) => { setF({ chkNewX: e.target.checked }); setCtl((c) => ({ ...c, xOn: e.target.checked })); }} />
          <span>Allow New X</span>
        </label>
        <VbButton x={30} y={212} w={97} h={25} onClick={applyEdit} disabled={!ctl.applyEn} busy={!!busy} testId="tk-apply">Apply</VbButton>
        <VbButton x={158} y={212} w={97} h={25} onClick={cancelEdit} disabled={!ctl.cancelEn} testId="tk-cancel">Cancel</VbButton>
      </Group>

      <div style={{ left: 16, top: 716, width: 289, height: 117 }} data-testid="tk-tabs">
        <div style={{ display: 'flex', height: 22, paddingTop: 2, fontSize: `${8 * PT}px`, fontFamily: 'Arial' }}>
          {TABS.map((t, i) => (
            <button key={t} type="button" data-testid={`tk-tab-${i}`} onClick={() => setTab(i)}
              style={{ border: '1px solid var(--vb-border-light)', borderBottom: tab === i ? 'none' : undefined, padding: '0 4px',
                whiteSpace: 'pre', background: tab === i ? 'var(--vb-window)' : 'var(--vb-face)', font: 'inherit' }}>{t}</button>
          ))}
        </div>
        <div style={{ position: 'absolute', left: 4, top: 22, width: 281, height: 91, background: 'var(--vb-window)',
          outline: '1px solid var(--vb-border-light)', overflow: 'hidden' }}>
          <VbGrid x={DGV[tab][0]} y={DGV[tab][1]} w={DGV[tab][2]} h={88 - DGV[tab][1]} columns={tabGrid.columns}
            rows={tabGrid.rows} font={{ size: 8, family: 'Arial' }} testId="tk-grid" />
        </div>
      </div>

      {GRAPHS.map((g, i) => {
        const large = view === g.name;
        const hidden = view !== 'Composite' && !large;
        const gv = graphView(g);
        return (
          <TankGraph key={g.name} testId={`tk-graph-${g.name}`} geo={large ? GEO_LARGE : GEO_SMALL}
            x={large ? 328 : g.x} y={large ? 24 : g.y} hidden={hidden}
            range={gv.range} lines={gv.lines} selection={gv.selection} grid={gridOn} showNumbers
            title={g.title} xLabel={g.xl} yLabel={g.yl}
            onContainerClick={() => setTab(i)}
            onContainerDoubleClick={() => onContainerDouble(g.name)}
            onPointerDown={(b, px, py) => { setTab(i); onGraphDown(g.name)(b, px, py); }}
            onPointerMove={onGraphMove(g.name)} onPointerUp={onGraphUp(g.name)}
            onContextMenu={openContext(g.name)}
            editLabel={editing && edit.graph === g.name ? (
              <div style={{ position: 'absolute', left: 16, top: 8, color: '#ff0000', fontWeight: 700,
                fontSize: `${8.25 * PT}px` }} data-testid={`tk-edit-${g.name}`}>EDIT</div>
            ) : null} />
        );
      })}

      {ctx && (
        <>
          <div style={{ left: 0, top: 0, width: 1151, height: 833, zIndex: 19 }}
            onMouseDown={() => { setCtx(null); setSubOpen(false); }}
            onContextMenu={(e) => { e.preventDefault(); setCtx(null); setSubOpen(false); }} />
          <div className="vb-ctxmenu" role="menu" data-testid="tk-ctxmenu" style={{ left: ctx.x, top: ctx.y }}>
            <div role="menuitem" aria-disabled={editing} className={`vb-ctxmenu-item${editing ? ' disabled' : ''}`}
              data-testid="tk-menu-edit"
              onMouseEnter={() => { if (!editing) setSubOpen(true); }}
              onClick={() => { if (!editing) { gEdit.current.dataset = ''; setSubOpen(true); } }}>
              Edit ▸
              {subOpen && !editing && (
                <div className="vb-ctxmenu" role="menu">
                  <div role="menuitem" className="vb-ctxmenu-item" data-testid="tk-menu-dataset"
                    onClick={(e) => e.stopPropagation()}>Dataset</div>
                  {menuMri.map((m) => (
                    <div key={m.resId} role="menuitem" className="vb-ctxmenu-item" data-testid={`tk-menu-mri-${m.resId}`}
                      onClick={(e) => { e.stopPropagation(); onMenuMri(m); }}>{m.text}</div>
                  ))}
                </div>
              )}
            </div>
            <div role="menuitem" aria-disabled={!editing} className={`vb-ctxmenu-item${editing ? '' : ' disabled'}`}
              data-testid="tk-menu-cancel"
              onClick={() => { if (editing) { setCtx(null); cancelEdit(); } }}>Cancel edit</div>
          </div>
        </>
      )}

      {busy && <div className="vb-busy" style={{ whiteSpace: 'pre', left: 'auto' }} data-testid="tk-busy">{busy}</div>}

      {modal?.kind === 'detail' && (
        <VbModal onClose={() => setModal(null)} testId="tk-detail-modal">
          <TankDetailForm database={database} resIds={modal.resIds} selectAll={modal.selectAll} onClose={() => setModal(null)} />
        </VbModal>
      )}
      {modal?.kind === 'voltage' && (
        <VbModal onClose={() => setModal(null)} testId="tk-voltage-modal">
          <TankVoltageSForm database={database} probeId={probeId} pulseType={modal.pulseType} onClose={() => setModal(null)} />
        </VbModal>
      )}
    </VbForm>
  );
}
