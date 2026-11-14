// 레거시 intNewName(275x92): 새 RTP 이름 입력. 제목은 NameFlag("RTPName").
// Enter=OK, Esc=Cancel(원본 txtNewName_KeyPress).

import { useState } from 'react';
import { VbButton, VbForm, VbLabel, VbText } from '../vb/Vb';

const A8 = { size: 8, family: 'Arial' };

export default function NewNameForm({ nameFlag = 'RTPName', onOk, onCancel }) {
  const [name, setName] = useState('');
  const ok = () => onOk?.(name.trim());

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); ok(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
      }}
    >
      <VbForm title={nameFlag} width={275} height={92} onClose={onCancel} testId="int-newname" zoom={1}>
        <VbLabel x={48} y={20} w={65} h={17} font={A8}>New Name:</VbLabel>
        <VbText x={120} y={16} w={121} h={25} font={A8} value={name} onChange={setName} testId="int-newname-text" ariaLabel="New Name" />
        <VbButton x={48} y={56} w={65} h={25} font={A8} onClick={ok} testId="int-newname-ok">OK</VbButton>
        <VbButton x={160} y={56} w={65} h={25} font={A8} onClick={onCancel} testId="int-newname-cancel">Cancel</VbButton>
      </VbForm>
    </div>
  );
}
