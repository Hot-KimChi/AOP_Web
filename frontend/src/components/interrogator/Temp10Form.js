'use client';

// 레거시 frmTemp10 "Temp 10mins converter"(1127x855) 이식.

import { useEffect, useRef, useState } from 'react';
import { VbButton, VbCombo, VbForm, VbGrid, VbLabel, VbList, asGrid } from '../vb/Vb';
import { apiJson } from '../../lib/apiJson';
import TempChart from './tempChart';
import { showAlert, showAlerts, showConfirm, showError } from '../../lib/dialog';

const API = '/api/interrogator/temp/t10';
const B9 = 'bold 9pt "Microsoft Sans Serif"';
const B825 = 'bold 8.25pt "Microsoft Sans Serif"';
const HINT = { font: '6.75pt "Microsoft Sans Serif"', color: 'var(--text-muted)' };
const CAPTION = { font: 'bold 9.75pt Arial', align: 'center', style: { border: '1px solid var(--vb-border)', borderRadius: 'var(--radius-sm)' } };
const EMPTY = { columns: [], rows: [] };

function alertAll(msgs) {
  return showAlerts(msgs);
}

export default function Temp10Form({ database, onClose }) {
  const [probes, setProbes] = useState([]);
  const [probeId, setProbeId] = useState('');
  const [material, setMaterial] = useState('');
  const [ss, setSs] = useState(EMPTY);
  const [sets, setSets] = useState(EMPTY);
  const [t10, setT10] = useState(EMPTY);
  const [t10m, setT10m] = useState(EMPTY);
  const [tempSSId, setTempSSId] = useState(null);
  const [tempSetId, setTempSetId] = useState(null);
  const [ssRow, setSsRow] = useState(-1);
  const [setRow, setSetRow] = useState(-1);
  const [selectSet, setSelectSet] = useState([]);
  const [en, setEn] = useState({ conv: false, plot: false, save: false, multi: false });
  const [chart, setChart] = useState(null);
  const [busy, setBusy] = useState(false);
  const gen = useRef(0);
  const busyRef = useRef(false);

  const call = async (path, body, fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const my = gen.current;
    try {
      const data = await apiJson(`${API}${path}`, { method: 'POST', body: { database, ...body } });
      if (my === gen.current) await fn(data);
    } catch (e) {
      showError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    gen.current += 1;
    const my = gen.current;
    apiJson(`${API}/probes`, { method: 'POST', body: { database } })
      .then((d) => { if (my === gen.current) setProbes(d.probes || []); })
      .catch((e) => showError(e));
  }, [database]);

  const ids = () => ({ probeId: Number(probeId), tempSSId, tempSetId });

  const onProbe = async (v) => {
    if (!v) { setProbeId(v); return; }
    // 취소하면 프로브 선택을 바꾸지 않는다(이전 프로브의 tempSSId·tempSetId 와 섞이지 않게).
    if (!await showConfirm('get10TempSetId 프로시저를 실행합니다. 계속할까요?')) return;
    if (busyRef.current) return;
    gen.current += 1;
    call('/probe', { probeId: Number(v), confirm: true }, (d) => {
      const s = asGrid(d.sets);
      setProbeId(v);
      setSs(asGrid(d.stations));
      setSets(s);
      setSelectSet(new Array(s.rows.length).fill(false));
      setT10(EMPTY);
      setT10m(EMPTY);
      setSsRow(-1);
      setSetRow(-1);
      setTempSSId(null);
      setTempSetId(null);
      setEn({ conv: false, plot: false, save: false, multi: false });
    });
  };

  const onSsHeader = (r) => {
    if (busyRef.current) return;
    setTempSSId(ss.rows[r]?.[0] ?? null);
    setSsRow(r);
    setEn((e) => ({ ...e, save: false }));
  };

  const onSetHeader = (r) => {
    if (busyRef.current) return;
    const ts = sets.rows[r]?.[0];
    setTempSetId(ts);
    setSetRow(r);
    call('/rows', { tempSSId, tempSetId: ts }, (d) => {
      const g = asGrid(d.grid);
      setT10(g);
      setEn((e) => ({ ...e, conv: g.rows.length > 0, plot: false, save: false }));
    });
  };

  const onSetMHeader = (r) => {
    setSelectSet((s) => s.map((v, i) => (i === r ? !v : v)));
  };

  const doPlot = () => call('/plot', ids(), (d) => {
    alertAll(d.messages);
    if (!d.exit) setChart(d);
  });

  const onConvert = async () => {
    if (material === '') {
      showAlert('Please select material Air or Tmm!');
      return;
    }
    if (!await showConfirm('10분 온도 fitting 후 temp10_fit_coeff 에 저장합니다. 계속할까요?')) return;
    call('/convert', { ...ids(), material, confirm: true }, (d) => {
      alertAll(d.messages);
      if (d.ok) setEn((e) => ({ ...e, save: true, plot: true }));
    });
  };

  const onSave = async () => {
    if (!await showConfirm('30분 온도를 dbo.temperature 에 저장합니다. 계속할까요?')) return;
    call('/save30', { ...ids(), confirm: true }, (d) => {
      alertAll(d.messages);
      setEn((e) => ({ ...e, save: false }));
    });
  };

  const selectedSetIds = (flags) => sets.rows.filter((_, i) => flags[i]).map((r) => r[0]);

  const getRecords = (flags) => call('/multi-rows', { tempSSId, tempSetIds: selectedSetIds(flags) }, (d) => {
    const g = asGrid(d.grid);
    setT10m(g);
    setEn((e) => ({ ...e, multi: g.rows.length > 0 }));
  });

  const onAllRecords = () => {
    const all = new Array(sets.rows.length).fill(true);
    setSelectSet(all);
    getRecords(all);
  };

  const onMulti = async () => {
    if (!await showConfirm('선택된 세트마다 fitting 후 30분 온도를 저장합니다. 계속할까요?')) return;
    call('/multi-convert', { probeId: Number(probeId), tempSSId, tempSetIds: selectedSetIds(selectSet),
      confirm: true }, (d) => alertAll(d.messages));
  };

  return (
    <VbForm title="Temp 10mins converter" width={1127} height={855} onClose={onClose} testId="temp10-form">
      <VbLabel x={52} y={17} w={55} h={17} font="8pt Arial">ProbeID:</VbLabel>
      <VbCombo x={124} y={12} w={121} h={22} options={probes.map(String)} value={probeId} onChange={onProbe}
        testId="t10-probe" ariaLabel="ProbeID" disabled={busy} />
      <VbLabel x={302} y={9} w={49} h={13} font="8pt Arial">Material</VbLabel>
      <VbList x={302} y={25} w={57} h={32} items={['Air', 'TMM']} font="8pt Arial"
        value={material === 'A' ? 'Air' : material === 'T' ? 'TMM' : ''}
        onChange={(v) => setMaterial(String(v).charAt(0))} testId="t10-material" />

      <VbLabel x={51} y={43} w={193} h={12} {...HINT}>(Double click row-head for selection, only one)</VbLabel>
      <VbLabel x={52} y={61} w={340} h={25} {...CAPTION}>temp_station_setup</VbLabel>
      <VbGrid x={54} y={89} w={338} h={110} columns={ss.columns} rows={ss.rows} showNewRow={false}
        onRowHeaderDoubleClick={onSsHeader} cellColor={(r) => (r === ssRow ? 'var(--vb-cyan, cyan)' : undefined)}
        testId="t10-ss" />

      <VbLabel x={3} y={210} w={201} h={16} font={'bold 9.75pt "Microsoft Sans Serif"'}>Single TempSetId Selection</VbLabel>
      <VbLabel x={53} y={234} w={193} h={12} {...HINT}>(Double click row-head for selection, only one)</VbLabel>
      <VbLabel x={55} y={252} w={338} h={25} {...CAPTION}>temp_setting</VbLabel>
      <VbGrid x={52} y={280} w={340} h={110} columns={sets.columns} rows={sets.rows} showNewRow={false}
        onRowHeaderDoubleClick={onSetHeader} cellColor={(r) => (r === setRow ? 'var(--vb-cyan, cyan)' : undefined)}
        testId="t10-set" />
      <VbLabel x={52} y={405} w={338} h={25} {...CAPTION}>temperature10mins</VbLabel>
      <VbGrid x={52} y={433} w={340} h={111} columns={t10.columns} rows={t10.rows} showNewRow={false}
        testId="t10-rows" />

      <VbButton x={32} y={563} w={88} h={45} font={B9} disabled={!en.conv || busy} onClick={onConvert}
        testId="t10-convert">Temp10 Converter</VbButton>
      <VbButton x={129} y={563} w={88} h={45} font={B9} disabled={!en.plot || busy} onClick={doPlot}
        testId="t10-plot">Plot</VbButton>
      <VbButton x={227} y={563} w={93} h={45} font={B9} disabled={!en.save || busy} onClick={onSave}
        testId="t10-save">save 30min temp to Db</VbButton>
      <VbButton x={331} y={563} w={88} h={45} font={B9} disabled onClick={() => {}}>Refresh</VbButton>

      <TempChart x={448} y={64} w={667} h={544} data={chart} testId="t10-chart" />

      <VbLabel x={12} y={629} w={211} h={16} font={'bold 9.75pt "Microsoft Sans Serif"'}>Multiple TempSetId Selection</VbLabel>
      <VbLabel x={80} y={661} w={195} h={12} {...HINT}>(Double click row-head for multiple selections )</VbLabel>
      <VbLabel x={79} y={679} w={387} h={25} {...CAPTION}>temp_setting</VbLabel>
      <VbGrid x={79} y={707} w={387} h={136} columns={sets.columns} rows={sets.rows} showNewRow={false}
        onRowHeaderDoubleClick={onSetMHeader}
        cellColor={(r) => (selectSet[r] ? 'var(--vb-cyan, cyan)' : 'var(--vb-lightgray, #d3d3d3)')}
        testId="t10-setm" />
      <VbLabel x={539} y={679} w={388} h={25} {...CAPTION}>temperature10mins</VbLabel>
      <VbGrid x={539} y={707} w={388} h={136} columns={t10m.columns} rows={t10m.rows} showNewRow={false}
        testId="t10-rowsm" />

      <VbButton x={951} y={666} w={114} h={33} font={B825} disabled={busy} onClick={() => getRecords(selectSet)}
        testId="t10-getsel">Get Sel Records</VbButton>
      <VbButton x={951} y={712} w={114} h={33} font={B825} disabled={busy} onClick={onAllRecords}
        testId="t10-getall">Get All Records</VbButton>
      <VbButton x={951} y={759} w={114} h={39} font={B825} disabled={!en.multi || busy} onClick={onMulti}
        testId="t10-multi">Multi-Set Converter</VbButton>
      <VbButton x={951} y={813} w={114} h={30} font={B9} onClick={onClose} testId="t10-exit">Exit</VbButton>
    </VbForm>
  );
}
