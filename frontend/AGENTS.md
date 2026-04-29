# Frontend Architecture Map & Rules

> Read this before modifying any file under `frontend/`.

---

## Coding Standards

- JavaScript (JSX) dominant; TypeScript acceptable for new files
- All pages/components **must** declare `'use client'`
- Small, composable components. No duplicated logic or unused hooks

---

## File Structure

```
frontend/src/
├── globals.css           # CSS variables (:root + [data-theme="dark"])
├── components/
│   ├── Layout.js         # Navbar + main wrapper (dynamic, ssr: false)
│   ├── Navbar.js         # Navigation, auth check, theme toggle
│   ├── ThemeInit.js      # Applies saved theme on mount (renders null)
│   └── DataViewer.js     # Table: cascaded filters, sort, CSV export
└── app/
    ├── (home)/           # Landing page
    ├── auth/login/       # Login (popup window)
    ├── viewer/           # DB browser
    ├── data-view/        # Data editor (custom hooks, editable cells)
    ├── measset-generation/  # Measurement set generation
    ├── machine-learning/    # ML training, scoring charts
    ├── verification-report/ # TX summary extraction
    └── SSR_DocOut/       # Export to Word
```

---

## Layout Stack (order is mandatory)

```jsx
<html lang="en" suppressHydrationWarning>
  <body>
    <script dangerouslySetInnerHTML={{...}} />  {/* 1. Theme flash prevention */}
    <ThemeInit />                               {/* 2. Re-apply after hydration */}
    <Layout>{children}</Layout>                 {/* 3. Navbar + content */}
  </body>
</html>
```

Do not reorder. Inline script must execute before React hydration.

---

## Theming

- Selector: `[data-theme="dark"]` — not `.dark`
- Storage key: `'aop-theme'` (values: `'dark'` / `'light'`)
- Use CSS variables only (`var(--bg)`, `var(--surface)`, `var(--text)`, etc.) — **no hardcoded colors**
- Definitions: see `src/globals.css` `:root` and `[data-theme="dark"]`
- Chart.js: use `isDark` parameter factory functions
- Bootstrap overrides require `!important`

---

## API Communication

```javascript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
const res = await fetch(`${API_BASE_URL}/api/endpoint`, {
  credentials: 'include',  // MANDATORY for authenticated requests
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

- `NEXT_PUBLIC_` prefix required for browser env vars
- Handle loading/error states; parse `response.json()` before showing errors

---

## DataViewer Component

- **Cascaded filter**: exclude current column's filter when computing dropdown options
- **Number format**: `XP_Value_*` → 2 decimals, others → 4 decimals
- **CSV export**: BOM prefix (`'\uFEFF'`) for Excel
- **Sticky**: header `top: 0`, filter row `top: 38px`

---

## Common Tasks

- **Add page**: `src/app/route-name/page.js` + `layout.js`, copy layout stack
- **Add nav item**: `Navbar.js` menuItems array (auth-gated)
- **Style component**: CSS variables from `globals.css` + `[data-theme="dark"]` overrides
- **Add API call**: `API_BASE_URL` + `credentials: 'include'`

---

## Do Not Simplify Away

- `dynamic(() => ..., { ssr: false })` on Layout.js → prevents hydration mismatch
- `suppressHydrationWarning` → inline theme script modifies DOM before React
- `window.opener` / popup patterns in auth → login opens in popup window

---

## ⚠️ Top 5 Costly Mistakes

1. **`'use client'` 누락** → 빌드 에러 (see: Coding Standards)
2. **`credentials: 'include'` 누락** → 401 에러 (see: API Communication)
3. **하드코딩 색상** → 다크모드 깨짐 (see: Theming)
4. **`.dark` 선택자 오용** → 테마 미적용 (see: Theming)
5. **Layout 순서 변경** → FOUC 발생 (see: Layout Stack)

---

## 🔍 Diagnostic Flow

```
문제 발생
  ├─ 흰 화면 (hydration error)? → Layout.js dynamic import 확인 → suppressHydrationWarning
  ├─ 401 Unauthorized? → fetch의 credentials: 'include' 확인 → 쿠키 도메인
  ├─ 다크모드 깨짐? → CSS 변수 사용 여부 → [data-theme="dark"] 선택자 확인
  ├─ 테마 깜빡임? → root layout의 inline script 존재 확인 → 순서 확인
  └─ 빌드 에러? → 'use client' 선언 → import 경로 → 환경변수 NEXT_PUBLIC_ 접두사
```
