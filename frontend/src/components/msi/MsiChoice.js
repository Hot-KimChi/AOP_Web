'use client';

// 레거시 MsiChoice(543x253): 두 버튼으로 MSI 입력 방식을 고른다.

import { useState } from 'react';
import { VbButton, VbDbBar, VbForm, VbModal } from '../vb/Vb';
import MsiExcelForm from './MsiExcelForm';
import MsiDumpForm from './MsiDumpForm';

const BOLD = { size: 9.75, bold: true };

export default function MsiChoice() {
  const [database, setDatabase] = useState('');
  const [open, setOpen] = useState('');
  const close = () => setOpen('');

  return (
    <div>
      <VbForm title="MsiChoice" width={543} height={253} testId="msi-choice"
        toolbar={<VbDbBar inline value={database} onChange={setDatabase} testId="msi-db" />}>
        <VbButton x={55} y={88} w={163} h={72} font={BOLD} disabled={!database}
          onClick={() => setOpen('excel')} testId="msi-choice-excel">MSI Input From Excel</VbButton>
        <VbButton x={285} y={88} w={163} h={72} font={BOLD} disabled={!database}
          onClick={() => setOpen('dump')} testId="msi-choice-dump">MSI Input From Dumped Data</VbButton>
      </VbForm>
      {open === 'excel' && (
        <VbModal full onClose={close} testId="msi-excel-modal">
          <MsiExcelForm database={database} onClose={close} />
        </VbModal>
      )}
      {open === 'dump' && (
        <VbModal onClose={close} testId="msi-dump-modal">
          <MsiDumpForm database={database} onClose={close} />
        </VbModal>
      )}
    </div>
  );
}
