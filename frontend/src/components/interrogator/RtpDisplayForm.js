'use client';

// 레거시 intRtpDisplay1(제목 "Form14", 1118x775): RTP_LUT 와 온도 LUT 3종을 원본 배치로 표시.
// problemReport > 0 인 행이 있으면 RTP 그리드를 Cyan 으로 칠하고 안내 문구를 보인다.

import { useEffect, useState } from 'react';
import { VbButton, VbForm, VbGrid, VbLabel } from '../vb/Vb';
import { apiJson, query } from '../../lib/apiJson';

const A8 = { size: 8, family: 'Arial' };
const EMPTY = { columns: [], rows: [] };
const CYAN = '#00ffff';

export default function RtpDisplayForm({ database, probeId, rtpName, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    if (!database || !probeId || !rtpName) return undefined;
    const ctrl = new AbortController();
    apiJson(`/api/interrogator/rtp-display?${query({ database, probeId, rtpName })}`, { signal: ctrl.signal })
      .then(setData)
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [database, probeId, rtpName]);

  const problem = (data?.problemCount || 0) > 0;
  const rtp = data?.rtpLut || EMPTY;
  const prb = data?.tempPrbLut || EMPTY;
  const volt = data?.tempPrbVoltLut || EMPTY;
  const pulse = data?.tempPulseLut || EMPTY;

  return (
    <VbForm title="Form14" width={1118} height={775} onClose={onClose} testId="int-rtp-display">
      <VbLabel x={296} y={19} w={487} h={41} font={{ size: 24, bold: true, family: 'Arial' }} color="#000">RTP Look-Up-Table List</VbLabel>
      <VbLabel x={32} y={63} w={71} h={17}>RTP_LUT</VbLabel>
      <VbGrid x={35} y={83} w={1001} h={269} columns={rtp.columns} rows={rtp.rows} testId="int-rtp-grid"
        backColor={problem ? CYAN : undefined} cellColor={problem ? () => CYAN : undefined} />
      <VbLabel x={32} y={355} w={201} h={25} font={A8}>Probe Temperature data:</VbLabel>
      <VbGrid x={35} y={383} w={1001} h={71} columns={prb.columns} rows={prb.rows} testId="int-tempprb-grid" />
      <VbLabel x={32} y={457} w={201} h={25} font={A8}>Probe Temperature Voltage data:</VbLabel>
      <VbGrid x={35} y={485} w={1001} h={71} columns={volt.columns} rows={volt.rows} testId="int-tempvolt-grid" />
      <VbLabel x={32} y={568} w={177} h={25} font={A8}>Temperature Pulse Data:</VbLabel>
      <VbGrid x={35} y={584} w={1001} h={71} columns={pulse.columns} rows={pulse.rows} testId="int-temppulse-grid" />
      <VbLabel x={88} y={708} w={633} h={25} wrap font={{ size: 12, bold: true, family: 'Arial' }} color="#ff0000"
        hidden={!problem && !error} testId="int-rtp-problem">
        {error || 'Please check the blue table for RTP problem(s).'}
      </VbLabel>
      <VbButton x={775} y={700} w={129} h={33} font={{ size: 9.75, bold: true, family: 'Arial' }} onClick={onClose} testId="int-rtp-close">Close</VbButton>
    </VbForm>
  );
}
