'use client';

// 레거시 frmVoltageS "Voltage String"(450x169) 이식: voltage_grid 에 PmPulseType 별 전압 문자열 등록.

import { useState } from 'react';
import { VbButton, VbForm, VbLabel, VbText } from '../vb/Vb';
import { apiJson } from '../../lib/apiJson';

export default function TankVoltageSForm({ database, probeId, pulseType, onClose }) {
  const [pulse, setPulse] = useState(pulseType ?? '');
  const [voltage, setVoltage] = useState('');
  const [busy, setBusy] = useState(false);

  const cmdSaveOk = async () => {
    if (voltage === '') {
      window.alert('Please input Voltage String befor save.');
      return;
    }
    setBusy(true);
    try {
      // 원본은 txtPulseType 이 아니라 SelectedPulseType(전달받은 값)으로 INSERT 한다.
      await apiJson('/api/interrogator/tank/voltage-grid', {
        method: 'POST', body: { database, probeId, pulseType, voltageString: voltage, confirm: true },
      });
    } catch (e) {
      window.alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <VbForm title="Voltage String" width={450} height={169} onClose={onClose} testId="int-tank-voltages">
      <VbLabel x={39} y={34}>PmPulseType:</VbLabel>
      <VbText x={118} y={30} w={307} h={20} value={pulse} onChange={setPulse} testId="tv-pulse" />
      <VbLabel x={39} y={76}>Voltage String:</VbLabel>
      <VbText x={118} y={72} w={307} h={20} value={voltage} onChange={setVoltage} testId="tv-voltage" />
      <VbButton x={137} y={119} w={65} h={25} onClick={cmdSaveOk} busy={busy} testId="tv-save">Save</VbButton>
      <VbButton x={249} y={119} w={65} h={25} onClick={onClose} testId="tv-close">Close</VbButton>
    </VbForm>
  );
}
