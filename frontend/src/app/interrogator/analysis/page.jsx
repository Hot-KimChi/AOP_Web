// Interrogator 의 Tank/Power/Temp Data Analysis 를 화면 전체 크기의 별도 브라우저 창에서 연다.
// 메인(interrogator/page.jsx)이 window.open 으로 ?kind=&database=&probeId=&probeName=&rtpName= 를 넘긴다.

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VbModal } from '../../../components/vb/Vb';
import TankForm from '../../../components/interrogator/TankForm';
import PowerForm from '../../../components/interrogator/PowerForm';
import TempForm from '../../../components/interrogator/TempForm';
import { fitWindowToScreen } from '../../../lib/openWindow';

const FORMS = { tank: TankForm, power: PowerForm, temp: TempForm };

export default function InterrogatorAnalysisPage() {
  const [sp] = useSearchParams();
  const kind = sp.get('kind') || '';
  const database = sp.get('database') || '';
  const probeId = sp.get('probeId') || '';
  const Form = FORMS[kind];

  useEffect(() => { fitWindowToScreen(); }, []);

  if (!Form || !database || !probeId) {
    return (
      <div className="empty-state-wrap">
        <section className="empty-state">
          <h1 className="empty-state-title">분석 대상이 지정되지 않았습니다</h1>
          <p className="empty-state-desc">Interrogator 에서 Database·Probe ID 를 선택한 뒤 분석 버튼으로 다시 열어 주세요.</p>
        </section>
      </div>
    );
  }

  const close = () => {
    window.close();
    // 스크립트로 연 창이 아니면 닫히지 않으므로 Interrogator 화면으로 이동한다.
    setTimeout(() => { if (!window.closed) window.location.href = '/interrogator'; }, 150);
  };
  return (
    <VbModal maximized closeOnEsc onClose={close} testId={`int-${kind}-window`}>
      <Form database={database} probeId={probeId} probeName={sp.get('probeName') || ''}
        rtpName={sp.get('rtpName') || ''} onClose={close} />
    </VbModal>
  );
}
