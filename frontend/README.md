# AOP Web 프런트엔드 (React + Vite)

React 18 + Vite 8 + react-router-dom 7 로 만든 CSR SPA 입니다. 개발 규칙은 [AGENTS.md](./AGENTS.md) 를 보세요.

## 실행

```cmd
npm ci               # 의존성 설치(최초 또는 package-lock.json 변경 시)
npm run dev          # 개발 서버 → http://localhost:3000 (저장 즉시 반영)
npm run build        # 운영 빌드 → dist\
npm start            # 운영 서버(server.mjs) → http://localhost:3000
npm test             # Playwright e2e (3000 에 서버가 없으면 npm run dev 자동 기동)
```

보통은 저장소 루트의 `AOP_Web.bat start`(개발) / `AOP_Web.bat prod`(운영)로 백엔드와 함께 띄웁니다.

## 구조

| 구분 | 개발(`npm run dev`) | 운영(`npm start`) |
|---|---|---|
| 서버 | Vite 개발 서버 | `server.mjs` (Node 기본 모듈만 사용) |
| 화면 | 소스 즉시 변환 | `dist\` 정적 파일 + SPA fallback |
| `/api/*` | 백엔드로 프록시 | 백엔드로 프록시(스트리밍, 시간 제한 없음) |
| 접속 허용 | localhost·IP·이 PC 이름 | 모든 주소(0.0.0.0) |

- 브라우저는 같은 출처의 `/api` 로만 요청하므로 백엔드 CORS 설정이 필요 없습니다.
- 백엔드 주소는 환경변수 `AOP_BACKEND_URL`(기본 `http://localhost:5000`), 운영 포트는 `PORT`(기본 3000).

## 운영 서버(server.mjs) 동작

- `/assets/*`(해시 이름): `Cache-Control: public, max-age=31536000, immutable`
- `index.html`·SPA 경로: `no-cache` + ETag(변경 없으면 304)
- 1KB 넘는 텍스트 자산은 gzip(결과를 메모리에 캐시)
- 보안 헤더: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: same-origin`
- `dist` 밖 경로 접근 차단(403), 없는 자산은 404, 정적 경로의 GET/HEAD 외 메서드는 405
- 백엔드에 연결할 수 없으면 502 → 화면에 "서버에 연결할 수 없습니다"

## Next.js 에서 전환(2026-11, #52·#53)

마지막 Next.js 버전은 git 태그 `nextjs-final` 에 있습니다.

| 항목 | Next.js 15 | React + Vite |
|---|---|---|
| 운영 빌드 시간 | 약 34초 | 약 3초 |
| 빌드 결과(JS+CSS) | 약 1.5 MB | 약 0.9 MB |
| 첫 화면 로드(gzip) | - | 약 105 KB (React·vendor·CSS) |
| 의존성 | next 포함 | 35개 패키지(npm audit 0건) |
| API 호출 | 브라우저 → `<호스트>:5000` 직접(CORS 필요) | 같은 출처 `/api` → 프록시(CORS 불필요) |
| 화면 이동 | 루트 레이아웃이 다르면 전체 새로고침 | 새로고침 없이 전환 |

### 알려진 차이

- Viewer·Machine Learning·Verification Report 의 select 모양: Next 는 이 세 화면만 CSS 로드 순서가 달라
  bootstrap 기본 select 가 보였습니다. 지금은 모든 화면이 `bootstrap → globals.css` 순서로 같은 스타일입니다.
- 없는 주소는 SPA 내부 404 화면(응답 코드 200)입니다.

### 운영 메모

- `COOKIE_SECURE=true` 를 쓰려면 HTTPS 로 서비스해야 로그인 쿠키가 저장됩니다(현재 HTTP 사내망 구성).
- 백엔드는 프록시가 덮어쓴 `X-Forwarded-For` 를 받습니다. 실제 클라이언트 IP 를 로그에 쓰려면 백엔드에 `ProxyFix` 를 적용합니다.
