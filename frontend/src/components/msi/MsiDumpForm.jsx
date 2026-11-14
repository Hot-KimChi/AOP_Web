// 레거시 msiFromDump(1094x728) 화면을 원본 배치 그대로 재현한다.
// 계산·저장은 /api/msi/* (pkg_MsiInput) 가 맡는다. 원본 결함(문자열 연결 SQL, max(measSetId) 경합 등)만 교정.

import { useEffect, useState } from 'react';
import { VbButton, VbCheck, VbCombo, VbForm, VbGrid, VbLabel, VbText } from '../vb/Vb';
import { apiJson, query } from '../../lib/apiJson';
import { showAlert, showConfirm, showError } from '../../lib/dialog';

const PURPOSES = ['Auto Detect', 'RTP', 'Sample', 'SSR', 'FDA', 'IEC', 'Power'];
const TABLES = ['meas_setting', 'temp_setting'];
const DARK = 'var(--text-muted)';
const F9 = { size: 9 };
const EMPTY = { columns: [], rows: [] };

const ACTION_LABEL = {
  insert: 'new', append: 'append subVerifId', exists: 'exists', too_long: 'name too long', skip: 'skip',
};

export default function MsiDumpForm({ database, onClose }) {
  const [probeIds, setProbeIds] = useState([]);
  const [probeId, setProbeId] = useState('');
  const [verifId, setVerifId] = useState('');
  const [verif, setVerif] = useState(EMPTY);
  const [sub, setSub] = useState(EMPTY);
  const [selected, setSelected] = useState([]);
  const [selectedCols, setSelectedCols] = useState([]);
  const [created, setCreated] = useState(EMPTY);
  const [purpose, setPurpose] = useState('Auto Detect');
  const [table, setTable] = useState('meas_setting');
  const [createNew, setCreateNew] = useState(false);
  const [msi, setMsi] = useState('0');
  const [busy, setBusy] = useState('');
  const [loadedProbe, setLoadedProbe] = useState('');
  useEffect(() => {
    setProbeIds([]);
    setProbeId('');
    setSelected([]);
    setLoadedProbe('');
    if (!database) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/msi/probe-ids?${query({ database })}`, { signal: ctrl.signal })
      .then((d) => setProbeIds(d || []))
      .catch((e) => { if (e.name !== 'AbortError') showError(e); });
    return () => ctrl.abort();
  }, [database]);

  // 원본: 처음 추가할 때 imag_subverif 열을 복제해 Selected 열을 만든다(selectedInit).
  // 프로브를 바꾸면 이전 프로브의 Selected 행이 새 probeId 로 전송되지 않게 비운다.
  const changeProbe = (v) => {
    if (String(v) !== String(probeId)) { setSelected([]); setLoadedProbe(''); }
    setProbeId(v);
  };
  const ensureSelectedCols = () => {
    if (!selectedCols.length) setSelectedCols(sub.columns);
  };

  const getRecords = async () => {
    if (!database) { showAlert('Database 를 선택하세요.'); return; }
    if (!probeId) { showAlert('Probe ID 를 선택하세요.'); return; }
    setBusy('get');
    try {
      const data = await apiJson(`/api/msi/dump-records?${query({ database, probeId, verifFilter: verifId })}`);
      setVerif(data.verification || EMPTY);
      setSub(data.subVerification || EMPTY);
      // 다른 프로브를 불러오면 이전 프로브의 Selected 행은 비운다(새 probeId 로 옛 subVerifId 가 전송되지 않게).
      if (loadedProbe !== String(probeId)) setSelected([]);
      setLoadedProbe(String(probeId));
    } catch (e) {
      showError(e);
    } finally {
      setBusy('');
    }
  };

  const addRow = (i) => {
    const row = sub.rows[i];
    if (!row) return;
    ensureSelectedCols();
    setSelected((s) => [...s, row]);
  };

  const selectAll = () => {
    ensureSelectedCols();
    setSelected(sub.rows.filter((r) => r[1] !== null && r[1] !== undefined));
  };

  const createMsi = async () => {
    if (!selected.length) {
      showAlert('Nothing in Selected table. No data is saved in database.');
      return;
    }
    const cols = selectedCols.length ? selectedCols : sub.columns;
    if (!String(cols[1] || '').includes('verifId')) { showAlert('Second Element is not verifId'); return; }
    if (!String(cols[0] || '').includes('subVerifId')) { showAlert('First Element is not subVerifId'); return; }
    if (table !== 'meas_setting') {
      // 원본도 temp_setting 저장(saveDataToTemp)은 주석 처리되어 아무것도 저장하지 않는다.
      setCreated(EMPTY);
      showAlert('temp_setting 저장은 원본에서도 지원하지 않습니다. 저장된 데이터가 없습니다.');
      return;
    }
    const minMeasSetId = createNew ? Math.max(0, Math.trunc(Number(msi) || 0)) : 0;
    const body = {
      database,
      probeId: Number(probeId),
      subVerifIds: selected.map((r) => Number(r[0])).filter(Number.isInteger),
      purposeMode: purpose,
      minMeasSetId,
    };
    setBusy('create');
    try {
      const plan = await apiJson('/api/msi/preview', { method: 'POST', body });
      const s = plan.summary || {};
      const lines = Object.entries(ACTION_LABEL).map(([k, label]) => `${label}: ${s[k] || 0}`).join('\n');
      const skipped = (plan.actions || []).filter((a) => a.action === 'skip')
        .slice(0, 10).map((a) => `subVerifId ${a.subVerifId}: ${a.message}`).join('\n');
      if (!await showConfirm(`meas_setting 에 저장합니다.\n\n${lines}${skipped ? `\n\n${skipped}` : ''}\n\n진행할까요?`)) return;
      const res = await apiJson('/api/msi/create', {
        method: 'POST', body: { ...body, planHash: plan.planHash, confirm: true },
      });
      setCreated(res.created || EMPTY);
    } catch (e) {
      showError(e);
    } finally {
      setBusy('');
    }
  };

  return (
    <VbForm title="msiFromDump" width={1094} height={728} onClose={onClose} testId="msi-dump-form">
      <VbLabel x={35} y={38}>Probe ID:</VbLabel>
      <VbCombo x={88} y={35} w={261} h={22} font={{ size: 8 }} value={probeId} onChange={changeProbe}
        options={probeIds} testId="msi-dump-probe" ariaLabel="Probe ID" />
      <VbLabel x={488} y={9} w={319} h={24} wrap font={{ size: 6.75 }} color={DARK} style={{ whiteSpace: 'pre-line' }}>
        {'Multiple Id sperated by ","; or using "~" for a range. No more than 5 segments.\nFor example: 1764, 1234~1256, 1861, 1900'}
      </VbLabel>
      <VbLabel x={428} y={41}>VerifId:</VbLabel>
      <VbText x={491} y={38} w={368} h={20} value={verifId} onChange={setVerifId} testId="msi-dump-verif" ariaLabel="VerifId" />

      <VbButton x={945} y={28} w={101} h={41} font={{ size: 8 }} onClick={onClose} testId="msi-dump-exit">Exit</VbButton>
      <VbButton x={945} y={98} w={102} h={41} onClick={getRecords} busy={busy === 'get'} disabled={!!busy} testId="msi-dump-get">Get Records</VbButton>
      <VbButton x={945} y={235} w={102} h={41} onClick={selectAll} disabled={!!busy} testId="msi-dump-all">Select ALL</VbButton>

      <VbLabel x={26} y={73}>imag_verification</VbLabel>
      <VbGrid x={29} y={89} w={899} h={73} columns={verif.columns} rows={verif.rows} testId="msi-dump-verif-grid" />

      <VbLabel x={23} y={189}>imag_subverif</VbLabel>
      <VbLabel x={139} y={189} color={DARK}>(Double click row-head to add the row to Selected RTP, or using button: Select ALL)</VbLabel>
      <VbGrid x={26} y={205} w={899} h={103} columns={sub.columns} rows={sub.rows}
        onRowHeaderDoubleClick={addRow} testId="msi-dump-sub-grid" />

      <VbLabel x={942} y={328} font={F9}>Purpose For Msi:</VbLabel>
      <VbCombo x={945} y={346} w={121} h={21} value={purpose} onChange={setPurpose} options={PURPOSES} blank={false} testId="msi-dump-purpose" ariaLabel="Purpose For Msi" />
      <VbLabel x={942} y={370} font={F9}>Table:</VbLabel>
      <VbCombo x={945} y={388} w={121} h={21} value={table} onChange={setTable} options={TABLES} blank={false} testId="msi-dump-table" ariaLabel="Table" />
      <VbCheck x={945} y={415} w={136} h={17} checked={createNew} onChange={setCreateNew} testId="msi-dump-createnew">Create New from MSI:</VbCheck>
      <VbText x={945} y={430} w={52} h={21} font={F9} value={msi} onChange={setMsi} testId="msi-dump-msi" ariaLabel="MSI" />
      <VbButton x={945} y={457} w={102} h={27} onClick={createMsi} busy={busy === 'create'} disabled={!!busy} testId="msi-dump-create">Create MSI</VbButton>

      <VbLabel x={23} y={339}>Selected subverif</VbLabel>
      <VbLabel x={139} y={339} color={DARK}>(Double click row-head to remove the row from Selected RTP)</VbLabel>
      <VbGrid x={26} y={355} w={899} h={119} columns={selectedCols} rows={selected} editable
        onCellChange={(ri, ci, value) => setSelected((s) => s.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? value : c)) : r)))}
        onRowAdd={(ci, value) => setSelected((s) => [...s, selectedCols.map((_, j) => (j === ci ? value : null))])}
        onRowDelete={(ri) => setSelected((s) => s.filter((_, k) => k !== ri))}
        onRowHeaderDoubleClick={(i) => setSelected((s) => s.filter((_, k) => k !== i))} testId="msi-dump-selected-grid" />

      <VbLabel x={24} y={498}>Created records</VbLabel>
      <VbGrid x={27} y={514} w={899} h={156} columns={created.columns} rows={created.rows} testId="msi-dump-created-grid" />
    </VbForm>
  );
}
