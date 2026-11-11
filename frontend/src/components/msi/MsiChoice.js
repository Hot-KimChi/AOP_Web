'use client';

// 레거시 MsiChoice(543x253): 두 버튼으로 MSI 입력 방식을 고른다.

import { useState } from 'react';
import { VbButton, VbDbBar, VbForm, VbModal } from '../vb/Vb';
import MsiDumpForm from './MsiDumpForm';
import { showAlert } from '../../lib/dialog';

const BOLD = { size: 9.75, bold: true };

// measSetInput 은 큰 폼이라 별도 브라우저 창에서 연다.
function openExcelWindow(database) {
  const w = window.screen?.availWidth || 1600;
  const h = window.screen?.availHeight || 1000;
  const win = window.open(
    `/msi-input?database=${encodeURIComponent(database)}`,
    `msiSetInput_${database}`,
    `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`,
  );
  if (win) win.focus();
  else showAlert('팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
}

export default function MsiChoice() {
  const [database, setDatabase] = useState('');
  const [open, setOpen] = useState('');
  const close = () => setOpen('');

  return (
    <div>
      <VbForm title="MsiChoice" width={543} height={253} testId="msi-choice"
        toolbar={<VbDbBar inline value={database} onChange={setDatabase} testId="msi-db" />}>
        <VbButton x={55} y={88} w={163} h={72} font={BOLD} disabled={!database}
          onClick={() => openExcelWindow(database)} testId="msi-choice-excel">MSI Input From Excel</VbButton>
        <VbButton x={285} y={88} w={163} h={72} font={BOLD} disabled={!database}
          onClick={() => setOpen('dump')} testId="msi-choice-dump">MSI Input From Dumped Data</VbButton>
      </VbForm>
      {open === 'dump' && (
        <VbModal onClose={close} testId="msi-dump-modal">
          <MsiDumpForm database={database} onClose={close} />
        </VbModal>
      )}
    </div>
  );
}
