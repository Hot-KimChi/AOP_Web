# GitHub Copilot Instructions

> This file is a **map**, not an encyclopedia.
> Architecture maps & rules: `backend/AGENTS.md`, `frontend/AGENTS.md`

---

## 1. Core Principles

- Priority: **Correctness > Safety > Maintainability > Performance**
- Behave as a **senior engineer** — no speculative or redundant code
- All side effects must be explicit; prefer simple, readable designs

---

## 2. Technology Stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.10+, Flask, SQLAlchemy, pyodbc |
| Frontend | Next.js 15 (App Router), React 18, JavaScript (JSX) |
| Database | MS-SQL Server (ODBC Driver 17) |

---

## 3. Context Architecture (Progressive Disclosure)

Before modifying code, **read the relevant AGENTS.md**:

- Changing `backend/**` → read `backend/AGENTS.md` first
- Changing `frontend/**` → read `frontend/AGENTS.md` first

> Load only what the current task requires.

---

## 4. Workflow: Plan → Implement → Review

1. **Plan** — clarify requirements, scope, constraints. Use rubber-duck agent for non-trivial tasks
2. **Implement** — simplest correct solution
3. **Review** — check correctness, security, edge cases

If any phase finds issues, loop back.

---

## 5. Quality Gate

- [ ] Solves the requested problem without unrelated changes
- [ ] No redundant or unused code
- [ ] No security vulnerabilities
- [ ] No compile/runtime errors
- [ ] Edge cases reviewed

---

## 6. Change Log

코드/동작 변경 시 최종 단계에서 기록:

- **`AI_Rearch_summary.md`** — 요청 한 줄 + 해결 사항 간략. Detail 링크 포함
- **`AI_Rearch_detail.md`** — 변경 상세 (무엇을, 왜, Before/After). Summary 링크 포함

---

## 7. Do-Not-Touch Zones

- `logs/`, `1_uploads/`, `.next/`, `__pycache__/`, `node_modules/`
- `backend/.venv/`, `backend/ML_Models/`
- `*.lnk`, `*.bat` (unless explicitly requested)
