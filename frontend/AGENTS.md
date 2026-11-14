# Frontend (React + Vite) Architecture Map & Rules

> Read this before modifying any file under `frontend/`.
> 순수 CSR SPA다. SSR·서버 컴포넌트가 없으므로 hydration 관련 규칙은 필요 없다.

---

## Coding Standards

- JavaScript + JSX. JSX가 들어간 파일은 **반드시 `.jsx`** (Vite 8/oxc는 `.js` 안의 JSX를 해석하지 않는다)
- `'use client'`·`next/*` import 금지(Next.js 전용). 라우팅은 `react-router-dom`
- Small, composable components. No duplicated logic or unused hooks

| 하고 싶은 일 | 쓰는 것 |
|---|---|
| 링크 | `<Link to="/path">` |
| 코드로 이동 | `const navigate = useNavigate(); navigate('/path')` |
| 현재 경로 | `useLocation().pathname` |
| 쿼리 문자열 | `const [sp] = useSearchParams(); sp.get('x')` |
| 탭 제목·레이아웃 | `src/App.jsx` 의 `ROUTES` (`title`, `wrap`) |
| 브라우저 환경변수 | `import.meta.env.VITE_*` (`.env.development` / `.env.production`) |

---

## File Structure

```
frontend/
├── index.html            # 테마 깜빡임 방지 인라인 스크립트 + #root (제거·이동 금지)
├── vite.config.mjs       # 개발 서버 3000(LAN 수신, allowedHosts=PC 이름), /api 프록시, vendor 청크 분리
├── server.mjs            # 운영 서버(npm start): dist 서빙·SPA fallback·/api 프록시·gzip·캐시·보안 헤더
└── src/
    ├── main.jsx          # bootstrap → globals.css → BrowserRouter → App
    ├── App.jsx           # 라우트 표(ROUTES): path·title·Page(lazy)·wrap(Layout/PopupLayout/Standalone), 404
    ├── globals.css       # CSS variables (:root + [data-theme="dark"])
    ├── components/
    │   ├── Layout.jsx        # AuthProvider + Navbar + <main><AuthGate>
    │   ├── PopupLayout.jsx   # 별도 창용: AuthProvider + AuthGate (Navbar 없음)
    │   ├── AuthContext.jsx   # 인증 상태 단일 원천(useAuth) + AuthGate. /api/auth/status 를 직접 호출하지 말 것
    │   ├── Navbar.jsx        # Navigation (useAuth), theme toggle
    │   ├── ThemeInit.jsx     # Applies saved theme on mount (renders null)
    │   └── DataViewer.jsx    # Table: cascaded filters, sort, CSV export
    ├── lib/
    │   ├── apiBase.jsx       # API_BASE_URL
    │   ├── dialog.jsx        # showAlert/showError/showConfirm (브라우저 alert/confirm 금지)
    │   └── loginPopup.jsx    # APP_VERSION(버전 배지), openLoginPopup()
    └── app/**/page.jsx       # 화면 (home, auth/login, viewer, data-view, measset-generation,
                              #       machine-learning, verification-report, SSR_DocOut, interrogator, msi-input)
```

---

## Add a Page

1. `src/app/<route>/page.jsx` 작성
2. `src/App.jsx` 의 `ROUTES` 에 `{ path, title, Page: lazy(() => import(...)), wrap }` 한 줄 추가
   - 일반 화면 `wrap: Layout`, 별도 창 `wrap: PopupLayout`, 페이지가 자체 Layout 을 쓰면 생략
3. 네비 항목은 `Navbar.jsx` 의 `menuItems`(auth-gated)
4. 페이지는 반드시 `lazy` 로 등록한다(첫 화면 번들에 넣지 않기 위해)

---

## Theming

- Selector: `[data-theme="dark"]` — not `.dark`
- Storage key: `'aop-theme'` (values: `'dark'` / `'light'`)
- Use CSS variables only (`var(--bg)`, `var(--surface)`, `var(--text)`, etc.) — **no hardcoded colors**
- Chart.js: use `isDark` parameter factory functions
- Bootstrap overrides require `!important`
- 깜빡임 방지 스크립트는 `index.html` `<head>` 에 있다. React 가 그리기 전에 실행돼야 하므로 옮기지 않는다

---

## API Communication

```javascript
import { API_BASE_URL } from '<relative>/lib/apiBase';

const res = await fetch(`${API_BASE_URL}/api/endpoint`, {
  credentials: 'include',  // MANDATORY for authenticated requests
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

- `API_BASE_URL` = `window.location.origin`(같은 출처). 개발은 Vite, 운영은 `server.mjs` 가 `/api/` 를
  `AOP_BACKEND_URL`(기본 `http://localhost:5000`)로 프록시하므로 **CORS 불필요**
- **Never redeclare the base URL** — 특히 `'http://localhost:5000'` 하드코딩 금지(`localhost` 는 접속한 사용자 PC)
- 프록시 없이 백엔드를 직접 호출해야 할 때만 `VITE_API_BASE_URL` 지정(백엔드 `ALLOWED_ORIGINS` 필요)
- 백엔드가 꺼지면 프록시가 502 를 준다 → `AuthContext` 가 502~504 를 offline 으로 처리한다
- Handle loading/error states; parse `response.json()` before showing errors

---

## DataViewer Component

- **Cascaded filter**: exclude current column's filter when computing dropdown options
- **Number format**: `XP_Value_*` → 2 decimals, others → 4 decimals
- **CSV export**: BOM prefix (`'\uFEFF'`) for Excel
- **Sticky**: header `top: 0`, filter row `top: 38px`

---

## Accessibility & Design (WCAG 2.2 AA)

> 감사 절차·체크리스트: `.github/skills/web-design-review/SKILL.md`

- **Contrast**: text ≥ 4.5:1, UI borders/focus ≥ 3:1 in both themes — compute from the actual HEX, don't eyeball.
- **Focus**: never `outline: none` alone. Use `outline: 2px solid var(--border-focus); outline-offset: 2px`.
- **Clickable `div`** → `role="button"` + `tabIndex={0}` + Enter/Space `onKeyDown` (or use `<button type="button">`).
- **Icon-only buttons** need `aria-label`; decorative icons get `aria-hidden="true"`. `title` alone is not an accessible name.
- **Brand surfaces** use `var(--on-brand)` for text/icons; shadows/radius use `--shadow-*` / `--radius-*` tokens.
- **Bootstrap `.btn-close`** is inverted for dark mode in `globals.css` — do not add `btn-close-white`.
- 알림·확인은 `lib/dialog.jsx` 만 쓴다(`window.alert`/`confirm` 금지).

---

## Performance

- 페이지는 `lazy` 로 분리, 무거운 라이브러리(chart.js 등)는 그 페이지에서만 import → 첫 화면 번들에 들어가지 않는다
- `vite.config.mjs` 의 `VENDOR_GROUPS` 가 react·chart·기타 라이브러리를 별도 청크로 나눈다(배포 후에도 캐시 유지)
- 운영 서버는 `/assets/*`(해시 이름)를 1년 `immutable` 캐시, `index.html` 은 `no-cache` + ETag

---

## Do Not Simplify Away

- `index.html` 의 테마 인라인 스크립트 → 다크 테마 깜빡임 방지
- `server.mjs` 의 경로 이탈 검사·SPA fallback(확장자 있는 주소는 404) → 보안·직접 접근
- `window.opener` / popup patterns in auth → login opens in popup window

---

## ⚠️ Top 5 Costly Mistakes

1. **JSX 를 `.js` 파일에 작성** → 빌드 에러 (see: Coding Standards)
2. **`credentials: 'include'` 누락** → 401 에러 (see: API Communication)
3. **하드코딩 색상** → 다크모드 깨짐 (see: Theming)
4. **`ROUTES` 등록 누락** → 새 화면이 404 (see: Add a Page)
5. **API 주소 하드코딩** → 원격 사용자 전원 로그인 실패 (see: API Communication)

---

## 🔍 Diagnostic Flow

```
문제 발생
  ├─ 빌드 에러 "Unexpected JSX"? → 파일 확장자 .jsx 확인
  ├─ 새 화면이 404? → App.jsx ROUTES 등록 확인
  ├─ "서버에 연결할 수 없습니다"(502)? → 백엔드 5000 기동·AOP_BACKEND_URL 확인
  ├─ 401 Unauthorized? → fetch의 credentials: 'include' 확인
  ├─ 다크모드 깨짐? → CSS 변수 사용 여부 → [data-theme="dark"] 선택자 확인
  ├─ 다른 PC 에서 개발 서버 403(Blocked request)? → IP 또는 이 PC 이름으로 접속(다른 호스트명은 vite allowedHosts)
  └─ 배포 후 화면이 안 바뀜? → npm run build 후 운영 서버 재기동(AOP_Web.bat restart)
```
