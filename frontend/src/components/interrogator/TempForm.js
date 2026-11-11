'use client';

// 레거시 intTemp(frmTemp.vb) "Temperature"(1468x809) 이식 — Interrogator 메인의 "Temp Data Analysis".

import { useEffect, useRef, useState } from 'react';
import { VbButton, VbCheck, VbForm, VbGrid, VbLabel, VbList, VbModal, VbText, asGrid } from '../vb/Vb';
import { apiJson } from '../../lib/apiJson';
import TempChart, { ChgBox, ITEM_COLORS, PopupMenu, useEditPoint } from './tempChart';
import Temp10Form from './Temp10Form';
import WobblerForm from './WobblerForm';
import { showAlert, showAlerts, showConfirm, showError } from '../../lib/dialog';

const API = '/api/interrogator/temp';
const EMPTY = { columns: [], rows: [] };
const ROW_H = 14.5;
const VISIBLE = 6;
const LEGEND_Y = [159, 173, 188, 202, 216, 231];
const BOX = { Spectrum: [450, 23], HPSF: [883, 23], Voltage: [450, 395], TrSpectrum: [883, 395] };
const MS_GRAPH = { 1: 'Spectrum', 4: 'Voltage', 3: 'HPSF', 14: 'TrSpectrum' };
const EDITABLE = new Set(['Voltage']);

function alertAll(msgs) {
  return showAlerts(msgs);
}

function parse(item) {
  return item.split('\t').map((s) => s.trim());
}

function menuText(item) {
  const p = parse(item);
  return `TempId:  ${p[1]},   mSetNum:  ${p[2]},   PulseT:  ${p[4]},   Fm/Volt:  ${p[5]},   AzAperS:  ${p[6]},   ElevIndex:  ${p[3]}`;
}

// DrawError(HPSF/TrSpectrum): 저장된 MyError 를 x>0 인 점(첫 점 포함)만 그리고 범위엔 (0,0) 이 포함된다.
function errorChart(err, title) {
  const pts = err.x.map((x, i) => [x, err.y[i]]).filter((p, i) => i === 0 || p[0] > 0)
    .filter((p) => p[1] !== null && p[1] !== undefined);
  const xs = [...pts.map((p) => p[0]), 0];
  const ys = [...pts.map((p) => p[1]), 0];
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  yMin = yMin < 0 ? yMin * 1.2 : yMin * 0.8;
  yMax = yMax < 0 ? yMax * 0.8 : yMax * 1.2;
  return { title, xLabel: 'Freq (MHz)', yLabel: 'Error (dB)', xMin: Math.min(...xs), xMax: Math.max(...xs), yMin, yMax,
    showLine: true, lines: [{ points: pts, color: 'blue' }] };
}

export default function TempForm({ database, probeId, onClose }) {
  const [swVersions, setSwVersions] = useState([]);
  const [swSel, setSwSel] = useState([]);
  const [cwVoltSep, setCwVoltSep] = useState(false);
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState([]);
  const [colors, setColors] = useState({});
  const [top, setTop] = useState(0);
  const [gridData, setGridData] = useState(EMPTY);
  const [material, setMaterial] = useState('A');
  const [tolerance, setTolerance] = useState('2');
  const [en, setEn] = useState({ plot: false, aper: true, tr: true, voltErr: false, hpsfErr: false, specErr: false });
  const [charts, setCharts] = useState({});
  const [errors, setErrors] = useState({});
  const [isTwoD, setIsTwoD] = useState(false);
  const [gridOn, setGridOn] = useState(true);
  const [edit, setEdit] = useState(null);
  const [menu, setMenu] = useState(null);
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState(false);
  const ep = useEditPoint();
  const gen = useRef(0);
  const busyRef = useRef(false);

  const post = (path, body) => apiJson(`${API}${path}`, { method: 'POST', body: { database, probeId, ...body } });

  const run = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const my = gen.current;
    try {
      await fn(() => my === gen.current);
    } catch (e) {
      showError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const call = (path, body, fn) => run(async (alive) => {
    const data = await post(path, body);
    if (alive()) await fn(data);
  });

  const resetItems = (list) => {
    setItems(list || []);
    setChecked(new Array((list || []).length).fill(false));
    setColors({});
    setTop(0);
    setEn((e) => ({ ...e, plot: false }));
  };

  // intTemp_Load → intTemp_GotFocus(pre_RTP_temp)
  useEffect(() => {
    gen.current += 1;
    const my = gen.current;
    (async () => {
      try {
        const d = await post('/load', {});
        if (my !== gen.current) return;
        setSwVersions(d.swVersions || []);
        setGridData(asGrid(d.grid));
        if (!await showConfirm('pre_RTP_temp 프로시저를 실행해 trtp_temp 를 다시 만듭니다. 계속할까요?')) return;
        if (my !== gen.current) return;
        const f = await post('/focus', { confirm: true });
        if (my === gen.current) resetItems(f.items);
      } catch (e) {
        if (my === gen.current) showError(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, probeId]);

  const checkedItems = () => items.filter((_, i) => checked[i]);
  const itemColor = (it) => colors[items.indexOf(it)];

  const onSwChange = (e) => {
    const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
    if (sel.length > 3) {
      showAlert("Please limit your selection of 'measImgSwVersion' values to a maximum of three (3).");
      return;
    }
    setSwSel(sel);
  };

  const onGetRecords = async () => {
    if (!await showConfirm('pre_RTP_temp 프로시저를 실행합니다. 계속할까요?')) return;
    gen.current += 1;
    call('/records', { swVersions: swSel, confirm: true }, (d) => {
      resetItems(d.items);
      setGridData(asGrid(d.grid));
      setEn((e) => ({ ...e, voltErr: true }));
    });
  };

  const onCheck = (i, v) => {
    ep.off();
    const next = checked.map((c, j) => (j === i ? v : c));
    setChecked(next);
    if (v) {
      const used = new Set(Object.entries(colors).filter(([k]) => next[k]).map(([, c]) => c));
      setColors({ ...colors, [i]: ITEM_COLORS.find((c) => !used.has(c)) || ITEM_COLORS[i % ITEM_COLORS.length] });
    }
    setEn((e) => ({ ...e, plot: next.some(Boolean) }));
  };

  const onMark = async (k) => {
    const idx = top + k;
    if (idx >= items.length) return;
    if (!await showConfirm('trtp_temp 의 mark 값을 변경합니다. 계속할까요?')) return;
    call('/mark', { item: items[idx], confirm: true }, (d) => {
      setItems((list) => list.map((it, j) => (j === idx ? d.item : it)));
      setGridData(asGrid(d.grid));
    });
  };

  const onMarkAll = async () => {
    if (!await showConfirm("trtp_temp 전체의 mark 를 'checked' 로 변경합니다. 계속할까요?")) return;
    call('/mark-all', { confirm: true }, (d) => {
      setItems((list) => list.map((it) => { const p = it.split('\t'); p[7] = 'checked'; return p.join('\t'); }));
      setGridData(asGrid(d.grid));
    });
  };

  const drawGraph = async (graph, list) => {
    const d = await post('/plot', { graph, items: list, material, isTwoD });
    alertAll(d.messages);
    if (d.exit) return;
    const lines = (d.lines || []).map((ln) => (ln.item !== undefined ? { ...ln, color: itemColor(list[ln.item]) } : ln));
    setCharts((c) => ({ ...c, [graph]: { ...d, lines } }));
    if (d.error) {
      setErrors((e) => ({ ...e, [graph]: d.error }));
      setEn((e) => ({ ...e, ...(graph === 'HPSF' ? { hpsfErr: true } : { specErr: true }) }));
    }
  };

  const onPlot = () => {
    const list = checkedItems();
    const flags = new Set(list.map((it) => MS_GRAPH[Number(parse(it)[2])]).filter(Boolean));
    if ((flags.has('HPSF') || flags.has('TrSpectrum')) && list.length > 1) {
      showAlert('Please select one for plot!');
      return;
    }
    run(async (alive) => {
      for (const g of ['Voltage', 'Spectrum', 'HPSF', 'TrSpectrum']) {
        if (!flags.has(g) || !alive()) continue;
        if (g === 'Voltage' && edit?.graph === 'Voltage') stopEdit();
        // eslint-disable-next-line no-await-in-loop
        await drawGraph(g, list);
      }
    });
  };

  const onAperRun = async () => {
    if (!await showConfirm('Aperture 계수를 fitting 해 temp_coeff 에 저장합니다. 계속할까요?')) return;
    call('/aper-run', { material, confirm: true }, (d) => {
      alertAll(d.messages);
      if (d.isTwoD !== null && d.isTwoD !== undefined) setIsTwoD(d.isTwoD);
      if (d.plotEnabled !== null) setEn((e) => ({ ...e, plot: d.plotEnabled, aper: d.aperRunEnabled }));
    });
  };

  const onTrSpec = async () => {
    if (!await showConfirm('TR Spectrum 을 계산해 dbo.trSpectrum 에 저장합니다. 계속할까요?')) return;
    call('/tr-spec', { confirm: true }, async (d) => {
      alertAll(d.messages);
      await drawGraph('TrSpectrum', checkedItems());
    });
  };

  const onVoltErr = () => call('/nonlinear-error', {}, (d) => {
    alertAll(d.messages);
    if (!d.exit) setCharts((c) => ({ ...c, Voltage: { ...d, xLabel: 'Freq (MHz)', yLabel: 'Error (dB)' } }));
  });

  const onGridDbl = async (r, c) => {
    if (!String(gridData.columns[c] || '').includes('isDataUsable')) return;
    if (!await showConfirm('isDataUsable 값을 변경합니다(trtp_temp, ws_temperature). 계속할까요?')) return;
    call('/usable', { tempId: gridData.rows[r][0], value: String(gridData.rows[r][c] ?? ''), confirm: true }, (d) => {
      setGridData((g) => ({ ...g, rows: g.rows.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? d.value : v)) : row)) }));
    });
  };

  // ── 그래프 편집(mnuEditGraph / EditGraph / SaveEdit) ──
  function stopEdit() {
    setEdit(null);
    ep.reset();
  }

  const startEdit = (graph, dataset) => {
    call('/edit-data', { graph, dataset, material }, (d) => {
      if (d.skip) return;
      ep.reset();
      ep.set({ graphName: d.graphName, measFreq: d.fmVolt });
      setEdit({ graph, dataset, points: d.points, range: d.xMin !== undefined ? d : charts[graph] });
      if (d.grid) setGridData(asGrid(d.grid));
    });
  };

  const save = async (i, x, y) => {
    if (!await showConfirm('trtp_temp 데이터를 수정합니다. 계속할까요?')) return;
    const p = edit.points[i];
    const { graph } = edit;
    call('/save-edit', { graph, dataset: edit.dataset, material, tempId: p[0], oldX: p[1], x, y, confirm: true },
      async (d) => {
        if (d.grid) setGridData(asGrid(d.grid));
        if (d.aperRunEnabled) setEn((e) => ({ ...e, aper: true }));
        if (ep.s.multi) {
          setEdit((e) => (e ? { ...e, points: e.points.map((q, j) => (j === i ? [q[0], x, y] : q)) } : e));
          ep.off();
        } else {
          stopEdit();
          await drawGraph(graph, checkedItems());
        }
      });
  };

  const onDragEnd = async (i, x, y) => {
    if (await showConfirm('The dataset has been modified. Do you want to save your changes?')) {
      save(i, ep.s.allowX ? x : edit.points[i][1], y);
    } else {
      ep.off();
      setEdit((e) => (e ? { ...e } : e));
    }
  };

  const onApply = () => save(ep.s.selected, Number(ep.s.newX), Number(ep.s.newY));

  const onCancelEdit = () => {
    ep.off();
    setEdit((e) => (e ? { ...e } : e));
  };

  const onContext = (graph) => (e) => {
    if (!EDITABLE.has(graph)) return;
    if (!edit && !checked.some(Boolean)) return;
    const list = edit ? [] : checkedItems().map((it) => ({ key: menuText(it), label: `Edit ▸ ${menuText(it)}` }));
    setMenu({ x: e.clientX, y: e.clientY, graph,
      items: [...list, { key: '__cancel', label: 'Cancel Edit', disabled: !edit }] });
  };

  const onMenuPick = (k) => {
    if (k === '__cancel') {
      const g = edit?.graph;
      stopEdit();
      if (g) run(() => drawGraph(g, checkedItems()));
      return;
    }
    startEdit(menu.graph, k);
  };

  const s = ep.s;
  const dis = !s.manual;

  const chart = (graph) => {
    const [x, y] = BOX[graph];
    const editing = edit?.graph === graph;
    return (
      <div key={graph} style={{ position: 'absolute', left: x, top: y, width: 427, height: 366,
        background: 'var(--vb-window)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <TempChart x={0} y={0} w={427} h={366} data={charts[graph]} editLabel={editing}
          grid={graph === 'Voltage' || graph === 'Spectrum' ? gridOn : true}
          onContextMenu={onContext(graph)} testId={`temp-chart-${graph}`}
          edit={editing ? {
            points: edit.points, range: edit.range, selected: s.selected,
            onSelect: (i) => ep.select(i, edit.points[i][1], edit.points[i][2]),
            onDrag: (_, nx, ny) => ep.drag(nx, ny),
            onDragEnd,
          } : null} />
      </div>
    );
  };

  return (
    <VbForm title="Temperature" width={1468} height={809} onClose={onClose} testId="temp-form">
      <div className="vb-menubar" style={{ position: 'absolute', left: 0, top: 0, width: 1468, height: 24, font: '9pt Arial' }}>
        <button type="button" className="vb-menu-item" onClick={() => setGridOn((g) => !g)}
          data-testid="temp-grid-onoff">{gridOn ? 'Grid Off' : 'Grid On'}</button>
      </div>

      <VbLabel x={3} y={24} w={293} h={14}>Do you need to convert some 10 min measured temp data ?</VbLabel>
      <VbButton x={384} y={19} w={48} h={24} onClick={() => setSub('t10')} testId="temp-convert10">Yes</VbButton>
      <VbLabel x={4} y={52} w={215} h={14}>Want to processing wobbling coefficents? </VbLabel>
      <VbButton x={385} y={47} w={48} h={24} onClick={() => setSub('wob')} testId="temp-gowobb">Yes</VbButton>

      <VbLabel x={11} y={88} w={86} h={14}>TempSwVersion</VbLabel>
      <select multiple className="vb-list" aria-label="TempSwVersion" value={swSel} onChange={onSwChange}
        style={{ position: 'absolute', left: 128, top: 71, width: 206, height: 54, font: '8pt Arial' }}
        data-testid="temp-sw">
        {swVersions.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <VbLabel x={21} y={113} w={100} h={22}>(Selection&lt;=3)</VbLabel>
      <VbCheck x={340} y={77} w={83} h={17} checked={cwVoltSep} onChange={setCwVoltSep}>Cw Volt Sep</VbCheck>
      <VbButton x={347} y={104} w={85} h={25} onClick={onGetRecords} disabled={busy} testId="temp-get">Get Records</VbButton>

      <VbLabel x={41} y={135} w={39} h={20}>tempId</VbLabel>
      <VbLabel x={92} y={135} w={53} h={16}>mSetNum</VbLabel>
      <VbLabel x={141} y={135} w={54} h={16}>elevIndex</VbLabel>
      <VbLabel x={201} y={135} w={55} h={16}>PMpulseT</VbLabel>
      <VbLabel x={262} y={135} w={50} h={16}>Fm/Volt</VbLabel>
      <VbLabel x={318} y={135} w={59} h={16}>azAperS</VbLabel>
      <VbLabel x={383} y={135} w={33} h={16}>mark</VbLabel>
      <VbLabel x={419} y={135} w={33} h={16}>Chg</VbLabel>

      <div className="vb-list" style={{ position: 'absolute', left: 26, top: 153, width: 390, height: 92, overflowY: 'auto',
        font: '8pt Arial' }} onScroll={(e) => setTop(Math.floor(e.currentTarget.scrollTop / ROW_H))} data-testid="temp-lstfreq">
        {items.map((it, i) => {
          const p = it.split('\t');
          return (
            // eslint-disable-next-line react/no-array-index-key
            <label key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', height: ROW_H,
              whiteSpace: 'nowrap' }}>
              <input type="checkbox" style={{ margin: '0 2px' }} checked={!!checked[i]}
                onChange={(e) => onCheck(i, e.target.checked)} />
              {[1, 2, 3, 4, 5, 6, 7].map((k, ci) => (
                <span key={k} style={{ position: 'absolute', left: [15, 66, 115, 175, 236, 292, 357][ci] }}>{p[k]}</span>
              ))}
            </label>
          );
        })}
      </div>
      {LEGEND_Y.map((ly, k) => {
        const idx = top + k;
        return (
          <span key={`lg${ly}`} style={{ position: 'absolute', left: 15, top: ly + 1, width: 9, height: 9,
            background: checked[idx] ? colors[idx] : 'transparent', border: checked[idx] ? '1px solid var(--vb-border)' : 'none' }} />
        );
      })}
      {LEGEND_Y.map((ly, k) => (
        <input key={`mk${ly}`} type="checkbox" aria-label={`chkMark ${k}`} checked={false} onChange={() => onMark(k)}
          disabled={busy} style={{ position: 'absolute', left: 423, top: ly, width: 13, height: 12, margin: 0 }}
          data-testid={`temp-mark-${k}`} />
      ))}

      <VbLabel x={10} y={246} w={415} h={13}>Please do not select different measSetNum items at the same time.</VbLabel>
      <VbLabel x={10} y={258} w={427} h={16}>If measSetNum=1, all freq with the same PulseType are displayed</VbLabel>
      <VbLabel x={10} y={271} w={383} h={16}>If measSetNum=4, all voltage data with the same settings are displayed</VbLabel>
      <VbLabel x={10} y={284} w={312} h={16}>If measSetNum=3 or 14, all data joined fitting are displayed</VbLabel>
      <VbLabel x={328} y={295} w={65} h={14}>tolerance %</VbLabel>
      <VbText x={406} y={290} w={26} h={19} value={tolerance} onChange={setTolerance} />

      <VbButton x={44} y={312} w={105} h={38} onClick={onAperRun} disabled={!en.aper || busy} testId="temp-aperrun">Apert Coeff Generation</VbButton>
      <VbButton x={164} y={312} w={105} h={38} onClick={onTrSpec} disabled={!en.tr || busy} testId="temp-trspec">TR Spectrum Generation</VbButton>
      <VbButton x={284} y={312} w={105} h={38} onClick={() => setCharts((c) => ({ ...c }))} testId="temp-refresh">Refresh</VbButton>
      <VbButton x={44} y={356} w={105} h={23} onClick={onPlot} disabled={!en.plot || busy} testId="temp-plot">Plot</VbButton>
      <VbButton x={164} y={356} w={105} h={23} onClick={onMarkAll} disabled={busy} testId="temp-markall">Mark All</VbButton>
      <VbButton x={284} y={356} w={104} h={23} onClick={onClose} testId="temp-done">Done</VbButton>

      <fieldset className="vb-group" style={{ position: 'absolute', left: 45, top: 384, width: 361, height: 187, margin: 0 }}>
        <legend>Edit Point</legend>
        <VbCheck x={56} y={19} w={17} h={16} checked={s.multi} onChange={(v) => ep.set({ multi: v })} testId="temp-multiedit" />
        <VbLabel x={80} y={19} w={121} h={16}>Multi-point Edit</VbLabel>
        <VbLabel x={10} y={37} w={37} h={14}>Graph</VbLabel>
        <VbLabel x={10} y={52} w={89} h={16} style={{ border: '1px solid var(--vb-border)', borderRadius: 'var(--radius-sm)', padding: '0 4px' }}>{s.graphName}</VbLabel>
        <VbLabel x={117} y={37} w={97} h={14}>measTxFrequency</VbLabel>
        <VbText x={117} y={52} w={83} h={20} value={s.measFreq} readOnly />
        <VbLabel x={275} y={37} w={49} h={12}>Material</VbLabel>
        <VbList x={277} y={52} w={47} h={30} items={['Air', 'TMM']} value={material === 'A' ? 'Air' : 'TMM'}
          onChange={(v) => { setMaterial(String(v).charAt(0)); setEn((e) => ({ ...e, aper: true })); }}
          testId="temp-material" />
        <VbLabel x={10} y={71} w={59} h={14}>Selected X</VbLabel>
        <VbText x={10} y={86} w={89} h={20} value={s.selX} readOnly />
        <VbLabel x={117} y={71} w={60} h={14}>Selected Y</VbLabel>
        <VbText x={117} y={86} w={84} h={20} value={s.selY} readOnly />
        <VbLabel x={24} y={107} w={39} h={14}>% Chg</VbLabel>
        <ChgBox x={59} y={107} value={s.chgX} disabled={dis || !s.allowX} onChange={(v) => ep.set({ chgX: v })}
          onCommit={(d) => ep.pct('X', d)} />
        <VbLabel x={131} y={107} w={39} h={14}>% Chg</VbLabel>
        <ChgBox x={166} y={107} value={s.chgY} disabled={dis} onChange={(v) => ep.set({ chgY: v })}
          onCommit={(d) => ep.pct('Y', d)} />
        <VbLabel x={10} y={120} w={40} h={14}>New X</VbLabel>
        <VbText x={10} y={136} w={89} h={20} value={s.newX} readOnly={dis || !s.allowX} onChange={(v) => ep.set({ newX: v })} />
        <VbLabel x={117} y={120} w={41} h={14}>New Y</VbLabel>
        <VbText x={117} y={136} w={83} h={20} value={s.newY} readOnly={dis} onChange={(v) => ep.set({ newY: v })} />
        <VbButton x={250} y={99} w={97} h={23} disabled={dis || !(s.newX.trim() || s.newY.trim()) || busy}
          onClick={onApply} testId="temp-apply">Apply</VbButton>
        <VbButton x={250} y={131} w={97} h={23} disabled={dis} onClick={onCancelEdit} testId="temp-cancel">Cancel</VbButton>
        <VbCheck x={18} y={160} w={81} h={16} checked={s.allowX} onChange={(v) => ep.set({ allowX: v })}>Allow New X</VbCheck>
      </fieldset>

      <VbLabel x={-1} y={583} w={460} h={12} font="7pt Arial">
        Select Edit item in pic, then double click cell in &quot;isDataUsable&quot; column to change
      </VbLabel>
      <div style={{ position: 'absolute', left: 16, top: 601, width: 416, height: 188 }}>
        <div className="vb-tab-strip" style={{ font: '8pt var(--font-sans)', padding: '2px 8px', border: '1px solid var(--border)', borderBottom: 'none',
          display: 'inline-block', background: 'var(--vb-window)' }}>trtp_temp</div>
        <VbGrid x={3} y={22} w={402} h={158} columns={gridData.columns} rows={gridData.rows} showNewRow={false}
          onCellDoubleClick={onGridDbl} testId="temp-grid" />
      </div>

      {['Spectrum', 'HPSF', 'Voltage', 'TrSpectrum'].map(chart)}

      <VbLabel x={1316} y={32} w={150} h={270} font="7pt Arial" wrap style={{ whiteSpace: 'pre', overflow: 'hidden' }}>
        {errors.HPSF?.label || ''}
      </VbLabel>
      <VbButton x={1319} y={305} w={106} h={39} disabled={!en.hpsfErr} testId="temp-hpsferr"
        onClick={() => errors.HPSF && setCharts((c) => ({ ...c, HPSF: errorChart(errors.HPSF, 'HPSF Error in Db') }))}>
        Plot Hpsf Error
      </VbButton>
      <VbLabel x={1316} y={395} w={150} h={278} font="7pt Arial" wrap style={{ whiteSpace: 'pre', overflow: 'hidden' }}>
        {errors.TrSpectrum?.label || ''}
      </VbLabel>
      <VbButton x={1319} y={676} w={106} h={39} disabled={!en.specErr} testId="temp-specerr"
        onClick={() => errors.TrSpectrum && setCharts((c) => ({ ...c,
          TrSpectrum: errorChart(errors.TrSpectrum, 'Spectrum Error in Db') }))}>
        Plot Spec Error
      </VbButton>
      <VbButton x={450} y={766} w={158} h={32} disabled={!en.voltErr || busy} onClick={onVoltErr}
        testId="temp-volterr">Plot nonLinear Error</VbButton>

      <PopupMenu menu={menu} onClose={() => setMenu(null)} onPick={onMenuPick} />
      {sub === 't10' && (
        <VbModal onClose={() => setSub(null)} testId="temp10-modal">
          <Temp10Form database={database} probeId={probeId} onClose={() => setSub(null)} />
        </VbModal>
      )}
      {sub === 'wob' && (
        <VbModal onClose={() => setSub(null)} testId="wobbler-modal">
          <WobblerForm database={database} probeId={probeId} onClose={() => setSub(null)} />
        </VbModal>
      )}
    </VbForm>
  );
}
