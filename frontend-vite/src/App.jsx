// Next.js 의 app/**/layout.js 13개를 대신하는 라우트 표.
// 각 항목의 title 은 기존 layout.js 의 metadata.title, wrap 은 기존 레이아웃이 감싸던 컴포넌트다.
import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import ThemeInit from './components/ThemeInit';
import Layout from './components/Layout';
import PopupLayout from './components/PopupLayout';

const HomePage = lazy(() => import('./app/(home)/page'));
const LoginPage = lazy(() => import('./app/auth/login/page'));
const DataViewPage = lazy(() => import('./app/data-view/page'));
const InterrogatorPage = lazy(() => import('./app/interrogator/page'));
const MachineLearningPage = lazy(() => import('./app/machine-learning/page'));
const MeasSetGenerationPage = lazy(() => import('./app/measset-generation/page'));
const MsiInputPage = lazy(() => import('./app/msi-input/page'));
const SsrDocOutPage = lazy(() => import('./app/SSR_DocOut/page'));
const VerificationReportPage = lazy(() => import('./app/verification-report/page'));
const VrStandalonePage = lazy(() => import('./app/verification-report/data-view-standalone/page'));
const TxMatchingPopupPage = lazy(() => import('./app/verification-report/tx-matching-popup/page'));
const ViewerPage = lazy(() => import('./app/viewer/page'));
const ViewerStandalonePage = lazy(() => import('./app/viewer/data-view-standalone/page'));

const Standalone = ({ children }) => <div className="standalone-viewer">{children}</div>;

const ROUTES = [
  { path: '/', title: 'AOP Web', Page: HomePage, wrap: Layout },
  { path: '/auth/login', title: 'AOP Web: Login', Page: LoginPage },
  { path: '/data-view', title: 'Data View — MeasSet', Page: DataViewPage },
  { path: '/interrogator', title: 'AOP Web: Interrogator', Page: InterrogatorPage, wrap: Layout },
  { path: '/machine-learning', title: 'AOP Web: Machine Learning', Page: MachineLearningPage },
  { path: '/measset-generation', title: 'AOP Web: MeasSet Generation', Page: MeasSetGenerationPage, wrap: Layout },
  { path: '/msi-input', title: 'AOP Web: measSetInput', Page: MsiInputPage, wrap: PopupLayout },
  { path: '/SSR_DocOut', title: 'AOP Web: SSR DocOut', Page: SsrDocOutPage },
  { path: '/verification-report', title: 'AOP Web: Verification Report', Page: VerificationReportPage },
  { path: '/verification-report/data-view-standalone', title: 'Data View — Verification Report', Page: VrStandalonePage, wrap: Standalone },
  { path: '/verification-report/tx-matching-popup', title: 'Tx Summary Parameter Matching', Page: TxMatchingPopupPage },
  { path: '/viewer', title: 'AOP Web: Viewer', Page: ViewerPage },
  { path: '/viewer/data-view-standalone', title: 'Data View — Viewer', Page: ViewerStandalonePage, wrap: Standalone },
];

function RoutePage({ title, Page, wrap: Wrap }) {
  useEffect(() => { document.title = title; }, [title]);
  const page = <Page />;
  return Wrap ? <Wrap>{page}</Wrap> : page;
}

function NotFound() {
  useEffect(() => { document.title = '404: This page could not be found.'; }, []);
  return (
    <div className="page-wrapper" style={{ textAlign: 'center', paddingTop: '20vh' }}>
      <h1>404</h1>
      <p>페이지를 찾을 수 없습니다.</p>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ThemeInit />
      <Suspense fallback={null}>
        <Routes>
          {ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={<RoutePage {...r} />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
