'use client';

// 레거시 frmWobbler "Wobbler"(1153x798) 이식 — frmTemp 의 GoWobbCmd 로 열린다.

import { useRef, useState } from 'react';
import { VbButton, VbCheck, VbForm, VbGrid, VbLabel, VbText, asGrid } from '../vb/Vb';
import { apiJson } from '../../lib/apiJson';
import TempChart, { ChgBox, ITEM_COLORS, PopupMenu, useEditPoint } from './tempChart';

const API = '/api/interrogator/temp/wob';
const A9 = '9pt Arial';
const F975 = '9.75pt Arial';
const EMPTY = { columns: [], rows: [] };

function alertAll(msgs) {
  (msgs || []).forEach((m) => window.alert(m));
}

function parseItem(item) {
  const p = item.split('\t');
  return { area: Number(String(p[1]).replace(/,/g, '')), angle: Number(String(p[2]).replace(/,/g, '')) };
}

function menuText(item) {
  const p = item.split('\t');
  return `EffectiveArea:  ${p[1]},   WobblingAngle:  ${p[2]}`;
}

export default function WobblerForm({ database, probeId, onClose }) {
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState([]);
  const [colors, setColors] = useState({});
  const [gridData, setGridData] = useState(EMPTY);
  const [runEn, setRunEn] = useState(false);
  const [plotEn, setPlotEn] = useState(false);
  const [gridOn, setGridOn] = useState(true);
  const [chart, setChart] = useState(null);
  const [coeffs, setCoeffs] = useState(null);
  const [edit, setEdit] = useState(null);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const ep = useEditPoint();
  const busyRef = useRef(false);
  const gen = useRef(0);

  const call = async (path, body, fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const my = gen.current;
    try {
      const data = await apiJson(`${API}${path}`, { method: 'POST', body: { database, probeId, ...body } });
      if (my === gen.current) await fn(data);
    } catch (e) {
      window.alert(e.message || String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const checkedItems = () => items.filter((_, i) => checked[i]);

  const onGetRecords = () => {
    if (!window.confirm('pre_RTP_wobbler 프로시저를 실행합니다. 계속할까요?')) return;
    gen.current += 1;
    call('/records', { confirm: true }, (d) => {
      setItems(d.items || []);
      setChecked(new Array((d.items || []).length).fill(false));
      setColors({});
      setGridData(asGrid(d.grid));
      setRunEn(true);
    });
  };

  const onRun = () => {
    if (!window.confirm('wobbling 계수를 fitting 해 temp_wobbler_coeff 에 저장합니다. 계속할까요?')) return;
    call('/run', { confirm: true }, (d) => {
      alertAll(d.messages);
      if (d.coefficients) setCoeffs(d.coefficients);
      if (d.finish) {
        setPlotEn(true);
        setRunEn(false);
      }
    });
  };

  const draw = () => call('/plot', { items: checkedItems(), coefficients: coeffs }, (d) => {
    alertAll(d.messages);
    if (d.coefficients) setCoeffs(d.coefficients);
    if (d.exit) return;
    const idx = items.map((_, i) => i).filter((i) => checked[i]);
    setChart({ ...d, lines: d.lines.map((ln) => ({ ...ln, color: colors[idx[ln.item]] })) });
  });

  const onCheck = (i, v) => {
    const next = checked.map((c, j) => (j === i ? v : c));
    setChecked(next);
    if (v) {
      const used = new Set(Object.values(colors));
      setColors({ ...colors, [i]: ITEM_COLORS.find((c) => !used.has(c)) || ITEM_COLORS[i % ITEM_COLORS.length] });
    }
    setPlotEn(next.some(Boolean));
    ep.off();
  };

  const startEdit = (item) => {
    const { area, angle } = parseItem(item);
    call('/edit-data', { effectiveArea: area, wobbAngleDeg: angle }, (d) => {
      ep.reset();
      ep.set({ graphName: 'Wobbler', measFreq: '' });
      setEdit({ item, points: d.points, range: d.xMin !== undefined ? d : chart });
    });
  };

  const stopEdit = () => {
    setEdit(null);
    ep.reset();
  };

  const save = (i, x, y) => {
    if (!window.confirm('trtp_wobbler 데이터를 수정합니다. 계속할까요?')) return;
    call('/save-edit', { tempWobbId: edit.points[i][0], x, y, confirm: true }, (d) => {
      setGridData(asGrid(d.grid));
      setEdit((e) => (e ? { ...e, points: e.points.map((p, j) => (j === i ? [p[0], x, y] : p)) } : e));
      if (!ep.s.multi) stopEdit();
    });
  };

  const onDragEnd = (i, x, y) => {
    if (window.confirm('The dataset has been modified. Do you want to save your changes?')) {
      save(i, ep.s.allowX ? x : edit.points[i][1], y);
    } else {
      ep.off();
    }
  };

  const onApply = () => save(ep.s.selected, Number(ep.s.newX), Number(ep.s.newY));

  const onContext = (e) => {
    if (!edit && !checked.some(Boolean)) return;
    const list = edit ? [] : checkedItems().map((it) => ({ key: it, label: menuText(it) }));
    setMenu({ x: e.clientX, y: e.clientY, items: [...list, { key: '__cancel', label: 'Cancel Edit', disabled: !edit }] });
  };

  const s = ep.s;
  const dis = !s.manual;

  return (
    <VbForm title="Wobbler" width={1153} height={798} onClose={onClose} testId="wobbler-form">
      <div className="vb-menubar" style={{ position: 'absolute', left: 0, top: 0, width: 1153, height: 24, font: '9pt Arial' }}>
        <button type="button" className="vb-menu-item" onClick={() => setGridOn((g) => !g)}
          data-testid="wob-grid">{gridOn ? 'Grid Off' : 'Grid On'}</button>
      </div>
      <VbButton x={164} y={33} w={85} h={54} font={A9} onClick={onGetRecords} disabled={busy}
        testId="wob-get">Get Records</VbButton>
      <VbButton x={274} y={34} w={108} h={53} font={A9} onClick={onRun} disabled={!runEn || busy}
        testId="wob-run">Generate wobbling coefficients</VbButton>
      <VbLabel x={8} y={50} w={54} h={17}>ProbeId:</VbLabel>
      <VbLabel x={62} y={50} w={79} h={23} style={{ border: '1px solid #000' }}>{probeId}</VbLabel>
      <VbLabel x={21} y={110} w={34} h={14}>Legd</VbLabel>
      <VbLabel x={58} y={111} w={110} h={14}>effectiveArea</VbLabel>
      <VbLabel x={183} y={110} w={100} h={14}>wobblingAngle</VbLabel>
      <div className="vb-list" style={{ position: 'absolute', left: 41, top: 131, width: 337, height: 122, overflowY: 'auto' }}
        data-testid="wob-list">
        {items.map((it, i) => {
          const p = it.split('\t');
          return (
            <label key={it} style={{ display: 'flex', alignItems: 'center', height: 15, font: '8pt Arial' }}>
              <input type="checkbox" checked={!!checked[i]} onChange={(e) => onCheck(i, e.target.checked)} />
              <span style={{ width: 10, height: 10, margin: '0 4px', background: checked[i] ? colors[i] : 'transparent' }} />
              <span style={{ width: 125 }}>{p[1]}</span>
              <span>{p[2]}</span>
            </label>
          );
        })}
      </div>
      <VbButton x={56} y={285} w={81} h={25} onClick={draw} disabled={!plotEn || busy} testId="wob-plot">Plot</VbButton>
      <VbButton x={164} y={285} w={81} h={25} onClick={() => setChart((c) => (c ? { ...c } : c))}
        testId="wob-refresh">Refresh</VbButton>
      <VbButton x={274} y={285} w={81} h={25} onClick={onClose} testId="wob-close">Close</VbButton>

      <fieldset className="vb-group" style={{ position: 'absolute', left: 76, top: 366, width: 285, height: 244, font: F975, margin: 0 }}>
        <legend>Edit Point</legend>
        <VbCheck x={55} y={19} w={20} h={17} checked={s.multi} onChange={(v) => ep.set({ multi: v })} testId="wob-multi" />
        <VbLabel x={79} y={19} w={110} h={17}>Multi-point Edit</VbLabel>
        <VbLabel x={26} y={45} w={89} h={15}>Graph</VbLabel>
        <VbLabel x={26} y={61} w={89} h={17} style={{ border: '1px solid #888' }}>{s.graphName}</VbLabel>
        <VbLabel x={154} y={45} w={97} h={15}>PMpulseType</VbLabel>
        <VbText x={154} y={61} w={97} h={20} value={s.measFreq} readOnly />
        <VbLabel x={26} y={84} w={97} h={15}>Selected X</VbLabel>
        <VbText x={26} y={100} w={97} h={20} value={s.selX} readOnly />
        <VbLabel x={154} y={84} w={97} h={15}>Selected Y</VbLabel>
        <VbText x={154} y={100} w={97} h={20} value={s.selY} readOnly />
        <VbLabel x={39} y={124} w={35} h={15}>%Chg</VbLabel>
        <ChgBox x={74} y={124} value={s.chgX} disabled={dis || !s.allowX} onChange={(v) => ep.set({ chgX: v })}
          onCommit={(d) => ep.pct('X', d)} />
        <VbLabel x={167} y={124} w={35} h={15}>%Chg</VbLabel>
        <ChgBox x={202} y={124} value={s.chgY} disabled={dis} onChange={(v) => ep.set({ chgY: v })}
          onCommit={(d) => ep.pct('Y', d)} />
        <VbLabel x={26} y={145} w={97} h={15}>New X</VbLabel>
        <VbText x={26} y={161} w={97} h={20} value={s.newX} readOnly={dis || !s.allowX}
          onChange={(v) => ep.set({ newX: v })} />
        <VbLabel x={154} y={145} w={97} h={15}>New Y</VbLabel>
        <VbText x={154} y={161} w={97} h={20} value={s.newY} readOnly={dis} onChange={(v) => ep.set({ newY: v })} />
        <VbCheck x={34} y={188} w={120} h={17} checked={s.allowX} onChange={(v) => ep.set({ allowX: v })}>Allow New X</VbCheck>
        <VbButton x={26} y={206} w={97} h={25} disabled={dis || !(s.newX.trim() || s.newY.trim()) || busy}
          onClick={onApply} testId="wob-apply">Apply</VbButton>
        <VbButton x={154} y={206} w={97} h={25} disabled={dis} onClick={() => ep.off()} testId="wob-cancel">Cancel</VbButton>
      </fieldset>

      <div style={{ position: 'absolute', left: 45, top: 626, width: 345, height: 168 }}>
        <div className="vb-tab-strip" style={{ font: '8pt Arial', padding: '2px 6px', border: '1px solid #888',
          borderBottom: 'none', display: 'inline-block', background: 'var(--vb-window, #fff)' }}>trtp_power</div>
        <VbGrid x={3} y={24} w={330} h={136} columns={gridData.columns} rows={gridData.rows} showNewRow={false}
          testId="wob-grid-data" />
      </div>

      <div style={{ position: 'absolute', left: 410, top: 25, width: 738, height: 770, background: 'var(--vb-window, #fff)',
        border: '1px solid #888' }}>
        <TempChart x={64} y={40} w={664} h={680} data={chart} grid={gridOn} editLabel={!!edit}
          onContextMenu={onContext} testId="wob-chart"
          edit={edit ? {
            points: edit.points, range: edit.range, selected: s.selected,
            onSelect: (i) => ep.select(i, edit.points[i][1], edit.points[i][2]),
            onDrag: (_, x, y) => ep.drag(x, y),
            onDragEnd,
          } : null} />
      </div>
      <PopupMenu menu={menu} onClose={() => setMenu(null)}
        onPick={(k) => (k === '__cancel' ? stopEdit() : startEdit(k))} />
    </VbForm>
  );
}
