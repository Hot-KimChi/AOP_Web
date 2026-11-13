'use client';

// measSetInput 을 별도 브라우저 창에서 연다(MsiChoice → window.open). DB 는 ?database= 로 전달받는다.

import { useEffect, useState } from 'react';
import MsiExcelForm from '../../components/msi/MsiExcelForm';

export default function MsiInputPage() {
  const [database, setDatabase] = useState(null);

  useEffect(() => {
    setDatabase(new URLSearchParams(window.location.search).get('database') || '');
  }, []);

  if (database === null) return null;
  if (!database) {
    return (
      <div className="empty-state-wrap">
        <section className="empty-state">
          <h1 className="empty-state-title">데이터베이스가 지정되지 않았습니다</h1>
          <p className="empty-state-desc">MeasSet Generation → MSI input 에서 데이터베이스를 선택한 뒤 다시 열어 주세요.</p>
        </section>
      </div>
    );
  }

  const close = () => {
    window.close();
    // 스크립트로 연 창이 아니면 닫히지 않으므로 원래 화면으로 이동한다.
    setTimeout(() => { if (!window.closed) window.location.href = '/measset-generation'; }, 150);
  };

  return (
    <div className="vb-standalone">
      <MsiExcelForm database={database} onClose={close} />
    </div>
  );
}
