# Verification & Quality Gate

> 작업 완료 전 수행할 검증 체크리스트. 상세 규칙은 각 `AGENTS.md` 참조.
> **위험도 기준으로 승격된 검증은 GPT 서브에이전트가 수행한다** — 승격 기준·모델 배정·iteration: `model-routing.instructions.md`

---

## 공통 체크리스트

- [ ] 요청한 문제만 해결 — 관련 없는 코드 수정 없음
- [ ] 중복/미사용 코드 없음
- [ ] 보안 취약점 없음 · 컴파일/런타임 오류 없음
- [ ] 기존 동작이 깨지지 않았는지 확인
- [ ] **엣지케이스: 결과 0건 / 1건 / 대량 / 실패 경로** — 특히 "1건일 때"는 언어 런타임의 단일값 언롤링·타입 변환 때문에 실제로 자주 깨진다
- [ ] **주장이 아닌 실행 증거로 확인** — "될 것이다"가 아니라 명령을 돌린 출력으로 판정

## 검증 강도 — Tier 에 맞춘다

> 모든 변경에 전체 스위트를 돌리는 것은 **지연의 주요 원인**이다. Tier 정의는 `copilot-instructions.md` §4.1.

| Tier | 최소 검증 | 비고 |
|------|-----------|------|
| **S** | 변경 지점을 직접 확인하는 명령 **1회** (렌더·출력·로그 대조) | 빌드·전체 테스트 생략 |
| **M** | 타깃 테스트 + 영향 범위 빌드 | 예: `npx playwright test -g "<케이스>"`, `npm run build` |
| **L** | 전체 테스트 + 빌드 + 서비스 재기동 확인 | `npm test` 전체 |

> ⚠ 위 표는 **메인이 직접 하는 자체 검증의 깊이**만 정한다.
> **GPT 교차 검증 위임 여부는 Tier 가 아니라 위험도가 단독으로 결정**한다 — Tier S 라도 인증·SQL·시크릿·구동 스크립트·확신 없는 변경이면 **필수**다(`model-routing.instructions.md` §3).

- **타깃 선택자를 먼저 쓴다.** 전체 실행은 타깃 결과가 모호하거나 공용 모듈을 건드렸을 때만.
- 타깃 검증이 **실패하거나 결과가 모호하면 즉시 상위 Tier 검증으로 승격**한다. 속도보다 정확성이 우선이다.

---

## Backend (Flask) 체크 항목

> 상세 규칙·코드 예시: `backend/AGENTS.md`

- [ ] Decorator 순서 유지 (`@handle_exceptions` → `@require_auth` → `@with_db_connection()`)
- [ ] SQL 파라미터화 (`?` placeholder) — f-string SQL 금지
- [ ] numpy 타입 → `.item()` 변환 후 cursor 전달
- [ ] `Config.load_config()` → `create_app()` 호출 순서

### 위험 변경 트리거

| 변경 대상 | 반드시 확인 |
|-----------|------------|
| `routes/auth.py` | JWT cookie, session 정리, CORS credentials |
| `routes/db_api.py` | SQL 파라미터화, 테이블명 allowlist |
| `config.py` | `load_config()` 호출 시점 |
| `utils/decorators.py` | decorator 순서 불변식 |

---

## Frontend (Next.js) 체크 항목

> 상세 규칙·코드 예시: `frontend/AGENTS.md`

- [ ] `'use client'` 선언 확인
- [ ] `credentials: 'include'` 포함 확인
- [ ] CSS 변수만 사용 (하드코딩 색상 금지)
- [ ] `[data-theme="dark"]` 선택자 사용 (`.dark` 금지)

### 위험 변경 트리거

| 변경 대상 | 반드시 확인 |
|-----------|------------|
| root `layout.js` / `Layout.js` / `Navbar.js` | `frontend/AGENTS.md`의 Layout Stack · Do Not Simplify Away 불변식 재확인 |
| `globals.css` | `:root` + `[data-theme="dark"]` 양쪽 변수 정의 |
| API 호출 추가 | `API_BASE_URL` + `credentials: 'include'` |

---

## 실행 스크립트 (PowerShell/배치) 체크 항목

> 대상: `scripts/AOP_Web.ps1`, `AOP_Web.bat`

- [ ] 컬렉션 반환 함수 호출부는 `@()`로 배열 고정 — **1건일 때 스칼라 언롤링으로 `.Count`가 `$null`이 되는 버그 재발 방지** (v0.9.58)
- [ ] `$projectPath`는 `Split-Path -Parent $scriptPath` 기준 — `logs/`·`backend/`·`frontend/` 경로 해석 유지
- [ ] 배치는 `ERRORLEVEL`을 전파 — 항상 `exit /b 0` 금지 (작업 스케줄러가 실패를 감지해야 함)
- [ ] `timeout /t N /nobreak >nul`은 PowerShell에서 호출 시 `2>&1` 필요
- [ ] `start`/`stop`/`restart`/`status`를 **실제로 실행**해 확인하고, 검증 후 원래 상태로 복원

---

## 검증 흐름 (교차 모델)

```
[Implement 완료 · 스모크 테스트 실행 로그 확보]  ← Claude Opus
   ↓  (위험도 승격 기준 미해당이면 여기서 종료 — 생략 사실을 응답에 명시)
[Verify 서브에이전트 위임]  ← GPT (메인이 직접 하지 않음)
   입력: 요구사항 + 설계 의도 + 불변식 + diff + 실행 로그 + 이미 확인된 사실
   ├─ 관련 AGENTS.md 불변식 위반 여부
   ├─ 위 스택별 체크 항목
   └─ 엣지케이스·회귀·보안
   ↓
[리포트: Blocker / Major / Minor]
   ├─ Blocker·Major → Opus가 수정 → write_agent로 재검증
   └─ Minor → 기록만, 요청 범위 밖이면 수정하지 않음
   ↓
[Blocker 0 AND Major 0] → Change Log 기록 → 자동 커밋
```

> 승격 기준·모델 선택·iteration 상한·이견 해소: `.github/instructions/model-routing.instructions.md`
