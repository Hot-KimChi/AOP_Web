'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Eye, PlusCircle } from 'lucide-react';
import RecordTable from './RecordTable';
import { apiJson, query } from '../lib/apiJson';
import { API_BASE_URL } from '../lib/apiBase';

const PURPOSE_MODES = ['Auto Detect', 'RTP', 'Sample', 'SSR', 'FDA', 'IEC', 'Power'];
const DEFAULT_FILTER = '1,3,5~9';
const MAX_SELECTION = 200;

const ACTION_LABEL = {
  insert: '신규 생성',
  append: 'subVerifId 추가',
  exists: '이미 연결됨',
  too_long: '추가 불가(길이 초과)',
  skip: '건너뜀',
};

function planRows(plan) {
  return (plan?.actions || []).map((a) => ({
    subVerifId: a.subVerifId,
    verifId: a.verifId,
    branch: a.branch,
    action: ACTION_LABEL[a.action] || a.action,
    measSetId: a.measSetId != null && a.measSetId < 0 ? `(신규 ${-a.measSetId})` : a.measSetId,
    comments: a.comments,
    message: a.message,
  }));
}

/** Silverstone MSI input — 레거시 msiFromDump 의 웹 이식. */
export default function MsiInputPanel() {
  const [dbList, setDbList] = useState([]);
  const [database, setDatabase] = useState('');
  const [probes, setProbes] = useState([]);
  const [probeId, setProbeId] = useState('');
  const [verifFilter, setVerifFilter] = useState(DEFAULT_FILTER);
  const [purposeMode, setPurposeMode] = useState('Auto Detect');
  const [minMeasSetId, setMinMeasSetId] = useState('0');
  const [verifData, setVerifData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [plan, setPlan] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/get_list_database`, {
          credentials: 'include',
        });
        if (res.ok) setDbList((await res.json()).databases || []);
      } catch {
        setError('데이터베이스 목록을 가져오지 못했습니다.');
      }
    })();
  }, []);

  useEffect(() => {
    setProbes([]);
    setProbeId('');
    setVerifData(null);
    setPlan(null);
    setResult(null);
    if (!database) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/msi/probes?${query({ database })}`, { signal: ctrl.signal })
      .then((d) => setProbes(d || []))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [database]);

  const resetSelection = () => {
    setSelected(new Set());
    setPlan(null);
    setResult(null);
  };

  const loadVerifications = useCallback(async () => {
    if (!database || !probeId) return;
    setBusy(true);
    setError('');
    resetSelection();
    try {
      const data = await apiJson(`/api/msi/verifications?${query({ database, probeId, verifFilter })}`);
      setVerifData(data);
    } catch (e) {
      setError(e.message);
      setVerifData(null);
    } finally {
      setBusy(false);
    }
  }, [database, probeId, verifFilter]);

  const toggle = (id) => {
    setPlan(null);
    setResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECTION) next.add(id);
      return next;
    });
  };

  const toggleAll = (on) => {
    setPlan(null);
    setResult(null);
    const ids = (verifData?.subVerifications || []).map((r) => r.subVerifId).slice(0, MAX_SELECTION);
    setSelected(on ? new Set(ids) : new Set());
  };

  const requestBody = () => ({
    database,
    probeId: Number(probeId),
    subVerifIds: Array.from(selected),
    purposeMode,
    minMeasSetId: Number(minMeasSetId) || 0,
  });

  const runPreview = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setPlan(await apiJson('/api/msi/preview', { method: 'POST', body: requestBody() }));
    } catch (e) {
      setError(e.message);
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  const runCreate = async () => {
    if (!plan) return;
    const { insert = 0, append = 0 } = plan.summary || {};
    if (insert + append === 0) {
      setError('생성하거나 갱신할 항목이 없습니다.');
      return;
    }
    if (!window.confirm(`meas_setting 에 ${insert}건 생성, ${append}건 갱신합니다. 진행할까요?`)) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiJson('/api/msi/create', {
        method: 'POST',
        body: { ...requestBody(), planHash: plan.planHash, confirm: true },
      });
      setResult(data);
      setPlan(null);
    } catch (e) {
      if (e.status === 409 && e.data) {
        setPlan(e.data);
        setError(`${e.message} 갱신된 미리보기를 확인한 뒤 다시 생성하세요.`);
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const summary = plan?.summary;

  return (
    <div data-testid="msi-input-panel">
      <div className="row g-3">
        <div className="col-md-3">
          <label htmlFor="msiDatabase" className="form-label">Database</label>
          <select id="msiDatabase" className="form-select" value={database}
            onChange={(e) => setDatabase(e.target.value)} disabled={busy}>
            <option value="">Select database…</option>
            {dbList.map((db) => <option key={db} value={db}>{db}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label htmlFor="msiProbe" className="form-label">Probe</label>
          <select id="msiProbe" className="form-select" value={probeId}
            onChange={(e) => { setProbeId(e.target.value); setVerifData(null); resetSelection(); }}
            disabled={busy || !database}>
            <option value="">Select probe…</option>
            {probes.map((p) => <option key={p.probeId} value={p.probeId}>{p.probeName} ({p.probeId})</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label htmlFor="msiVerifFilter" className="form-label">verifId 필터</label>
          <input id="msiVerifFilter" className="form-control" value={verifFilter} maxLength={200}
            placeholder="예: 1,3,5~9" onChange={(e) => setVerifFilter(e.target.value)} disabled={busy} />
        </div>
        <div className="col-md-2">
          <label htmlFor="msiPurpose" className="form-label">Purpose</label>
          <select id="msiPurpose" className="form-select" value={purposeMode}
            onChange={(e) => { setPurposeMode(e.target.value); setPlan(null); }} disabled={busy}>
            {PURPOSE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label htmlFor="msiMinId" className="form-label">중복 비교 시작 measSetId</label>
          <input id="msiMinId" type="number" min="0" className="form-control" value={minMeasSetId}
            onChange={(e) => { setMinMeasSetId(e.target.value); setPlan(null); }} disabled={busy} />
        </div>
      </div>

      <div className="action-bar mt-3">
        <button type="button" className="btn-app btn-app-secondary" onClick={loadVerifications}
          disabled={busy || !database || !probeId}>
          <Search size={14} /> Verification 조회
        </button>
        <button type="button" className="btn-app btn-app-secondary" onClick={runPreview}
          disabled={busy || selected.size === 0}>
          <Eye size={14} /> 미리보기 ({selected.size})
        </button>
        <button type="button" className="btn-app btn-app-primary" onClick={runCreate}
          disabled={busy || !plan}>
          <PlusCircle size={14} /> meas_setting 생성
        </button>
        {busy && (
          <span className="busy-indicator action-bar-end" role="status">
            <span className="spinner-border spinner-border-sm text-secondary" aria-hidden="true" />
            처리 중…
          </span>
        )}
      </div>
      {!verifData && !busy && (
        <p className="hint-text mt-3">
          ① Verification 조회 → ② 생성 대상 subVerif 선택 → ③ 미리보기(DB 변경 없음) → ④ meas_setting 생성 순서로 진행합니다.
        </p>
      )}

      {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
      {verifData?.truncated && (
        <div className="alert alert-warning mt-3 mb-0">결과가 많아 일부만 표시합니다. verifId 필터를 좁혀 주세요.</div>
      )}

      {verifData && (
        <>
          <div className="step-title"><span className="step-num">1</span>imag_verification</div>
          <RecordTable rows={verifData.verifications} rowKey="verifId" maxHeight={220} testId="msi-verif-table" />
          <div className="step-title">
            <span className="step-num">2</span>imag_subverif 생성 대상 선택
            <span className="chip-soft">{selected.size} / 최대 {MAX_SELECTION}</span>
          </div>
          <RecordTable rows={verifData.subVerifications} rowKey="subVerifId" selectable selected={selected}
            onToggle={toggle} onToggleAll={toggleAll} testId="msi-subverif-table" />
        </>
      )}

      {plan && (
        <>
          <div className="step-title"><span className="step-num">3</span>미리보기 (DB 변경 없음)</div>
          {summary && (
            <div className="d-flex flex-wrap gap-2 mb-2" data-testid="msi-plan-summary">
              <span className="chip-soft">신규 {summary.insert}</span>
              <span className="chip-soft">추가 {summary.append}</span>
              <span className="chip-soft">이미 연결 {summary.exists}</span>
              <span className="chip-soft">길이 초과 {summary.too_long}</span>
              <span className="chip-soft">건너뜀 {summary.skip}</span>
            </div>
          )}
          <RecordTable rows={planRows(plan)} testId="msi-plan-table" />
        </>
      )}

      {result && (
        <>
          <div className="step-title"><span className="step-num">4</span>생성 결과</div>
          <div className="alert alert-success mb-0" role="status">
            완료: 신규 measSetId {result.createdIds?.length ? result.createdIds.join(', ') : '없음'}
            {result.summary ? ` / subVerifId 추가 ${result.summary.append}건` : ''}
          </div>
        </>
      )}
    </div>
  );
}
