# Agent Orchestration & Harness Engineering

> 서브에이전트 선택, 모델 배정, 병렬 실행, 도구 우선순위, 스킬 활용 가이드
> **스텝별 모델 분담(Design/Implement=Opus, Verify=GPT)은 `model-routing.instructions.md`가 기준이다.**

---

## 서브에이전트 선택 매트릭스

| 상황 | 에이전트 | 모델 오버라이드 | 이유 |
|------|----------|----------------|------|
| **변경 검증 (Verify 스텝)** | `task` / `general-purpose` | **GPT 최신** | 구현자와 다른 계열 → 교차 검증 |
| **보안·인증·SQL 경로 검증** | `security-review` | 기본 | Verify와 **병렬** 실행 |
| 비자명 설계 결정, 구현 전 검증 | `rubber-duck` | Claude Opus 최신 | 블라인드 스팟 사전 탐지 |
| 복잡한 다단계 작업 위임 | `general-purpose` | Claude Opus 최신 | 전체 도구셋 + 고품질 추론 |
| 대규모 코드베이스 병렬 탐색 (3+ 독립 질문) | `explore` | 기본(경량) | 병렬·저비용 탐색 |
| 빌드/테스트/린트 실행 | `task` | 기본(경량) | 성공 시 한 줄, 실패 시 상세 |
| diff 중심 리뷰 | `code-review` | GPT 최신 | 버그/보안만 서핑 |

> **구체적 모델 ID·선택 알고리즘·`reasoning_effort` 기준은 `model-routing.instructions.md` §2가 단일 기준이다.** 여기에 ID를 중복 기재하지 않는다.
> 탐색·빌드 같은 **기계적 작업에 상위 모델을 쓰지 않는다.** 비용만 늘고 품질 이득이 없다.
> 상위 모델은 **설계 판단**과 **교차 검증**에만 투입한다.

### 사용 예시

```
# Verify 스텝: 구현 후 GPT 최신 모델로 교차 검증
#   background로 띄우고, 메인은 검증 대상과 무관한 작업(Change Log 초안 등)만 진행
→ task(agent_type="task", model=<GPT 최신>, reasoning_effort="high", mode="background")

# 고위험 변경(인증·SQL·시크릿): 한 턴에 2개 동시 실행
→ task(<GPT 최신>, 기능·회귀 검증) + security-review(보안)

# 설계 검증: 새 API 엔드포인트 추가 전
→ rubber-duck(<Opus 최신>)에 설계안 전달 → 피드백 반영 → 구현
```

---

## 멀티턴 에이전트 운용

- `mode="background"`로 띄웠으면 **폴링하지 말고** 독립 작업을 진행한다. 완료 알림이 자동으로 온다.
  대기할 게 없으면 "검증 대기 중"이라고 알리고 턴을 종료한다.
- 서브에이전트는 **stateless** — 첫 프롬프트에 배경·요구사항·불변식·이미 확인된 사실을 모두 담는다.
- **후속 요청은 새 에이전트가 아니라 `write_agent`로** 같은 에이전트에 이어서 보낸다. 새로 띄우면 직전 맥락이 사라진다.
- 검증 iteration의 라운드 상한·실패 모드 대응: `model-routing.instructions.md` §5~6

---

## 병렬 도구 호출 규칙

1. **독립 작업은 반드시 한 턴에 묶는다**
   - 3개 파일 읽기 → view 3회를 한 response에
   - 서로 다른 파일 편집 → edit 여러 개를 한 response에
   - 독립 검증 에이전트 2개 → 한 response에
2. **의존 관계 있으면 순차** — 이전 결과가 다음 파라미터에 필요한 경우만
3. **PowerShell은 `;`로 체인** — `&&`는 PowerShell 키워드(`if`, 변수 할당) 앞에서 동작하지 않는다

---

## 도구 선택 우선순위

```
코드 검색: grep/glob > PowerShell (Select-String 사용 금지)
파일 읽기: view > PowerShell (Get-Content 사용 금지)
파일 탐색: glob > PowerShell (Get-ChildItem 사용 금지)
라이브러리 문서: context7 MCP > web_fetch
브라우저 테스트: playwright MCP
```

---

## MCP 서버 활용

| MCP | 용도 | 언제 사용 |
|-----|------|----------|
| `context7` | 라이브러리/프레임워크 공식 문서 조회 | API 사용법 불확실할 때 |
| `playwright` | 브라우저 자동화, UI 테스트 | 프론트엔드 동작 확인 필요 시 |
| `github` (내장) | 이슈/PR/Actions/코드 검색 | GitHub 리소스 조회 시 |

---

## 스킬 (`.github/skills/`) — 실제 보유 목록

| 스킬 | 언제 쓰나 |
|------|----------|
| `security-review` | 보안 취약점 스캔. **Verify 스텝에서 보안 경로 변경 시 병렬 실행** |
| `sql-code-review` | SQL 보안·표준·안티패턴 리뷰 (`backend/routes/db_api.py` 등 변경 시) |
| `sql-optimization` | 쿼리 튜닝·인덱스·실행계획 분석 |
| `playwright-explore-website` / `playwright-generate-test` | 프론트엔드 동작 확인·E2E 테스트 생성 |
| `acquire-codebase-knowledge` | 저장소 전체 매핑·온보딩 문서화 (명시 요청 시에만) |
| `make-skill-template` | 새 스킬 생성 |
| `suggest-awesome-github-copilot-*` | agents/instructions/skills 최신화 제안 |

- `/skills` — 스킬 확인 · `/mcp` — MCP 상태 · `/compact` — 컨텍스트 정리
- `/fleet` — 병렬 서브에이전트 모드 (대규모·독립 작업 다발 시)
- 스킬이 요청에 명확히 대응되면 **다른 응답보다 먼저 호출**한다.

---

## 에러 복구 전략

| 실패 유형 | 대응 |
|-----------|------|
| 빌드/테스트 실패 | 에러 메시지 분석 → 원인 파일 특정 → 수정 → 재실행 |
| Verify가 Blocker·Major 보고 | Implement(Opus)가 수정 → `write_agent`로 재검증 (규칙: `model-routing.instructions.md` §5) |
| 구현자와 검증자 결론 충돌 | **증거 우선(Evidence Wins)** — 최소 재현 테스트를 만들어 실행 결과로 판정 (§5) |
| 접근 불가 파일 | 경로 확인 → 대안 경로 탐색 → 필요 시 사용자에게 질문 |
| 반복 실패 (3회+) | `rubber-duck`(Opus)에 전체 맥락 전달 → 대안 접근법 도출 |
| 서브에이전트가 0턴/무의미 출력 | 재실행하지 말고 **즉시 직접 수행**으로 전환 |
| 컨텍스트 윈도우 부족 | `/compact` 실행 → 핵심만 남기고 재시작 (`todos` 테이블로 진행 스텝 복구) |
