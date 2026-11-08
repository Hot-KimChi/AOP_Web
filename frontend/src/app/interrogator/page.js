'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Table2, RefreshCw, Thermometer, Save, Calculator } from 'lucide-react';
import {
  Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import RecordTable from '../../components/RecordTable';
import { apiJson, query } from '../../lib/apiJson';
import { API_BASE_URL } from '../../lib/apiBase';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

const TEMP10_COEFF_NAMES = ['tau1', 'tau2', 'c1', 'c2', 'c3', 'c4'];

function temp10Model([tau1, tau2, c1, c2, c3, c4], t) {
  const e1 = Math.exp(-t / tau1);
  const e2 = Math.exp(-t / tau2);
  return ((c2 - c1 * e2) / (1 - c3 * e2 - c4 * e1)) * (1 - e1);
}

/** 공백·쉼표·탭 구분 숫자 표 → 행 배열. 빈 줄은 무시. */
function parseNumberRows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[\s,;]+/).filter(Boolean).map(Number));
}

function columnsOf(rows, n) {
  if (rows.some((r) => r.length < n || r.slice(0, n).some((v) => !Number.isFinite(v)))) {
    throw new Error(`각 행에 숫자 ${n}개가 필요합니다.`);
  }
  return Array.from({ length: n }, (_, i) => rows.map((r) => r[i]));
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card mt-3">
      <div className="card-header">
        <div className="card-title-row">
          <Icon size={16} className="card-title-icon" />
          <h5>{title}</h5>
        </div>
      </div>
      <div className="card-body" style={{ padding: '1.25rem' }}>{children}</div>
    </div>
  );
}

function FitResultView({ result, names }) {
  if (!result) return null;
  return (
    <div className="mt-3">
      <RecordTable
        rows={[Object.fromEntries([
          ...names.map((n, i) => [n, result.coefficients?.[i]]),
          ['error(MSE)', result.error],
          ['수렴', result.success ? 'Yes' : 'No'],
        ])]}
        maxHeight={120}
      />
      {(result.warnings || []).map((w) => <div key={w} className="alert alert-warning mt-2 mb-0 py-2">{w}</div>)}
    </div>
  );
}

// ─── RTP Display / Generation ───────────────────────────────────────────────
function RtpSection({ database, probeId }) {
  const [names, setNames] = useState([]);
  const [rtpName, setRtpName] = useState('');
  const [display, setDisplay] = useState(null);
  const [variant, setVariant] = useState('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // DB·Probe 가 바뀌거나 더 새 Display 요청이 있으면 늦게 도착한 이전 응답을 폐기한다.
  const seqRef = useRef(0);
  const displayReqRef = useRef(0);

  // 호출 시점의 대상 순번(seq)과 다르면 응답을 반영하지 않는다.
  const loadNames = async (signal, seq = seqRef.current) => {
    const list = await apiJson(`/api/interrogator/rtp-names?${query({ database, probeId })}`, { signal });
    if (seq === seqRef.current) setNames(list || []);
  };

  useEffect(() => {
    seqRef.current += 1;
  }, [database, probeId]);

  useEffect(() => {
    setNames([]);
    setRtpName('');
    setDisplay(null);
    setError('');
    setNotice('');
    if (!database || !probeId) return undefined;
    const ctrl = new AbortController();
    loadNames(ctrl.signal).catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, probeId]);

  const loadDisplay = async (name = rtpName, seq = seqRef.current) => {
    if (!name) return;
    const req = ++displayReqRef.current;
    const isLatest = () => seq === seqRef.current && req === displayReqRef.current;
    setBusy(true);
    setError('');
    try {
      const res = await apiJson(`/api/interrogator/rtp-display?${query({ database, probeId, rtpName: name })}`);
      if (isLatest()) setDisplay(res);
    } catch (e) {
      if (isLatest()) {
        setError(e.message);
        setDisplay(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    const label = variant === 'modified' ? 'RTP_main_modified' : 'RTP_main';
    if (!window.confirm(`${label} 를 실행하면 Probe ${probeId} 의 RTP LUT 전체가 다시 계산됩니다. 진행할까요?`)) return;
    const seq = seqRef.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiJson('/api/interrogator/rtp-generate', {
        method: 'POST', body: { database, probeId: Number(probeId), variant, confirm: true },
      });
      setNotice(`${label} 실행을 완료했습니다(Probe ${probeId}).`);
      if (seq !== seqRef.current) return;
      await loadNames(undefined, seq);
      if (rtpName && seq === seqRef.current) await loadDisplay(rtpName, seq);
    } catch (e) {
      if (seq === seqRef.current) setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon={Table2} title="RTP Display / Generation">
      <div className="row g-3 align-items-end">
        <div className="col-md-4">
          <label htmlFor="rtpName" className="form-label">RTP Name</label>
          <select id="rtpName" className="form-select" value={rtpName} disabled={busy || !names.length}
            onChange={(e) => { setRtpName(e.target.value); setDisplay(null); loadDisplay(e.target.value); }}>
            <option value="">{names.length ? 'Select RTP…' : 'RTP 없음'}</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label htmlFor="rtpVariant" className="form-label">생성 프로시저</label>
          <select id="rtpVariant" className="form-select" value={variant} onChange={(e) => setVariant(e.target.value)} disabled={busy}>
            <option value="standard">RTP_main</option>
            <option value="modified">RTP_main_modified</option>
          </select>
        </div>
        <div className="col-md-5" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-app btn-app-secondary" onClick={() => loadDisplay()} disabled={busy || !rtpName}>
            <RefreshCw size={14} /> 다시 조회
          </button>
          <button type="button" className="btn-app btn-app-primary" onClick={generate} disabled={busy || !probeId}>
            <Activity size={14} /> RTP 생성
          </button>
        </div>
      </div>
      {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
      {notice && <div className="alert alert-success mt-3 mb-0">{notice}</div>}
      {display && (
        <>
          {display.warnings.map((w) => <div key={w} className="alert alert-warning mt-3 mb-0">{w}</div>)}
          {display.truncated && <div className="alert alert-warning mt-3 mb-0">일부 표가 최대 행 수를 넘어 잘렸습니다.</div>}
          <h6 className="mt-4">RTP_LUT</h6>
          <RecordTable rows={display.rtpLut} testId="rtp-lut-table" />
          <h6 className="mt-4">tempPrb_LUT</h6>
          <RecordTable rows={display.tempPrbLut} maxHeight={240} />
          <h6 className="mt-4">tempPulse_LUT</h6>
          <RecordTable rows={display.tempPulseLut} maxHeight={240} />
          <h6 className="mt-4">tempPrbVolt_LUT</h6>
          <RecordTable rows={display.tempPrbVoltLut} maxHeight={240} />
        </>
      )}
    </Section>
  );
}

// ─── Temp10 fitting ─────────────────────────────────────────────────────────
function Temp10Section({ database, probeId }) {
  const [stations, setStations] = useState([]);
  const [tempSSId, setTempSSId] = useState('');
  const [sets, setSets] = useState([]);
  const [tempSetId, setTempSetId] = useState('');
  const [fit, setFit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setStations([]);
    setTempSSId('');
    setFit(null);
    setError('');
    if (!database || !probeId) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/interrogator/temp10/stations?${query({ database, probeId })}`, { signal: ctrl.signal })
      .then((d) => setStations(d || []))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [database, probeId]);

  useEffect(() => {
    setSets([]);
    setTempSetId('');
    setFit(null);
    if (!database || !probeId || !tempSSId) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/interrogator/temp10/sets?${query({ database, probeId, tempSSId })}`, { signal: ctrl.signal })
      .then((d) => setSets(d || []))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [database, probeId, tempSSId]);

  const ids = () => ({ database, probeId: Number(probeId), tempSSId: Number(tempSSId), tempSetId: Number(tempSetId) });
  // 선택이 바뀌면 순번을 올려 진행 중이던 fitting 응답을 폐기한다(다른 대상 결과 표시·저장 방지).
  const fitSeqRef = useRef(0);
  useEffect(() => {
    fitSeqRef.current += 1;
    setFit(null);
  }, [database, probeId, tempSSId, tempSetId]);

  const runFit = async () => {
    const seq = ++fitSeqRef.current;
    const req = ids();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await apiJson('/api/interrogator/temp10/fit', { method: 'POST', body: req });
      if (seq === fitSeqRef.current) setFit({ ...res, request: req });
    } catch (e) {
      if (seq === fitSeqRef.current) {
        setError(e.message);
        setFit(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!fit) return;
    if (!window.confirm('서버에서 다시 fitting 한 계수를 temp10_fit_coeff 에 저장합니다(기존 행이 있으면 저장하지 않음). 진행할까요?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiJson('/api/interrogator/temp10/save', { method: 'POST', body: { ...fit.request, confirm: true } });
      setNotice(res.saved ? '저장했습니다.' : '이미 저장된 계수가 있어 저장하지 않았습니다(레거시와 동일).');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(() => {
    if (!fit) return null;
    const pts = fit.timeElapsedS.map((t, i) => ({ x: t, y: fit.tempRiseC[i] }));
    const tMax = Math.max(...fit.timeElapsedS);
    const curve = Array.from({ length: 121 }, (_, i) => {
      const t = (tMax * i) / 120;
      return { x: t, y: temp10Model(fit.fit.coefficients, t) };
    }).filter((p) => Number.isFinite(p.y));
    return {
      datasets: [
        { label: '측정 ΔT (°C)', data: pts, backgroundColor: 'rgba(37,99,235,0.7)', pointRadius: 3 },
        { label: 'Fit', data: curve, showLine: true, borderColor: 'rgba(220,38,38,0.9)', pointRadius: 0, borderWidth: 2 },
      ],
    };
  }, [fit]);

  return (
    <Section icon={Thermometer} title="Temp10 Fitting (MATLAB fminsearch → SciPy Nelder-Mead)">
      <h6>temp_station_setup</h6>
      <RecordTable rows={stations} maxHeight={200} emptyText="Probe 를 선택하면 표시됩니다." />
      <div className="row g-3 align-items-end mt-1">
        <div className="col-md-3">
          <label htmlFor="tempSSId" className="form-label">tempSSId</label>
          <select id="tempSSId" className="form-select" value={tempSSId} onChange={(e) => setTempSSId(e.target.value)} disabled={busy || !stations.length}>
            <option value="">Select…</option>
            {stations.map((s) => <option key={s.tempSSId} value={s.tempSSId}>{s.tempSSId}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label htmlFor="tempSetId" className="form-label">tempSetId</label>
          <select id="tempSetId" className="form-select" value={tempSetId} onChange={(e) => { setTempSetId(e.target.value); setFit(null); }} disabled={busy || !sets.length}>
            <option value="">Select…</option>
            {sets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-md-6" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-app btn-app-secondary" onClick={runFit} disabled={busy || !tempSetId}>
            <Activity size={14} /> Fitting
          </button>
          <button type="button" className="btn-app btn-app-primary" onClick={save} disabled={busy || !fit}>
            <Save size={14} /> 계수 저장
          </button>
        </div>
      </div>
      {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
      {notice && <div className="alert alert-success mt-3 mb-0">{notice}</div>}
      {fit && (
        <>
          {fit.existing && <div className="alert alert-info mt-3 mb-0">이미 저장된 계수가 있습니다(temp10FitId {fit.existing.temp10FitId ?? '-'}).</div>}
          <FitResultView result={fit.fit} names={TEMP10_COEFF_NAMES} />
          <div style={{ height: 320 }} className="mt-3">
            <Scatter data={chartData} options={{
              maintainAspectRatio: false,
              scales: { x: { title: { display: true, text: 'timeElapsed (s)' } }, y: { title: { display: true, text: 'ΔT (°C)' } } },
            }} />
          </div>
        </>
      )}
    </Section>
  );
}

// ─── 계산기 (개구 보정 / TR 스펙트럼) ───────────────────────────────────────
function CalculatorSection() {
  const [apMode, setApMode] = useState('1d');
  const [apText, setApText] = useState('');
  const [azPitch, setAzPitch] = useState('');
  const [elPitch, setElPitch] = useState('');
  const [apResult, setApResult] = useState(null);
  const [matrixText, setMatrixText] = useState('');
  const [trText, setTrText] = useState('');
  const [trResult, setTrResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const runAperture = async () => {
    setError('');
    setApResult(null);
    try {
      const rows = parseNumberRows(apText);
      const body = { mode: apMode, azPitchCm: azPitch || null, elPitchCm: elPitch || null };
      if (apMode === '1d') {
        const [azAperCm, tempRise, normCoeff] = columnsOf(rows, 3);
        Object.assign(body, { azAperCm, tempRise, normCoeff });
      } else {
        const [azAperCm, elAperCm, tempRise] = columnsOf(rows, 3);
        Object.assign(body, { azAperCm, elAperCm, tempRise });
      }
      setBusy(true);
      setApResult(await apiJson('/api/interrogator/fit/aperture', { method: 'POST', body }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const runTr = async () => {
    setError('');
    setTrResult(null);
    try {
      const sysSpectrum = parseNumberRows(matrixText);
      const trMeas = parseNumberRows(trText).flat();
      setBusy(true);
      setTrResult(await apiJson('/api/interrogator/fit/tr-spectrum', { method: 'POST', body: { sysSpectrum, trMeas } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const apNames = apMode === '1d' ? ['x1', 'x2', 'x3'] : ['x1', 'x2', 'x3', 'x4', 'x5'];

  return (
    <Section icon={Calculator} title="MATLAB 계산기 (DB 저장 없음)">
      <div className="row g-4">
        <div className="col-lg-6">
          <h6>개구(aperture) 보정 fitting</h6>
          <div className="row g-2 align-items-end">
            <div className="col-4">
              <label htmlFor="apMode" className="form-label">모드</label>
              <select id="apMode" className="form-select" value={apMode} onChange={(e) => { setApMode(e.target.value); setApResult(null); }}>
                <option value="1d">1D (3계수, 가중)</option>
                <option value="2d">2D (5계수)</option>
              </select>
            </div>
            <div className="col-4">
              <label htmlFor="azPitch" className="form-label">azPitch (cm)</label>
              <input id="azPitch" className="form-control" value={azPitch} onChange={(e) => setAzPitch(e.target.value)} />
            </div>
            {apMode === '2d' && (
              <div className="col-4">
                <label htmlFor="elPitch" className="form-label">elPitch (cm)</label>
                <input id="elPitch" className="form-control" value={elPitch} onChange={(e) => setElPitch(e.target.value)} />
              </div>
            )}
          </div>
          <label htmlFor="apText" className="form-label mt-2">
            {apMode === '1d' ? '행마다: azAper(cm) tempRise normCoeff' : '행마다: azAper(cm) elAper(cm) tempRise'}
          </label>
          <textarea id="apText" className="form-control" rows={6} value={apText} onChange={(e) => setApText(e.target.value)} style={{ fontFamily: 'monospace' }} />
          <button type="button" className="btn-app btn-app-secondary mt-2" onClick={runAperture} disabled={busy || !apText.trim()}>
            <Activity size={14} /> 계산
          </button>
          <FitResultView result={apResult} names={apNames} />
        </div>
        <div className="col-lg-6">
          <h6>TR 스펙트럼 (sys_spectrum \ TR_meas)</h6>
          <label htmlFor="matrixText" className="form-label">sys_spectrum (행: 주파수, 열: bin)</label>
          <textarea id="matrixText" className="form-control" rows={4} value={matrixText} onChange={(e) => setMatrixText(e.target.value)} style={{ fontFamily: 'monospace' }} />
          <label htmlFor="trText" className="form-label mt-2">TR_meas (행 수만큼)</label>
          <textarea id="trText" className="form-control" rows={2} value={trText} onChange={(e) => setTrText(e.target.value)} style={{ fontFamily: 'monospace' }} />
          <button type="button" className="btn-app btn-app-secondary mt-2" onClick={runTr} disabled={busy || !matrixText.trim() || !trText.trim()}>
            <Activity size={14} /> 계산
          </button>
          {trResult && (
            <div className="mt-3">
              <RecordTable rows={trResult.probeSpectrum.map((v, i) => ({ bin: i + 1, probeSpectrum: v }))} maxHeight={200} />
              <div className="small mt-1">rank {trResult.rank}, residual norm {trResult.residualNorm.toPrecision(4)}</div>
              {trResult.warnings.map((w) => <div key={w} className="alert alert-warning mt-2 mb-0 py-2">{w}</div>)}
            </div>
          )}
        </div>
      </div>
      {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
    </Section>
  );
}

export default function InterrogatorPage() {
  const [dbList, setDbList] = useState([]);
  const [database, setDatabase] = useState('');
  const [probes, setProbes] = useState([]);
  const [probeId, setProbeId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/get_list_database`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('데이터베이스 목록을 가져오지 못했습니다.'))))
      .then((d) => setDbList(d.databases || []))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setProbes([]);
    setProbeId('');
    if (!database) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/interrogator/probes?${query({ database })}`, { signal: ctrl.signal })
      .then((d) => setProbes(d || []))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [database]);

  return (
    <div className="page-wrapper" data-testid="interrogator-page">
      <div className="card">
        <div className="card-header">
          <div className="card-title-row">
            <Activity size={16} className="card-title-icon" />
            <h5>Interrogator</h5>
          </div>
        </div>
        <div className="card-body" style={{ padding: '1.25rem' }}>
          <div className="row g-3">
            <div className="col-md-4">
              <label htmlFor="intDatabase" className="form-label">Database</label>
              <select id="intDatabase" className="form-select" value={database} onChange={(e) => { setError(''); setDatabase(e.target.value); }}>
                <option value="">Select database…</option>
                {dbList.map((db) => <option key={db} value={db}>{db}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label htmlFor="intProbe" className="form-label">Probe</label>
              <select id="intProbe" className="form-select" value={probeId} onChange={(e) => setProbeId(e.target.value)} disabled={!database}>
                <option value="">Select probe…</option>
                {probes.map((p) => <option key={p.probeId} value={p.probeId}>{p.probeName} ({p.probeId})</option>)}
              </select>
            </div>
          </div>
          {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
        </div>
      </div>
      <RtpSection database={database} probeId={probeId} />
      <Temp10Section database={database} probeId={probeId} />
      <CalculatorSection />
    </div>
  );
}
