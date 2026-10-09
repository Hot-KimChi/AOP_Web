# GitHub Copilot Instructions

> **이 파일은 라우터(map)이며 유일한 상시 로드 지침이다.** 세부사항은 AGENTS.md와 `.github/instructions/`에 있다.
> 구체적 지침이 일반 지침보다 우선. 안전/보안 불변식은 항상 최우선.
> 이 파일에는 **자주 바뀌는 값(모델 ID·날짜·실측치)을 넣지 않는다** — 안정적인 접두부여야 프롬프트 캐시가 적중한다.

---

## 1. Core Principles

- Priority: **Correctness > Safety > Maintainability > Performance**
- Behave as a **senior engineer** — no speculative or redundant code
- **예시(example) > 추상적 원칙** — 구체적 코드 패턴으로 설명

### 🚨 언어 규칙 (MANDATORY — 예외 없음)

- **모든 출력은 한글(Korean)**: 사용자 응답·설명·요약, `report_intent`(예: `"테스트 실행 중"`), 커밋 메시지 본문(트레일러 제외)
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

| 변경 대상 | 먼저 읽을 파일 |
|-----------|---------------|
| `backend/**` | `backend/AGENTS.md` |
| `frontend/**` | `frontend/AGENTS.md` |
| 프로젝트 구동/배포/실행 | `README.md`, `scripts/AOP_Web.ps1`, `verification.instructions.md` §실행 스크립트 |
| 디버깅/오류 분석 · 완료 전 체크리스트 · 훅 | `.github/instructions/verification.instructions.md` |
| 서브에이전트 위임 프롬프트 작성(JEV 봉투·표준 질문) | `.github/instructions/agent-orchestration.instructions.md` |
| Verify·Leader 위임, iteration, 이견 해소 | `.github/instructions/model-routing.instructions.md` |

- 위 파일은 **해당 작업일 때만** 연다(세 지침은 `applyTo`로 상시 로드 제외). 위임하지 않는 작업은 이 라우터만으로 충분하다.
- 큰 파일은 `grep -n` → `view_range`로 구간만, diff는 `--stat` 선행. 주변 모듈은 **불확실할 때만** 추가로 읽고, 3개 이상 연속 읽기 전에 가설부터 세운다. 대화가 길어지면 `/compact`.

---

## 4. Workflow — Tier별 레인

> `Leader → Design → Implement → Verify`는 **Tier L의 최대 경로**다. 모든 요청에 4단계를 태우면 지연만 는다.
> 모델: Leader·Verify = GPT 최신, Design·Implement = Claude Opus 최신(ID는 `model-routing` §2). Leader와 Verify는 **다른 에이전트**.
> **Tier는 착수 전에 먼저 정한다.**

| Tier | 판정 기준 | 레인 | 도구 호출 예산 |
|------|-----------|------|----------------|
| **S** | 조회·설명·문서·오타·단일 파일 국소 수정 | Implement → 자체 확인 1회 | ≤ 10 |
| **M** (기본) | 기능 추가·버그 수정·리팩터 | Design(3~5줄) → Implement → 타깃 테스트 + 빌드 → *(위험 시)* Verify | ≤ 40 |
| **L** | 전수 리뷰·아키텍처 변경·"전체/완벽하게" **명시** | Leader → Design → 설계 검토 → Implement → 전체 테스트 + 빌드 → *(위험 시)* Verify | ≤ 120 |

- **허브는 메인 에이전트다.** 서브에이전트는 격리된 하위 작업만 맡는다. 멀티에이전트는 토큰을 크게 늘리므로 필요할 때만.
- **Leader는 코드를 쓰지 않는 계획 자문역.** 기본은 메인이 대행하고 보고에 1줄. Tier L·분해가 자명하지 않으면 `model-routing` §2.1로 판정.
- **검증 우선순위: 실행 체크 → 교차 검증.** 1차는 결정론적 체크(훅 게이트·테스트·빌드), GPT Verify는 그것으로 확인되지 않는 판단용 2차 수단.
- **버그 수정은 재현 먼저(TDD)**: 실패하는 테스트·재현 명령 → 수정 → 같은 명령으로 통과 확인.
- **설계 검토(`rubber-duck`)는 구현 전에** — Tier L과 Tier 무관 **비자명 설계**에 적용한다(구현 후 재작업보다 싸다).
- Tier L은 착수 전 **예상 소요를 고지**한다. 예산을 넘기면 더 파지 말고 멈춰 → 접근법 재검토 또는 중간 보고 후 **사용자 확인**.
- 작업 중 **실제 범위·위험이 추정을 넘었다는 증거**가 나오면 **반드시 상향**한다(요청 범위는 그대로, 검증 강도만). 예산이 크게 늘면 사용자에게 알린다. 증거 없는 "이왕 하는 김에" 확장은 금지, 하향은 언제든.
- 완료 조건은 **`Blocker 0 AND Major 0`**. 미해결 시 커밋하지 않고 보고한다.

### 4.1 교차 검증(Verify) 필수 조건 — **단일 원천**

> **Tier와 무관하게 위험도 단독으로** 판정한다. 하나라도 해당하면 **필수**이며 생략 조건보다 우선한다. 한 줄짜리 수정도 예외 없다.

- 인증·권한·세션·쿠키(`credentials: 'include'` 포함) / 시크릿 취급
- SQL·DB 스키마·마이그레이션 / 데이터 삭제·덮어쓰기
- 공용 API 계약(요청·응답 스키마)
- 동시성·상태 전이·재시도
- 서비스 구동·배포 스크립트(`scripts/AOP_Web.ps1`, `AOP_Web.bat`) / 에이전트 훅(`.github/hooks/**`)
- 이 라우터 등 **상시 로드 지침** 변경
- 재현 방법이 불명확하거나 **확신 없는** 변경

→ 인증·SQL·시크릿 경로면 `security-review`를 병렬 추가. 승격하면 `model-routing` §5~6을 연다.
→ 생략(위 조건 미해당 + 문서·리네임·한두 명령으로 직접 확인 가능)했으면 응답에 한 줄로 밝힌다.

### 4.2 에이전트 소통 — JEV 형식

> JEV 모델을 호출하지 않는다. **형식(타입 질문 + 보정 확률)만 차용**한다. 상세: `agent-orchestration` §JEV

- 위임 프롬프트는 **`[GOAL] [CONTEXT] [ASK] [BUDGET]` 4블록**. `[ASK]`는 Choice/Score/Noul 타입 질문을 **한 번에 묶는다**.
- **`[PRIOR]`(내 예상)는 프롬프트에 넣지 않고 메인만 보관**(앵커링 방지).
- 회신은 질문당 1줄 `Q# | 값 | p | E=실행/코드/추론 | 근거`. E=추론이면 p ≤ 0.7, p ≤ 0.7은 `[RESIDUAL]`. 산문 단정 금지.

### 4.3 루프 규칙 (반복·종료)

- **루프당 한 항목.** 여러 항목은 순서대로 하나씩 끝낸다(구현 → 체크 → 커밋).
- **종료는 결정론적 게이트로 판정**한다. `agentStop` 훅(`.github/hooks/quality-gate.json`)이 변경된 `.py` 구문 오류를 턴 종료 전에 차단하며, 강제 연속은 1회까지(`stop_hook_active`).
- **검증 서브에이전트는 동시에 1개**(백프레셔 방지). 유일한 예외: 인증·SQL·시크릿 경로에서 Verify와 `security-review` 병렬(§4.1). 탐색·조사는 병렬 가능.
- **같은 실패가 2회 반복되면 루프를 멈추고** 접근법을 재검토한다(같은 조건 재시도 금지).

### 4.4 지연·토큰 예산

1. 독립 작업(읽기·편집·에이전트)은 **한 응답에 묶는다.** 도구 호출 수가 곧 지연이다.
2. 이미 읽었거나 서브에이전트가 보고한 내용을 재확인하지 않는다(수정 근거가 되는 Blocker·Major 지적의 타깃 확인은 예외).
3. Verify는 `background`로 띄우고 무관한 작업을 진행한다. 폴링 금지.
4. 탐색·빌드·테스트 실행은 경량 에이전트에, 출력은 요약·발췌만 받는다.

---

## 5. 학습 루프 — 교훈 승격 사다리

> 실패에서 배운 것을 **문장이 아니라 하네스로** 옮긴다. 지침은 건너뛸 수 있지만 훅은 매번 실행된다.

| 단계 | 조건 | 행동 |
|------|------|------|
| 1 | 실패·과잉확신 1회 (p ≥ 0.8인데 틀림 포함) | `Implementation_list.md`에 1줄 |
| 2 | 같은 유형이 **2회 재발** | 해당 영역 지침(AGENTS.md 또는 instructions)에 1줄 규칙 |
| 3 | **기계적으로 감지 가능** | 훅·스크립트·테스트로 승격하고 지침 문장은 제거 |

- 승격은 작업 완료 보고에 **제안**으로 적는다. 스킬을 자동 생성하지 않는다(품질 관리 불가).
- 라우터에는 **모든 세션에 필요한 규칙만** 올린다. 영역 한정 규칙은 해당 AGENTS.md로.

---

## 6. 작업 기록

- 작업 진행 내역은 **`Implementation_list.md`에만** 기록한다(`docs/AI_Rearch_*.md`에는 기록하지 않는다).

---

## 7. 자동 커밋 정책 (필수)

> **모든 수정은 완료·검증 후 자동으로 git 커밋한다.** 사용자가 "커밋하지 마"라고 한 경우만 예외.

- **시점**: 논리적 변경 1건이 검증까지 끝나면 즉시 커밋. 무관한 변경을 섞지 않는다. `Implementation_list.md` 갱신을 같은 커밋에 담는다.
- **스테이징**: 이번에 변경한 파일만 명시적으로 `git add`(`git add .`/`-A` 금지). 커밋 전 `git status --short` 확인.
  - 금지: `logs/`, `1_uploads/`, `.next/`, `__pycache__/`, `node_modules/`, `backend/.venv/`, `backend/ML_Models/`, `*.pyc`, 시크릿·`.env*`
- **메시지(한글)**: 제목 50자 내외 + 접두사(`기능:` `수정:` `리팩터:` `문서:` `성능:` `스타일:`), 본문 2~4줄(무엇을·왜), 마지막 줄 트레일러:
  ```
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

---

## 8. Do-Not-Touch Zones

- `logs/`, `1_uploads/`, `.next/`, `__pycache__/`, `node_modules/`
- `backend/.venv/`, `backend/ML_Models/`
- `*.lnk`, `*.bat` (unless explicitly requested)
