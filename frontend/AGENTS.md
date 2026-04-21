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
