'use client';

// 레거시 frmDetail "Details"(1125x792) 이식: 상세 그리드 + 행 머리글 선택(최대 2) + Waveform 그래프/엑셀 저장.

import { useEffect, useRef, useState } from 'react';
import { VbButton, VbForm, VbLabel, VbText, asGrid, cellText } from '../vb/Vb';
import { apiJson } from '../../lib/apiJson';
import { API_BASE_URL } from '../../lib/apiBase';
import TankGraph, { GEO_DETAIL } from './tankChart';

const API = '/api/interrogator/tank';
const B = { size: 9, bold: true };
const S675 = { size: 6.75 };

export default function TankDetailForm({ database, resIds, selectAll, onClose }) {
  const [grid, setGrid] = useState({ columns: [], rows: [] });
  const [picked, setPicked] = useState([]);
  const [z1, setZ1] = useState('');
  const [z2, setZ2] = useState('');
  const [delay, setDelay] = useState('0');
  const [excel, setExcel] = useState('');
  const [en, setEn] = useState({ plot: false, save: false });
  const [wave, setWave] = useState(null);
  const [busy, setBusy] = useState(false);
  const gen = useRef(0);

  useEffect(() => {
    gen.current += 1;
    const my = gen.current;
    apiJson(`${API}/details`, { method: 'POST', body: { database, resIds, selectAll } })
      .then((d) => { if (my === gen.current) setGrid(asGrid(d)); })
      .catch((e) => window.alert(e.message || String(e)));
    return () => { gen.current += 1; };
  }, [database, resIds, selectAll]);

  // RowHeaderMouseClick: 앞에서부터 선택된 최대 2개가 selResId
  const selResId = picked.map((i) => grid.rows[i]?.[0]).filter((v) => v !== null && v !== undefined).slice(0, 2);
  const numOfCases = selResId.length;

  const onRowHead = (ri) => {
    if (grid.rows[ri]?.[0] === null || grid.rows[ri]?.[0] === undefined) return;
    setPicked((p) => (p.includes(ri) ? p.filter((x) => x !== ri) : [...p, ri].sort((a, b) => a - b)));
  };

  // txt1stZloc/txt2ndZloc/txtExcelFile TextChanged: 조건을 만족하면 활성화(비활성화는 하지 않음)
  const recheck = (a, b, x, zChanged) => {
    if (a === '') return;
    if (numOfCases === 1 || (b !== '' && numOfCases > 1)) {
      setEn((e) => ({ plot: zChanged ? true : e.plot, save: e.save || x !== '' }));
    }
  };

  const cases = () => {
    const out = [{ resId: Number(selResId[0]), z: z1 }];
    if (numOfCases > 1) out.push({ resId: Number(selResId[1]), z: z2 });
    return out;
  };

  const cmdPlot = async () => {
    if (z1 === '' || (z2 === '' && numOfCases > 1)) { window.alert('Please input 1st and 2nd zLocations'); return; }
    setBusy(true);
    try {
      const d = await apiJson(`${API}/waveform`, { method: 'POST', body: { database, cases: cases(), delay } });
      setWave({
        range: d.range,
        lines: d.lines.map((l, i) => ({ color: i === 0 ? 1 : 4, points: l.points || [] })),
      });
    } catch (e) {
      window.alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const cmdSave = async () => {
    if (z1 === '' || (z2 === '' && numOfCases > 1) || excel === '') {
      window.alert('Please input 1st, 2nd zLocations and excel file name. ');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}${API}/waveform-xlsx`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database, cases: cases(), delay, excelFile: excel }),
      });
      if (!res.ok) {
        let msg = `요청 실패 (HTTP ${res.status})`;
        try { msg = (await res.json()).message || msg; } catch { /* 본문 없음 */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? decodeURIComponent(m[1]) : 'waveform.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      window.alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <VbForm title="Details" width={1125} height={792} onClose={onClose} testId="int-tank-detail">
      <VbLabel x={21} y={9} font={{ size: 9.75 }}>Detailed Information:</VbLabel>
      <VbLabel x={189} y={9}>(Click the row header to select or de-select )</VbLabel>
      <div className="vb-grid" style={{ left: 53, top: 28, width: 911, height: 98 }} data-testid="td-grid">
        <table>
          <thead>
            <tr>
              <th className="vb-rowhead" />
              {grid.columns.map((c, ci) => <th key={`${c}-${ci}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, ri) => (
              <tr key={ri}>
                <th className="vb-rowhead" data-testid={`td-rowhead-${ri}`} onClick={() => onRowHead(ri)}
                  style={{ background: picked.includes(ri) ? 'var(--vb-cyan)' : 'var(--vb-lightgray)', cursor: 'pointer' }} />
                {row.map((v, ci) => <td key={ci}>{cellText(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <VbLabel x={44} y={138} font={{ size: 9 }}>Please select up to 2 waveforms for plotting or saving to Excel file</VbLabel>
      <VbLabel x={45} y={168} font={S675}>1st Z loc:</VbLabel>
      <VbText x={48} y={184} w={79} h={20} value={z1} testId="td-z1"
        onChange={(v) => { setZ1(v); recheck(v, z2, excel, true); }} />
      <VbLabel x={157} y={168} font={S675}>2nd Z loc:</VbLabel>
      <VbText x={160} y={184} w={79} h={20} value={z2} testId="td-z2"
        onChange={(v) => { setZ2(v); recheck(z1, v, excel, true); }} />
      <VbLabel x={279} y={167} font={S675}>Delay on points</VbLabel>
      <VbText x={281} y={184} w={57} h={20} value={delay} onChange={setDelay} testId="td-delay" />
      <VbButton x={380} y={168} w={133} h={43} onClick={cmdPlot} disabled={!en.plot} busy={busy} font={B} testId="td-plot">Plot Waveform</VbButton>
      <VbLabel x={566} y={167} font={S675}>Excel file location and name:</VbLabel>
      <VbText x={568} y={184} w={255} h={20} value={excel} testId="td-excel"
        onChange={(v) => { setExcel(v); recheck(z1, z2, v, false); }} />
      <VbButton x={843} y={171} w={136} h={43} onClick={cmdSave} disabled={!en.save} busy={busy} font={B} testId="td-save">Save to Excel</VbButton>
      <VbButton x={1003} y={37} w={92} h={37} onClick={onClose} font={B} testId="td-close">Close</VbButton>
      <VbButton x={1003} y={98} w={92} h={37} onClick={() => {}} font={B} testId="td-refresh">Refresh</VbButton>
      <TankGraph geo={GEO_DETAIL} x={53} y={220} range={wave?.range ?? null} lines={wave?.lines ?? []}
        grid showCircle={false} showNumbers title="Waveform" xLabel="time (us)" yLabel="signal" testId="td-graph" />
      <VbLabel x={1000} y={432} font={{ size: 9 }} color="#0000ff">1st---blue</VbLabel>
       <VbLabel x={1001} y={457} font={{ size: 9 }} color="#ff0000">2nd---red</VbLabel>
    </VbForm>
  );
}
