# AOP Web 프런트엔드 — React + Vite 버전

`frontend/`(Next.js 15)와 **같은 화면 코드**를 React + Vite로 옮긴 비교용 프로젝트입니다.
브랜치: `feature/react-vite`

## 실행

백엔드(5000)는 기존 방식(`scripts\AOP_Web.ps1`)으로 띄운 상태에서 다음과 같이 실행합니다.

```powershell
cd frontend-vite
npm install          # 최초 1회
npm run dev          # 개발 서버  → http://localhost:3001
npm run build        # 운영 빌드  → dist/
npm start            # 빌드 결과 서빙(vite preview) → http://localhost:3001
npm test             # Playwright e2e (23건, frontend/ 와 동일)
```

Next 버전(3000)과 동시에 띄워 같은 화면을 나란히 비교할 수 있습니다.

## 두 버전 비교 (2026-11-13 실측)

| 항목 | Next.js (`frontend/`) | React + Vite (`frontend-vite/`) |
|---|---|---|
| 화면 코드(page·component·lib) | 원본 | 동일(파일 확장자 `.js`→`.jsx`, Next import 7개 파일 + `apiBase` 환경변수 1곳 = 8개 파일만 교체) |
| 라우팅 | 폴더 기반 `app/**/page.js` + `layout.js` 13개 | `src/App.jsx` 라우트 표 1개 |
| 렌더링 | SSR 프레임워크 위에서 사실상 CSR(`ssr:false`) | 순수 CSR |
| API 호출 | 브라우저 → `<호스트>:5000` 직접(CORS·ALLOWED_ORIGINS 필요) | 브라우저 → 같은 출처 `/api` → Vite 프록시 → 5000 (CORS 불필요) |
| 운영 빌드 시간(npx 기동 포함) | 약 34초 | 약 4.5초 |
| 빌드 결과(JS+CSS) | `.next/static` 약 1.5 MB | `dist/` 약 0.9 MB |
| 런타임 의존성 | next, react, react-dom … | react, react-dom, react-router-dom … |
| e2e 23건 | 통과 | 통과(dev·preview 모두) |
| 화면 픽셀 비교(10화면×라이트/다크) | 기준 | 7화면 동일. Viewer·Machine Learning·Verification Report 는 select 모양 차이(아래 참고) |

### 알려진 차이

- **select 모양(Viewer·Machine Learning·Verification Report)**: Next 버전은 이 세 화면에서만 라우트 레이아웃이
  `globals.css` 를 먼저, 페이지의 `Layout` 이 bootstrap 을 나중에 로드해 bootstrap 기본 select(높이 38px, ▼ 화살표)가
  보였습니다(라우트별 CSS 로드 순서의 부작용). Vite 버전은 모든 화면에서 `bootstrap → globals.css` 순서가 같아
  홈·MeasSet 화면과 같은 앱 공통 스타일(약간 낮은 높이, 화살표 없음)로 보입니다.
- **없는 주소**: 두 버전 모두 404 화면을 보여 줍니다(Vite 는 SPA 내부 404, 응답 코드는 200).
- **백엔드가 꺼졌을 때**: 프록시가 502 를 돌려주므로 `AuthContext` 가 이를 "서버에 연결할 수 없습니다"(offline)로 처리합니다(Next 와 같은 화면).
- **페이지 간 이동**: Next 는 서로 다른 루트 레이아웃 사이 이동 시 전체 새로고침이 일어나지만,
  Vite 버전은 SPA 라 새로고침 없이 전환합니다.
- **개발 서버(`npm run dev`)는 이 PC(localhost)에서만** 열립니다. 다른 PC 에서 비교하려면 `npm start`(preview)를 씁니다.

### 정식 채택 시 할 일

- `vite preview`(`npm start`)는 비교·검증용입니다. Vite 공식 문서도 운영용이 아니라고 명시합니다.
  운영에서는 `dist/` 를 Flask 나 IIS/nginx 가 서빙하고 같은 서버에서 `/api` 를 리버스 프록시해야 합니다.
  정적 서버만 두면 `/api` 프록시가 없어져 API 호출이 모두 실패합니다.
  이때 TLS·보안 헤더를 붙이고, 실제 클라이언트 IP 를 남기려면 `X-Forwarded-For` + 백엔드 `ProxyFix` 를 적용합니다.
- 운영에서 `COOKIE_SECURE=true` 를 쓰면 HTTPS 로 서비스해야 로그인 쿠키가 저장됩니다.
- `scripts\AOP_Web.ps1` 은 아직 Next 버전(3000)만 관리합니다. 채택 시 스크립트도 함께 바꿉니다.
