# GitHub Copilot Instructions

> **이 파일은 라우터(map)이다.** 세부사항은 AGENTS.md와 .instructions.md 파일에 있다.
> 구체적 지침이 일반 지침보다 우선. 안전/보안 불변식은 항상 최우선.

---

## 1. Core Principles

- Priority: **Correctness > Safety > Maintainability > Performance**
- Behave as a **senior engineer** — no speculative or redundant code
- **예시(example) > 추상적 원칙** — 구체적 코드 패턴으로 설명

### 🚨 언어 규칙 (MANDATORY — 예외 없음)

- **모든 출력은 반드시 한글(Korean)로 작성:**
  - 사용자 응답, 설명, 요약
  - `report_intent` (진행 상태 표시) — 예: `"코드베이스 탐색"`, `"테스트 실행 중"`, `"CSS 수정 중"`
  - 커밋 메시지의 본문 (Co-authored-by 트레일러 제외)
- **영어 사용 금지** (코드, 변수명, 기술 용어 인용은 예외)

---

## 2. Technology Stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.10+, Flask, SQLAlchemy, pyodbc |
| Frontend | Next.js 15 (App Router), React 18, JavaScript (JSX) |
| Database | MS-SQL Server (ODBC Driver 17) |

---

## 3. Context Loading (Progressive Disclosure)

### 라우팅 규칙

| 변경 대상 | 먼저 읽을 파일 |
|-----------|---------------|
| `backend/**` | `backend/AGENTS.md` |
| `frontend/**` | `frontend/AGENTS.md` |
| 프로젝트 구동/배포/실행 | `README.md`, `AOP_Web.ps1` |
| 디버깅/오류 분석 | `.github/instructions/verification.instructions.md` |
| 서브에이전트/병렬 작업 | `.github/instructions/agent-orchestration.instructions.md` |

### 컨텍스트 윈도우 관리

- **필요한 것만 로드** — AGENTS.md + 대상 파일을 찾으면 구현 시작
- **불확실할 때만** 주변 모듈 추가 읽기
- 3개 이상 파일을 연속 읽어야 하면 → 먼저 가설을 세우고 검증 대상만 선별
- 대화가 길어지면 `/compact`로 컨텍스트 정리

---

## 4. Workflow: Plan → Implement → Verify

1. **Plan** — 요구사항 명확화, 범위 확정. 비자명 작업은 `rubber-duck` 에이전트로 검증
2. **Implement** — 가장 단순한 정확한 해결책
3. **Verify** — `.github/instructions/verification.instructions.md` 체크리스트 수행. 문제 시 1로 복귀

---

## 5. Agent & Tool Orchestration

> 상세: `.github/instructions/agent-orchestration.instructions.md`

---

## 6. Change Log

코드/동작 변경 시 최종 단계에서 기록:

- **`AI_Rearch_summary.md`** — 요청 한 줄 + 해결 사항 간략. Detail 링크 포함
- **`AI_Rearch_detail.md`** — 변경 상세 (무엇을, 왜, Before/After). Summary 링크 포함

---

## 7. 자동 커밋 정책 (필수)

> **모든 수정은 완료·검증 후 자동으로 git 커밋한다.** 사용자가 명시적으로 "커밋하지 마"라고 한 경우만 예외.

### 커밋 시점
- 하나의 논리적 변경(기능 추가/버그 수정/리팩터링/문서 갱신)이 완료되고 검증(빌드·tsc·테스트 등)까지 끝나면 **즉시 커밋**
- 논리적 변경 1건 = 커밋 1건. 서로 무관한 변경을 한 커밋에 섞지 않는다
- Change Log(`AI_Rearch_*.md`) 갱신을 포함해 같은 커밋에 담는다

### 스테이징 규칙 (안전)
- **내가 이번에 변경한 파일만 명시적으로 `git add`** — `git add .` / `git add -A` 금지
- Do-Not-Touch/생성물은 절대 스테이징 금지: `logs/`, `1_uploads/`, `.next/`, `__pycache__/`, `node_modules/`, `backend/.venv/`, `backend/ML_Models/`, `*.pyc`
- 시크릿·자격증명·`.env*` 파일은 커밋 금지
- 커밋 전 `git status --short`로 스테이징 대상을 확인

### 커밋 메시지 (한글 필수)
- **제목**: 한글 요약 한 줄 (50자 내외). 접두사 권장 — `기능:`, `수정:`, `리팩터:`, `문서:`, `성능:`, `스타일:`
- **본문**: 무엇을·왜 변경했는지 한글로 2~4줄. 필요 시 Before/After
- 마지막 줄에 트레일러 포함:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

### 커밋 예시
```
성능: 데이터 뷰어 연쇄필터 Set 기반 최적화

행마다 반복하던 필터값 정규화를 컬럼별 Set 1회 생성으로 변경해
O(1) 조회로 전환. 4000행 기준 약 32배 개선.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## 8. Do-Not-Touch Zones

- `logs/`, `1_uploads/`, `.next/`, `__pycache__/`, `node_modules/`
- `backend/.venv/`, `backend/ML_Models/`
- `*.lnk`, `*.bat` (unless explicitly requested)
