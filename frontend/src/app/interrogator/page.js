'use client';

// 레거시 intMain(frmMain.vb, "Interrogator", 922x744) 화면을 원본 좌표·버튼·활성 규칙 그대로 재현한다.
// 하위 폼(Tank/Power/Temp/RTP Display/Export/RTP Analysis/NewName)은 원본처럼 창(모달)으로 띄운다.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radar } from 'lucide-react';
import { VbButton, VbCombo, VbDbBar, VbForm, VbLabel, VbModal, VbText } from '../../components/vb/Vb';
import NewNameForm from '../../components/interrogator/NewNameForm';
import RtpDisplayForm from '../../components/interrogator/RtpDisplayForm';
import RtpAnalysisForm from '../../components/interrogator/RtpAnalysisForm';
import TankForm from '../../components/interrogator/TankForm';
import PowerForm from '../../components/interrogator/PowerForm';
import TempForm from '../../components/interrogator/TempForm';
import ExportForm from '../../components/interrogator/ExportForm';
import { apiJson, query } from '../../lib/apiJson';

const NEW = '<New...>';
const A975 = { size: 9.75, family: 'Arial' };
const BTN = { size: 9.75, bold: true, family: 'Arial' };
const A8 = { size: 8, family: 'Arial' };
const ACTIVE_CAPTION = 'var(--accent-info)';
const B = { w: 153, h: 49, font: BTN };

export default function InterrogatorPage() {
  const router = useRouter();
  const [database, setDatabase] = useState('');
  const [probes, setProbes] = useState([]);
  const [probeId, setProbeId] = useState('');
  const [rtpNames, setRtpNames] = useState([]);
  const [rtpName, setRtpName] = useState('');
  const [probeReady, setProbeReady] = useState(false);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setProbes([]);
    setProbeId('');
    if (!database) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/interrogator/probes?${query({ database })}`, { signal: ctrl.signal })
      .then((d) => setProbes(d || []))
      .catch((e) => { if (e.name !== 'AbortError') window.alert(e.message); });
    return () => ctrl.abort();
  }, [database]);

  // cboProbeId_SelectedIndexChanged: ProbeName 표시, RTP 이름 목록(<New...> + distinct RTPName), 버튼 활성화
  useEffect(() => {
    setRtpNames([]);
    setRtpName('');
    setProbeReady(false);
    if (!database || !probeId) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/interrogator/rtp-names?${query({ database, probeId })}`, { signal: ctrl.signal })
      .then((d) => { setRtpNames(d || []); setProbeReady(true); })
      .catch((e) => { if (e.name !== 'AbortError') window.alert(e.message); });
    return () => ctrl.abort();
  }, [database, probeId]);

  const probeName = probes.find((p) => String(p.probeId) === String(probeId))?.probeName ?? '';

  const onRtpName = (v) => {
    if (v === NEW) { setOpen('newname'); return; }
    setRtpName(v);
  };

  const onNewName = (name) => {
    setOpen('');
    if (!name) return;
    setRtpNames((list) => (list.includes(name) ? list : [...list, name]));
    setRtpName(name);
  };

  const generate = async (variant) => {
    if (!probeId) { window.alert('Probe ID 를 선택하세요.'); return; }
    const label = variant === 'modified' ? 'RTP_main_modified' : 'RTP_main';
    if (!window.confirm(`ProbeId ${probeId} 에 대해 ${label} 를 실행합니다. 진행할까요?`)) return;
    setBusy(variant);
    try {
      await apiJson('/api/interrogator/rtp-generate', {
        method: 'POST', body: { database, probeId: Number(probeId), variant, confirm: true },
      });
      setOpen('display');
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy('');
    }
  };

  const close = () => setOpen('');
  const ready = probeReady && !busy;
  const common = { database, probeId, probeName, rtpName, onClose: close };

  return (
    <div className="page-wrapper">
      <div className="vb-page-header">
        <Radar size={22} className="card-title-icon" aria-hidden="true" />
        <div>
          <h1>Interrogator</h1>
          <p>RTP 데이터 점검 · 생성 · 내보내기</p>
        </div>
      </div>
      <VbDbBar value={database} onChange={setDatabase} testId="int-db" />
      <VbForm title="Interrogator" width={922} height={744} testId="int-main">
        <VbLabel x={122} y={19} w={749} h={139} font={{ size: 72, bold: true }} className="vb-hero">Interrogator</VbLabel>

        <VbLabel x={138} y={176} w={103} h={23} font={A975}>Probe ID</VbLabel>
        <VbCombo x={256} y={176} w={153} h={26} font={A975} value={probeId} onChange={setProbeId}
          options={probes.map((p) => String(p.probeId))} disabled={!database} testId="int-probe" ariaLabel="Probe ID" />
        <VbLabel x={512} y={176} w={98} h={23} font={A975}>ProbeName</VbLabel>
        <VbText x={616} y={176} w={153} h={23} font={A8} value={probeName} readOnly testId="int-probe-name" ariaLabel="ProbeName" />

        <VbLabel x={138} y={224} w={103} h={25} font={A975}>RTP Name</VbLabel>
        <VbCombo x={256} y={224} w={153} h={24} font={A8} value={rtpName} onChange={onRtpName}
          options={probeId ? [NEW, ...rtpNames] : []} disabled={!probeReady} testId="int-rtp-name" ariaLabel="RTP Name" />

        <VbLabel x={40} y={336} w={137} h={33} font={A975}>RTP data check-up:</VbLabel>
        <VbButton x={216} y={328} {...B} disabled={!ready} onClick={() => setOpen('tank')} testId="int-btn-tank">Tank Data Analysis</VbButton>
        <VbButton x={392} y={328} {...B} disabled={!ready} onClick={() => setOpen('power')} testId="int-btn-power">Power Data Analysis</VbButton>
        <VbButton x={568} y={328} {...B} disabled={!ready} onClick={() => setOpen('temp')} testId="int-btn-temp">Temp Data Analysis</VbButton>

        <VbLabel x={40} y={424} w={121} h={33} font={A975}>RTP Generation:</VbLabel>
        <VbButton x={216} y={424} {...B} disabled testId="int-btn-simu">RTP Simulation</VbButton>
        <VbButton x={392} y={424} {...B} disabled={!ready} busy={busy === 'standard'} onClick={() => generate('standard')} testId="int-btn-run">RTP Generation</VbButton>
        <VbButton x={568} y={424} {...B} color={ACTIVE_CAPTION} disabled={!!busy} busy={busy === 'modified'} onClick={() => generate('modified')} testId="int-btn-runaper">RTP Generation (Aperture Interp)</VbButton>

        <VbLabel x={40} y={520} w={121} h={33} font={A975}>RTP Export:</VbLabel>
        <VbButton x={216} y={520} {...B} disabled={!ready} onClick={() => setOpen('display')} testId="int-btn-display">RTP Display</VbButton>
        <VbButton x={392} y={520} {...B} disabled={!ready} onClick={() => setOpen('export')} testId="int-btn-export">RTP  Export</VbButton>
        <VbButton x={568} y={520} {...B} disabled={!!busy || !database} onClick={() => setOpen('analysis')} testId="int-btn-analysis">RTP Analysis</VbButton>

        <VbButton x={707} y={630} {...B} onClick={() => router.push('/')} testId="int-btn-return">Return To Home</VbButton>
      </VbForm>

      {open === 'newname' && (
        <VbModal onClose={close} testId="int-newname-modal">
          <NewNameForm nameFlag="RTPName" onOk={onNewName} onCancel={close} />
        </VbModal>
      )}
      {open === 'display' && <VbModal onClose={close}><RtpDisplayForm {...common} /></VbModal>}
      {open === 'analysis' && <VbModal onClose={close}><RtpAnalysisForm {...common} /></VbModal>}
      {open === 'tank' && <VbModal onClose={close}><TankForm {...common} /></VbModal>}
      {open === 'power' && <VbModal onClose={close}><PowerForm {...common} /></VbModal>}
      {open === 'temp' && <VbModal onClose={close}><TempForm {...common} /></VbModal>}
      {open === 'export' && <VbModal onClose={close}><ExportForm {...common} /></VbModal>}
    </div>
  );
}
