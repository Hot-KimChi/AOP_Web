// 레거시 IntExport(IntExport.vb, "Export") 화면 이식. 좌표·크기는 IntExport.Designer.vb 값 그대로.
// frmMain 의 intExport.Show() 는 vbproj 에 컴파일되는 IntExport 클래스를 가리킨다(frmExport.vb 는 미포함).

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { apiJson, query } from '../../lib/apiJson';
import { VbButton, VbCombo, VbForm, VbGrid, VbLabel, VbText, asGrid } from '../vb/Vb';
import { showAlert, showConfirm } from '../../lib/dialog';

const F8 = { size: 8, family: 'Arial' };
const F975 = { size: 9.75, family: 'Arial' };
const EMPTY = { columns: [], rows: [] };
const DEFAULT_PATH = 'R:\\Compass\\RTP LUT\\Temp';

const GRIDS = [
  { key: 'Limits', label: 'Limits:', lx: 50, ly: 137, cx: 377, cy: 137, tx: 450, ty: 137, gx: 40, gy: 165 },
  { key: 'RTP_LUT', label: 'RTP_LUT:', lx: 577, ly: 137, cx: 923, cy: 137, tx: 1000, ty: 134, gx: 580, gy: 165 },
  { key: 'PrbTypeList', label: 'PrbTypeList:', lx: 50, ly: 278, cx: 377, cy: 277, tx: 450, ty: 275, gx: 40, gy: 308 },
  { key: 'TempPulse_LUT', label: 'TempPulse_LUT:', lx: 576, ly: 277, cx: 923, cy: 277, tx: 995, ty: 275, gx: 580, gy: 308 },
  { key: 'TempPrb_LUT', label: 'TempPrb_LUT:', lx: 50, ly: 423, cx: 377, cy: 423, tx: 450, ty: 420, gx: 39, gy: 451 },
  { key: 'TempPrbVolt_LUT', label: 'TempPrbVolt_LUT:', lx: 577, ly: 423, cx: 923, cy: 423, tx: 1000, ty: 423, gx: 579, gy: 451 },
];

function download(fileName, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportForm({ database, probeId, rtpName, onClose }) {
  const [probes, setProbes] = useState([]);
  const [rtpNames, setRtpNames] = useState([]);
  const [prb, setPrb] = useState(probeId != null ? String(probeId) : '');
  const [rtp, setRtp] = useState(rtpName ?? '');
  // 원본 전역 SelectedProbeId / SelectedRtpName (cmdGet·cmdCopy 에서 콤보 값으로 갱신)
  const [selected, setSelected] = useState({ probeId: probeId != null ? String(probeId) : '', rtpName: rtpName ?? '' });
  const [tables, setTables] = useState({});
  const [counts, setCounts] = useState({});
  const [rtpCyan, setRtpCyan] = useState(false);
  const [pathName, setPathName] = useState(DEFAULT_PATH);
  const [convertEnabled, setConvertEnabled] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const gen = useRef(0);
  const rtpGen = useRef(0);

  const loadRtpNames = useCallback(async (p, keep) => {
    const my = ++rtpGen.current;
    if (!p) { setRtpNames([]); return; }
    try {
      const list = await apiJson(`/api/interrogator/export/rtp-names?${query({ database, probeId: p })}`);
      if (my !== rtpGen.current) return;
      setRtpNames(list || []);
      setRtp((cur) => {
        const want = keep ?? cur;
        return (list || []).includes(want) ? want : '';
      });
    } catch (e) {
      if (my === rtpGen.current) setError(e.message);
    }
  }, [database]);

  // intExport_Load
  useEffect(() => {
    const my = ++gen.current;
    (async () => {
      try {
        const list = await apiJson(`/api/interrogator/export/probes?${query({ database })}`);
        if (my !== gen.current) return;
        setProbes(list || []);
        const p = probeId != null ? String(probeId) : '';
        setPrb(p);
        await loadRtpNames(p, rtpName ?? '');
        if (my === gen.current) setConvertEnabled(true);
      } catch (e) {
        if (my === gen.current) setError(e.message);
      }
    })();
    return () => { gen.current += 1; };
  }, [database, probeId, rtpName, loadRtpNames]);

  const onProbeChange = (v) => {
    setPrb(v);
    loadRtpNames(v);
  };

  const applyTable = (key, data) => {
    setTables((t) => ({ ...t, [key]: asGrid(data) }));
    setCounts((c) => ({ ...c, [key]: data?.count ?? (data?.rows?.length || 0) }));
  };

  const onGet = async () => {
    if (busy) return;
    if (!prb) { showAlert('ProbeId 를 선택하세요.'); return; }
    const my = ++gen.current;
    setSelected({ probeId: prb, rtpName: rtp });
    setBusy('get');
    setError('');
    try {
      const data = await apiJson(`/api/interrogator/export/records?${query({ database, probeId: prb, rtpName: rtp })}`);
      if (my !== gen.current) return;
      setRtpCyan(data.rtpReport === 1);
      Object.entries(data.tables || {}).forEach(([k, v]) => applyTable(k, v));
      setConvertEnabled(true);
    } catch (e) {
      if (my === gen.current) setError(e.message);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  const onCopy = async () => {
    if (busy) return;
    if (!prb) { showAlert('ProbeId 를 선택하세요.'); return; }
    if (!await showConfirm(`rtp_M_duplicate 를 실행합니다.\nProbeId: ${prb}, RTP Name: ${rtp}\n계속하시겠습니까?`)) return;
    const my = ++gen.current;
    setSelected({ probeId: prb, rtpName: rtp });
    setBusy('copy');
    setError('');
    try {
      const data = await apiJson('/api/interrogator/export/duplicate', {
        method: 'POST', body: { database, probeId: Number(prb), rtpName: rtp, confirm: true },
      });
      if (my !== gen.current) return;
      applyTable('RTP_LUT', data);
    } catch (e) {
      if (my === gen.current) setError(e.message);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  const onConvert = async () => {
    if (busy) return;
    if (!selected.probeId) { showAlert('ProbeId 를 선택하세요.'); return; }
    const my = ++gen.current;
    setBusy('convert');
    setError('');
    try {
      const files = await apiJson('/api/interrogator/export/convert', {
        method: 'POST', body: { database, probeId: Number(selected.probeId), rtpName: selected.rtpName },
      });
      if (my !== gen.current) return;
      (files || []).forEach((f) => download(f.fileName, f.content));
    } catch (e) {
      if (my === gen.current) setError(e.message);
    } finally {
      if (my === gen.current) setBusy('');
    }
  };

  const white = 'var(--vb-window)';

  return (
    <VbForm title="Export" width={1408} height={879} onClose={onClose} testId="int-export">
      <VbLabel x={425} y={12} w={411} h={41} font={{ size: 24, bold: true, family: 'Arial' }} color="var(--vb-text)">RTP / IPOD Export</VbLabel>
      <VbLabel x={261} y={80} font={F975}>ProbeId:</VbLabel>
      <VbCombo x={337} y={81} w={185} h={24} font={F8} value={prb} onChange={onProbeChange} options={probes}
        testId="exp-probe" ariaLabel="ProbeId" />
      <VbLabel x={577} y={82} font={F975}>RTP Name:</VbLabel>
      <VbCombo x={693} y={81} w={189} h={24} font={F8} value={rtp} onChange={setRtp} options={rtpNames}
        testId="exp-rtp" ariaLabel="RTP Name" />
      <VbButton x={911} y={70} w={189} h={41} font={F975} onClick={onGet} busy={busy === 'get'} disabled={!!busy}
        testId="exp-get">Get records</VbButton>

      {GRIDS.map((g) => (
        <Fragment key={g.key}>
          <VbLabel x={g.lx} y={g.ly} font={F8}>{g.label}</VbLabel>
          <VbLabel x={g.cx} y={g.cy} font={F8}>Count#</VbLabel>
          <VbText x={g.tx} y={g.ty} w={100} h={22} font={F8} value={counts[g.key] ?? ''} onChange={() => {}}
            testId={`exp-count-${g.key}`} ariaLabel={`${g.key} Count`} />
          <VbGrid x={g.gx} y={g.gy} w={521} h={101} font={F8} showNewRow={false}
            columns={(tables[g.key] || EMPTY).columns} rows={(tables[g.key] || EMPTY).rows}
            backColor={g.key === 'RTP_LUT' ? (rtpCyan ? 'var(--vb-cyan)' : white) : undefined}
            testId={`exp-grid-${g.key}`} />
        </Fragment>
      ))}

      <VbButton x={1141} y={180} w={130} h={69} font={F8} onClick={onCopy} busy={busy === 'copy'} disabled={!!busy}
        testId="exp-copy">Duplicate all phaseInverse=1 to 0 for M mode</VbButton>

      <VbLabel x={50} y={566} font={F8}>ExportLog:</VbLabel>
      <VbGrid x={39} y={594} w={1062} h={101} font={F8} columns={[]} rows={[]} showNewRow={false} testId="exp-grid-log" />

      <VbLabel x={43} y={728} font={F975}>Export File Path:</VbLabel>
      <VbText x={247} y={727} w={537} h={22} font={F8} value={pathName} onChange={setPathName} testId="exp-path"
        title="웹에서는 같은 파일명으로 브라우저 다운로드합니다." />
      <VbLabel x={12} y={771} w={490} h={41} wrap font={{ size: 12, bold: true, family: 'Arial' }} color="var(--vb-disabled)">
        Please check all cyan cells before converting.
      </VbLabel>
      <VbButton x={552} y={764} w={204} h={41} font={F975} onClick={onConvert} busy={busy === 'convert'}
        disabled={!convertEnabled || !!busy} testId="exp-convert">Convert to csv</VbButton>
      <VbButton x={804} y={764} w={165} h={41} font={F975} onClick={onClose} testId="exp-close">Close</VbButton>

      {busy === 'convert' && <div className="vb-busy" role="status">Exporting to CSV ...</div>}
      {busy && busy !== 'convert' && <div className="vb-busy" role="status">처리 중...</div>}
      {error && <VbLabel x={1110} y={740} w={290} h={80} wrap style={{ overflow: 'auto' }}><span className="vb-msg">{error}</span></VbLabel>}
    </VbForm>
  );
}
