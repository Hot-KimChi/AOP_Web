# Verification & Quality Gate

> 작업 완료 전 수행할 검증 체크리스트. 상세 규칙은 각 `AGENTS.md` 참조.

---

## 공통 체크리스트

- [ ] 요청한 문제만 해결 — 관련 없는 코드 수정 없음
- [ ] 중복/미사용 코드 없음
- [ ] 보안 취약점 없음 · 컴파일/런타임 오류 없음
- [ ] 기존 동작이 깨지지 않았는지 확인

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

## 검증 흐름

```
1. 변경 완료
   ↓
2. 관련 AGENTS.md의 불변식(invariant) 위반 여부 확인
   ↓
3. 위 스택별 체크 항목 수행
   ↓
4. 빌드/테스트 실행 가능하면 실행
   ↓
5. 문제 발견 시 → 수정 → 2번으로 복귀
   ↓
6. Change Log 기록
```
