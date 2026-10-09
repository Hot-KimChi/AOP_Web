'use client';

import { ExternalLink, Edit3 } from 'lucide-react';
import TodoPanel from '../../components/TodoPanel';

const WEEKLY_SCHEDULE_URL = 'https://healthineersapc.sharepoint.com/:x:/r/teams/SUSKOUE/Shared%20Documents/AOP/Z_UE_AOP%20weekly/AOP%20weekly%20schedule.xlsx?d=wdfdc89b1439d4600b6af66d46b91b13b&csf=1&web=1&e=2FAyYg';
const WEEKLY_SCHEDULE_EMBED_URL = 'https://healthineersapc.sharepoint.com/teams/SUSKOUE/_layouts/15/Doc.aspx?sourcedoc=%7Bdfdc89b1-439d-4600-b6af-66d46b91b13b%7D&file=AOP%20weekly%20schedule.xlsx&action=embedview&wdAllowInteractivity=True&mobileredirect=true';

// 인증 확인·로그인 안내는 Layout 의 AuthGate 가 담당한다. 여기서는 인증된 화면만 그린다.
export default function HomePage() {
  return (
    <div className="page-wrapper home-page">
      <div className="home-split">
        <section className="home-split-main panel">
          <div className="panel-head">
            <div className="panel-title-row">
              <h1 className="panel-title">AOP Weekly Schedule</h1>
              <span className="chip-soft">미리보기</span>
            </div>
            <a
              href={WEEKLY_SCHEDULE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-app btn-app-primary"
            >
              <Edit3 size={14} />
              <span>Excel에서 직접 편집하기</span>
              <ExternalLink size={13} className="icon-dim" />
            </a>
          </div>
          <iframe
            title="AOP Weekly Schedule"
            src={WEEKLY_SCHEDULE_EMBED_URL}
            className="home-schedule-frame"
            allowFullScreen
          />
        </section>
        <TodoPanel />
      </div>
    </div>
  );
}
