# Frontend (React + Vite) Architecture Map & Rules

> `frontend-vite/` 아래 파일을 수정하기 전에 읽는다. Next.js 버전(`frontend/`)과 **화면 코드는 동일**하고, 껍데기(라우팅·진입점·빌드)만 다르다.

---

## Coding Standards

- JavaScript + JSX. JSX가 들어간 파일은 **반드시 `.jsx`** (Vite 8/oxc는 `.js` 안의 JSX를 해석하지 않는다)
- `'use client'` 는 Vite에서 의미가 없다(원본과 diff 비교를 위해 남겨 둔 것). 새 파일에는 쓰지 않는다
- Next 전용 import(`next/*`) 금지 → `react-router-dom` 사용

| Next.js | React + Vite |
|---|---|
| `app/**/layout.js` + `metadata` | `src/App.jsx` 의 `ROUTES` 표 (`title`, `wrap`) |
| `<Link href>` | `<Link to>` |
| `useRouter().push()` | `useNavigate()()` |
| `usePathname()` | `useLocation().pathname` |
| `useSearchParams()` | `const [sp] = useSearchParams()` |
| `dynamic(..., { ssr:false })` | 불필요(SSR 없음) |
| `NEXT_PUBLIC_*` / `process.env` | `VITE_*` / `import.meta.env` |

---

## File Structure

```
frontend-vite/
├── index.html            # 테마 깜빡임 방지 인라인 스크립트 + #root
├── vite.config.mjs       # 포트 3001, /api 프록시(→ AOP_BACKEND_URL, 기본 http://localhost:5000)
└── src/
    ├── main.jsx          # bootstrap → globals.css → BrowserRouter → App
    ├── App.jsx           # 라우트 표(ROUTES): path·title·Page(lazy)·wrap(Layout/PopupLayout/Standalone)
    ├── components/       # Layout.jsx(AuthProvider+Navbar+AuthGate), PopupLayout.jsx, Navbar.jsx …
    ├── lib/              # apiBase.jsx, dialog.jsx, loginPopup.jsx …
    └── app/**/page.jsx   # 화면(원본 frontend/src/app 과 동일 구조)
```

---

## Add a Page

1. `src/app/<route>/page.jsx` 작성
2. `src/App.jsx` 의 `ROUTES` 에 `{ path, title, Page: lazy(...), wrap }` 한 줄 추가
3. 네비 항목은 `Navbar.jsx` 의 `menuItems`

---

## Theming

- Selector `[data-theme="dark"]`, storage key `'aop-theme'`, CSS 변수만 사용(하드코딩 색 금지)
- 깜빡임 방지 스크립트는 `index.html` `<head>` 에 있다 — 제거·이동 금지

---

## API Communication

```javascript
import { API_BASE_URL } from '<relative>/lib/apiBase';
await fetch(`${API_BASE_URL}/api/endpoint`, { credentials: 'include', ... });
```

- `API_BASE_URL` = `window.location.origin`(같은 출처). Vite 서버(dev·preview)의 `/api` 프록시가 백엔드로 전달하므로 **CORS(ALLOWED_ORIGINS) 불필요**
- 백엔드를 직접 호출해야 하면 `VITE_API_BASE_URL` 지정(이 경우 백엔드 CORS 허용 필요)
- 기본 URL 재선언 금지, `credentials: 'include'` 필수

---

## Accessibility & Design

`frontend/AGENTS.md` 의 WCAG 2.2 AA 규칙을 그대로 따른다.

---

## 🔍 Diagnostic Flow

```
문제 발생
  ├─ "Unexpected JSX expression"? → JSX 파일 확장자가 .jsx 인지 확인
  ├─ 새로고침 시 404? → vite preview/정적 서버의 SPA fallback 확인
  ├─ API 실패(네트워크)? → vite.config.mjs proxy 대상(AOP_BACKEND_URL)·백엔드 5000 기동 확인
  └─ 401? → credentials: 'include'
```
