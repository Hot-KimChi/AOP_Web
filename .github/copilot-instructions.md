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
| 프로젝트 구동/배포/실행 | `README.md`, `scripts/AOP_Web.ps1` |
| 디버깅/오류 분석 | `.github/instructions/verification.instructions.md` |
| 서브에이전트/병렬 작업 | `.github/instructions/agent-orchestration.instructions.md` |
| **동작 변경을 수반하는 모든 작업** | `.github/instructions/model-routing.instructions.md` |

> 위 표의 파일은 **해당 작업일 때만** 연다. 라우터를 읽었다고 전부 열지 않는다. 불필요한 로딩은 그대로 지연이 된다.

### 컨텍스트 윈도우 관리

- **필요한 것만 로드** — AGENTS.md + 대상 파일을 찾으면 구현 시작
- **불확실할 때만** 주변 모듈 추가 읽기
- 3개 이상 파일을 연속 읽어야 하면 → 먼저 가설을 세우고 검증 대상만 선별
- 대화가 길어지면 `/compact`로 컨텍스트 정리

---

## 4. Workflow: Design → Implement → Verify

> **Design·Implement는 Claude Opus 최신, Verify는 GPT 최신 서브에이전트에 위임한다.**
> 계열이 바뀌는 지점은 Verify 하나뿐이며, 그 이유는 **자기 검증의 맹점 제거**다.
> 모델 ID·승격 기준·iteration 규칙: **`.github/instructions/model-routing.instructions.md`**

- **승격된 Verify는 GPT 서브에이전트가 수행한다** — 구현자와 같은 모델이 검증하면 같은 추론 오류를 그대로 통과시킨다. (예외: 해당 계열 모델이 없을 때)
- 교차 검증은 **위험도로 승격**한다(인증·SQL·데이터 손실·구동 스크립트·확신 없는 변경). 파일 수로 판단하지 않는다. **필수 조건은 생략 조건보다 우선**한다.
- 완료 조건은 **`Blocker 0 AND Major 0`**. 미해결 시 커밋하지 않고 보고한다.

### 4.1 작업 등급(Tier) — **착수 전에 먼저 정한다**

> 파이프라인을 **모든 요청에 풀로 돌리는 것이 지연의 최대 원인**이다.
> 실측(v0.9.62 §진단): 전수 리뷰 1턴 = 91.8분 / 메인 API 콜 317회, 반면 국소 작업 1턴 = 0.9분 / 8회.
> **메인 모델 도구 호출 1회 ≈ 11초.** 호출 10회를 줄이면 체감 2분이 줄어든다.

| Tier | 판정 기준 | 탐색 | Design | **자체** 검증 깊이 | 도구 호출 예산 |
|------|-----------|------|--------|--------------------|----------------|
| **S (즉답)** | 조회·설명·문서·오타·단일 파일 국소 수정 | 최대 3콜 | 생략 | 타깃 확인 1회 | **≤ 10** |
| **M (표준)** | 기능 추가·버그 수정·리팩터 (기본값) | 가설 후 선별 | 3~5줄 요약 | 타깃 테스트 + 빌드 | **≤ 40** |
| **L (심층)** | 전수 리뷰·아키텍처 변경·"전체/완벽하게" 명시 | 병렬 서브에이전트 | 정식 | 전체 테스트 + 빌드 | **≤ 120** |

> ⚠ **위 표는 교차 검증(Verify 위임) 여부를 정하지 않는다.**
> **교차 검증 승격은 Tier 와 무관하게 위험도 단독으로 판정**한다(인증·세션·시크릿, SQL·데이터 손실, 공용 API 계약, 동시성, 구동 스크립트, 확신 없는 변경).
> **Tier S 의 한 줄짜리 인증 수정이나 `AOP_Web.ps1` 수정도 교차 검증 필수다.**
> Tier 가 정하는 것은 **탐색 깊이·Design 서술·자체 검증 깊이·도구 호출 예산·적용 라운드 상한**이며, **교차 검증 승격은 절대 포함하지 않는다.**
> 판정 기준: `.github/instructions/model-routing.instructions.md` §3

- **기본은 Tier M.** Tier L 은 사용자가 "전체·완벽하게·전수" 등을 **명시**했을 때만 올린다.
- **Tier L 착수 전 예상 소요를 먼저 고지**한다(예: "전수 리뷰라 60~90분 예상"). 사용자가 범위를 줄일 기회를 준다.
- 예산을 넘기면 **더 파지 말고 멈춘다** → 접근법 재검토 or 중간 결과 보고 후 사용자 확인.
- **재조정 규칙**
  - 금지: "이왕 하는 김에" 식 **범위 확장에 의한 승격** — 요청 이탈이자 지연 원인이다.
  - 허용(오히려 필수): 작업 중 **실제 범위나 위험이 초기 추정을 넘었다는 증거**가 나오면 상향한다.
    (예: 한 줄 수정인 줄 알았는데 공용 훅이라 6개 화면에 영향 / 인증 경로임이 드러남)
    이때 **요청 범위는 그대로 두고 검증 강도만 올리며**, 예산이 크게 늘면 사용자에게 알린다.
  - 하향은 언제든 가능하다.

### 4.2 지연 예산 (Latency Budget) — 요약

> 상세 기법·안티패턴 표: `.github/instructions/agent-orchestration.instructions.md` §지연 최적화

1. **콜 수 줄이기** — 독립 작업(읽기·편집·에이전트)은 **한 응답에 전부** 묶는다.
2. **컨텍스트 줄이기** — 큰 파일은 `view_range`·`grep`으로 구간만, diff 는 `--stat` 선행. Tier L 착수 전 `/compact`.
3. **중복 조사 금지** — 이미 읽었거나 서브에이전트가 보고한 내용을 재확인하지 않는다.
4. **대기 시간 0** — Verify 는 `background` 로 띄우고 즉시 무관한 작업을 진행. 폴링 금지.
5. **경량 위임** — 탐색·빌드·테스트 실행은 경량 모델 에이전트로.

---

## 5. Agent & Tool Orchestration

> 에이전트·도구 운용: `.github/instructions/agent-orchestration.instructions.md`
> 모델 배정·iteration: `.github/instructions/model-routing.instructions.md`

---

## 6. Change Log

코드/동작 변경 시 최종 단계에서 기록:

- **`docs/AI_Rearch_summary.md`** — 요청 한 줄 + 해결 사항 간략. Detail 링크 포함
- **`docs/AI_Rearch_detail.md`** — 변경 상세 (무엇을, 왜, Before/After). Summary 링크 포함

---

## 7. 자동 커밋 정책 (필수)

> **모든 수정은 완료·검증 후 자동으로 git 커밋한다.** 사용자가 명시적으로 "커밋하지 마"라고 한 경우만 예외.

### 커밋 시점
- 하나의 논리적 변경(기능 추가/버그 수정/리팩터링/문서 갱신)이 완료되고 검증(빌드·tsc·테스트 등)까지 끝나면 **즉시 커밋**
- 논리적 변경 1건 = 커밋 1건. 서로 무관한 변경을 한 커밋에 섞지 않는다
- Change Log(`docs/AI_Rearch_*.md`) 갱신을 포함해 같은 커밋에 담는다

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
