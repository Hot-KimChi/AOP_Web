// 레거시 intRTPanalysis(제목 "RTP Analysis", 1181x655): RTPName 을 고르면
// tRTP_LUT 작성 → RtpAnalysis 실행 → RTP_analysis 결과를 그리드에 표시한다.

import { useEffect, useState } from 'react';
import { VbButton, VbCombo, VbForm, VbGrid, VbLabel } from '../vb/Vb';
import { apiJson, query } from '../../lib/apiJson';
import { showError } from '../../lib/dialog';

const A8 = { size: 8, family: 'Arial' };
const EMPTY = { columns: [], rows: [] };

export default function RtpAnalysisForm({ database, onClose }) {
  const [names, setNames] = useState([]);
  const [rtpName, setRtpName] = useState('');
  const [result, setResult] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!database) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/interrogator/rtp-names-all?${query({ database })}`, { signal: ctrl.signal })
      .then((d) => setNames(d || []))
      .catch((e) => { if (e.name !== 'AbortError') showError(e); });
    return () => ctrl.abort();
  }, [database]);

  const select = async (name) => {
    setRtpName(name);
    if (!name) return;
    setBusy(true);
    try {
      setResult(await apiJson('/api/interrogator/rtp-analysis', { method: 'POST', body: { database, rtpName: name } }));
    } catch (e) {
      setResult(EMPTY);
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VbForm title="RTP Analysis" width={1181} height={655} onClose={onClose} testId="int-rtp-analysis">
      <VbLabel x={121} y={36} w={939} h={130} font={{ size: 60, bold: true, family: 'Arial' }}>RTP Data Analysis</VbLabel>
      <VbLabel x={40} y={200} w={94} h={25} font={A8}>RTPName:</VbLabel>
      <VbCombo x={177} y={197} w={561} h={24} font={A8} value={rtpName} onChange={select} options={names}
        disabled={busy} testId="int-analysis-name" ariaLabel="RTPName" />
      <VbGrid x={43} y={244} w={1082} h={304} columns={result.columns} rows={result.rows} testId="int-analysis-grid" />
      {busy && <div className="vb-busy" style={{ left: 760, top: 200 }}>Running RtpAnalysis…</div>}
      <VbButton x={525} y={569} w={113} h={49} font={A8} onClick={onClose} testId="int-analysis-done">Done</VbButton>
    </VbForm>
  );
}
