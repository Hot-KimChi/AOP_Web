'use client';

// 레거시 msiReader(measSetInput.vb, "measSetInput", 1379x956) 이식 — "MSI Input From Excel".
// 좌표·문구·버튼 순서는 measSetInput.designer.vb 기준. 단, 사용자 요청으로 파일 선택 영역은 왼쪽 열로,
// Exel Input·Selected RTP 표는 그 오른쪽 위로 옮겨 표 높이를 키웠다. DB 저장/계산은 /api/msi-excel/* 가 맡는다.

import { useRef, useState } from 'react';
import { API_BASE_URL } from '../../lib/apiBase';
import { apiJson } from '../../lib/apiJson';
import {
  VbButton, VbCheck, VbCombo, VbForm, VbGrid, VbLabel, VbList, VbModal, VbSection, VbText, asGrid, cellText,
} from '../vb/Vb';

const F9 = { size: 9 };
const F9B = { size: 9, bold: true };
const F825B = { size: 8.25, bold: true };
// 원본 6.75pt 는 웹에서 너무 작아 가독성을 위해 7.5pt 로 키운다(같은 좌표 안에 들어감).
const F675 = { size: 7.5 };
const DARK = 'var(--vb-disabled)';
const MAROON = 'var(--vb-maroon)';
const RED = 'var(--vb-red)';
const CYAN = 'var(--vb-cyan)';
const SALMON = 'var(--vb-salmon)';
const LIGHTGRAY = 'var(--vb-lightgray)';

// ---------------------------------------------------------------- VB 변환 (excel_vb.py 와 동일)

function fmtG(x, digits) {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
  if (x === 0) return '0';
  const [mant, ex] = x.toExponential(digits - 1).split('e');
  const exp = parseInt(ex, 10);
  if (exp < -4 || exp >= digits) {
    const m = mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '') : mant;
    return `${m}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  const s = x.toFixed(Math.max(0, digits - 1 - exp));
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

export function cstr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : fmtG(v, 15);
  return String(v);
}

function stdFormat(s) {
  if (s.startsWith('0.')) return s.slice(1);
  if (s.startsWith('-0.')) return `-${s.slice(2)}`;
  return s;
}

// Str(Double)
export function vbStr(x) {
  const s = stdFormat(cstr(x));
  return s.startsWith('-') ? s : ` ${s}`;
}

// Str(Single)
export function vbStrSingle(x) {
  const s = stdFormat(fmtG(Math.fround(x), 7));
  return s.startsWith('-') ? s : ` ${s}`;
}

export function vbVal(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const s = cstr(v).replace(/[ \t\r\n]/g, '');
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?/.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[0].replace(/[dD]/, 'e'));
  return Number.isFinite(n) ? n : 0;
}

function cdbl(v, what) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? -1 : 0;
  const s = cstr(v).trim();
  const n = s === '' ? NaN : Number(s);
  if (Number.isNaN(n) && s.toLowerCase() !== 'nan') {
    throw new Error(`Conversion from string "${s}" to type 'Double' is not valid.${what ? ` (${what})` : ''}`);
  }
  return n;
}

const splitNonEmpty = (s) => cstr(s).split(' ').filter((x) => x !== '');
const has = (h, key) => cstr(h).indexOf(key) >= 0;

// AperSize(1566~1618). footAper 는 계산에 쓰이지 않으므로 생략.
export function aperSize(orgFocS, orgAperS, requiredFoc, breakPoint) {
  const orgFoc = splitNonEmpty(orgFocS);
  const orgAper = splitNonEmpty(orgAperS);
  if (orgFoc.length !== orgAper.length) {
    return { ok: false, message: 'The lengths of foci and aperture are not same, or aperture string is too long! Please fix it!' };
  }
  const params = splitNonEmpty(requiredFoc);
  const bp = Math.fround(breakPoint);
  let updateFoc = '';
  let term = '';
  let elev = '';
  const ub = orgFoc.length - 1;
  for (let i = 0; i < params.length; i += 1) {
    if (term !== '') { updateFoc += ' '; term += ' '; elev += ' '; }
    const focVal = vbVal(params[i]);
    let j = 0;
    while (j < ub && vbVal(orgFoc[j]) < focVal) j += 1;
    if (ub < 0) continue;
    if (focVal >= vbVal(orgFoc[0]) && focVal <= cdbl(orgFoc[ub], 'azFocusMm')) {
      let aper;
      if (j === 0 && focVal === vbVal(orgFoc[0])) {
        aper = cdbl(orgAper[0], 'azAperSizeMm');
      } else {
        const f0 = vbVal(orgFoc[j - 1]);
        const f1 = vbVal(orgFoc[j]);
        const a0 = vbVal(orgAper[j - 1]);
        const a1 = vbVal(orgAper[j]);
        aper = ((focVal - f0) / (f1 - f0)) * (a1 - a0) + a0;
      }
      updateFoc += vbStr(focVal);
      term += vbStrSingle(aper);
      elev += vbVal(params[i]) >= bp ? '1' : '0';
    }
  }
  return { ok: true, updateFoc, updateTerm: term, elevIndex: elev };
}

// ---------------------------------------------------------------- 하위 폼(measSetting / tempSetting)

function NewRowsForm({ title, data, onClose }) {
  const g = asGrid(data);
  return (
    <VbForm title={title} width={1100} height={520} readable onClose={onClose} testId="msi-excel-newrows">
      <VbLabel x={12} y={10} font={F9}>{`${g.rows.length} rows${data?.truncated ? ' (truncated)' : ''}`}</VbLabel>
      <VbGrid x={12} y={34} w={1076} h={420} columns={g.columns} rows={g.rows} showNewRow={false} testId="msi-excel-newrows-grid" />
      <VbButton x={972} y={464} w={116} h={44} font={F9B} onClick={onClose}>Close</VbButton>
    </VbForm>
  );
}

// ---------------------------------------------------------------- 본 폼

const TEMP_OPTS = ['0', '1', '3', '4', '14'];

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function alertAll(messages) {
  (messages || []).forEach((m) => window.alert(m));
}

export default function MsiExcelForm({ database, onClose }) {
  const filesRef = useRef(new Map());
  const pickerRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const [txtDirectory, setTxtDirectory] = useState('R:\\Compass\\ExcelFile');
  const [fileItems, setFileItems] = useState([]);
  const [selFile, setSelFile] = useState('');
  const [outputName, setOutputName] = useState('');

  const [out, setOut] = useState({ columns: [], rows: [] });
  const [selCols, setSelCols] = useState([]);
  const [selRows, setSelRows] = useState([]); // [{ v: [...], s: [salmon col...] }]
  const [selectedInit, setSelectedInit] = useState(false);
  const [selectedProbeId, setSelectedProbeId] = useState(null);

  const [purpose, setPurpose] = useState('RTP');
  const [txtMaxVoltage, setTxtMaxVoltage] = useState('1');
  const [txtProfVoltage, setTxtProfVoltage] = useState('0.48329');
  // Total TxGain points·Meas TxGain Num 입력은 사용하지 않아 삭제(#41) — 백엔드 저장값은 원본 기본값 유지.
  const txtVpoints = '20';
  const txtVoltNum = '12';
  const [measFocusList, setMeasFocusList] = useState('');
  const [measIndex, setMeasIndex] = useState('');
  const [txtSpeedSound, setTxtSpeedSound] = useState('1540');
  const [numCycList, setNumCycList] = useState('');
  const [isCreateNew, setIsCreateNew] = useState(false);
  const [msi, setMsi] = useState('0');
  const [msiEnd, setMsiEnd] = useState('');
  const [isElevReq, setIsElevReq] = useState(false);
  const [elevTouched, setElevTouched] = useState(false);
  const [pulseVoltage, setPulseVoltage] = useState('0.392157');
  const [pulseWidthUsec, setPulseWidthUsec] = useState('');
  const [txtSetRange, setTxtSetRange] = useState('3711:3713');
  const [tempLimit, setTempLimit] = useState('20');

  const [cmbTempOpt, setCmbTempOpt] = useState('');
  const [cwUseCode, setCwUseCode] = useState('0');
  const [lblOpt1, setLblOpt1] = useState('Temp Option Descriptin');
  const [lblSelectLabel, setLblSelectLabel] = useState('Selected Foci:');
  const [lblSelectLabel2, setLblSelectLabel2] = useState('Selected Foci:');
  const [txtSelectValue, setTxtSelectValue] = useState('');
  const [txtSelectValue2, setTxtSelectValue2] = useState('');
  const [vis, setVis] = useState({ sel: true, sel2: true, cw: false, notes: true });
  const [lblNotes, setLblNotes] = useState('');

  const [modal, setModal] = useState(null);

  const needDb = () => {
    if (!database) { window.alert('데이터베이스를 선택하십시오.'); return false; }
    return true;
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // ---- txtDirectory_MouseDoubleClick: 브라우저 폴더 선택으로 lstFiles 채움(기존 항목 뒤에 추가)
  const onPickFolder = (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    const top = list.filter((f) => (f.webkitRelativePath || f.name).split('/').length <= 2);
    const folder = (list[0].webkitRelativePath || '').split('/')[0];
    top.forEach((f) => filesRef.current.set(f.name, f));
    setFileItems((prev) => [...prev, ...top.map((f) => f.name)]);
    if (folder) setTxtDirectory(folder);
  };

  // ---- cmdOpen_Click
  const cmdOpen = () => run(async () => {
    if (!needDb()) return;
    const file = filesRef.current.get(selFile);
    if (!file) throw new Error('Could not find file. (lstFiles 에서 파일을 선택하십시오)');
    const fd = new FormData();
    fd.append('database', database);
    fd.append('file', file, file.name);
    const res = await fetch(`${API_BASE_URL}/api/msi-excel/parse`, { method: 'POST', credentials: 'include', body: fd });
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    if (!res.ok || payload?.status === 'error') throw new Error(payload?.message || `요청 실패 (HTTP ${res.status})`);
    setOutputName(`${txtDirectory}\\${selFile}`);
    setOut({ columns: payload.data.columns, rows: payload.data.rows });
    setSelRows([]);
    setSelCols([]);
    setSelectedInit(false);
  });

  // ---- dgvOutput_RowHeaderMouseDoubleClick
  const addRow = (ri) => {
    let cols = selCols;
    if (selRows.length === 0 && !selectedInit) {
      cols = [...out.columns];
      setSelCols(cols);
      setSelectedInit(true);
    }
    const src = out.rows[ri] || [];
    setSelRows((prev) => [...prev, { v: cols.map((_, i) => (i < src.length ? src[i] : null)), s: [] }]);
    setSelectedProbeId(src[1] ?? null);
  };

  // ---- cmdSelectAll_Click
  const cmdSelectAll = () => {
    let cols = selCols;
    if (!selectedInit) {
      cols = [...out.columns];
      setSelCols(cols);
      setSelectedInit(true);
    }
    const rows = [];
    let probe = selectedProbeId;
    out.rows.forEach((r) => {
      if (r[1] !== null && r[1] !== undefined) {
        rows.push({ v: cols.map((_, i) => (i < r.length ? r[i] : null)), s: [] });
        probe = r[1];
      }
    });
    setSelRows(rows);
    setSelectedProbeId(probe);
  };

  // ---- cmdUpdateAll_Click
  const cmdUpdateAll = () => {
    if (measFocusList === '') return;
    let bpCol = selCols.findIndex((h) => has(h, 'breakPoint'));
    if (bpCol < 0) bpCol = 0;
    const col = selCols.findIndex((h) => has(h, 'azFocusMm'));
    if (col < 0 || col + 2 >= selCols.length) { window.alert('azFocusMm 열이 없습니다.'); return; }
    const msgs = [];
    try {
      const next = selRows.map((row, ri) => {
        if (row.v[1] === null || row.v[1] === undefined) return row;
        let bp = 1000;
        const bv = row.v[bpCol];
        if (bv !== null && bv !== undefined && has(selCols[bpCol], 'breakPoint') && cstr(bv).trim() !== '') bp = cdbl(bv, 'breakPoint');
        const r = aperSize(row.v[col], row.v[col + 1], measFocusList, bp);
        if (!r.ok) {
          msgs.push(r.message, `update error in row: ${vbStr(ri)} -- string too long or focus and aperSize not match.`);
          return row;
        }
        const v = [...row.v];
        v[col] = r.updateFoc;
        v[col + 1] = r.updateTerm;
        v[col + 2] = r.elevIndex;
        return { v, s: row.s.includes(col + 1) ? row.s : [...row.s, col + 1] };
      });
      setSelRows(next);
    } catch (e) {
      msgs.push(e.message);
    }
    alertAll(msgs);
  };

  // ---- dgvSelected_CellDoubleClick
  const onSelCellDoubleClick = (ri, col) => {
    const row = selRows[ri];
    if (!row) return;
    try {
      const v = [...row.v];
      const s = [...row.s];
      if (has(selCols[col], 'azFocusMm') && measFocusList !== '' && measIndex === '') {
        if (col + 2 >= selCols.length || (isElevReq && col + 8 >= selCols.length)) throw new Error('azFocusMm 뒤 열이 부족합니다.');
        let bp = 10000;
        for (let j = 0; j < selCols.length; j += 1) {
          if (has(selCols[j], 'breakPoint') && v[j] !== null && v[j] !== undefined && cstr(v[j]).trim() !== '') {
            bp = cdbl(v[j], 'breakPoint');
            break;
          }
        }
        const orgFoc = v[col];
        const r = aperSize(orgFoc, v[col + 1], measFocusList, bp);
        if (!r.ok) {
          alertAll([r.message, 'update error in the row: -- string too long or focus and aperSize not match.']);
          return;
        }
        v[col] = measFocusList;
        v[col + 1] = r.updateTerm;
        v[col + 2] = r.elevIndex;
        if (!s.includes(col + 1)) s.push(col + 1);
        let msg = null;
        if (isElevReq) {
          const r1 = aperSize(orgFoc, v[col + 8], measFocusList, 100000);
          if (!r1.ok) {
            msg = [r1.message, 'update error in the row: -- string too long or focus and elevSize not match.'];
          } else {
            v[col + 8] = r1.updateTerm;
            if (!s.includes(col + 8)) s.push(col + 8);
          }
        }
        setSelRows((prev) => prev.map((x, i) => (i === ri ? { v, s } : x)));
        if (msg) alertAll(msg);
        return;
      }
      // 보정: 원본은 Selected Indices 가 비어 있으면 셀을 빈 문자열로 지웠다 → 비어 있으면 아무것도 하지 않음.
      if (col >= 11 && v[col] !== null && v[col] !== undefined && measIndex !== '') {
        const params = splitNonEmpty(v[col]);
        const idx = measIndex.split(' ');
        if (params.length - 1 >= idx.length - 1) {
          let term = '';
          idx.forEach((t) => {
            if (t === '') return;
            const k = Math.floor(cdbl(t, 'Selected Indices'));
            if (k < 0 || k >= params.length) throw new Error('Index was outside the bounds of the array.');
            if (term !== '') term += ' ';
            term += params[k];
          });
          v[col] = term;
          setSelRows((prev) => prev.map((x, i) => (i === ri ? { v, s } : x)));
        }
      }
    } catch (e) {
      window.alert(e.message);
    }
  };

  const onSelCellChange = (ri, ci, value) => {
    setSelRows((prev) => prev.map((x, i) => {
      if (i !== ri) return x;
      const v = [...x.v];
      v[ci] = value;
      return { ...x, v };
    }));
  };

  const onOutCellChange = (ri, ci, value) => {
    setOut((prev) => ({ ...prev, rows: prev.rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? value : c)) : r)) }));
  };

  // DataGridView 기본값(AllowUserToAddRows/DeleteRows=True): '*' 행 입력으로 추가, Delete 키로 삭제
  const onOutRowAdd = (ci, value) => {
    setOut((prev) => ({ ...prev, rows: [...prev.rows, prev.columns.map((_, j) => (j === ci ? value : null))] }));
  };
  const onOutRowDelete = (ri) => {
    setOut((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== ri) }));
  };
  const onSelRowAdd = (ci, value) => {
    setSelRows((prev) => [...prev, { v: selCols.map((_, j) => (j === ci ? value : null)), s: [] }]);
  };
  const onSelRowDelete = (ri) => setSelRows((prev) => prev.filter((_, i) => i !== ri));

  // ---- cmbTempOpt_SelectedIndexChanged (목록 항목을 고를 때만 동작 — 직접 입력은 이벤트 없음)
  const onTempOpt = (value) => {
    setCmbTempOpt(value);
    if (!TEMP_OPTS.includes(value)) return;
    const n = { ...vis, notes: false };
    switch (value) {
      case '0':
        setLblOpt1('0 -- Create Temp initial test Set For Each combination On voltage, PulseWidthUs, aperture vs Freq .');
        n.sel = true; setTxtSelectValue(''); setLblSelectLabel('FmMHz: ');
        n.sel2 = true; setTxtSelectValue2(''); setLblSelectLabel2('azAperElem:');
        break;
      case '1':
        setLblOpt1('1 -- Create Temp set for each combination on Freq, PulseWidthUs, aperture and measvoltage.');
        setLblSelectLabel('Multi-PulseWidthUs:'); n.sel = true;
        n.notes = true; setLblNotes('(not include the measured one)');
        n.sel2 = false; n.cw = true;
        break;
      case '4':
        setLblOpt1('4 -- Create Temp set for selected combination on PulseWidthUs, aperture vs. Freq, measVoltage.');
        n.sel = true; setTxtSelectValue(''); setLblSelectLabel('FmMHz:');
        n.sel2 = true; setTxtSelectValue2(''); setLblSelectLabel2('azAperElem:');
        n.cw = true;
        break;
      case '3':
        setLblOpt1('3 -- Create Temp set for selected combination on Freq, PulseWidthUs, and prof.Voltage vs. aperture elements.');
        n.sel = true; setTxtSelectValue(''); setLblSelectLabel('azAperElem:');
        n.sel2 = true; setLblSelectLabel2('FmMHz:'); setTxtSelectValue2('');
        n.cw = false;
        break;
      default: // '14'
        setLblOpt1('14 -- Create Temp set for selected combination on measVoltage, PulseWidthUs, aperture vs. Freq.');
        n.sel = true; setTxtSelectValue(''); setLblSelectLabel('Fm: Start/end/step');
        n.sel2 = true; setLblSelectLabel2('azAperElem:'); setTxtSelectValue2('');
        n.cw = false;
        break;
    }
    setVis(n);
  };

  const body = () => ({
    database,
    columns: selCols,
    rows: selRows.map((r) => r.v),
    selectedProbeId,
    isCreateNew,
    isElevReq,
    maxVoltage: txtMaxVoltage,
    profVoltage: txtProfVoltage,
    vPoints: txtVpoints,
    voltNum: txtVoltNum,
    speedSound: txtSpeedSound,
    numCycList,
    pulseVoltage,
    pulseWidthUsec,
    selectValue: txtSelectValue,
    selectValue2: txtSelectValue2,
    cwUseCode,
    tempOpt: cmbTempOpt,
    selectLabel: vis.sel ? lblSelectLabel : '',
    msi,
    msiEnd,
    purpose,
    outputName,
  });

  const save = (path, title, confirmText) => run(async () => {
    if (!needDb()) return;
    if (selRows.length > 0 && !window.confirm(confirmText)) return;
    const data = await apiJson(`/api/msi-excel/${path}`, { method: 'POST', body: body() });
    if (data?.setRange !== undefined) setTxtSetRange(data.setRange);
    if (data?.newRows) setModal({ title, data: data.newRows });
    alertAll(data?.messages);
  });

  const cmdSaveDb = () => save('save-tank', 'meas_setting', `meas_setting 에 Tank RTP 조건을 저장합니다(comments=${purpose || 'RTP'}). 계속할까요?`);
  const cmdSavePower = () => save('save-power', 'meas_setting', "meas_setting 에 Power 조건을 저장합니다(comments='Power'). 계속할까요?");
  const cmdSaveTemp = () => save('save-temp', 'temp_setting', `temp_setting 에 Temp 조건(옵션 ${cmbTempOpt})을 저장합니다. 계속할까요?`);

  // ---- cmdSaveMat_Click
  const cmdSaveMat = () => run(async () => {
    if (selRows.length === 0) { window.alert('Nothing in Selected RTP table. No new Excel file.'); return; }
    const parts = outputName.split('.');
    if (parts.length < 2) throw new Error('Index was outside the bounds of the array. (먼저 Open Excel File 로 파일을 여십시오)');
    let base = parts[0];
    if (base !== '' && base.slice(-4) !== '-Sel') base += '-Sel';
    const newName = `${base}.${parts[1]}`;
    const fileBase = base.split(/[\\/]/).pop() || 'Selected-Sel';
    const res = await fetch(`${API_BASE_URL}/api/msi-excel/export-xlsx`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: selCols, rows: selRows.map((r) => r.v), fileName: `${fileBase}.xlsx` }),
    });
    if (!res.ok) {
      let msg = `요청 실패 (HTTP ${res.status})`;
      try { msg = (await res.json())?.message || msg; } catch { /* 본문 없음 */ }
      throw new Error(msg);
    }
    download(await res.blob(), `${fileBase}.xlsx`);
    setOutputName(newName);
  });

  // ---- FillPwrSetId_Click
  const cmdFillPwr = () => run(async () => {
    if (txtSetRange === '') { window.alert('Please fill in SetId Range! ex: 3711:3720'); return; }
    if (!needDb()) return;
    const data = await apiJson('/api/msi-excel/power-setids', { method: 'POST', body: { database, setRange: txtSetRange } });
    download(new Blob([data.content], { type: 'text/plain' }), data.fileName);
  });

  // ---- cmdUpdatePrf_Click
  const cmdUpdatePrf = () => run(async () => {
    if (!needDb()) return;
    if (!window.confirm(`update_Prf_From_Init(ProbeId=${cellText(selectedProbeId)}, TempLimit=${tempLimit}) 을 실행합니다. 계속할까요?`)) return;
    const data = await apiJson('/api/msi-excel/update-prf', {
      method: 'POST', body: { database, selectedProbeId, tempLimit },
    });
    alertAll(data?.messages);
  });

  const selHeaderColor = (name) => {
    if (selRows.length === 0 && !selectedInit) return undefined;
    if (has(name, 'azFocusMm') || has(name, 'azAperSizeMm') || has(name, 'elevIndex')) return CYAN;
    if (has(name, 'elAperSizeMm')) {
      if (isElevReq) return CYAN;
      if (elevTouched) return LIGHTGRAY;
    }
    return undefined;
  };

  return (
    <VbForm title="measSetInput" width={1379} height={956} fill fitPage readable onClose={onClose} testId="msi-excel-form">
      {/* 웹 레이아웃: 파일 선택을 왼쪽 열로 옮기고 Exel Input·Selected RTP 표를 위로 올려 표 높이를 키운다(동작은 원본과 동일). */}
      <VbSection x={6} y={6} w={246} h={680} />
      <VbSection x={258} y={6} w={1116} h={320} />
      <VbSection x={258} y={332} w={1116} h={354} />
      <VbSection x={6} y={692} w={894} h={140} />
      <VbSection x={906} y={692} w={467} h={140} tone="action" />
      <VbSection x={6} y={838} w={1241} h={112} />
      <input
        ref={pickerRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        hidden
        onChange={onPickFolder}
        data-testid="msi-excel-picker"
      />
      <VbLabel x={20} y={18} font={F9B}>Excel File Directory:</VbLabel>
      <VbText
        x={20} y={40} w={218} h={26} font={F9} value={txtDirectory} onChange={setTxtDirectory}
        onDoubleClick={() => pickerRef.current?.click()} title="더블클릭: 폴더 선택" testId="msi-excel-dir"
      />
      <VbLabel x={20} y={72} color={MAROON}>(mouseDoubleClick for listing files)</VbLabel>
      <VbList
        x={20} y={94} w={218} h={516} items={fileItems} value={selFile} onChange={setSelFile} testId="msi-excel-files"
      />
      <VbButton x={20} y={620} w={218} h={54} onClick={cmdOpen} busy={busy} variant="primary" testId="msi-excel-open">Open  Excel File</VbButton>

      <VbLabel x={274} y={16} font={F9B}>Exel Input </VbLabel>
      <VbLabel x={370} y={18} color={DARK}>(Double click row-head to add the row to Selected RTP)</VbLabel>
      <VbGrid
        x={274} y={40} w={1084} h={278} columns={out.columns} rows={out.rows} editable onCellChange={onOutCellChange}
        onRowAdd={onOutRowAdd} onRowDelete={onOutRowDelete}
        onRowHeaderDoubleClick={addRow} emptyText="Open Excel File 로 엑셀 파일을 불러오세요." testId="msi-excel-output"
      />

      <VbLabel x={916} y={338} font={F9}>Purpose:</VbLabel>
      <VbCombo x={916} y={358} w={140} h={24} value={purpose} onChange={setPurpose} editable options={['RTP', 'Sample', 'SSR', 'FDA', 'IEC']} testId="msi-excel-purpose" ariaLabel="Purpose" />
      <VbButton x={1070} y={342} w={125} h={41} onClick={cmdSelectAll} disabled={busy} testId="msi-excel-selectall">Select All RTP</VbButton>
      <VbButton x={1205} y={342} w={153} h={41} onClick={cmdUpdateAll} disabled={busy} testId="msi-excel-updateall">Update All Foc/Aper</VbButton>
      <VbLabel x={384} y={340} color={DARK}>(Double click row-head to remove the row from Selected RTP)</VbLabel>
      <VbLabel x={274} y={346} font={F9B}>Selected RTP</VbLabel>
      <VbLabel x={384} y={356} color={DARK}>(Modify cyan fields with double-click cell, selected either foci values or indices will fill in)</VbLabel>
      <VbLabel x={384} y={372} color={DARK}>(Salmon color field data are estimated from fnumber and focus, please check it.)</VbLabel>
      <VbGrid
        x={274} y={394} w={1084} h={284} columns={selCols} rows={selRows.map((r) => r.v)} editable
        onCellChange={onSelCellChange} onCellDoubleClick={onSelCellDoubleClick}
        onRowAdd={onSelRowAdd} onRowDelete={onSelRowDelete}
        onRowHeaderDoubleClick={(ri) => setSelRows((prev) => prev.filter((_, i) => i !== ri))}
        headerColor={selHeaderColor} cellColor={(r, c) => (selRows[r]?.s.includes(c) ? SALMON : undefined)}
        emptyText="위 Exel Input 의 행 머리글을 더블클릭하거나 Select All RTP 로 추가하세요."
      />

      {/* #42: 하단은 6px 그리드에 맞추고 라벨 열(x20)·입력 열(x168)을 통일. 저장은 대상별 한 줄, 왼쪽→오른쪽 = 준비→실행. */}
      {/* ① Tank/Power 파라미터 카드 */}
      <VbLabel x={20} y={706} font={F9}>Max Sys TxGain:</VbLabel>
      <VbText x={168} y={702} w={72} h={24} font={F9} value={txtMaxVoltage} onChange={setTxtMaxVoltage} ariaLabel="Max Sys TxGain" />
      <VbLabel x={258} y={706} font={F9}>Profile TxGain:</VbLabel>
      <VbText x={366} y={702} w={72} h={24} font={F9} value={txtProfVoltage} onChange={setTxtProfVoltage} ariaLabel="Profile TxGain" />
      <VbLabel x={456} y={706} font={F9}>Speed of Sound (m/s)</VbLabel>
      <VbText x={606} y={702} w={72} h={24} font={F9} value={txtSpeedSound} onChange={setTxtSpeedSound} ariaLabel="Speed of Sound" />
      <VbCheck
        x={700} y={704} w={150} h={21} checked={isElevReq} testId="msi-excel-elevreq"
        onChange={(c) => { setIsElevReq(c); setElevTouched(true); }}
      >
        Elev data req?
      </VbCheck>

      <VbLabel x={20} y={738} font={F9}>Selected Foci:</VbLabel>
      <VbText
        x={168} y={735} w={432} h={24} value={measFocusList} ariaLabel="Selected Foci" testId="msi-excel-foci"
        onChange={(t) => { setMeasFocusList(t); if (t !== '') setMeasIndex(''); }}
      />
      <VbLabel x={620} y={733} font={F675} color={RED}>If there is a similar record except pulseWidth,</VbLabel>
      <VbLabel x={620} y={748} font={F675} color={RED}>create a new or overwrite PulseString on exist one? </VbLabel>

      <VbLabel x={20} y={771} font={F9}>Selected Indices:</VbLabel>
      <VbText
        x={168} y={768} w={432} h={24} value={measIndex} ariaLabel="Selected Indices" testId="msi-excel-indices"
        onChange={(t) => { setMeasIndex(t); if (t !== '') setMeasFocusList(''); }}
      />
      <VbCheck x={620} y={770} w={186} h={21} checked={isCreateNew} onChange={setIsCreateNew} testId="msi-excel-createnew">Create New from MSI =  </VbCheck>
      <VbText x={812} y={768} w={76} h={24} font={F9} value={msi} onChange={setMsi} ariaLabel="MSI" testId="msi-excel-msi" />

      <VbLabel x={20} y={804} font={F9}>NumCycles for Chirp:</VbLabel>
      <VbText x={168} y={801} w={432} h={24} font={F9} value={numCycList} onChange={setNumCycList} ariaLabel="NumCycles for Chirp" />
      <VbLabel x={740} y={804} font={F9}>to MSI =</VbLabel>
      <VbText x={812} y={801} w={76} h={24} font={F9} value={msiEnd} onChange={setMsiEnd} ariaLabel="MSI End" testId="msi-excel-msiend" />

      {/* ② 저장 동작 카드 — Tank / Power / Excel 대상별 한 줄 */}
      <VbButton x={918} y={702} w={218} h={36} font={F825B} onClick={cmdSaveDb} busy={busy} variant="primary" testId="msi-excel-savedb">Save Tank RTP to DB</VbButton>
      <VbLabel x={1148} y={699} font={F675}>SetId Range:</VbLabel>
      <VbText x={1148} y={714} w={213} h={24} value={txtSetRange} onChange={setTxtSetRange} ariaLabel="SetId Range" testId="msi-excel-setrange" />
      {/* 원본의 BeamWidth Simulation(MATLAB simMeasSettings) 버튼은 사용하지 않아 사용자 요청으로 삭제. */}
      <VbButton x={918} y={746} w={218} h={36} font={F825B} onClick={cmdFillPwr} busy={busy} testId="msi-excel-fillpwr">Get matched Power MeasSetId</VbButton>
      <VbButton x={1146} y={746} w={215} h={36} font={F825B} onClick={cmdSavePower} busy={busy} variant="primary" testId="msi-excel-savepower">Save Power to DB</VbButton>
      <VbButton x={918} y={790} w={218} h={36} font={F825B} onClick={cmdSaveMat} busy={busy} testId="msi-excel-savemat">Save to Excel</VbButton>
      <VbLabel x={1148} y={789} font={F675}>File is in </VbLabel>
      <VbLabel x={1148} y={802} font={F675}>R:\Compass\Intensity\</VbLabel>
      <VbLabel x={1148} y={815} font={F675}>MeasInput_date.txt</VbLabel>

      {/* ③ Temperature 카드 — 입력(왼쪽) → TempLimit → 실행 버튼(오른쪽) 순서 */}
      <VbLabel x={20} y={846} font={F9B}>Temperature</VbLabel>
      <VbLabel x={120} y={848} font={{ size: 7.2 }} color={MAROON} testId="msi-excel-opt1">{lblOpt1}</VbLabel>
      <VbLabel x={20} y={874} font={F9}>Temp Options:</VbLabel>
      <VbCombo x={130} y={870} w={64} h={24} value={cmbTempOpt} onChange={onTempOpt} editable options={TEMP_OPTS} testId="msi-excel-tempopt" ariaLabel="Temp Options" />
      <VbLabel x={210} y={874} font={F9}>measTxGain:</VbLabel>
      <VbText x={350} y={870} w={300} h={24} font={F9} value={pulseVoltage} onChange={setPulseVoltage} ariaLabel="measTxGain" />
      <VbLabel x={670} y={874} font={F9}>PulseWidthUsec:</VbLabel>
      <VbText x={800} y={870} w={76} h={24} font={F9} value={pulseWidthUsec} onChange={setPulseWidthUsec} ariaLabel="PulseWidthUsec" />

      <VbLabel x={20} y={907} font={F9} hidden={!vis.cw}>PwCwUseCode:</VbLabel>
      <VbCombo x={130} y={903} w={64} h={24} value={cwUseCode} onChange={setCwUseCode} editable options={['0', '1', '2']} hidden={!vis.cw} ariaLabel="PwCwUseCode" testId="msi-excel-cwcode" />
      <VbLabel x={210} y={907} font={F9} hidden={!vis.sel} testId="msi-excel-sellabel">{lblSelectLabel}</VbLabel>
      <VbText x={350} y={903} w={300} h={24} value={txtSelectValue} onChange={setTxtSelectValue} hidden={!vis.sel} ariaLabel="Select value" testId="msi-excel-selvalue" />
      <VbLabel x={670} y={907} font={F9} hidden={!vis.sel2} testId="msi-excel-sellabel2">{lblSelectLabel2}</VbLabel>
      <VbText x={800} y={903} w={76} h={24} value={txtSelectValue2} onChange={setTxtSelectValue2} hidden={!vis.sel2} ariaLabel="Select value 2" testId="msi-excel-selvalue2" />
      <VbLabel x={350} y={932} font={F675} color={RED} hidden={!vis.notes}>{lblNotes}</VbLabel>

      <VbLabel x={904} y={866} font={F9}>TempLimit:</VbLabel>
      <VbText x={904} y={888} w={76} h={24} font={F9} value={tempLimit} onChange={setTempLimit} ariaLabel="TempLimit" />
      <VbButton x={996} y={862} w={118} h={58} font={F9B} onClick={cmdSaveTemp} busy={busy} variant="primary" testId="msi-excel-savetemp">Save Temp to DB</VbButton>
      <VbButton x={1120} y={862} w={118} h={58} font={F9B} onClick={cmdUpdatePrf} busy={busy} testId="msi-excel-updateprf">Update Prf from Init</VbButton>

      <VbButton x={1259} y={862} w={114} h={58} font={F9B} onClick={() => onClose?.()} variant="subtle" testId="msi-excel-exit">Exit</VbButton>

      {modal && (
        <VbModal onClose={() => setModal(null)} testId="msi-excel-modal">
          <NewRowsForm title={modal.title} data={modal.data} onClose={() => setModal(null)} />
        </VbModal>
      )}
    </VbForm>
  );
}
