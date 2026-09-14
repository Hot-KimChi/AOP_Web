# AOP_Web 변경 이력 상세 (Detail)

> 변경 상세: 무엇을, 왜, 어떻게 변경했는지. Before/After 비교 포함.
> 
> 📎 **[→ 변경 요약 (Summary)](./AI_Rearch_summary.md)**

---

## 변경 이력 (v0.9.67 — 2026-09-14)

### v0.9.67 — #1. 메인화면 엑셀 인라인 편집 모드 전환

**요청**: frontend 엑셀을 메인화면에 띄우는데, 새창에서 열기로 하면 수정이 되는데 새창에서 열기를 하지 않고, 메인화면에서 편집할 수 있게끔 수정. (Agent 재작성 명세 작성 후 진행)

#### 1) 문제 분석 및 원인
- `frontend/src/app/(home)/page.js`에서 iframe 임베드 주소(`WEEKLY_SCHEDULE_EMBED_URL`) 파라미터가 `action=embedview`로 설정되어 있어 읽기 전용 뷰어 모드로 렌더링되고 있었음.
- 새 창 열기 링크(`WEEKLY_SCHEDULE_URL`)는 기본 웹 편집기로 열려 수정이 가능했던 반면, 메인화면 임베드에서는 수정을 위해 외부 창으로 이동해야 하는 번거로움이 있었음.

#### 2) 해결 내용
- `WEEKLY_SCHEDULE_EMBED_URL`의 파라미터를 `action=embedview`에서 `action=edit`로 변경하여 메인화면 iframe 내에서 직접 셀 입력 및 실시간 편집/저장이 가능하도록 변경.
- `Layout.js` 버전 배지를 `v 0.9.67`로 갱신.

#### 3) 검증
- Playwright E2E 테스트 15건 전수 통과 (`cd frontend; npm test`).
- 비로그인 시 접근 차단 및 로그인 후 우측 개인 Todo 패널 레이아웃 등 기존 불변식 유지 확인.

---

## 변경 이력 (v0.9.66 — 2026-09-13)

### v0.9.66 — #1. 접속자별 로그인 권한과 사용자별 Todo

**요청**: 서버에 접속한 사람의 `selxxxxx` 를 확인해 로그인 권한을 따로 줄 수 있는가? 혹은 Windows 로그인 권한과 동일한 인증으로 로그인할 수 있는가? MS-SQL 은 Windows 인증으로 접속하니 같은 방식이면 유저별 todo list 출력도 가능할 것 같다.

#### 1) 인프라 실측 (추측 금지)

| 항목 | 실측값 | 확인 방법 |
|---|---|---|
| 서버 PC 도메인 가입 | **`DomainJoined : NO`** (Domain = `AAD005`, `PartOfDomain = False`) | `dsregcmd /status`, `Get-CimInstance Win32_ComputerSystem` |
| Entra ID 조인 | `AzureAdJoined : YES`, `AzureAdPrt : YES` | `dsregcmd /status` |
| 서버 PC Windows 계정 | `AD005\sel04327` — **selxxxxx 형식이 맞음** | `whoami`, `$env:USERNAME` |
| IIS | **미설치** | 기능 조회 |
| MS-SQL Windows 인증 접속 | **성공** (`SUSER_NAME() = AD005\sel04327`, sysadmin=1) | pyodbc `Trusted_Connection=yes` 실접속 |
| 현재 AOP 의 DB 접속 방식 | **SQL 인증** (`UID`/`PWD`) | `pkg_SQL/database.py:create_connection_string()` |
| 현재 로그인 사용자명 | `sel02776` 등 — **이미 selxxxxx 그 자체** | 로그인 폼 입력값 = DB 계정명 |

#### 2) 질문별 답

1. **"접속한 사람의 selxxxxx 를 확인할 수 있는가?"** → **이미 확인하고 있다.** 로그인 시 입력하는 DB 계정명이 곧 `selxxxxx` 이고 JWT 에 담겨 매 요청 검증된다. 다만 라우트에서 그 값을 꺼내 쓸 수 없어 사용자별 기능을 만들지 못하던 상태였다.
2. **"Windows 로그인 권한과 동일한 인증이 가능한가?"** → **현 구성에서는 불가.** 서버가 접속자의 Windows 신원을 *검증*하려면 AD 도메인 가입 + Kerberos(SPN)/NTLM 패스스루가 필요한데 이 서버는 `DomainJoined : NO` 이고 IIS 도 없다.
3. **"MS-SQL 이 Windows 인증으로 되는데 왜 웹은 안 되는가?"** → **방향이 반대다.** MS-SQL 접속은 서버가 *클라이언트로서* 자기 자격증명을 제시하는 것이고, 웹 SSO 는 서버가 *검증자로서* 남의 자격증명을 판정해야 한다. 또한 DB 접속을 Windows 인증으로 바꾸면 **모든 사용자가 서버 프로세스 계정(sysadmin) 권한으로 DB 에 붙어 사용자별 DB 권한이 사라진다** — 현행 SQL 인증이 더 안전하므로 유지했다.
   - 실현 경로(이번 범위 밖, IT 승인 필요): ① AD 도메인 가입 + IIS Windows 인증 리버스 프록시, ② Entra ID OIDC 앱 등록(`AzureAdPrt : YES` 라 브라우저는 이미 Entra SSO 상태)
4. **"유저별 todo list 출력이 가능한가?"** → **가능하며 구현했다.** 식별 기준은 AOP Web 로그인 계정 = `selxxxxx` 로, Windows 계정과 동일한 ID 체계다.

#### 3) 변경 내역

| 파일 | 변경 |
|---|---|
| `backend/utils/decorators.py` | `require_auth` 가 JWT 를 디코드해 **`g.current_user`** 에 username 저장(없으면 403). **매 요청 허용목록 검사** 후 미허용 시 403 |
| `backend/config.py` | `_parse_allowed_users()`, `Config.ALLOWED_USERS`(env `AUTH_ALLOWED_USERS`, 쉼표 구분·소문자 정규화·빈 값이면 무제한), `Config.is_login_allowed()`. `load_config()` 에서 재적용 |
| `backend/routes/auth.py` | `login()` 이 **자격증명 검증 후** 허용목록 판정 → 403. `auth_status()` 도 허용목록 확인 → `authenticated:false` + 쿠키 만료 |
| `backend/utils/todo_store.py` *(신규)* | SQLite(`backend/data/user_data.db`) 저장소. 모든 쿼리에 `owner = ?` 강제, owner 소문자 정규화, 제목 200자·사용자당 500건 상한, id 범위 검증 |
| `backend/routes/todo.py` *(신규)* | `GET/POST /api/todos`, `PATCH/DELETE /api/todos/<id>`. 소유자는 `g.current_user` 만 사용(클라이언트 입력 불신), 타인 항목은 **404** |
| `backend/app.py` | `todo_bp` 등록 |
| `frontend/src/components/TodoPanel.js` *(신규)* | 목록·추가·토글·삭제. `credentials: 'include'`, 낙관적 업데이트 + 실패 롤백, `pendingIds` 로 항목별 중복 요청 차단 |
| `frontend/src/app/(home)/page.js` | 로그인 뷰를 `.home-split` 2단(좌: 주간 일정, 우: 내 할 일)으로 변경. **비로그인 뷰는 미변경** |
| `frontend/src/globals.css` | `.home-split`, `.todo-*`, `.visually-hidden` 추가. CSS 변수만 사용, 900px 이하 세로 스택 |
| `.gitignore` | `backend/data/` 추가(사용자 데이터 비커밋) |

#### 4) 설계 결정과 이유

- **Todo 저장을 운영 MS-SQL 이 아닌 서버 로컬 SQLite 로** — 운영 측정 DB 에 앱 테이블을 만들면 DB 권한·백업·스키마 관리에 얽히고 되돌리기 어렵다.
- **타인 항목은 403 이 아니라 404** — 403 은 "그 id 는 존재한다"를 알려주는 정보 노출이다.
- **허용목록 판정은 자격증명 검증 *후*** — 먼저 판정하면 비밀번호를 모르는 사람이 계정의 권한 여부를 떠볼 수 있다.
- **owner 소문자 정규화** — SQL Server 로그인은 대소문자를 구분하지 않으므로, 정규화하지 않으면 `SEL02776` 과 `sel02776` 이 다른 사람이 된다.

#### 5) 검증

| 항목 | 결과 |
|---|---|
| 비로그인 `GET /api/todos` | 401 |
| 사용자 A·B 목록 격리 | OK (서로 보이지 않음) |
| B 가 A 항목 PATCH / DELETE | 404 / 404 |
| A 가 자기 항목 PATCH | 200 |
| `SEL02776` vs `sel02776` | 동일인 처리 |
| 빈 제목 / 200자 초과 / `done:"yes"` | 400 / 400 / 400 |
| 허용목록 미설정 / 비허용 / 대소문자 다른 허용 | 200 / 403 / 200 |
| 브라우저 UI(추가·토글·삭제·새로고침 유지·다크모드) | 정상 |
| `npm test` / `npm run build` | 15/15 / 성공 |

**GPT 교차 검증 (Blocker 0 / Major 1 · Minor 2 → 전건 수정 후 재실측 통과)**

| 지적 | 내용 | 수정 | 재실측 |
|---|---|---|---|
| MAJOR | 허용목록을 `login()` 에서만 검사해, **이미 발급된 JWT 는 목록에서 제외돼도 계속 통과** | `require_auth` 가 매 요청 검사 + `auth_status()` 가 쿠키 만료 | 제외 후 `GET`·`PATCH` **403**, `auth_status` → `authenticated:false` + 쿠키 만료 |
| MINOR | 64비트 초과 todo id → `OverflowError` → **500** | `_is_valid_id()` 범위 검사 후 없음 처리 | 100자리 id·`2**63` DELETE/PATCH 모두 **404** |
| MINOR | 같은 항목 연속 토글 시 응답 순서 역전으로 UI 가 서버 상태와 어긋남 | `pendingIds` 로 항목별 중복 요청 차단(입력 `disabled`) | 토글·삭제 진행 중 재클릭 불가 |

---
### v0.9.65 — #1. 로그인 실패: API 주소 자동 산출과 실패 원인 분류

**요청**: 로그인에 실패하였다. 원인 및 해결. 단 agent 재작성 명세를 먼저 남기고 진행.

#### 0) 원칙 — 추측하지 않고 재현부터 한다

"로그인이 안 된다"는 증상만으로는 비밀번호·DB·네트워크·프론트엔드 어디든 원인이 될 수 있다. 그래서 **재현 → 원인 특정 → 재발 방지** 순서를 고정하고, 각 단계를 측정값으로만 넘어갔다.

#### 1) 측정 — 어디까지 정상인가

| 확인 항목 | 결과 |
|-----------|------|
| DB 서버 도달성 | 정상 (0.5초 내 응답) |
| 백엔드 `/api/auth/login` 직접 호출 (실계정) | **200 성공**, `auth_token`·`session` 쿠키 발급 |
| 서버 PC 브라우저(`http://localhost:3000`) 로그인 | **6/6 성공** (평균 약 1.3초) |
| CORS 헤더 | 정상 (`allow-credentials=true`) |

즉 **인증 로직 자체는 멀쩡했다.** 실패는 "누가 어디서 접속하는가"에 달려 있었다.

#### 2) 원인 — `localhost` 는 서버가 아니라 접속자의 PC다

서버 IP 로 접속(`http://172.30.1.69:3000`)한 뒤, 접속자 PC 의 `localhost:5000` 을 차단해 **다른 PC 상황을 재현**했다. 결과는 로그인 카드에 `Unable to connect to the server.` 이고, 브라우저가 실제로 호출한 주소는 다음과 같았다.

```
http://localhost:5000/api/auth/status
http://localhost:5000/api/auth/login
```

원인은 프론트엔드 환경 변수였다.

| 파일 | 변경 전 값 | 실제 적용 여부 |
|------|-----------|----------------|
| `frontend/.env.development` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000` | **적용됨** (무인 자동 기동이 `npm run dev` 이므로) |
| `frontend/.env.production` | `NEXT_PUBLIC_API_BASE_URL=http://10.82.218.49:5000` | 적용 안 됨 (production 으로 구동하지 않음) |

`NEXT_PUBLIC_` 변수는 **브라우저 번들에 그대로 박혀** 나간다. 그리고 `localhost` 는 서버가 아니라 **그 페이지를 연 사용자의 PC** 를 가리킨다. 따라서 다른 PC 사용자는 자기 컴퓨터의 5000 번 포트로 로그인 요청을 보내게 되고, 거기엔 아무것도 없으므로 **100% 실패**한다. 서버 PC 본인만 성공하던 이유가 이것이다.

`.env.production` 에 올바른 주소가 있긴 했지만 **IP 하드코딩**이라, 설령 production 으로 구동하더라도 서버 IP 가 바뀌는 순간 같은 방식으로 다시 깨진다. 게다가 같은 선언이 **9개 파일에 복사**돼 있어 한 곳을 고쳐도 전체가 따라오지 않는 구조였다.

#### 3) 해결 — 접속한 호스트에서 주소를 만든다

주소를 어딘가에 "적어두는" 방식은 적어둔 값이 틀리는 순간 전부 깨진다. 그래서 **브라우저가 실제로 접속한 호스트**에서 매번 산출하도록 바꿨다.

**신설 `frontend/src/lib/apiBase.js`**

```javascript
export function getApiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (typeof window === 'undefined') return `http://localhost:${DEFAULT_BACKEND_PORT}`;
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_BACKEND_PORT}`;
}
```

| 접속 주소 | 산출되는 API 주소 |
|-----------|-------------------|
| `http://localhost:3000` | `http://localhost:5000` |
| `http://172.30.1.69:3000` | `http://172.30.1.69:5000` |

명시 지정(`NEXT_PUBLIC_API_BASE_URL`)이 있으면 항상 그 값이 우선하므로, 백엔드가 프론트와 다른 호스트에 있는 배포도 그대로 지원된다.

**Before / After (9개 파일 공통)**

```javascript
// Before — 파일마다 복사된 선언
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

// After — 단일 모듈에서 가져다 쓴다
import { API_BASE_URL } from '../../lib/apiBase';
```

대상: `app/(home)/page.js`, `app/auth/login/page.js`, `app/machine-learning/_hooks.js`, `app/measset-generation/page.js`, `app/SSR_DocOut/page.js`, `app/verification-report/page.js`, `app/viewer/page.js`, `app/viewer/data-view-standalone/page.js`, `components/Navbar.js`

`.env.development` / `.env.production` 은 값을 지우고, **왜 여기에 `localhost:5000` 을 적으면 안 되는지**를 주석으로 남겼다. 같은 내용을 `frontend/AGENTS.md` 의 API 규약과 `README.md` 5.3 절에도 반영해, 이후 작업에서 다시 하드코딩되지 않도록 했다.

#### 4) 부수 결함 — 원인 규명이 오래 걸린 진짜 이유

`backend/routes/auth.py` 의 `login()` 은 연결 예외를 전부 삼키고 있었다.

```python
# Before
except (sqlalchemy.exc.InterfaceError, sqlalchemy.exc.OperationalError,
        pyodbc.InterfaceError, pyodbc.OperationalError):
    pass  # 인증 실패 — 아래 공통 응답으로 처리

logger.warning(f"Failed login attempt for user: {username}")
return error_response("Invalid username or password", 401)
```

실측해 보니 **세 가지 전혀 다른 상황이 모두 같은 401 "Invalid username or password"** 로 나왔다.

| 실제 상황 | SQLSTATE | 변경 전 응답 | 변경 전 로그 |
|-----------|----------|--------------|--------------|
| 비밀번호 오류 | 28000 | 401 | 원인 없음 |
| DB 서버 다운 | 08001 | 401 | 원인 없음 |
| ODBC 드라이버 없음 | IM002 | 401 | 원인 없음 |

관리자는 로그를 봐도 원인을 알 수 없고, 사용자는 멀쩡한 비밀번호를 계속 다시 입력하게 된다. SQLSTATE 기준으로 분류하도록 바꿨다.

```python
# After (요지)
sqlstate = _extract_sqlstate(exc)
detail = _safe_error_text(exc, password)   # 길이 제한 + 비밀번호 마스킹
if sqlstate in _INFRA_SQLSTATES:           # 08001 08S01 08004 HYT00 HYT01 IM002 IM003
    logger.error(f"... database connection failed (SQLSTATE={sqlstate}) - {detail}")
    return error_response("Cannot reach the authentication server. ...", 503)
logger.warning(f"... (SQLSTATE={sqlstate or 'unknown'}): {detail}")
return error_response("Invalid username or password", 401)
```

| 실제 상황 | 변경 후 응답 | 변경 후 로그 |
|-----------|--------------|--------------|
| 비밀번호 오류 | 401 (**문구 그대로 유지**) | `WARNING ... (SQLSTATE=28000)` + 사유 |
| DB 서버 다운 | **503** | `ERROR ... (SQLSTATE=08001)` + 사유 |
| ODBC 드라이버 없음 | **503** | `ERROR ... (SQLSTATE=IM002)` + 사유 |

자격증명 오류 시 사용자에게 보이는 문구는 **일부러 그대로 두었다.** 계정 존재 여부를 흘리지 않기 위해서다. 연결은 됐는데 `sys.sql_logins` 에서 계정 메타데이터를 찾지 못하는 경로도 별도 경고 로그로 구분했다.

로그인 화면도 함께 손봤다. 응답 본문이 JSON 이 아닐 때 엉뚱하게 "연결 실패" 로 표시되던 것을 HTTP 상태 표기로 바꾸고, 연결 실패 메시지에 **실제로 호출한 API 주소를 함께 표시**하도록 했다. 이번 같은 주소 문제를 다음엔 화면만 보고 알 수 있다.

#### 5) 검증

| 항목 | 결과 |
|------|------|
| 서버 IP 접속 + localhost:5000 차단(= 다른 PC 재현) | **로그인 성공** (이전엔 실패). 차단된 localhost 요청 **0건**, API 전량 `http://172.30.1.69:5000` 으로 전송, 쿠키 발급, **CORS 통과** |
| localhost 접속 회귀 | 성공 (API 전량 `http://localhost:5000`) |
| 실패 분류 실측 | 28000 → 401, 08001 → 503, IM002 → 503, SQLAlchemy 래핑 08001 → 503, **비밀번호 누출 0** |
| Flask test_client | 401 응답 본문 불변, 로그에 `SQLSTATE=28000` 기록 확인 |
| Playwright E2E | **15/15 통과** |
| `npm run build` | 성공 |
| GPT 교차 검증 | **BLOCKER 0 / MAJOR 0 / MINOR 0** |

---
## 변경 이력 (v0.9.64 — 2026-09-13)

### v0.9.64 — #1. 프론트엔드 디자인 토큰·버튼 체계 개편

**요청**: 프론트엔드 디자인을 모던하고 가독성 있게, 전문가스러운 분위기로 너무 복잡하지 않게. 단 agent 재작성 명세를 먼저 남기고 진행.

#### 0) 원칙 — "모던하게"를 수치로 환산

"모던·전문가스러움"은 그대로 두면 취향 논쟁이 된다. 그래서 착수 전에 **검증 가능한 4개 지표**로 바꿔 명세에 못 박았다.

| 지표 | Before | 목표 | After |
|---|---|---|---|
| WCAG AA(4.5:1) 미달 색 조합 | **12 / 17** | 0 | **0 / 47** |
| 실행 버튼 색 역할 수 | 4종(보라·초록·하늘·주황) | 1종 + 보조 | **1종 + 보조** |
| UI 이모지 | 11개 파일에 산재 | 0 | **0** |
| 버튼 인라인 색 스타일 | 36개 | 0 | **0** |

#### 1) 대비 — 눈대중 대신 계산

측정 결과 토큰 자체가 읽히지 않는 값이었다.

| 조합 | Before | After |
|---|---|---|
| 흰 글씨 on `--accent-warning` | **2.15** FAIL | `#b45309` → **5.02** PASS |
| 흰 글씨 on `--accent-success` | 2.54 FAIL | `#047857` → **5.48** PASS |
| 흰 글씨 on `--accent-info` | 2.77 FAIL | `#0369a1` → **5.93** PASS |
| 흰 글씨 on `--brand` | 4.47 FAIL | `#4f46e5` → **6.29** PASS |
| `--text-muted` on 흰 배경 | 2.56 FAIL | `#5f6d80` → **5.27** PASS |
| `--disabled-text` on 흰 배경 | **1.48** FAIL | `#5f6d80` → **5.27** PASS |
| 다크 `--text-muted` on surface | 1.93 FAIL | `#94a3b8` → **5.71** PASS |

토큰 블록 상단에 "값을 바꿀 때는 눈대중이 아니라 대비비를 계산해 확인할 것" 주석을 남겨 재발을 막았다.

#### 2) 구조적 해결 — `--brand` 와 `--brand-text` 분리

브랜드색 하나로 버튼 배경과 글자색을 겸하면 다크모드에서 모순이 생긴다. 밝히면 그 위의 흰 글씨 대비가 깨지고, 어둡게 두면 어두운 배경 위의 브랜드색 글자가 안 보인다.

- `--brand` — **채워진 버튼 배경 전용**. 위에는 항상 흰 글씨(라이트/다크 동일 `#4f46e5`, 6.29:1)
- `--brand-text` — **글자·아이콘 전용**. 라이트 `#4f46e5`, 다크 `#a5b4fc`(7.34:1)

덕분에 다크모드에서 개별적으로 덮어쓰던 `.navbar-link.active` 등의 중복 규칙을 **삭제**할 수 있었다. 테마 분기를 토큰 한 곳으로 흡수한 것이다.

#### 3) 비활성 상태 — 색이 아니라 투명도로

비활성 텍스트는 요구가 모순된다. 대비를 지키려면 진해져야 하는데, 비활성으로 보이려면 흐려야 한다. 색으로 풀지 않고 `--disabled-text` 를 `--text-muted` 와 같은 값으로 두고, 비활성감은 `opacity: 0.5` + `cursor: not-allowed` + hover 제거로 표현했다.

#### 4) 버튼 — 위계를 만든다

**Before**: 같은 성격의 실행 버튼이 화면마다 다른 색이고, `w-100` 으로 1400px 폭을 가로질렀다. 버튼 36개가 각자 인라인 `style` 로 색·반경·굵기를 반복 선언했다.

**After**: `globals.css` 에 공용 체계를 신설했다.

- `.btn-app` + `.btn-app-primary`(채움, **화면당 1개**) / `-secondary`(아웃라인) / `-ghost` / `-danger` / `-sm` / `-block` / `-icon-danger`
- `.action-bar` — 여러 실행 버튼을 전폭으로 늘리지 않고 한 줄로 묶는다. `.action-bar-end` 는 보조 버튼을 우측으로 민다.

로그인 버튼·Start Training 버튼은 비활성일 때 `--brand-light` 배경에 흰 글씨였다(대비 1.x, 스크린샷에서 글자가 사라져 있었다). 공용 클래스로 옮기면서 함께 해결됐다.

#### 5) 이모지 → lucide 아이콘

이미 `lucide-react` 를 쓰면서도 카드 제목·배지에 이모지가 섞여 있었다. 전부 치환했고, 두 곳은 단순 치환이 불가능해 따로 처리했다.

- `DataPreviewModal` — `{ icon: '이모지' }` **문자열 필드**여서 `{ Icon: 컴포넌트 }` 로 자료구조를 바꾸고 `<cfg.Icon />` 으로 렌더
- `_helpers.js` Chart.js 범례 — 라벨은 문자열만 받으므로 아이콘 불가. `' ⭐'` → `' (Production)'` 텍스트로 대체

#### 6) 덤 — 적용되지 않던 죽은 클래스 제거

작업 중 이 프로젝트가 **Tailwind 를 쓰지 않는데도** `flex`, `w-full`, `text-gray-500`, `hover:bg-gray-200`, `mr-1` 같은 유틸리티 클래스가 남아 있는 것을 발견했다. 즉 해당 레이아웃·색은 **처음부터 적용된 적이 없었다**. CSS 변수와 Bootstrap 클래스로 정상화했다(`ActionButtons`, `ChangeSummary`, `RowActions`, `TableHeader`, `TableBody`, `EditableCell`, `DataViewer`).

`data-view` 페이지는 `bg-white`·`bg-light`·`text-dark` 를 쓰고 있어 **다크모드에서 깨지던** 것도 함께 토큰으로 교체했다.

#### 7) 검증

- 대비 감사 스크립트 — Before 12/17 FAIL → After **47쌍 전수 PASS**
- 라이트/다크 × 4개 업무 화면 스크린샷 **개선 전/후 비교**
- `npm test` (Playwright) **15/15**, `npm run build` 성공(14개 라우트 정적 프리렌더)
- GPT 교차 검증 — Blocker 0 / **Major 1 · Minor 2** 지적 후 전건 수정 → 0건
  - Major: 다크모드 `.dp-chip-unknown` 이 `#475569` 를 유지해 1.93:1 → 다크 오버라이드 추가
  - Minor: 일괄 치환 과정에서 `accentColor` 가 `accentcolor` 로 망가져 React 가 무시하던 문제 → 복구
  - Minor: 존재하지 않는 `--radius-md` 참조 → `--radius` 로 교정

---

## 변경 이력 (v0.9.63 — 2026-09-13)

### v0.9.63 — #1. 런타임 성능 실측 기반 개선

**요청**: 전체 프로젝트의 속도를 개선하되, 먼저 agent 재작성 명세를 작성한 뒤 진행.

#### 0) 원칙 — 추측 금지

명세에 다음을 못 박고 시작했다.

- 개선 항목마다 **개선 전/후 벤치마크**(동일 입력·동일 기준)
- 최적화 전후 출력이 같음을 데이터로 대조(**mismatch 0**)
- 표시 데이터·정렬·필터·편집 결과가 변경 전과 **완전히 동일**할 것
- 이미 최적인 계층(DB 엔진 전역 캐시 + 풀 + 안전한 `close`, v0.9.60 의 ML 벡터화)은 **재작업 금지**

그 결과 **채택 2건 / 기각 3건**이 나왔다. 기각한 것도 수치와 함께 남긴다.

#### 1) 채택 — 연쇄필터 옵션 계산 (13.52배)

각 컬럼의 드롭다운 옵션은 "자기 자신의 필터만 빼고" 나머지 필터를 적용한 결과에서 뽑는다.
기존 구현은 **컬럼마다** 전체 행을 다시 훑었다. 컬럼이 40개면 40번 훑는다.

```js
// Before — 컬럼 수만큼 전체 데이터 재순회 + 매번 localeCompare
columns.forEach((column) => {
  const others = activeFilters.filter((f) => f !== column);
  const subset = data.filter((row) => others.every((f) => match(row, f)));
  options[column] = [...new Set(subset.map(...))].sort((a, b) => a.localeCompare(b, ...));
});
```

활성 필터 컬럼 수를 k 라 하면, 실제로 필요한 부분집합은 **(k+1)개**뿐이다.
"모든 필터 적용" 1개 + "필터 컬럼 i 만 제외" k 개. 나머지 컬럼은 전부 첫 번째를 공유한다.

```js
// After — 부분집합 (k+1)개만 만들어 공유, Collator 는 모듈 레벨에서 1회 생성
const optionCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const buildCascadedOptions = (data, columns, filters, normalizedFilterSets) => { ... };
```

| 조건 | Before | After | 결과 |
|------|--------|-------|------|
| 1000행 × 40컬럼, 필터 2개 | 1.78 ms | **0.13 ms** | **13.52배**, mismatch 0 |

같은 로직이 `data-view/hooks/useDataFilter.js` 와 `components/DataViewer.js` 에 **중복 구현**돼 있었다.
둘 다 `filterHelpers.buildCascadedOptions` 호출로 교체해 구현을 하나로 합쳤다.

#### 2) 채택 — 편집 시 리렌더 범위 (1000행 → 변경된 행만)

셀 하나를 고칠 때마다 `editedData` 와 `validationErrors` 가 **새 객체**로 교체된다.
이 평면 맵을 모든 행에 그대로 내려주면 `TableBody` 의 메모가 무효화되어
표 전체(행 × 컬럼)가 타이핑 한 번마다 재조정됐다. 1000행 × 40컬럼이면 4만 셀이다.

편집 항목이 자기 자신의 `rowId`·`columnName` 을 들고 있다는 점을 이용해,
부모에서 **행별 버킷**으로 나눈 뒤 메모된 `TableRow` 에 그 버킷만 내려준다.
편집되지 않은 행은 항상 `undefined` 가 전달되므로 참조가 그대로고, 얕은 비교로 렌더를 건너뛴다.

```js
// After — 비용은 "편집한 셀 수"에 비례하며 행 수와 무관
const editedByRow = useMemo(() => {
  const grouped = new Map();
  Object.values(editedData || {}).forEach((entry) => {
    if (!entry || entry.rowId === undefined) return;
    let bucket = grouped.get(entry.rowId);
    if (!bucket) { bucket = Object.create(null); grouped.set(entry.rowId, bucket); }
    bucket[entry.columnName] = entry;
  });
  return grouped;
}, [editedData]);
```

| 조건 (1000행 × 40컬럼, 편집 20셀) | Before | After |
|---|---|---|
| 타이핑 1회당 편집 상태 분배 비용 | 3.58 ms | **0.008 ms** (463배) |
| 타이핑 1회당 다시 그리는 행 수 | 1000 | **20** |

첫 시도는 메모 비교 함수에서 행마다 셀 키를 조합해 비교하는 방식이었으나,
문자열 연결 4만 회 때문에 **15.5 ms** 가 들어 오히려 비쌌다. 측정했기에 버릴 수 있었다.

함께 `DataTable/index.jsx` 의 `headers` useMemo 가 `displayData` 에 의존해
편집마다 **내용이 같은 새 배열**을 반환하던 문제도 고쳤다. 이것을 놔두면 위 최적화가 통째로 무효가 된다.

```js
// After — 컬럼 구성이 같으면 이전 배열 참조를 그대로 반환
if (prev.length === next.length && prev.every((name, i) => name === next[i])) return prev;
```

- `validationErrors` 는 값이 메시지 문자열뿐이라 행 정보가 없어, 오류가 있을 때만 행 접두사로 나눈다(대부분의 경우 즉시 빈 Map 반환).
- 버킷은 `Object.create(null)` 로 만든다. `{}` 를 쓰면 `constructor`·`toString` 같은 이름의 컬럼에서 `Object.prototype` 속성이 잡혀 변경 표시가 오탐된다(교차 검증 지적 수용).

#### 3) 기각 — 측정 결과 이득이 없거나 위험이 큰 것

| 후보 | 측정 결과 | 판단 |
|------|-----------|------|
| 전체 배열 딥클론 → 얕은 행 복사 | JSON 딥클론 **5.12 ms** vs 얕은 행 복사 **8.60 ms** | **기각** — 오히려 0.60배로 느려짐 |
| `content-visibility: auto` 로 화면 밖 행 렌더 생략 | 4만 셀 159.8 ms → **136.2 ms** | **기각** — 1.17배로 미미, 스크롤 시 레이아웃 리스크만 추가 |
| `get_probes` 의 `SELECT DISTINCT` 푸시다운 | 전송량은 감소하나 MS-SQL DISTINCT 는 **collation** 을 따름 | **되돌림** — 대소문자만 다르거나 뒤에 공백이 붙은 `probeName` 을 병합해, pandas `drop_duplicates` 의 정확일치와 결과가 달라질 수 있음. 수 ms 이득보다 표시 동일성이 우선 |
| `pool_pre_ping=True` 제거 | 이득 수 ms | **보류** — 끊긴 연결 방치 위험이 더 큼 |
| DB 연결 계층 재작업 | 요청 단위 연결 캐시 + 엔진 전역 LRU + 풀이 **이미 적용돼 있음** | **재작업 금지** (서브에이전트의 "요청마다 재연결" 지적은 사실이 아님을 코드로 확인) |

#### 4) dev vs prod 구동 모드 — 측정 및 문서화

명세의 "무인 기동 동작을 임의로 바꾸지 않는다"를 지키기 위해, 바꾸지 않고 수치만 남긴다.

| 라우트 | dev (`npm run dev`) | prod (`npm run build && npm start`) |
|--------|---------------------|--------------------------------------|
| `/` | 49~51 ms | **8 ms** |
| `/data-view` | — | **5~13 ms** |
| `/machine-learning` | 47 ms | **5~12 ms** |
| `/verification-report` | 60 ms | **5~10 ms** |
| `/measset-generation` | 46 ms | **6~14 ms** |
| `/SSR_DocOut` | 72 ms | **7~14 ms** |

- 라우트 응답 기준 **약 7~10배** prod 가 빠르다.
- 대신 기동할 때마다 `npm run build` **69초**가 추가되어 **시작 속도는 악화**된다.
- 상시 띄워두고 쓰는 운용이라면 prod 가 유리하고, 껐다 켜는 운용이라면 dev 가 유리하다. 선택지만 제시하고 기본 동작(`AOP_Web.bat` 인자 없는 실행 = development)은 유지했다.

#### 5) 검증

- `npm test` **15/15 통과**
- `npm run build` 성공 (69초, 14개 라우트 정적 프리렌더)
- 동등성: 연쇄필터 옵션 40컬럼 전수 대조 **mismatch 0**
- **GPT 교차 검증 2라운드**
  - 라운드1: `Major 1`(SQL DISTINCT 의 collation 의존) · `Minor 1`(버킷의 프로토타입 속성 오탐) → 둘 다 수용·수정
  - 라운드2: **0건**

---

## 변경 이력 (v0.9.62 — 2026-09-13)

### v0.9.62 — #1. 작업 등급(Tier) 도입과 지연 예산 규칙 적용

**요청**: 요청사항을 진행하는 데 너무 오랜 시간이 걸리니, 개선 방법을 md에 적용.

#### 1) 진단 — 추측이 아닌 실측

세션 텔레메트리(로컬 세션 스토어 `assistant_usage_events`)로 턴별 소요를 집계했다.

| 턴 | 작업 | 소요 | 메인 모델 API 콜 | 입력 토큰 |
|----|------|------|------------------|-----------|
| 7 | #5 전수 리뷰·전면 개선 | **91.8분** | 317 | 5,058만 |
| 6 | #4 루트 정리 | 27.7분 | 52 | 690만 |
| 8 | #6 README 갱신 | 8.8분 | 57 | 776만 |
| 9 | 국소 작업 | 0.9분 | 8 | 65만 |

- **메인 모델 도구 호출 1회 ≈ 11초** (59분 / 317콜).
- 즉 **지연 ≈ (도구 호출 수) × (콜당 컨텍스트 크기)**. 파일 수나 코드 줄 수가 아니라 **왕복 횟수**가 1차 결정 요인이다.
- 근본 원인: 요청 규모와 무관하게 **Design → Implement → Verify 파이프라인을 항상 풀로** 돌렸고, 탐색을 순차 왕복으로 했으며, 검증 라운드를 "상한까지" 채우는 경향이 있었다.

#### 2) 변경 — 지침 4개 파일 (새 파일 만들지 않음)

> 지침 파일을 새로 추가하면 **로딩 자체가 지연**이 되므로 기존 파일만 수정했다.

**a. `.github/copilot-instructions.md` — §4.1 작업 등급(Tier) 신설**

| Tier | 판정 기준 | 탐색 | Design | Verify | 도구 호출 예산 |
|------|-----------|------|--------|--------|----------------|
| S (즉답) | 조회·설명·문서·오타·단일 파일 국소 수정 | ≤3콜 | 생략 | 생략(타깃 확인 1회) | ≤ 10 |
| M (표준) | 기능 추가·버그 수정·리팩터 **(기본값)** | 가설 후 선별 | 3~5줄 | 위험도 승격 시 1라운드 | ≤ 40 |
| L (심층) | 전수 리뷰·아키텍처 변경·"전체/완벽하게" 명시 | 병렬 서브에이전트 | 정식 | 최대 3라운드 | ≤ 120 |

- 기본은 **Tier M**. Tier L 은 사용자가 명시할 때만 — 스스로 승격하지 않는다.
- **Tier L 착수 전 예상 소요를 고지**해 사용자가 범위를 줄일 기회를 준다.
- 예산 초과 시 더 파지 말고 멈춘다. Tier 는 **낮추는 방향으로만** 재조정("이왕 하는 김에" 승격 금지).

**b. `.github/copilot-instructions.md` — §4.2 지연 예산 신설**
콜 수 줄이기(한 응답에 묶기) / 컨텍스트 줄이기(`view_range`·`grep`·`diff --stat`) / 중복 조사 금지 / 대기 시간 0(`background` 중 무관 작업) / 기계적 작업 경량 위임.
§3 라우팅 표에는 "해당 작업일 때만 연다"는 한 줄을 추가해 불필요한 지침 로딩을 막았다.

**c. `.github/instructions/agent-orchestration.instructions.md` — "지연 최적화 실전 기법" 신설**
안티패턴 → 대체 패턴 6쌍을 표로 제시.

| 안티패턴 | 대체 |
|----------|------|
| grep → 확인 → view → 또 grep (순차 탐색) | 가설 수립 후 grep/glob/view **동시 발사** |
| 파일 통째로 읽고 10줄만 사용 | `grep -n` 위치 확보 → `view_range` |
| 명령마다 별도 셸 호출 | `;` 로 한 호출에 체인 |
| 편집 1건 → 확인 → 편집 1건 | 비중첩 편집은 한 응답에 `edit` 여러 개 |
| 빌드·테스트 전체 출력 수신 | 경량 `task` 위임 후 한 줄 회수 |
| 서브에이전트 보고 내용 재확인 | **재확인 금지** |

**d. `.github/instructions/model-routing.instructions.md`**
- §3에 **Tier 와 위험도의 역할 분리**를 명시: Tier 는 *라운드 수와 예산*만 정하고, **승격 여부는 위험도 단독 판정**. Tier S 라도 필수 조건이면 승격하고, Tier L 이라도 위험이 없으면 승격하지 않는다.
- §5 라운드 상한 재정의:

  | Before | After |
  |--------|-------|
  | 1~2 정상 iteration / 3 마지막 | **1 = Tier M 의 기본이자 끝**(Blocker 0·Major 0 이면 종료) / 2 = Blocker·Major 가 실제 보고된 경우만 / 3 = Tier L 한정 |

  "한 번 더 돌려보자"는 순수 지연이라는 원칙을 명문화.

**e. `.github/instructions/verification.instructions.md` — 검증 강도 Tier 연동**

| Tier | 최소 검증 |
|------|-----------|
| S | 변경 지점 직접 확인 1회 (렌더·출력·로그 대조) |
| M | 타깃 테스트 + 영향 범위 빌드 |
| L | 전체 테스트 + 빌드 + 교차 검증 |

타깃 검증이 실패하거나 모호하면 **즉시 상위 Tier 로 승격** — 속도가 정확성을 이기지 못하게 안전장치를 걸었다.

#### 3) 보존한 불변식

- 교차 검증 승격은 **위험도 단독 판정**. Tier 로 필수 검증을 우회할 수 없다.
- 완료 조건 `Blocker 0 AND Major 0` 유지.
- Correctness > Safety > Maintainability > Performance — 속도 규칙은 이 순서를 뒤집지 않는다.
- 라우터 파일은 라우터로 유지, 지침 파일 개수는 늘리지 않음.

#### 4) 교차 검증 iteration (GPT 최신, 2라운드)

새 규칙(Verify 위임 = 위험도 판정)을 이번 작업에 **자기 적용**해 검증했다. 지침 변경은 에이전트 동작 자체를 바꾸므로 "확신 없는 변경"에 해당해 승격.

| ID | 라운드1 지적 | 처리 |
|----|--------------|------|
| V-001 | **Blocker** — Tier 표의 `Verify: 생략` 표기 때문에 Tier S 라는 이유로 **필수 교차 검증을 건너뛸 수 있음**(한 줄 인증 수정, `AOP_Web.ps1` 수정) | 열 이름을 `자체 검증 깊이`로 변경, S 행의 "생략" 삭제, 표 아래 **위험도 단독 판정** 경고 블록 추가 |
| V-002 | **Blocker** — `verification.md` 표가 교차 검증을 Tier L 전용처럼 보이게 함 + 라운드 규칙이 라우터와 `model-routing` 두 곳에 존재해 상충 | L 행에서 "교차 검증" 제거, 위험도 독립 경고 추가, **라운드 규칙은 `model-routing` §5 단일 출처**로 통일 |
| V-003 | **Major** — Tier 를 **하향으로만** 재조정하게 해, 작업 중 실제 범위·위험이 커져도 승격 불가 | "이왕 하는 김에" 식 **범위 확장 승격은 금지**하되, **증거 기반 상향은 필수**로 명문화(요청 범위는 유지하고 검증 강도만 상향) |
| V-004 | **Minor** — 라우터가 상세를 흡수 + "모든 확인 사실을 `todos` 기록"·"기계적 작업 항상 위임"이 오히려 오버헤드 | §4.2 를 5줄 요약 + 링크로 축약, 기록·위임에 **비용 대비 판단** 단서 추가 |

| ID | 라운드2 지적 | 처리 |
|----|--------------|------|
| V-005 | **Major** — "서브에이전트 보고 재확인 금지"가 무조건적이라 **할루시네이션·스냅샷 불일치를 그대로 통과**시킬 수 있고 증거 우선 원칙과 충돌 | 광범위 재조사만 금지하고, **Blocker·Major 판정이나 코드 수정의 근거가 되는 지적은 해당 파일:라인을 타깃 확인**하도록 수정 |
| V-006 | **Minor** — "Tier 는 라운드 수와 예산만 정한다"가 인접 표(탐색·Design·자체 검증도 규정)와 불일치 | 문구를 정정: Tier 는 탐색·Design·자체 검증·예산·라운드 상한을 정하고 **교차 검증 승격은 포함하지 않는다** |

- 라운드1은 검증자가 **2회 연속 판정 회피**(diff 출력 초과 → "검증 미완")해, 규칙 §6대로 `write_agent` 재지시 후에도 회피하자 **다른 모델·다른 `agent_type` 으로 교체**(`task`+`gpt-6-astra` → `general-purpose`+`gpt-5.6-sol`)해 실제 판정을 얻었다.
- 이 과정에서 **`write_agent` 는 `background` 에이전트에만 동작**한다는 제약을 확인해, "재검증 가능성이 있는 Verify 는 반드시 `background` 로 띄운다"를 `agent-orchestration` 에 반영했다(sync 로 띄우면 라운드2에 맥락을 통째로 재작성해야 해 비용이 2배).
- 라운드2 지적 2건은 검증자가 제시한 수정안을 그대로 채택했고, 변경 지점이 문구 2곳으로 국소·확인 가능해 라운드3 없이 종료했다.

---

## 변경 이력 (v0.9.61 — 2026-09-13)

### v0.9.61 — #1. README 전면 갱신 및 E2E 테스트 현행화

**요청**: 수정된 코드나 워크플로우를 기반으로 다시 한번 README 를 업데이트.

**배경**: v0.9.60 전수 리뷰로 설정 로딩·보안 정책·업로드 경로·데이터뷰 워크플로우가 크게 바뀌었으나 `README.md` 는 구동 방법 중심의 7장 구조에 머물러 있어, 신규 설치자가 운영 모드 fail-fast·CORS·재로그인 동작을 알 수 없었다.

**변경 (`README.md`, 7장 → 10장)**

| 장 | 상태 | 내용 |
|----|------|------|
| 주요 기능 표 | 신설 | 홈(`/`)·MeasSet Generation·Viewer·Verification Report·SSR DocOut·Machine Learning + `/data-view` 별도 창 설명 |
| 3. 최초 설치 | 신설 | venv 생성 + `pip install -r requirements.txt`(구동 스크립트는 pip 설치를 하지 않음), `npm install` 은 `AOP_Web.ps1` 이 자동 수행, `AOP_config.cfg` 역할 |
| 5. 환경 변수 및 보안 설정 | 신설 | 5.1 백엔드 변수 표(`AOP_ENV`/`AUTH_SECRET_KEY`/`FLASK_SECRET_KEY`/`AUTH_EXPIRE_TIME`/`ALLOWED_ORIGINS`/`COOKIE_SECURE`) + 운영 예시, 5.2 인증·세션(백엔드 재시작 시 재로그인 필요), 5.3 `NEXT_PUBLIC_API_BASE_URL`, 5.4 업로드 저장 위치 |
| 8. 테스트 | 신설 | `npx playwright install` → `npm test`(15 케이스), `npm run build`, dev 서버의 `.next` 잠금 주의, **테스트는 비로그인 상태 전제**임을 명시 |
| 9. 디렉토리 구조 | 갱신 | backend 하위 패키지·frontend `src` 세부·루트 `1_uploads/` 반영 |
| 10. 트러블슈팅 | 확장 | "자주 발생하는 증상" 표 7행(운영 fail-fast, CORS 차단, 로그인 풀림, 401, 추상 오류 메시지, `.next` 빌드 실패, requirements 인코딩, `backend\1_uploads` 레거시) |

**문서 정확성 실측 검증** — 운영 모드 fail-fast 를 단계별로 재현해 문서 내용과 일치함을 확인.

```
AOP_ENV=production 단독          → RuntimeError: ... AUTH_SECRET_KEY, FLASK_SECRET_KEY
+ AUTH/FLASK 시크릿 주입          → RuntimeError: ... ALLOWED_ORIGINS 를 명시적으로 지정
+ ALLOWED_ORIGINS 주입            → PROD_OK ['https://aop.example.com'] False
```

**E2E 테스트 현행화 (`frontend\tests\app.spec.js`)** — `npm test` 실행 결과 3건이 실패했는데, 제품 결함이 아니라 **이미 제거된 UI 를 검증하던 낡은 테스트**였다(`home-feature-card` / `AOP Web Platform` 문자열은 `globals.css` 에만 잔존하고 JSX 에는 없음).

| 케이스 | Before | After |
|--------|--------|-------|
| 홈 Hero 섹션 | `text=AOP Web Platform` 존재 확인 → 실패 | `비로그인 상태에서 로그인 안내 카드가 표시된다` — `h1:has-text("로그인이 필요합니다")` 검증 |
| 5개 Feature 카드 | `.home-feature-card` 5개 → 실패(0개) | `비로그인 상태에서는 주간 일정이 노출되지 않는다` — `main iframe` 0개 + 본문 로그인 버튼 검증 |
| Navbar Login 버튼 | `button:has-text("Login")` → strict mode violation(데스크톱·모바일 2개 매치) | `.navbar-login-btn` 으로 데스크톱 버튼 특정 |

**검증 결과**: `npm test` → **15 passed (25.7s)**, 실패 0건.

---

## 변경 이력 (v0.9.60 — 2026-09-12)

### v0.9.60 — #1. 전체 프로젝트 전수 리뷰 및 결함·성능 개선

**요청:**
- 전체 프로젝트를 리뷰하고 병목현상·에러·성능개선을 전체적으로 진행. "완벽하게 그리고 모든 아이템을 리뷰"

**접근 (v0.9.59 모델 분담 파이프라인 적용):**
- **Design·Implement** = Claude Opus 최신(메인 직접 수행) / **Verify** = GPT 최신(서브에이전트 위임)
- 1단계로 4축(백엔드 보안·백엔드 로직/성능·프론트엔드·구성/스크립트) 병렬 서브에이전트가 소스 96개(15,121 LOC)를 전수 분석 → **Blocker 15 / Major 34 / Minor 14** 식별
- 2단계로 메인이 6개 Phase로 나눠 직접 수정, 각 Phase마다 실행 증거 확보

---

#### Phase 1 — 백엔드 보안

| 항목 | Before | After |
|------|--------|-------|
| DB 비밀번호 보관 | `session["password"] = 평문` — Flask 세션 쿠키는 **서명만 될 뿐 암호화되지 않아** base64 디코딩만으로 읽힘 | 신규 `backend/utils/credential_store.py` — 쿠키에는 `secrets.token_urlsafe(32)` 불투명 토큰만, 실제 자격증명은 서버 메모리에 TTL(슬라이딩 갱신) 보관 |
| CORS | 개발 기본값 `origins="*"` + `supports_credentials=True` — 임의 사이트가 인증 쿠키를 실은 요청 가능(CSRF·데이터 탈취) | `DEV_ORIGIN_PATTERN` 정규식(localhost/사설망 대역, 앵커·이스케이프 적용)으로 제한 |
| 시크릿 | `AOP_config.cfg` 에 SECRET_KEY 하드코딩 | 파일에서 제거, 환경변수 우선. `Config._validate_production()` 이 운영 모드에서 기본 시크릿 사용 시 **부팅 중단** |
| 예외 | `str(e)` 를 클라이언트에 그대로 반환(스택·SQL·경로 노출) | 서버 로그에만 상세 기록, 응답은 일반화 메시지 |
| 엔진 | 요청마다 SQLAlchemy 엔진 신규 생성 | `_ENGINE_CACHE`(LRU 32) + `reuse_engine` / `close()` |

#### Phase 2 — 백엔드 정확성

- `data_preprocessing.py`: **항상 False 로 평가되던 전처리 분기**를 `get_preprocessing_steps()` 로 재작성 → 스케일러·다항식 변환이 실제로 적용됨
- `machine_learning.py`: sklearn `Pipeline` 구성 — 전처리를 split 이전 전체 데이터에 fit 하던 **데이터 누수** 제거. 일부 모델 실패 시 `partial_success` 반환
- `training_evaluation.py`: 표본 수가 적을 때 CV fold 수를 적응적으로 축소. `modelSave()` 에 논리명+타임스탬프 부여
- `create_groupidx.py`: 예외 삼킴 제거 + `pd.isna()` 체크
- `predictML.py`: `_get_probe_geo()` 캐시, `_align_features()` 로 학습/추론 피처 순서 정렬, 모델 부재 시 명시적 RuntimeError
- `data_inout.py`: 타임스탬프를 초 단위로(같은 probe 를 1분 내 두 번 생성 시 **결과 파일이 조용히 덮어써지던 문제**), 절대경로화, case 1 경로 버그 수정

#### Phase 3 — 백엔드 성능 (동등성 실측)

원본을 `git show HEAD:<path>` 로 추출해 같은 패키지에 임시 로드한 뒤 신·구 결과를 키별로 대조했다.

| 대상 | Before | After | 결과 |
|------|--------|-------|------|
| `Temp_Prr_predict.find_prr_for_temprise_batch()` | 행마다 그리드 평가 + 이분탐색을 각각 단건 추론 | 그리드 1회 + 보간 1회 + **이분탐색 스텝별 1회**(스텝 동기 배치) + mtime 기반 아티팩트 캐시 | 200행 **22.30s → 0.17s (128배)**, mismatch **0** |
| `param_gen` 전 메서드 | `apply(lambda)` / 행 루프 | numpy·pandas 벡터화 | 4000행 **0.063s → 0.010s (6.1배)**, mismatch **0** |
| `mlflow_integration` | 요청마다 모델 재로딩, 행 단위 INSERT | 체크섬 기반 `_MODEL_CACHE`(락 보호), `_bulk_insert()` 다중 VALUES(파라미터 2100 제한 내) | 반복 예측 I/O 제거 |

> **중대 발견**: `param_gen.py` 에는 `import numpy` / `import pandas` 가 **아예 없었다**. 기존 코드는 우연히 해당 심볼을 쓰지 않아 통과했으나, 벡터화 시점에 런타임 `NameError` 가 되는 상태였다.

#### Phase 4 — 프론트엔드 정확성

- **행 편집/삭제 데이터 오염(Blocker)**: 편집·삭제 대상을 **화면 인덱스**로 지목하고 있어 정렬·필터가 걸린 상태에서는 전혀 다른 원본 행이 수정·삭제됨
  - 신규 `data-view/utils/rowIdentity.js` — `ROW_ID` Symbol 기반 안정 식별자(`Object.keys`/`JSON.stringify` 에 노출되지 않아 헤더·저장 값을 오염시키지 않음)
  - `useDataEdit` / `useRowOperations` / `EditableCell` / `RowActions` 를 rowId 기준으로 전환
- `useDataManagement`: `activeStorageKeyRef` 로 실제 로드한 키를 기억 → 저장 후 재오픈 시 **수정 이전 데이터가 되살아나던 문제** 해결
- `useWindowSync`: 미저장 변경이 있을 때 REFRESH_DATA 확인 창
- `useDataSort` + `DataViewer`: 문자열 비교에 의한 숫자 정렬 오류 수정(`numeric: true`)
- `DataTable`: 필터 결과가 0행이어도 헤더 스키마가 유지되도록 `allData` prop 추가, `colSpan` 을 `headers.length + 1` 로 수정
- `csvExport.js`: RFC 4180 `escapeCSVValue()` — 쉼표·따옴표·개행 포함 값이 열을 밀어내던 문제 수정
- `verification-report`: 순차 fetch → `Promise.all`, 팝업 차단 감지

#### Phase 5 — 프론트엔드 성능·테마·설정

- `auth/layout.js` 에 inline theme script 추가 → 로그인 화면 다크모드 FOUC 제거
- `globals.css` 에 `--accent-success/-info/-warning`, `--tx-header-bg`, `--tx-legend-*` 토큰을 **light·dark 양쪽**에 정의하고, 하드코딩 색상을 CSS 변수로 치환(`tx-matching-popup` 34곳 포함)
- `.env.development` 의 고정 사설 IP → `localhost:5000`
- `backend/requirements.txt` UTF-16LE → UTF-8(BOM 없음)
- `package.json` 에 `"test": "playwright test"` 추가, 버전 배지 v0.9.60 + E2E 는 정규식 검증으로 완화

---

### 교차 검증(GPT 최신) — 3라운드 iteration

같은 모델의 자기 검증은 구현 시의 추론 오류를 그대로 재현하므로, 계열이 다른 모델에 위임했다.

**라운드 1 — Blocker 1 · Major 3**

| # | 심각도 | 위치 | 내용 | 조치 |
|---|--------|------|------|------|
| 1 | BLOCKER | `utils/credential_store.py` `bind_to_session()` | `FLASK_SECRET_KEY` 를 유지한 채 배포하면 **구버전 쿠키의 평문 비밀번호가 그대로 살아남아** 로그인 후에도 계속 왕복. 토큰만 교체하고 `session["password"]` 를 지우지 않았음 | `session.clear()` 후 토큰 저장 + `app.py` 에 `@before_request` 훅으로 레거시 키 상시 제거 |
| 2 | MAJOR | `pkg_MeasSetGen/data_inout.py` ↔ `routes/db_api.py` | 생성 파일은 **저장소 루트**의 `1_uploads` 로 옮겼는데, `/api/csv-data` 는 `os.getcwd()`(= `backend/`) 하위만 허용. 생성은 성공하는데 조회는 400 | `Config.UPLOADS_ROOT` 단일 기준 루트를 도입해 **쓰는 쪽과 읽는 쪽이 같은 절대 경로**를 공유 |
| 3 | MAJOR | `hooks/useDataEdit.js` | 편집이 `displayData` 에만 반영되고 `csvData` 는 그대로여서, 필터를 적용/해제하면 `csvData` 로부터 화면이 재계산되며 **편집 이전 값이 되살아나고 CSV 내보내기도 옛 값**을 씀 | 편집·삭제를 canonical `csvData` 에 **즉시 반영**하도록 전환. 삭제 행은 `{rowId, row, index}` 로 보관해 원래 위치로 복원 |
| 4 | MAJOR | `pkg_MeasSetGen/param_gen.py` | 범위 검증은 추가했으나 `astype(int)` 가 소수 인덱스를 **조용히 버림** → `3.5` 가 인덱스 `3` 의 주파수로 둔갑(원본은 `TypeError` 로 거부했음) | `freq_index % 1 != 0` 을 invalid 마스크에 추가 |

**라운드 2 — Major 2 · Minor 1 (라운드 1 수정이 새로 만든 결함)**

| # | 심각도 | 위치 | 내용 | 조치 |
|---|--------|------|------|------|
| 5 | MAJOR | `hooks/useDataEdit.js` | `handleCellChange` 의 의존성이 줄면서 **오래된 `validateCellData` 클로저**를 붙잡게 됨 → 다른 셀을 정상 값으로 고치면 기존 오류가 통째로 지워지고 **잘못된 데이터가 저장 가능**해짐 | `validateCellData` 를 앞에 정의하고 `validationErrors` 의존 제거 + 함수형 업데이트로 전환, `handleCellChange` 의존성에 포함 |
| 6 | MAJOR | `hooks/useRowOperations.js` | 편집된 행을 삭제하면 그 행의 편집·검증 기록이 **버려지고**, 복원 시에도 되살아나지 않음 → 데이터는 저장 스냅샷과 다른데 "변경 없음"으로 표시되어 저장 버튼이 숨고 창 닫을 때 동기화도 안 됨 | 삭제 항목에 `edits`/`errors` 를 함께 보관하고 복원 시 병합 |
| 7 | MINOR | `hooks/useRowOperations.js` | 보관한 index 는 각기 **다른 중간 배열** 기준이라, 오름차순 삽입은 원래 순서를 복구하지 못함(`[A,B,C,D]` 에서 B→C 삭제 후 복원하면 `A,C,B,D`) | 삭제의 **역순**으로 splice |

**라운드 3 — Blocker 0 · Major 0 · Minor 0 → 완료 조건 충족**

**재현 검증 결과**

```
[PASS] legacy password purged -> ['cred_token', 'username']
[PASS] generated path inside uploads root -> D:\GitHub\AOP_Web\1_uploads\...
[PASS] path traversal still blocked -> D:\GitHub\AOP_Web\backend\config.py
[PASS] fractional freq index rejected -> ValueError
[PASS] integer freq index ok -> [1333300, 1000000]

[PASS] edit visible immediately -> 50
[PASS] edit survives filter re-apply -> 50
[PASS] export source has edited value -> 50
[PASS] deleted row stays deleted after filter clear -> true
[PASS] restore puts row back at original index -> 50,80,70

[PASS] error recorded on invalid cell -> 1
[PASS] other cell edit does not erase existing error -> ["r1-voltage"]
[PASS] restored row keeps edited value -> 50
[PASS] dirty state preserved after restore -> true
[PASS] multi-delete restore keeps original order -> A,B,C,D
```

`npm run build` ✓ Compiled successfully (14개 라우트 전부 생성), `create_app()` import ✓

---

### 의도적으로 보류한 항목 (사유 기록)

| 항목 | 보류 사유 |
|------|-----------|
| `training_evaluation` / `model_selection` 의 `n_jobs=-1` 중첩 | CPU 과구독이지만, 튜닝 값 변경이 학습 시간·결과 재현성에 미치는 영향이 커 실측 없이 건드리지 않음 |
| `fetch_selectFeature` 의 `LIKE '%Beamstyle%'`, `ORDER BY 1` | 학습 데이터의 **행 순서 재현성**에 영향 가능. 모델 재학습 검증 없이 변경 불가 |
| Tailwind 클래스 잔재(`bg-red-100` 등) | `tailwindcss` 의존성이 없어 무시되는 클래스지만 주 프레임워크가 Bootstrap이고 대부분 장식용. 전면 정리는 회귀 위험 대비 이득이 낮음 |
| `frontend/package.json` 의 미사용 `process`/`typescript`/`@types/*` | 제거 시 재설치·재빌드 비용 대비 이득이 낮음 |
| 10°C 정책의 역탐색 미적용, GroupIndex 원자적 예약 | 도메인 의사결정이 필요한 사안 |

**검증:**
- 백엔드: `create_app()` import, 전처리 분기 동작(`['poly','scaler']` / `[]`), 성능 리팩터 신·구 결과 대조(mismatch 0), 보안 수정 재현 테스트 5건
- 프론트엔드: `npm run build` 통과(14개 라우트), 데이터뷰 편집·삭제·복원 시나리오 재현 5건
- 교차 검증: GPT 최신 모델 3라운드 iteration(Blocker 1·Major 3 → Major 2·Minor 1 → **0건**), 완료 조건 `Blocker 0 AND Major 0` 충족

---

## 변경 이력 (v0.9.59 — 2026-09-12)

### v0.9.59 — #1. 스텝별 모델 분담 파이프라인 도입

**요청:**
- Agent 성능 최대화를 위해 md 지시문에 스텝별 모델을 지정 — ① design: Claude Opus 최신 ② 구현: Claude Opus 최신 ③ 검증: GPT 최신
- 각 스텝에서 문제가 있으면 iteration을 진행하여 상호보완
- 하네스·스킬 등 최신 테크닉 기반으로 업데이트

**대상 파일:** `.github/instructions/model-routing.instructions.md`(신규), `.github/copilot-instructions.md`, `.github/instructions/agent-orchestration.instructions.md`, `.github/instructions/verification.instructions.md`

**Before:**
- 워크플로우가 `Plan → Implement → Verify` 3줄 서술뿐이고 **모델 배정 개념이 전무**
- 검증을 메인 에이전트가 직접 수행 → 구현자와 검증자가 동일 모델이라 **구현 시의 잘못된 전제를 검증에서도 그대로 통과**시킴
- iteration 규칙 부재 — 문제 발견 시 몇 번까지 재시도할지, 구현자와 검증자의 결론이 충돌하면 무엇을 따를지 기준 없음
- 서브에이전트 매트릭스에 모델 오버라이드·`reasoning_effort` 기준 없음
- 스킬 섹션이 존재하지 않는 `/fleet`, `.github/extensions/`를 안내 (실제 `.github/skills/`의 10개 스킬은 미기재)

**After:**

1. **3스텝 모델 배정 (신규 `model-routing.instructions.md`)**

   | 스텝 | 모델 | 실행 주체 |
   |------|------|-----------|
   | Design | Claude Opus 최신 (`claude-opus-5`) | 메인이 Opus면 직접, 아니면 `general-purpose`에 Opus로 위임 |
   | Implement | Claude Opus 최신 (`claude-opus-5`) | 위와 동일 (Design과 쪼개지 않고 연속 수행) |
   | Verify | GPT 최신 (`gpt-6-astra`) | **승격 시 서브에이전트 필수 위임** |

   - **설계 핵심**: 계열이 바뀌는 지점은 **Verify 하나뿐**이다. 메인이 이미 Opus 계열이면 Design/Implement를 **재위임하지 않고 직접 수행**한다 — 같은 모델에 넘기는 것은 컨텍스트 손실 + 지연만 늘리는 순손실이기 때문이다. 반면 승격된 Verify를 메인이 직접 하면 교차 검증 효과가 0이 되므로 반드시 위임한다.
   - **모델 선택 알고리즘(5단계)**으로 세대 교체에 대응 — ① 선호 ID가 노출 목록에 있으면 사용 ② 없으면 같은 계열 최상위(버전 번호·등급 표기로 판정) ③ 참고 목록 중 실제 노출된 첫 모델 ④ 계열 자체가 없으면 메인이 직접 검증하되 **"교차 검증 미성립"을 사용자에게 명시**(필수 조건의 유일한 예외) ⑤ 선택 근거를 최종 보고에 기록
   - `reasoning_effort` 단일 기준 통합 — 3스텝·근본원인 분석은 `high`, 기계적 작업은 기본값

2. **승격 기준을 "위험도"로 설계 (파일 수·줄 수 기준 폐기)**
   - **필수**: 인증·권한·세션·쿠키·시크릿 / SQL·스키마·데이터 삭제 / 공용 API 계약 / 동시성·상태 전이 / 구동·배포 스크립트 / **재현 방법이 불명확하거나 확신하지 못하는 변경**. 이 중 인증·SQL·시크릿이면 `security-review` 병렬 추가
   - **생략**: 문서·주석·오타, 기계적 리네임, 한두 명령으로 결과를 직접 확인 가능한 국소 변경
   - **우선순위 명문화**: `필수 조건 > 생략 조건`. 둘 다 해당하면 **항상 필수**이며, "한 줄짜리"라는 크기는 판단 기준이 아니다. `credentials: 'include'` 추가(인증 경로)와 구동 스크립트 `@()` 수정을 **생략 섹션 안에 반례로 명시**해 구멍을 닫음

3. **설계 근거를 실제 버그로 문서화**
   - v0.9.58에서 잡힌 `.Count`가 `$null`이 되는 배열 언롤링 버그를 근거 사례로 기재. 구현자는 "배열이 반환된다"는 전제로 코드도 리뷰도 통과시켰고, 결국 **실행 증거**(`stop`이 프론트엔드를 못 죽임)로만 발견됐다. → 검증은 **다른 모델 + 실행 증거** 두 축이어야 한다는 규칙의 근거.

4. **iteration 프로토콜**
   - 심각도 3등급: **Blocker**(요구 미충족·런타임 실패·보안) / **Major**(회귀 위험·불변식 위반·엣지케이스) / **Minor**(가독성 — 요청 범위 밖이면 **수정하지 않음**)
   - **완료 조건 = `Blocker 0 AND Major 0`** (라우터·model-routing·verification 3개 문서 동일). Major를 남긴 채 커밋하지 않는다
   - **finding ID(`V-001` 형식) 부여 + 라운드별 `해결/미해결/기각(사유)` 기록** — ID가 없으면 "같은 지적이 반복되는지"를 판별할 수 없다
   - **재검증은 `write_agent`로 같은 에이전트에 이어서 요청** — 새 에이전트를 띄우면 직전 지적 맥락이 사라져 같은 지적을 반복하거나 수정분을 놓친다
   - 라운드 상한 3회 → 초과 시 `rubber-duck` 에스컬레이션 → 사용자 보고
   - **검증 중에는 검토 대상 파일을 수정하지 않는다**(스냅샷 고정). `background`로 띄운 뒤에는 검증 대상과 무관한 작업만 진행

5. **모델 간 이견 해소 — 증거 우선(Evidence Wins)**
   - GPT 검증자도 틀린다. 다수결이나 "리뷰어 말이 맞다"로 판정하지 않는다.
   - ① 실행 증거(재현 명령·실제 출력)를 제시한 쪽이 이긴다 → ② 양쪽 다 없으면 **최소 재현 테스트를 만들어** 결론 낸다 → ③ 증거 생성 불가면 안전한 쪽(Correctness > Safety > ...) → ④ 전제가 뒤집히면 본 Detail 문서에 기록
   - **도구 가시성 차이 규칙**: 검증자는 메인과 다른 도구 스키마를 볼 수 있다. "그 도구는 존재하지 않는다"류 지적은 **동일 세션에서 같은 도구·인자로 성공한 호출 기록**이 있으면 기각한다. 단 이 기각은 **"존재 여부" 주장에만** 적용되며 권한·결과 품질·현재 장애 지적은 기각할 수 없고, **더 최근의 재현 가능한 실패 증거가 과거 성공보다 우선**한다
   - 근거: v0.9.58의 `.Count` 이슈는 대화형 콘솔과 `-File` 실행 결과가 달라, 실제 `-File` 실행으로만 결론이 났다

6. **Verify 서브에이전트 프롬프트 규격 (9블록 필수)**
   - 역할 / **실행 환경** / 프로젝트 컨텍스트 / 원래 요구사항 / **설계 의도 및 불변식** / 변경 내용 / **이미 확인된 사실** / 검증 항목 / 출력 형식
   - 서브에이전트는 stateless이므로 하나라도 비면 오탐률이 급등한다. 특히 **diff만 던지면 의도된 동작을 버그로 오탐**한다.
   - Verify 에이전트는 **읽기·실행 전용** — 수정은 Implement(Opus)가 한다. 검증자가 고치면 검증자가 없어진다.
   - **검증자 실패 모드 표를 실측 기반으로 신설**(아래 "iteration 실측 기록" 참조)

7. **하네스 최신화 (`agent-orchestration.instructions.md`)**
   - 서브에이전트 매트릭스에 **모델 오버라이드 열** 추가. 탐색·빌드 같은 기계적 작업에는 상위 모델을 쓰지 않고, 상위 모델은 **설계 판단과 교차 검증에만** 투입하도록 명시. 단 **구체적 모델 ID는 기재하지 않고** `model-routing.instructions.md` §2를 단일 기준으로 참조
   - `background` 모드는 **폴링 금지**, 띄운 뒤 독립 작업 진행 → 완료 알림 수신 패턴
   - 스킬 섹션을 실제 `.github/skills/` 10개 목록으로 교체
   - PowerShell 체인 규칙 정정: `&&`는 PowerShell 키워드 앞에서 동작하지 않으므로 `;` 사용
   - 에러 복구 표에 Verify Blocker 대응·이견 충돌·서브에이전트 무응답 시 직접 수행 전환 추가

8. **검증 문서 (`verification.instructions.md`)**
   - 공통 체크리스트에 **엣지케이스(0건/1건/대량/실패 경로)** 와 "주장이 아닌 실행 증거로 확인" 추가
   - **실행 스크립트(PowerShell/배치) 체크 항목 신설** — `@()` 배열 고정, `$projectPath` 기준, `ERRORLEVEL` 전파 등 v0.9.58에서 얻은 교훈을 재발 방지 규칙으로 고정
   - 검증 흐름을 교차 모델 흐름으로 교체

**자체 적용 검증 — 이 변경 자체를 새 파이프라인으로 검증했다 (iteration 실측 기록):**

| 라운드 | 검증자 | 결과 |
|--------|--------|------|
| 1 | `task` + `gpt-6-astra` | 기계적 확인만 수행(모델 ID 6개 유효, 참조 파일 11개 존재, 스킬 10개 존재)하고 **의미 검토 미수행** |
| 1-재 | 동일 에이전트 (`write_agent`) | 2회 연속 판정 회피 → **모델·에이전트 교체 결정** |
| 2 | `general-purpose` + `gpt-5.6-sol` | **Blocker 1 / Major 6** — 실질적 결함 다수 발견 |
| 3 | 동일 에이전트 (`write_agent`) | Blocker 0 / **Major 2** — 수정이 만든 신규 모순 지적 |
| 4 | 동일 에이전트 (`write_agent`) | **Blocker 0 / Major 0 — 완료 조건 충족** (Minor 3, 2건 반영) |

**검증이 실제로 잡아낸 주요 결함:**
1. **필수↔생략 기준 정면 충돌** — 검증자가 준 예시(`credentials: 'include'`, `@()`)를 생략 예시로 그대로 옮기면서, "인증 경로·구동 스크립트는 필수"와 모순되는 구멍을 만들었다. → 우선순위 선언 + 반례 명시로 폐쇄
2. **라우터 자기 원칙 위반** — §4에 모델표·불변식·생략기준을 중복 기재해 "라우터는 세부를 중복 기재하지 않는다"를 스스로 어김. 실제로 "스텝마다 모델을 바꾼다"는 **사실과 다른 문구 드리프트**까지 발생 → §4를 24줄 → 9줄로 축소
3. **완료 조건 불일치** — 본문은 Blocker·Major 해소를 요구하는데 게이트는 `Blocker 0`만 요구 → Major를 남긴 채 커밋 가능한 구멍
4. **과잉 위임** — "3파일 이상이면 `security-review`" 같은 크기 기준이 보안 무관 변경까지 강제 → 위험도 기준으로 전면 교체

**증거 우선 원칙으로 기각한 지적 2건:**
- 검증자가 "`task` 도구에 `mode` 인자가 없다", "`rubber-duck` 에이전트가 없다"고 지적했으나, 메인 세션에서 `mode="background"` 호출이 실제로 2회 성공했고 `agent_type` enum에 `rubber-duck`이 존재한다. **서브에이전트에 노출된 스키마가 메인과 다른 것**이 원인. → 이 경험을 §5의 "도구 가시성 차이" 규칙과 그 안전장치로 문서화

**검증자 실패 모드 2건도 실측으로 확보해 §6 표에 기록:**
- **판정 회피** — 기계적 확인만 하고 "의미 검토는 미수행"으로 종료 → 프롬프트에 "네 산출물은 각 항목의 판정이다" 명시 + "이미 확인된 사실" 블록 제공으로 대응
- **인코딩 중단** — 서브에이전트가 한글을 셸로 출력하다 `UnicodeEncodeError: 'cp949'`로 명령이 죽고 그대로 포기 → 프롬프트에 "실행 환경" 블록 필수화

**부분 산출물의 가치:** 판정을 회피한 1라운드 검증자도 **실제 오류 1건을 잡아냈다** — `/fleet`이 존재하지 않는다고 판단해 문서에서 삭제했으나, CLI 도움말에 실제로 존재함을 증거로 제시해 복원했다. 이에 따라 "검증자가 실패해도 부분 산출물은 버리지 않는다"를 §6에 규정했다.

---

## 변경 이력 (v0.9.58 — 2026-09-11)

### v0.9.58 — #1. 루트 폴더 구조 단순화 및 진입점 단일화

**요청:**
- 최상위 폴더에 파일이 너무 많고, `Start_AOP_Web`·`Stop_AOP_Web`·`AOP_Web.ps1`이 혼재해 가독성이 떨어짐
- 불필요한 파일 삭제 및 구조 최적화

**대상 파일:** `AOP_Web.bat`(신규 진입점), `scripts/AOP_Web.ps1`, `docs/AI_Rearch_*.md`, `README.md`, `.github/copilot-instructions.md`, `.gitignore`, `backend/app.py`

**Before (루트 추적 파일 14개):**
- 동일 기능에 대해 진입점이 5개 공존 — `AOP_Web_Auto.bat`, `Start_AOP_Web_Auto.bat`, `Stop_AOP_Web_Auto.bat`, `Start_AOP_Web.ps1`, `Stop_AOP_Web.ps1`
- `Start_AOP_Web.ps1`은 v0.9.56 래퍼화 과정에서 **구 파일의 잔여 코드가 그대로 남아 문법적으로 깨진 상태**였음 (래퍼 9줄 뒤에 이전 구현의 `catch` 블록 잔재가 이어짐)
- `AOP_Web_Common.ps1`은 `AOP_Web.ps1`이 모든 함수를 자체 보유하게 되면서 **아무도 참조하지 않는 죽은 코드**가 됨
- 변경이력 문서 2개(약 140KB)가 루트에 노출
- `AOP_Web.ps1`의 `-Debug` 파라미터는 선언만 되고 사용처 없음
- `.playwright-mcp/`, `screenshots/` 산출물이 `.gitignore` 미등록

**After (루트 추적 파일 6개):**
- 진입점 단일화: `AOP_Web.bat` 하나만 유지 (`start`/`stop`/`restart`/`status`/`prod`)
- 실행 로직 이동: `AOP_Web.ps1` → `scripts/AOP_Web.ps1`
- 변경이력 이동: `AI_Rearch_summary.md`, `AI_Rearch_detail.md` → `docs/`
- 삭제: 래퍼 4종 + 죽은 코드 `AOP_Web_Common.ps1`
- **경로 기준 보정(중요)**: 스크립트가 `scripts/` 하위로 내려가면서 `$projectPath = $scriptPath`가 `scripts/`를 가리켜 `logs/`·`backend/`·`frontend/` 해석이 모두 깨질 수 있었음 → `$projectPath = Split-Path -Parent $scriptPath`로 수정
- 미사용 `-Debug` 파라미터 및 Help 항목 제거
- 참조 갱신: `README.md`(명령어·디렉터리 구조), `.github/copilot-instructions.md`(라우팅·Change Log 경로), `backend/app.py`(AOP_ENV 주석)
- `.gitignore`에 `.playwright-mcp/`, `screenshots/` 추가

**정리 과정에서 발견·수정한 실제 버그 3건:**

1. **단일 프로세스 서비스 미탐지 (영향 큼)**
   - 증상: 프론트엔드가 실제로 기동(HTTP 200)되어 있는데 `status`는 `STOPPED`로 표시. 더 심각하게는 `stop`이 프론트엔드를 **종료하지 못하고 조용히 건너뜀**
   - 원인: `Get-ProcessesOnPort`가 결과 1건일 때 PowerShell이 배열을 스칼라로 언롤링 → 호출부의 `$procs.Count`가 `$null`이 되어 `-gt 0` / `-eq 0` 분기가 모두 오작동. 백엔드는 reloader 때문에 프로세스가 2개라 우연히 정상 동작해 그동안 드러나지 않았음
   - 조치: 5개 호출부를 모두 `@(Get-ProcessesOnPort ...)`로 배열 고정하고, 함수에 호출 규약 주석 명시. `Show-Status`·`Stop-Services`·`Start-Services`(포트 선점 정리)가 함께 교정됨
2. **종료된 PID를 RUNNING으로 오탐**
   - 증상: `stop` 직후 `status`가 `Process: Unknown`으로 RUNNING 표시. `start` 시 이미 죽은 PID에 `Stop-Process` 시도
   - 원인: 프로세스 종료 후에도 netstat에 LISTENING 소켓이 잠시 잔존하는데, 기존 코드는 `Get-Process` 실패 시 `"Unknown"` 이름으로 **레코드를 그대로 생성**
   - 조치: `Get-Process`로 생존 확인 후 죽은 PID는 결과에서 제외
3. **배치가 실패를 은폐**
   - 증상: PowerShell이 오류로 종료해도 `AOP_Web_Auto.bat`이 항상 `exit /b 0` 반환 → 작업 스케줄러가 실패를 감지 불가
   - 조치: `ERRORLEVEL`을 그대로 전파하고, 알 수 없는 인자에 대해 사용법 출력 후 `exit /b 1`

**검증:**
- `scripts\AOP_Web.ps1 -Diagnose` → Python 3.12.9 / Node v20.15.0 / backend·frontend 경로 모두 `OK` (경로 기준 보정 확인)
- 로그가 `scripts/logs`가 아닌 루트 `logs/`에 생성되는 것 확인
- `.\AOP_Web.bat start` → 백엔드·프론트엔드 정상 기동 (약 2초), exit code 0
- `.\AOP_Web.bat status` → 수정 전 프론트엔드 `STOPPED` 오탐 → 수정 후 `RUNNING | node | PID` 정상 표시
- `.\AOP_Web.bat stop` → 프론트엔드 포함 3개 프로세스 정상 종료 (수정 전에는 프론트엔드 미종료)
- 종료 직후 `status` → 잔존 소켓에도 불구하고 양쪽 `STOPPED` 정상 판정
- `.\AOP_Web.bat restart` → 종료 후 재기동까지 정상, HTTP 확인(프론트엔드 200, 백엔드 404 응답 = 앱 정상 응답)
- `.\AOP_Web.bat bogus` → 사용법 출력 후 exit code 1 반환
- 검증 후 세션 시작 시점과 동일하게 서비스는 정지 상태로 복원

---

## 변경 이력 (v0.9.57 — 2026-09-11)

### v0.9.57 — #1. README 작성 및 구동 컨텍스트 보완

**요청:**
- Readme 파일을 생성하여 애플리케이션 구동 방법 설명
- AI 에이전트가 이를 잘 수행할 수 있도록 컨텍스트를 보완한 뒤 설계/구현/검증 진행

**대상 파일:** `README.md`, `.github/copilot-instructions.md`, `Implementation_list.md`

**Before:**
- 프로젝트 루트에 구동 가이드라인을 담은 `README.md` 문서가 존재하지 않았음
- `.github/copilot-instructions.md` 라우팅 테이블에 프로젝트 실행/구동에 관한 파일 참조가 없었음

**After:**
- `.github/copilot-instructions.md` 라우터에 `README.md`, `AOP_Web.ps1` 라우팅 경로를 추가하여 AI 에이전트의 컨텍스트 참조 효율을 향상시킴
- `README.md` 작성: 기술 스택, 사전 요구사항, `AOP_Web_Auto.bat` 통합 제어 명령어, PowerShell 세부 옵션, Windows 시작프로그램 자동 실행 등록 방법, 수동 개별 실행 방법, 디렉토리 구조 및 트러블슈팅 안내 체계화
- `Implementation_list.md`에 수행 일자(2026-09-11)와 버전(v0.9.57)을 명시한 2줄 요약 기록

---

## 변경 이력 (v0.9.56 — 2026-09-11)

### v0.9.56 — #1. 루트 파일 정리 및 단일 통합 스크립트 구축

**요청:**
- 프로젝트 root 디렉토리 파일 정리 (중복 제거 및 흩어진 파일 정리)
- 하나의 파일에서 start/stop/restart/status가 모두 가능하도록 통합
- 서버 시작프로그램 등록 자동 기동에 최적화되도록 `.bat` 및 스크립트 구조 검증 및 개선

**대상 파일:** `AOP_Web_Auto.bat`, `AOP_Web.ps1`, `Start_AOP_Web_Auto.bat`, `Stop_AOP_Web_Auto.bat`, `Start_AOP_Web.ps1`, `Stop_AOP_Web.ps1`, `Implementation_list.md`

**Before:**
- Start/Stop 스크립트가 파편화되어 중복 코드가 존재했고, 단일 파일에서 다목적 관리가 불가능했음
- 루트 디렉토리에 불필요한 고정 바로가기(`Start_AOP_Web_Auto.bat - 바로 가기.lnk`) 존재
- 서버 시작프로그램 등록 시 비대화형 실행 옵션 미흡으로 대기 병목 가능성 존재

**After:**
- `AOP_Web.ps1` 및 `AOP_Web_Auto.bat` 단일 통합 스크립트 작성: Start/Stop/Restart/Status를 인자 하나로 완벽 제어
- 매개변수 없이 실행 시 서버 시작프로그램 자동 실행에 맞춰 dev 모드 Start가 비차단(-NonInteractive)으로 즉시 진행되도록 최적화
- 불필요한 `.lnk` 파일 제거 및 기존 스크립트(`Start_AOP_Web_Auto.bat` 등)는 1줄 래퍼로 단순화해 하위 호환성 유지
- `Implementation_list.md`에 수행 일자(2026-09-11)와 버전(v0.9.56)을 명시하고 2줄 요약 기록

---

## 변경 이력 (v0.9.55 — 2026-09-11)

### v0.9.55 — #1. Start_AOP_Web_Auto 구동 속도 및 병목 최적화

**요청:**
- `Implementation_list.md` 기반으로 `Start_AOP_Web_auto.bat` 실행 시 병목 및 최적화 진행, 속도 개선 후 수행 내역 기록

**대상 파일:** `Start_AOP_Web_Auto.bat`, `Stop_AOP_Web_Auto.bat`, `Start_AOP_Web.ps1`, `Implementation_list.md`

**Before:**
- `Start_AOP_Web_Auto.bat` 및 `Stop_AOP_Web_Auto.bat`에서 `powershell.exe`를 호출할 때 `-NoProfile` 옵션 미지정으로 사용자 프로필 로딩에 의한 초기 1~3초 추가 지연 발생
- 배치 파일 종료 전 고정 `timeout /t 3` 대기로 불필요한 대기 병목 존재
- `Start_AOP_Web.ps1` 내부 Backend/Frontend 창 띄울 때도 `-NoProfile` 미지정으로 창 기동 지연

**After:**
- 배치 파일의 PowerShell 실행 구정에 `-NoProfile` 옵션 추가 (`powershell.exe -NoProfile -ExecutionPolicy Bypass ...`)
- 배치 종료 대기시간을 1초(`timeout /t 1`)로 단축
- `Start_AOP_Web.ps1` 자식 창 기동 파라미터에 `-NoProfile` 추가
- `Implementation_list.md`에 수행 일자(2026-09-11)와 버전(v0.9.55)을 명시하고 2줄 요약 형태의 개선 사항 기록

---

## 변경 이력 (v0.9.54 — 2026-08-16)

### v0.9.54 — #1. Backend 개발모드 자동 재시작(Reloader) 도입

**요청:**
- Backend/Frontend 코드 수정 시 서버를 매번 종료 후 재시작해야 하는지 확인
- 가능하면 개발 모드에서는 자동 반영되도록 개선

**대상 파일:** `backend/app.py`, `Start_AOP_Web.ps1`

**Before:**
- `app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)` — 운영/개발 구분 없이 `use_reloader=False` 고정
- Frontend(`npm run dev`)는 Next.js Fast Refresh로 이미 자동 반영되고 있었으나, Backend는 코드 수정 후 반드시 `Stop_AOP_Web.ps1` → `Start_AOP_Web.ps1` 재실행이 필요했음

**After:**
- `app.py`: `AOP_ENV` 환경변수(`development`/`production`, 미설정 시 `development`로 간주)를 읽어 `is_dev` 계산 → `debug=is_dev, use_reloader=is_dev`
  - 개발 모드: Werkzeug reloader 활성화 → `.py` 파일 저장 시 자동 감지·재시작 (`* Detected change in '...', reloading` 로그로 확인)
  - 운영 모드: 기존과 동일하게 `debug=False, use_reloader=False` 유지 (보안: Werkzeug 디버거 노출 방지, 안정성: reloader의 자식 프로세스 분기 방지)
- `Start_AOP_Web.ps1`: 백엔드 프로세스 시작 직전 `$env:AOP_ENV = if ($Production) {"production"} else {"development"}` 설정. `Start-Process`로 띄우는 자식 프로세스는 현재 세션의 환경변수를 상속받으므로 별도 인자 전달 없이 자동 반영

**검증:**
- 개발 모드로 `app.py` 직접 기동 후 로그에서 `* Restarting with stat` 확인
- `config.py`의 mtime을 갱신해 실제 파일 변경을 시뮬레이션 → `* Detected change in '...\config.py', reloading` → `* Restarting with stat` 로 자동 재시작 확인
- 신규 바인딩이 이전 프로세스 종료 후에도 정상적으로 이루어짐을 확인 (포트 점유 잔존 이슈 없음)

**참고 (Frontend):**
- `npm run dev`는 이미 Fast Refresh(HMR)가 기본 활성화되어 있어 대부분의 컴포넌트/CSS 수정은 별도 조치 없이 자동 반영됨. `next.config.js`/`.env*`/`package.json` 변경 시에만 재시작 필요 (기존 동작 유지, 변경 없음)

**참고 (전체 개발 모드 기동):**
- `Start_AOP_Web_Auto.bat`은 이미 기본적으로 `-Production` 없이 `Start_AOP_Web.ps1`을 호출하도록 되어 있어(운영 모드 라인은 주석 처리) Backend/Frontend 모두 개발 모드로 시작됨. 별도 수정 없이 현재 상태가 "전부 개발 모드로 시작"에 해당

---

## 변경 이력 (v0.9.53 — 2026-08-16)

### v0.9.53 — #1. Server Start Script 성능 개선

**요청:**
- `Start_AOP_Web_Auto.bat`(서버 기동 스크립트) 관련 속도/정확도 리뷰 및 개선
- 기능 삭제 금지, 중복·병목 발견 시 업데이트

**대상 파일:** `AOP_Web_Common.ps1`, `Start_AOP_Web.ps1`, `Stop_AOP_Web.ps1`

**변경 내용:**

1. **포트 확인 방식 전환 (핵심 병목 제거)**
   - Before: `Get-NetTCPConnection`(CIM 기반) — 실측 호출당 **2.5~4.5초**
   - After: `netstat -ano -p tcp` 파싱 — 실측 호출당 **70~120ms** (약 30배 이상 고속화)
   - 신규 공통 함수 `Get-ProcessesOnPort`(포트→PID→프로세스명), `Test-PortListening`(단발 확인), `Wait-ForPortListening`(폴링 대기)을 `AOP_Web_Common.ps1`에 추가

2. **백엔드 기동 검증 로직 개선**
   - Before: 무조건 `Start-Sleep -Seconds 5` 후 프로세스 확인 → 별도로 최대 10초(20회×0.5초) 포트 폴링 루프 → 총 대기 상한 15초, 정상 기동 시에도 최소 5초 낭비
   - After: 프로세스 최소 초기화 대기(0.5초) 후 즉시 `Wait-ForPortListening`(0.3초 간격, 최대 15초) 폴링 → 정상 기동 시 대기시간이 실제 준비 시간에 수렴

3. **프론트엔드 기동 검증 추가** (기능 확장, 삭제 없음)
   - Before: 무검증 고정 대기(`Start-Sleep -Seconds 2/5`) 후 그대로 진행
   - After: 포트 3000 리스닝 여부를 폴링으로 확인해 로그에 성공/경고 기록. 실패해도 치명적 오류로 처리하지 않음(첫 컴파일 등으로 지연 가능)

4. **프로덕션 헬스체크 루프 개선**
   - Before: `Test-NetConnection`(DNS 조회·ICMP 관련 오버헤드 포함, 실측 4.5초) 매 분 2회 호출
   - After: 신규 `Test-PortListening` 사용 (netstat 기반, 실측 <100ms)

5. **Start/Stop 스크립트 간 중복 코드 제거**
   - `Start_AOP_Web.ps1`의 `Stop-ProcessOnPort`와 `Stop_AOP_Web.ps1`의 `Stop-ServiceOnPort`가 거의 동일한 "포트→PID→프로세스" 탐지 로직을 각자 보유하고 있었음 → 공통 함수 `Get-ProcessesOnPort`로 통합, 두 스크립트는 결과만 소비
   - 부가 효과: 기존에는 PID당 `Get-Process`를 로깅용/표시용으로 두 번 조회했으나, 헬퍼가 반환하는 객체(`ProcessId`, `ProcessName`)를 재사용해 중복 조회 제거

6. **정확도 개선: LISTENING 상태만 필터링**
   - Before: `Get-NetTCPConnection -LocalPort $Port`(상태 무관)로 조회 후 PID 0만 제외 → TIME_WAIT/ESTABLISHED 상태의 무관한 클라이언트 프로세스(예: 해당 포트에 접속 중인 브라우저 탭)의 PID가 섞여 들어와 있으면 오탐 가능성 존재
   - After: `Get-ProcessesOnPort`가 `LISTENING` 상태 항목만 파싱 → 실제로 포트를 점유(바인딩)한 서버 프로세스만 정확히 식별

7. **`Clean-OldLogs` 중복 디스크 스캔 제거**
   - Before: `Get-ChildItem -Recurse`를 오래된 로그 조회용/전체 용량 계산용으로 **2회** 수행
   - After: 1회 스캔한 결과를 메모리 상에서 필터링해 재사용 (로그가 많을수록 효과 큼)

**검증:**
- 3개 스크립트 모두 PowerShell 파서로 문법 검증(오류 없음)
- `Start_AOP_Web.ps1 -Diagnose` 정상 동작 확인
- 신규 공통 함수(`Get-ProcessesOnPort`, `Test-PortListening`, `Wait-ForPortListening`)를 실제 `python -m http.server` 임시 프로세스로 통합 테스트: 기동 감지 315ms, PID/프로세스명 정확 탐지, 프로세스 종료 후 미탐지까지 확인

---

## 변경 이력 (v0.9.51 — 2026-08-12)

### v0.9.51 — #1. 자동 커밋 정책 신설

**요청:**
- 매 수정이 있을 때마다 자동으로 커밋 진행
- 커밋에 한글 설명 포함

**대상 파일:** `.github/copilot-instructions.md`

**변경 내용:**
- **§7 자동 커밋 정책(필수) 신설** — 모든 수정은 완료·검증 후 자동 커밋(사용자가 "커밋하지 마"라고 한 경우만 예외)
  - **커밋 시점**: 논리적 변경 1건 완료+검증 후 즉시. 변경 1건 = 커밋 1건. Change Log 갱신도 동일 커밋에 포함
  - **스테이징 안전 규칙**: 이번에 변경한 파일만 명시적 `git add`, `git add .`/`-A` 금지. 생성물(`__pycache__`, `.next`, `node_modules`, `*.pyc` 등)·`.env*`·시크릿 스테이징 금지. 커밋 전 `git status --short` 확인
  - **한글 메시지 규칙**: 제목(한글 요약, 접두사 `기능:`/`수정:`/`리팩터:`/`문서:`/`성능:`/`스타일:`) + 본문(무엇을·왜, 2~4줄) + `Co-authored-by` 트레일러. 예시 포함
- **Do-Not-Touch Zones**를 §7 → **§8**로 이동(번호 재정렬)

**비고:**
- 이 정책은 CLI 에이전트의 워크플로 규칙이다. 파일 저장 즉시 트리거되는 OS 레벨 파일와처/git 훅 방식이 아니라, 에이전트가 각 변경 단위를 완료할 때마다 커밋하는 방식으로 안전성(오염 커밋·시크릿 유출 방지)을 확보한다

---

### v0.9.51 — #2. Input file 매칭 팝업 흐름 복구

**요청:** Tx Summary Input에서 Input file 선택 시 출력되는 매칭 팝업창을 이전 상태로 복구. 다른 부분은 변경 금지.

**대상 파일:** `frontend/src/app/verification-report/page.js` (단일 파일, 7 insertions / 18 deletions)

**히스토리 분석:**

| 커밋 | 내용 |
|------|------|
| `79a6055` | **원래 흐름** — 파일 선택 시 검증 → 매칭 팝업(`Tx Summary Parameter Matching`) 출력. 업로드는 `txValidationOk` 게이트만 확인 |
| `ebb4a26` | 파일 선택 시 CSV 미리보기 팝업으로 교체, DB 매칭 검증을 업로드 시점으로 이동 |
| `e6d0b9a` | 되돌리려 했으나 **복원이 불완전** |

**원인 (`e6d0b9a`의 누락 2건):**

1. **매칭 팝업 중복 출력** — `handleTxFileChange`에서 `validateTxFile()`을 호출하는데, 동시에 `useEffect([txFile, ...])`도 같은 검증을 실행.
   파일을 고르면 `setTxFile()`로 useEffect까지 트리거되어 **팝업이 2번** 열렸다.
2. **업로드 시 팝업 재출력** — `ebb4a26`이 넣은 `uploadTxSummary` 내부의 `validateTxFile()` 재호출이 그대로 남아,
   업로드 버튼을 누를 때 매칭 팝업이 또 열렸다. 원래는 `txValidationOk`만 확인했다.

**변경 내용:**

```javascript
// ① handleTxFileChange: 파일 상태만 갱신 (검증 호출 제거)
const handleTxFileChange = (event) => {
  const selectedFile = event.target.files?.[0] || null;
  setTxFile(selectedFile);
  setTxValidationMessage('');
  setTxValidationOk(false);
  setTxError('');
  if (selectedFile && (!txDatabase || !txProbe || !txSoftwareVersion)) {
    setTxValidationMessage('파일이 선택되었습니다. Database/Probe/Software version 선택 후 자동 검증됩니다.');
  }
  // 실제 검증/매칭 팝업은 useEffect가 단독으로 담당한다(팝업 중복 방지).
};

// ② uploadTxSummary: 검증 재실행 → 게이트 확인으로 복원 (79a6055 방식)
if (!txValidationOk) {
  alert('파일 파라미터 검증이 완료되지 않았습니다. 검증 결과를 확인하세요.');
  return;
}
```

**동작 (복구 후)**
- Database/Probe/Software version이 모두 선택된 상태에서 파일 선택 → 매칭 팝업 **1회** 출력
- 파일을 먼저 선택한 경우 → 안내 메시지 표시 후, 선택값이 채워지면 자동 검증 및 팝업 출력
- 업로드 버튼 → 추가 팝업 없이 검증 통과 여부만 확인 후 진행

**변경하지 않은 것:** 팝업 내용/레이아웃(`openTxValidationWindow`), 검증 API(`/api/validate_tx_summary_file`), 백엔드, Verification Report 카드 등 나머지 전부

**검증:** `npm run build` — Compiled successfully (exit 0), 변경 범위 1파일 확인

---

### v0.9.51 — #3. Tx Summary txt 파일 입력 지원

**요청:** Tx summary 입력 파일이 txt 형태이다. 반영 필요. 에러: `Only CSV files are allowed`

**원인:** Tx summary 파일은 `날짜_ProbeName_TxRequestSummary.txt` 형식인데, 백엔드 3개 엔드포인트가 모두 `.csv` 확장자만 허용하고 `pd.read_csv`를 콤마 구분자 기본값으로 호출하고 있었다.

| 위치 | 기존 |
|------|------|
| `preview_tx_summary_file` | `endswith(".csv")` + `read_csv(...)` |
| `validate_tx_summary_file` | `endswith(".csv")` + `read_csv(...)` |
| `upload_tx_summary` | `endswith('.csv')` + `decode('utf-8')` + `read_csv(...)` |

**대상 파일:** `backend/routes/db_api.py`, `frontend/src/app/verification-report/page.js`

**변경 내용:**

1. **공용 헬퍼 2개 신설** (`db_api.py`) — 3곳에 흩어진 확장자 검사/파싱 로직을 단일화

```python
_ALLOWED_TX_EXTENSIONS = (".csv", ".txt")


def _is_allowed_tx_file(filename: str) -> bool:
    return bool(filename) and filename.strip().lower().endswith(_ALLOWED_TX_EXTENSIONS)


def _read_tx_dataframe(file_storage) -> pd.DataFrame:
    """Tx summary 입력 파일(CSV/TXT)을 DataFrame으로 읽는다."""
    raw_bytes = file_storage.read()
    try:
        content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        content = raw_bytes.decode("cp949")
    filename = (file_storage.filename or "").strip().lower()
    if filename.endswith(".txt"):
        try:
            return pd.read_csv(StringIO(content), sep=None, engine="python")
        except Exception:
            return pd.read_csv(StringIO(content), sep="\t")
    return pd.read_csv(StringIO(content))
```

   - **구분자 자동 감지** — txt는 `sep=None, engine="python"`으로 sniffing, 실패 시 tab 폴백
   - **대소문자 무관** — `.TXT` / `.CSV`도 허용
   - **인코딩 폴백** — `upload_tx_summary`는 기존에 `decode('utf-8')` 고정이라 BOM·cp949 파일에서 깨졌는데, 다른 두 엔드포인트와 동일하게 `utf-8-sig` → `cp949` 폴백으로 통일

2. **3개 엔드포인트 적용** — 확장자 검사·파싱을 헬퍼 호출로 교체, 에러 메시지 한글화(`CSV 또는 TXT 파일만 업로드할 수 있습니다.` / `파일 파싱에 실패했습니다.` / `파일에 데이터가 없습니다.`)

3. **프론트엔드** — 파일 선택기에 `accept=".csv,.txt"` 추가

**검증:**

| 케이스 | 결과 |
|--------|------|
| 확장자 허용 (`.csv` / `.txt` / `.TXT`) | 통과, `.xlsx` 거부 |
| tab 구분 txt | 컬럼 3개 · 2행 정상 파싱 |
| 콤마 구분 txt | 컬럼 3개 정상 파싱 (sniffing 동작) |
| cp949 인코딩 txt (한글 값) | 정상 디코딩 |
| 기존 csv | 회귀 없음 |

- `py_compile` 통과, `npm run build` Compiled successfully (exit 0)

---

## 변경 이력 (v0.9.52 — 2026-08-14)

### v0.9.52 — #1. Tx Summary 매칭 팝업 컬럼순서/파생값/표시 규칙 정렬

**요청:**
- 컬럼 순서를 아래 SQL 순서로 고정
  `TxSummaryID, ProbeName, ExamName, Mode, SubModeIndex, BeamStyleIndex, TxFreqIndex, ProbeNumElevAper, ProbeNumTxCycles, TxpgWaveformStyle, TxChannelModulationEn, CompoundingIndex, TxPulseRle, IsPresetCpaEn, IsProcessed, ProbeID, Software_version, Combined_mode, TxFrequency`
- 없는 데이터는 파라미터 아래 `X`, 실제값은 `NULL(빨간색)`으로 표시
- `ProbeID`/`Software_version`/`ProbeName`/`ExamName`/`Combined_mode` 파생값 규칙 반영

**대상 파일:**
- `backend/routes/db_api.py`
- `frontend/src/app/verification-report/page.js`
- `frontend/src/app/verification-report/tx-matching-popup/page.js`

**변경 내용:**
1. **백엔드 컬럼 순서 고정**
   - `validate_tx_summary_file`에서 `parameter_order`를 고정 배열로 반환
   - 프론트는 이 순서를 그대로 사용해 표의 컬럼 순서가 매번 동일

2. **파생값 규칙 반영**
   - `ProbeID` = 선택한 ProbeID
   - `Software_version` = 선택한 SW version
   - `ProbeName` = 드롭다운 선택 ProbeName (프론트 formData로 `probeName` 전달)
   - `ExamName` = txt 파일의 `Exam`/`ExamName` 계열 컬럼에서 추출
   - `Combined_mode` = `Mode` 길이 기준 (`1글자 → 0`, `2글자 이상 → 1`)
   - `IsProcessed` = `"1"`

3. **선택값 필터 fallback**
   - 파일에 `ProbeID`/`Software_version` 컬럼이 있어도 선택값 필터 결과가 비면 파일 전체(`df_norm`)를 fallback으로 사용해 데이터 소실 방지

4. **팝업 셀 표시 규칙 변경**
   - 값 없음/매핑불가(`UNMATCHED` 또는 `NULL`)는 셀에 `X` + `NULL`(빨간색) 2줄로 표시
   - 정상값은 기존처럼 실제 값 출력

**Before / After:**
- Before: 컬럼 순서가 매번 변동 가능, 일부 파생값이 빈값/미매핑, 없는 데이터 표기가 일관되지 않음
- After: SQL 기준 고정 컬럼 순서 + 파생값 자동 주입 + 누락 데이터 `X/NULL(빨간색)` 일관 표기

📎 **[→ 변경 요약(Summary)](./AI_Rearch_summary.md)**

---

## 변경 이력 (v0.9.38 — 2026-05-12)

### v0.9.38 — #1. 전체 프로젝트 코드 리뷰

**요청:**
- 전체 프로젝트(Backend + Frontend)를 리뷰하여 버그, 보안 취약점, 중복 코드, 가독성 문제 수정

**수정 내역 (11건):**

#### 🔴 런타임 버그 (2건)

| 파일 | 문제 | 수정 |
|------|------|------|
| `pkg_MeasSetGen/data_inout.py` | `logging` 모듈 미임포트 → 108행 `logging.getLogger()` NameError | `import logging` 추가 |
| `backend/app.py` | `Config.load_config()`가 `if __name__ == "__main__"` 블록에만 존재 → WSGI/gunicorn 실행 시 설정 미로드 | `create_app()` 내부로 이동 |

#### 🟠 보안 취약점 (2건)

| 파일 | 문제 | 수정 |
|------|------|------|
| `routes/db_api.py` `insert_sql_measset()` | 임의 테이블명 입력 가능 (SQL 인젝션 위험) | `allowed_insert_tables = ["meas_setting"]` allowlist 검증 추가 |
| `utils/decorators.py` `with_db_connection()` | 임의 데이터베이스명 입력 가능 | `DATABASE_NAME` 환경변수 + `AOP_MLflow_Tracking` 기반 allowlist 검증 추가 |

#### 🟡 코드 품질 (7건)

| 파일 | 문제 | 수정 |
|------|------|------|
| `app.py` | `g.pop("db", None)` — 존재하지 않는 `g.db` 정리 시도 (dead code) | teardown에서 제거, `DatabaseManager.close_connections()`만 유지 |
| `routes/db_api.py` `run_tx_compare()` | `@handle_exceptions`와 중복되는 내부 try/except | 내부 try/except 제거 (decorator가 동일 처리) |
| `routes/db_api.py` | `import json`, `import numpy as np`, `from io import StringIO` 함수 내부 인라인 임포트 | 파일 상단으로 이동 |
| `pkg_MeasSetGen/Temp_Prr_predict.py` | 340-341행 `pandas`/`numpy` 중복 임포트, 352행 함수 내부 `numpy` 중복 임포트 | 중복 3건 삭제 (1-5행의 기존 임포트 유지) |
| `pkg_MeasSetGen/predictML.py` | 미사용 `from pkg_SQL.database import SQL`, 함수 내부 `import time` | `SQL` 제거, `time`을 파일 상단으로 이동 |
| `pkg_MeasSetGen/create_groupidx.py` | 직접 `SQL()` 생성 → 중앙화된 `get_db_connection()` 미사용, 생성자에서 불필요한 session 접근 | `get_db_connection()` 사용으로 통일, session 접근 제거 |
| `pkg_MachineLearning/fetch_selectFeature.py` | 매 호출 시 `Config.load_config()` 반복 실행 | `create_app()`에서 1회 호출로 통합되어 삭제 |

#### 🔵 프론트엔드 (1건)

| 파일 | 문제 | 수정 |
|------|------|------|
| `frontend/src/app/viewer/page.js` | `useEffect` 의존성 배열에 `API_BASE_URL` 누락 → React lint 경고 | 두 `useEffect`에 `API_BASE_URL` 추가 |

**Before/After:**
- Before: 런타임 NameError 가능, WSGI 시 설정 미로드, 테이블/DB 이름 미검증, 중복·인라인 임포트 산재
- After: 모든 런타임 버그 수정, 보안 allowlist 적용, 임포트 정리, DB 접근 패턴 통일

---

## 변경 이력 (v0.9.37 — 2026-05-11)

### v0.9.37 — #1. awesome-copilot 확장 설치

**요청:**
- GitHub awesome-copilot 리포지토리에서 프로젝트 기술 스택(Python/Flask + Next.js 15 + MS-SQL + Playwright)에 맞는 instructions, skills, agents를 분석하여 적용

**해결 방식:**
- 프로젝트 기술 스택을 분석하여 awesome-copilot에서 관련성 높은 항목 선별
- 🔴 필수 + 🟡 권장 우선순위로 설치 범위 결정

**설치 내역:**

| 카테고리 | 항목 | 파일 수 |
|----------|------|---------|
| Instructions | `nextjs`, `ms-sql-dba`, `sql-sp-generation`, `security-and-owasp`, `html-css-style-color-guide`, `context7` | 6 |
| Skills | `sql-code-review`, `sql-optimization`, `playwright-generate-test`, `playwright-explore-website`, `security-review`(+5 refs), `acquire-codebase-knowledge`(+10 assets), `conventional-commit` | 22 |
| Agents | `ms-sql-dba`, `playwright-tester`, `expert-nextjs-developer`, `principal-software-engineer`, `plan` | 5 |

**Before:** Instructions 2개(커스텀), Skills 4개(suggest/make 도구), Agents 0개
**After:** Instructions 8개, Skills 11개 폴더(26 파일), Agents 4개

**최적화 조치 (심층 감사):**

| 항목 | 조치 | 이유 |
|------|------|------|
| `security-and-owasp.instructions.md` (29.7KB) | **제거** | 너무 큼. AGENTS.md + security-review 스킬로 대체 |
| `nextjs.instructions.md` (9.6KB) | **제거** | Next.js 16 기준. frontend/AGENTS.md에 v15 규칙 있음 |
| `context7.instructions.md` (4.3KB) | **제거** | MCP 도구 설명에 이미 포함. 중복 |
| `html-css-style-color-guide` (3.2KB) | **제거** | 일반 색상 이론이 프로젝트 CSS 변수와 충돌 |
| `sql-sp-generation` (3.1KB) | **제거** | `id` 필수 등 기존 DB 스키마와 충돌 |
| `expert-nextjs-developer.agent.md` (18.4KB) | **제거** | Next.js 16 + TypeScript → 잘못된 안내 위험 |
| `conventional-commit` 스킬 | **제거** | 영어 커밋 포맷 → 한글 커밋 규칙과 충돌 |
| `playwright-tester.agent.md` | TypeScript → **JavaScript** 수정 | 프로젝트 JS 사용 |
| `ms-sql-dba.instructions.md` | applyTo: `**` → `**/*.sql,**/*.py` | 불필요한 로드 방지 |

**컨텍스트 로드 변화:**
- JS 작업 최악: 51.8KB → **5.0KB** (90% 감소)
- SQL 작업: 43.5KB → **6.4KB** (85% 감소)
- 항상 로드: 9.3KB → **5.0KB** (46% 감소)

---

## 변경 이력 (v0.9.36 — 2026-04-29)

### v0.9.36 — #1. Data Preview 모달 추가

**문제:**
- MeasSet Generation 후 생성되는 전체 데이터(Intensity/Power/Temperature)의 관계 구조를 한눈에 파악하기 어려움
- 기존 UI는 Temperature 데이터만 필터링하여 표시, 전체 구조를 확인할 수 없음

**해결 방식:**
- `DataPreviewModal.js` 컴포넌트 신규 생성
- measSetComments 기반 4가지 타입 분류: Intensity / Power / Temperature / Temperature_SA
- GroupIndex별 아코디언 UI로 데이터 관계도 표시
- 요약 통계(전체 rows, 그룹 수, 타입별 개수) 상단 표시
- 모달 열기 전 세션 스토리지에서 최신 데이터 동기화 (팝업 편집 창과의 데이터 정합성 보장)
- ESC 키 닫기, 백드롭 클릭 닫기, body 스크롤 잠금
- 다크모드 완전 지원 (CSS 변수 + `[data-theme="dark"]` 선택자)

**변경 파일:**

| 파일 | 변경 |
|------|------|
| `frontend/src/components/DataPreviewModal.js` | 신규 — 모달 컴포넌트 |
| `frontend/src/app/measset-generation/page.js` | 📊 Data Preview 버튼 추가, 모달 state/렌더링 통합 |
| `frontend/src/globals.css` | DataPreview 모달 CSS + 다크모드 스타일 추가 |

**Before:** Generate & View CSV / Open Data in New Window / Save to SQL — 3개 버튼
**After:** + 📊 Data Preview 버튼 추가 (fullCsvData 존재 시 활성화), 클릭 시 GroupIndex별 관계도 모달 표시

---

### v0.9.36 — #2. Data Preview 아이콘 및 메타정보 변경

**문제:**
- Power 아이콘(⚡)과 Intensity 아이콘(📐)이 직관적이지 않음
- GroupIndex 헤더에서 해당 그룹의 주요 측정 파라미터(주파수, 파형, 사이클)를 즉시 확인 불가

**해결 방식:**
- Power 아이콘: ⚡ → ⚖️ (저울 모양)으로 변경
- Intensity 아이콘: 📐 → 💧 (물방울 모양)으로 변경
- GroupIndex 헤더 순서 변경: `Group N` → `Freq/WF/Cycle` → (오른쪽 정렬) `아이콘 배지` → `rows`

**변경 파일:**

| 파일 | 변경 |
|------|------|
| `frontend/src/components/DataPreviewModal.js` | 아이콘 변경 (typeConfig, summary bar, group badges), GroupIndex 메타정보 렌더링 추가 |
| `frontend/src/globals.css` | `.dp-group-meta`, `.dp-meta-sep` 스타일 추가 |

**Before:** `Group {N}` + 타입 배지 + 전체 rows 수만 표시
**After:** `Group {N}` + 타입 배지 + `Freq: 값 | WF: 값 | Cycle: 값` + 전체 rows 수 표시

---

### v0.9.36 — #3. Data Preview 배지 위치 통일

**문제:**
- 그룹 헤더의 🌡️ Temperature, 🌡️SA, ⚖️ Power, 💧 Intensity 배지가 조건부 렌더링으로 인해 데이터가 없는 그룹에서는 배지가 생략되어 나머지 배지의 위치가 밀림
- 그룹마다 아이콘 위치가 달라 시각적으로 정렬되지 않음

**해결 방식:**
- 4개 주요 배지(Temperature, Temperature SA, Power, Intensity)를 항상 렌더링
- 데이터가 0개인 배지에 `.dp-badge-empty` 클래스 적용 (opacity: 0.3)
- `.dp-badge`에 `min-width: 3rem; text-align: center` 추가하여 크기 일관성 확보

**변경 파일:**

| 파일 | 변경 |
|------|------|
| `frontend/src/components/DataPreviewModal.js` | 배지 조건부 렌더링 → 항상 렌더링 + `dp-badge-empty` 클래스 조건 추가 |
| `frontend/src/globals.css` | `.dp-badge-empty` 스타일 추가, `.dp-badge`에 min-width/text-align 추가 |

**Before:** 데이터 없는 타입의 배지가 생략되어 그룹마다 아이콘 위치가 다름
**After:** 모든 배지가 항상 동일 위치에 표시, 0개 데이터는 흐리게(opacity 0.3) 처리

---

## 변경 이력 (v0.9.35 — 2026-04-25)

### v0.9.35 — #1. 스크립트 리팩토링

**문제:**
- `Write-Log`, `Save-JsonLog`, `Clean-OldLogs` 함수가 Start/Stop 스크립트에 완전히 동일하게 중복 (~90줄)
- `Stop_AOP_Web.ps1`의 `Stop-ServiceOnPort`에서 PID 0 (TIME_WAIT 커널 연결) 필터링 누락 → `Stop-Process -Id 0` 실패 가능
- `Start_AOP_Web.ps1`에 미사용 `Test-PortAvailability` 함수, `-NoAdmin` 파라미터 존재
- JSON 로그 타임스탬프가 `fffZ` (로컬 시간인데 UTC 표기)

**해결 방식:**

| 항목 | Before | After |
|------|--------|-------|
| 공유 함수 | Start/Stop 각각에 동일 함수 복사 | `AOP_Web_Common.ps1` 신규 생성, dot-source 로 공유 |
| PID 0 버그 | `Stop-ServiceOnPort`에서 PID 0 포함하여 `Stop-Process` 시도 | `Where-Object { $_.OwningProcess -ne 0 }` 필터 추가 + 조기 반환 |
| 미사용 코드 | `Test-PortAvailability`, `-NoAdmin` 선언만 존재 | 완전 제거 |
| 타임스탬프 | `"yyyy-MM-ddTHH:mm:ss.fffZ"` (잘못된 UTC 표기) | `[DateTimeOffset]::Now.ToString("o")` (ISO 8601 정확한 오프셋) |
| bat 파일 | PS 스크립트 존재만 확인 | `AOP_Web_Common.ps1` 존재 여부도 확인 |

**변경 파일:**
- `AOP_Web_Common.ps1` — **신규 생성** (공통 로깅·정리 함수)
- `Start_AOP_Web.ps1` — 중복 함수 제거, dot-source 추가, 미사용 코드 제거
- `Stop_AOP_Web.ps1` — 중복 함수 제거, dot-source 추가, PID 0 버그 수정
- `Start_AOP_Web_Auto.bat` — `AOP_Web_Common.ps1` 존재 확인 추가
- `Stop_AOP_Web_Auto.bat` — `AOP_Web_Common.ps1` 존재 확인 추가

---

### v0.9.35 — #2. Copilot CLI 5대 엔지니어링 최적화

**목적:** Claude Code의 5대 핵심 엔지니어링 개념(프롬프트·컨텍스트·스킬·MCP·하네스)을 Copilot CLI에 적용하여 에이전트 성능 최대화

**설계 원칙:**
- 루트 = 라우터(map) — 전역 규칙 + 라우팅만, 세부사항은 하위 파일에
- AGENTS.md = 도메인 아키텍처/불변식 — 코드 예시 포함 (canonical source)
- .instructions.md = 작업 모드 — 트리거 기반 조건부 로딩
- 중복 금지 — 같은 체크리스트를 두 곳에 쓰지 않음, 참조로 대체

**해결 방식:**

| 항목 | Before | After |
|------|--------|-------|
| 루트 instruction | 모든 규칙을 한 파일에 나열 (map + workflow + quality gate) | **라우터 전용**: 전역 규칙 + 컨텍스트 라우팅 테이블 + 파일 포인터 |
| 컨텍스트 관리 | "read AGENTS.md first" 1줄 | **라우팅 테이블** (변경 대상 → 읽을 파일 매핑) + **윈도우 관리 규칙** (필요한 것만 로드, 중단 조건) |
| 오케스트레이션 | 없음 | `agent-orchestration.instructions.md` **신규**: 서브에이전트 선택 매트릭스, 병렬 호출 규칙, 도구 우선순위, MCP 활용, 에러 복구 |
| 검증 체크리스트 | Quality Gate 3줄 (generic) | `verification.instructions.md` **신규**: 스택별 체크 항목, 위험 변경 트리거, 검증 흐름 (AGENTS.md 참조 방식) |
| backend AGENTS.md | 아키텍처 규칙만 | + **Top 5 Costly Mistakes** (1줄 요약 + 본문 섹션 포인터) + **Diagnostic Flow** (증상 기반 진단 트리) |
| frontend AGENTS.md | 아키텍처 규칙만 | + **Top 5 Costly Mistakes** + **Diagnostic Flow** |
| 지침 우선순위 | 없음 | 루트에 **precedence 규칙** 추가: "구체적 지침 > 일반 지침, 안전/보안 항상 최우선" |

**변경 파일:**
- `.github/copilot-instructions.md` — 라우터 구조로 재설계, 컨텍스트 라우팅·우선순위 규칙 추가, 오케스트레이션 섹션을 포인터로 축소
- `.github/instructions/agent-orchestration.instructions.md` — **신규 생성** (하네스/오케스트레이션/스킬/MCP)
- `.github/instructions/verification.instructions.md` — **신규 생성** (품질 게이트/검증 체크리스트)
- `backend/AGENTS.md` — Top 5 Costly Mistakes + Diagnostic Flow 추가
- `frontend/AGENTS.md` — Top 5 Costly Mistakes + Diagnostic Flow 추가

**중복 제거 내역:**
- verification.instructions.md: 코드 예시 블록 전면 삭제 → AGENTS.md 참조로 대체 (decorator order, SQL, theming 등 8건)
- AGENTS.md Top 5: 본문 반복 설명 삭제 → 1줄 요약 + 섹션 포인터 (backend 5건, frontend 5건)
- copilot-instructions.md section 5: 요약 bullets 전면 삭제 → 파일 포인터만 유지

---

## 변경 이력 (v0.9.34 — 2026-04-18)

### v0.9.34 — #1. 네비바 반응형 개선

**문제:** 브라우저 창을 줄이면 5개 메뉴 + 로그인 버튼이 공간 부족으로 로그인 버튼이 메뉴 위로 올라감

**해결 방식:** 3단계 프로그레시브 콜랩스 (현재 반응형 트렌드 반영)

| 화면 크기 | 동작 |
|-----------|------|
| >1100px | 전체 표시 (아이콘 + 텍스트) |
| 901–1100px | 아이콘 전용 모드 (텍스트 숨김, 툴팁으로 메뉴명 표시) |
| ≤900px | 햄버거 메뉴 (메뉴 + 테마 토글 + 로그인/로그아웃 통합) |

**변경 파일:**

1. **`frontend/src/components/Navbar.js`**
   - `handleLogin` 함수 추출 (데스크톱/모바일 공유)
   - 인증 영역을 `.navbar-auth-buttons`로 래핑 (CSS 제어용)
   - 모바일 드롭다운에 테마 토글, 로그인/로그아웃, 사용자명 섹션 추가
   - 인라인 스타일 → CSS 클래스 전환 (`.navbar-login-btn`, `.navbar-logout-btn`)
   - 메뉴 링크에 `title` 속성 추가 (아이콘 전용 모드에서 툴팁)

2. **`frontend/src/globals.css`**
   - `.navbar-auth-buttons`, `.navbar-login-btn`, `.navbar-logout-btn` 스타일 추가
   - `button.navbar-mobile-link` 리셋, `.navbar-mobile-divider`, `.navbar-mobile-user-info` 등 모바일 인증 스타일 추가
   - 중간 브레이크포인트 `@media (max-width: 1100px) and (min-width: 901px)` 추가 — `.navbar-link-text` 숨김
   - 모바일 브레이크포인트에 `.navbar-auth-buttons { display: none }` 추가

**Before:** 창 축소 시 로그인 버튼이 메뉴 영역 위로 겹침  
**After:** 점진적 축소 — 중간 크기에서 아이콘 전용, 모바일에서 햄버거로 모든 컨트롤 통합

📎 **[→ Summary](./AI_Rearch_summary.md)**

---

## 2026-08-16 전역 병목 2차 개선 (기능 동일)

### 요청
- 기능은 그대로 유지하면서 전역 병목 구간을 2차로 추가 개선

### 조치
1. **필터 공통 로직 통합 + Set 기반 재사용**
   - 파일:
     - `frontend/src/app/data-view/utils/filterHelpers.js` (신규)
     - `frontend/src/app/data-view/hooks/useDataFilter.js`
     - `frontend/src/app/data-view/hooks/useDataEdit.js`
     - `frontend/src/app/data-view/hooks/useRowOperations.js`
   - 변경:
     - `normalizeFilterValue`, `buildNormalizedFilterSets`, `isRowMatchingFilters` 공통화
     - 저장/복원 시 필터 재적용 경로를 동일한 Set 기반 판정으로 통일
   - 효과:
     - 대규모 데이터에서 필터 재계산 시 문자열 정규화 및 선형 탐색 반복 감소
     - 훅 간 필터 동작 일관성 강화(정확도 개선)

2. **TableBody 렌더 경로 최적화**
   - 파일: `frontend/src/app/data-view/components/DataTable/TableBody.jsx`
   - 변경:
     - `editableKeys.includes`를 셀 단위 반복 호출하지 않고 `Set`으로 1회 구성 후 조회
     - 각 셀에서 `Object.entries(row)` 대신 `headers` 기준 순회로 키 탐색 비용 절감
     - `formatNumber` 결과를 title/content에서 재사용해 중복 포맷 연산 제거
   - 효과:
     - 행/열이 많은 화면에서 셀 렌더링 비용 감소

3. **TX 검증 비교 루프 최적화**
   - 파일: `backend/routes/db_api.py` (`validate_tx_summary_file`)
   - 변경:
     - `iterrows()` 기반 순회를 `to_dict('records')` 기반으로 전환
     - 파일 행별 컬럼 소문자 lookup을 파라미터마다 재생성하지 않고 행당 1회 생성 후 재사용
   - 효과:
     - 비교 파라미터가 많은 경우 CPU 사용량과 처리시간 감소

4. **대량 삽입 처리량 최적화**
   - 파일: `backend/pkg_SQL/database.py`
   - 변경:
     - `create_engine(..., fast_executemany=True)` 적용
     - `insert_data`에서 `to_sql(..., chunksize=1000, method='multi')` 적용
   - 효과:
     - `upload_tx_summary` 등 대량 INSERT 경로의 처리량 개선

### 결과
- 기능 동작/응답 형식은 유지하면서, 데이터뷰 렌더·필터·검증·대량 삽입의 고비용 루프를 줄여 체감 성능을 추가 개선했다.

📎 **[→ Summary](./AI_Rearch_summary.md)**

---

## 변경 이력 (v0.9.33 — 2026-04-17)

### Detailed Change Description

[→ Summary](./AI_Rearch_summary.md#변경-이력-v0933--2026-04-17)

#### 1. auth.py — 입력 검증 및 에러 핸들링 (`backend/routes/auth.py`)

**문제**: `request.get_json()`이 None을 반환할 때 `data.get()` 호출에서 AttributeError 발생 가능. 로그인 실패 시 동일한 에러 응답이 2번 중복.

**Before**:
```python
data = request.get_json()
username = data.get("username")  # data가 None이면 AttributeError
```

**After**:
```python
data = request.get_json(silent=True)
if not data:
    return error_response("Request body must be valid JSON", 400)
```

#### 2. db_api.py — SQL 안전성 강화 (`backend/routes/db_api.py`)

**문제**: 
- 테이블명이 f-string으로 직접 삽입 (allowlist 검증 후이지만 bracket 이스케이프 미적용)
- IN절에서 문자열 연결 방식 사용 (파라미터화 미적용)
- NaN 대체값 불일치 ("empty" vs "Empty")

**Before**:
```python
query = f"SELECT * FROM {selected_table} WHERE measSSId IN ({id_str})"
df["probeId"] = df["probeId"].fillna("empty")
```

**After**:
```python
placeholders = ",".join(["?" for _ in id_list])
query = f"SELECT * FROM [{selected_table}] WHERE measSSId IN ({placeholders})"
df = g.current_db.execute_query(query, params=id_list)
df["probeId"] = df["probeId"].fillna("Empty")
```

#### 3. database.py — 가독성 개선 (`backend/pkg_SQL/database.py`)

**문제**: execute_query 메서드가 170줄로 과도하게 길고, `logging.info()` vs `logger.info()` 혼용.

**After**: `_sanitize_params_for_log()`, `_convert_params()` 헬퍼 메서드 분리. 모든 `logging.*` → `logger.*` 통일.

#### 4. create_groupidx.py — 성능 벡터화 (`backend/pkg_MeasSetGen/create_groupidx.py`)

**문제**: Python for 루프로 DataFrame 행을 순회하여 GroupIndex 생성 — 대용량 데이터에서 10x+ 느림.

**Before**:
```python
for value in df["TxFocusLocCm"]:
    if prev_value is None or value >= prev_value:
        group_indices.append(group_index)
    else:
        group_index += 1
        group_indices.append(group_index)
    prev_value = value
```

**After**:
```python
decreased = df["TxFocusLocCm"] < df["TxFocusLocCm"].shift()
df["GroupIndex"] = decreased.fillna(False).cumsum() + last_groupIdx + 1
```

#### 5. predictML.py — iterrows 제거 및 예외 로깅 (`backend/pkg_MeasSetGen/predictML.py`)

**문제**: `iterrows()` 사용 (pandas에서 가장 느린 순회 방법). `except: pass`로 예외 무시.

**After**: `to_dict('records')` 변환으로 100x+ 성능 향상. 모든 `pass` → `logger.debug()` 로깅.

#### 6. data_inout.py — 예외 처리 (`backend/pkg_MeasSetGen/data_inout.py`)

**문제**: `except OSError: pass` — 디렉토리 생성 실패를 무시하여 후속 파일 저장에서 원인 추적 불가.

**After**: 로깅 후 예외 재발생 (`raise`).

#### 7. remove_duplicate.py — 코드 최적화 (`backend/pkg_MeasSetGen/remove_duplicate.py`)

**문제**: 모드별 필터링에서 불필요한 개별 변수 생성, `concat` 다회 호출, CEUS 모드에 isDuplicate 컬럼 누락.

**After**: `isin()` 활용으로 간결화, `ignore_index=True`로 한 번에 concat, CEUS 모드 isDuplicate 초기화 추가.

#### 8. data_splitting.py — 재현성 (`backend/pkg_MachineLearning/data_splitting.py`)

**문제**: `random_state` 미지정으로 실행할 때마다 다른 분할 결과.

**After**: `random_state=42` 기본값 추가, docstring 추가.

#### 9. training_evaluation.py — 정리 (`backend/pkg_MachineLearning/training_evaluation.py`)

**문제**: `np.round_` (deprecated alias), 메서드 내부 `import logging`, 주석처리된 DNN 코드.

**After**: `np.round` 사용, 모듈 레벨 logger, 불필요 코드 제거.

#### 10. Navbar.js — 테마 중복 제거 (`frontend/src/components/Navbar.js`)

**문제**: `ThemeInit`에서 이미 `data-theme` 속성을 설정했는데, Navbar에서 `localStorage`를 다시 읽고 재설정 — 불필요한 I/O + race condition 가능성.

**After**: localStorage 대신 `document.documentElement.getAttribute('data-theme')` 읽기만 수행.

#### 11. Layout CSS 중복 import (`frontend/src/app/(home)/layout.js`, `measset-generation/layout.js`)

**문제**: Layout.js가 이미 Bootstrap과 globals.css를 import하는데, Layout을 사용하는 레이아웃에서 다시 import — 번들 파싱 시간 증가.

**After**: Layout 래퍼를 사용하는 레이아웃에서 중복 import 제거.

#### 12. csvExport.js — 에러 안전성 (`frontend/src/app/data-view/utils/csvExport.js`)

**문제**: 에러 발생 시 `URL.revokeObjectURL()`이 호출되지 않아 메모리 누수 가능.

**After**: `try/finally` 패턴으로 항상 DOM 정리 및 URL 해제.

#### 13. useWindowSync.js — 보안 (`frontend/src/app/data-view/hooks/useWindowSync.js`)

**문제**: `postMessage` 수신 시 origin 검증 없어 XSS 공격에 취약.

**After**: `event.origin !== window.location.origin` 검증 추가.

#### 14. TableBody.jsx — 버그 수정 (`frontend/src/app/data-view/components/DataTable/TableBody.jsx`)

**문제**: `displayData.length === 0`일 때 `displayData[0]`에 접근 → `Object.keys(undefined)` 에러.

**After**: 안전한 colSpan 계산 (editableKeys 기반).

#### 15. EditableCell.jsx — CSS 안정성 (`frontend/src/app/data-view/components/EditableCell.jsx`)

**문제**: `border.split(' ')[2]`로 borderColor 추출 — CSS 변수 형식 변경 시 깨짐.

**After**: STYLE_VARIANTS에 `borderColor` 속성 직접 추가, split 제거.

---

## 변경 이력 (v0.9.32 — 2026-04-17)

### Detailed Change Description

[→ Summary](./AI_Rearch_summary.md#변경-이력-v0932--2026-04-17)

#### 1. 다크모드 테이블 가독성 수정 (`frontend/src/globals.css`)

**문제**: Machine Learning 페이지의 Model Version Performance 테이블이 다크모드에서 텍스트/숫자가 보이지 않음. Bootstrap 5.3의 내부 CSS 변수 캐스케이드(`--bs-table-color-type`, `--bs-table-color-state`)가 커스텀 다크 테마 오버라이드보다 우선 적용되어 검은색 텍스트가 어두운 배경에 표시됨.

**Before**:
```css
[data-theme="dark"] .table { color: var(--text); }
[data-theme="dark"] .table-light,
[data-theme="dark"] .table-light > * {
  --bs-table-color: var(--text);
  --bs-table-bg: var(--bg);
}
```

**After**:
```css
[data-theme="dark"] .table {
  --bs-table-color: var(--text);
  --bs-table-bg: var(--surface);
  --bs-table-hover-color: var(--text);
  --bs-table-hover-bg: var(--table-hover);
  color: var(--text);
}
[data-theme="dark"] .table-light,
[data-theme="dark"] thead.table-light {
  --bs-table-color-type: var(--text);   /* Bootstrap 5.3 cascade */
  --bs-table-color-state: var(--text);  /* Bootstrap 5.3 cascade */
}
[data-theme="dark"] .table > :not(caption) > * > * {
  --bs-table-color-type: var(--text);
  --bs-table-color-state: var(--text);
  color: var(--text);
}
```

#### 2. Viewer 중복 key 에러 수정 (`frontend/src/app/viewer/page.js`)

**문제**: 테이블 목록에 `"----------"` 구분선이 여러 개 포함되어 React key 중복 에러 발생.

**Before**: `{tableList.map((t) => <option key={t} value={t}>{t}</option>)}`
**After**: `{tableList.map((t, i) => <option key={\`${t}-${i}\`} value={t} disabled={t === '----------'}>{t}</option>)}`

---

## 변경 이력 (v0.9.31 — 2026-04-15)

### Detailed Change Description

[→ Summary](./AI_Rearch_summary.md#변경-이력-v0931--2026-04-15)

프로젝트 전체 코드 리뷰를 통해 보안, 버그, 코드 품질 문제를 식별하고 수정.

#### 1. SQL 인젝션 방어 강화 — `get_viewer_data`

**파일:** `backend/routes/db_api.py`

**Before:**
```python
id_df = g.current_db.execute_query(
    f"SELECT TOP 1 c.name FROM sys.columns c "
    f"JOIN sys.tables t ON c.object_id = t.object_id "
    f"WHERE t.name = N'{selected_table}' AND c.is_identity = 1"
)
```

**After:**
```python
id_df = g.current_db.execute_query(
    "SELECT TOP 1 c.name FROM sys.columns c "
    "JOIN sys.tables t ON c.object_id = t.object_id "
    "WHERE t.name = ? AND c.is_identity = 1",
    params=(selected_table,)
)
```

**이유:** allowlist 검증 후에도 f-string SQL은 방어 심층(defense-in-depth) 원칙에 위배. 파라미터화 쿼리로 변경하여 SQL 인젝션 경로를 원천 차단.

#### 2. `datetime.utcnow()` 지원 중단 대응

**파일:** `backend/routes/auth.py`

**Before:**
```python
"exp": datetime.utcnow() + timedelta(seconds=Config.EXPIRE_TIME),
```

**After:**
```python
"exp": datetime.now(timezone.utc) + timedelta(seconds=Config.EXPIRE_TIME),
```

**이유:** Python 3.12부터 `datetime.utcnow()`가 deprecated. timezone-aware datetime 사용으로 전환.

#### 3. 로그인 실패 로깅 추가

**파일:** `backend/routes/auth.py`

**Before:** 로그인 실패 시 로깅 없음
**After:** `logger.warning(f"Failed login attempt for user: {username}")` 추가

**이유:** 무차별 대입(brute-force) 공격 탐지를 위한 보안 감사 로그 필수.

#### 4. `auth/status` 세션 자격증명 확인 추가

**파일:** `backend/routes/auth.py`, `frontend/src/components/Navbar.js`

**Before:** JWT 토큰만 확인 → JWT 유효하나 세션 만료 시 인증됨으로 표시되지만 DB 요청에서 422 오류 발생
**After:** `has_credentials` 필드 추가 → 세션 자격증명 없으면 프론트엔드에서 비인증 상태로 처리

**이유:** JWT와 세션의 이중 인증 소스 불일치로 인한 사용자 혼란 방지.

#### 5. 미사용 코드 제거

- **`backend/pkg_SQL/database.py`:** 사용되지 않는 `verify_password()` 메서드 및 `import bcrypt` 제거
- **`backend/utils/database_manager.py`:** 사용되지 않는 `_connections = {}` 클래스 변수 제거

**이유:** 죽은 코드는 유지보수 혼란과 불완전한 보안 구현의 오해를 유발.

#### 6. 프론트엔드 에러 핸들링 개선

**파일:** `Navbar.js`, `SSR_DocOut/page.js`, `viewer/page.js`

**Before:** `catch {}` (빈 catch 블록, 에러 무시)
**After:** `catch (err) { console.error('...', err); ... }`

**이유:** 빈 catch 블록은 네트워크 오류, CORS 문제, 서버 장애 등의 디버깅을 불가능하게 만듦.

#### 7. 다크모드 호환성 수정

**파일:** `frontend/src/app/SSR_DocOut/page.js`

**Before:** `background: '#10b981'` / `'#d1d5db'` (하드코딩 색상)
**After:** `background: 'var(--status-success-text)'` / `'var(--border)'` (CSS 변수)

**이유:** 하드코딩 색상은 다크모드에서 가독성 문제 유발.

#### 8. React key 및 의존성 배열 수정

- **`viewer/page.js`, `SSR_DocOut/page.js`:** `<option key={i}>` → `<option key={db}>` (인덱스 대신 고유값 사용)
- **`auth/login/page.js`:** `useCallback` deps에 `API_BASE_URL` 추가

**이유:** 인덱스 기반 key는 리스트 재정렬 시 상태 누수 유발. 누락된 의존성은 stale closure 버그 가능.

---

## 변경 이력 (v0.9.30 — 2026-04-15)

### Detailed Change Description

[→ Summary](./AI_Rearch_summary.md#변경-이력-v0930--2026-04-15)

하네스 엔지니어링(OpenAI "Harness Engineering") 원칙을 적용하여 AI 에이전트의 프롬프트/컨텍스트 시스템을 전면 재설계.

#### 적용된 하네스 엔지니어링 원칙

1. **Map, not encyclopedia**: `copilot-instructions.md`를 목차(TOC)로 전환. 도메인별 상세 지침은 각 폴더의 `AGENTS.md`로 분리하여 progressive disclosure 구현.
2. **Context is scarce**: 에이전트가 필요한 폴더 작업 시에만 해당 `AGENTS.md`를 읽도록 경로 기반 지시.
3. **Enforce invariants at boundaries**: Critical Invariants 섹션을 각 instructions 파일에 추가.
4. **Describe actual patterns**: TypeScript → JavaScript(JSX), "session-based auth" → "JWT+Session hybrid" 등 실제 코드베이스 패턴으로 수정.

#### 수정 파일 상세

**`.github/copilot-instructions.md`** — 전면 재구성

| 항목 | Before | After |
|------|--------|-------|
| 역할 | 규칙 나열 | 목차/맵 (도메인 문서로 안내) |
| Context Architecture | 없음 | progressive disclosure 섹션 추가 |
| Do-Not-Touch Zones | 없음 | 생성/런타임 파일 보호 규칙 추가 |
| Change Log | Quality Gate 체크리스트 내 한 줄 | 독립 섹션 — 목적·작성법·상호 링크 규칙 명시 |
| 기술 스택 Frontend | TypeScript | JavaScript (JSX) — 실제 반영 |

**`.github/instructions/backend.instructions.md`** — 규칙 강화

| 항목 | Before | After |
|------|--------|-------|
| 데코레이터 | 이름만 나열 | 순서 명시 (exceptions → auth → DB) |
| Auth 패턴 | "session-based" | "JWT HttpOnly cookie + Flask session stores DB credentials" |
| 응답 포맷 | 미기술 | Success/Error JSON 구조 + 상태 코드 표 |
| Critical Invariants | 없음 | CORS, 쿠키 설정, 로깅 규칙 |

**`.github/instructions/frontend.instructions.md`** — 규칙 강화

| 항목 | Before | After |
|------|--------|-------|
| 'use client' | 미기술 | 모든 페이지/컴포넌트 필수 |
| 테마 시스템 | 기본 언급 | storage key, hydration flash 방지, 셀렉터 규칙 |
| Critical Invariants | 없음 | layout 순서, env prefix, Bootstrap override, DataViewer 필터 |

**`backend/AGENTS.md`** (신규 생성)
- 파일 구조 트리, Request Lifecycle, Auth Flow, DB 패턴 (CORRECT/WRONG 예시), Key Patterns 표

**`frontend/AGENTS.md`** (신규 생성)
- 파일 구조 트리, Layout Stack 순서, 테마 토큰 표, API 엔드포인트 표, "Do Not Simplify Away" 경고

---

## 변경 이력 (v0.9.29 — 2026-04-11)

### Detailed Change Description

Copilot 에이전트의 성능을 최적화하기 위해 `.github/copilot-instructions.md` 파일을 전면 재작성하였다.

#### 문제 분석

기존 파일(253줄)에는 LLM 성능을 저하시키는 다음과 같은 구조적 문제가 있었다:

1. **가상 3-에이전트 모델 (~70줄)**: Planning/Implementation/Evaluation 에이전트의 역할 정의, 3×3 교차검증 매트릭스, 각 에이전트별 교차검증 의무 등을 상세히 기술. LLM은 실제로 병렬 내부 에이전트를 실행하지 않으므로 불필요한 역할극을 강제하여 인지 부하만 증가시킴.
2. **병렬 실행 프로토콜**: 이미 시스템 프롬프트에 내장된 병렬 실행 기능을 4번 반복 지시.
3. **Pre-Output Safety Checklist**: 섹션 2(에이전트 모델)와 섹션 3-5(코딩 규칙)의 내용을 그대로 중복.
4. **기술 스택 불일치**: FastAPI로 기술되어 있으나 실제 프로젝트는 Flask 사용.

#### 수정 내역

**`.github/copilot-instructions.md`** — 전면 재작성

| 항목 | Before | After |
|------|--------|-------|
| 전체 줄 수 | 253줄 | 106줄 (−58%) |
| 에이전트 모델 | 가상 3-에이전트 + 교차검증 매트릭스 (70줄) | "Plan → Implement → Review" 3단계 워크플로우 (7줄) |
| 병렬 실행 | 별도 프로토콜 + 테이블 (10줄, 4회 반복) | Core Principles에 1줄로 통합 |
| 품질 검증 | Pre-Output Checklist (20줄, 섹션 2와 중복) | Quality Gate (8줄, scope/verification 체크 추가) |
| 기술 스택 | FastAPI (프로젝트 불일치) | Flask (실제 프로젝트 반영) |
| 프론트엔드 | "React or Next.js" (모호) | "Next.js 15 with React 18" (명확) |
| DB | 일반적 기술 | MS-SQL Server + deterministic/transaction-safe 명시 |
| 테스팅 | "No test → No acceptable code" (절대적) | "Behavior changes should include tests when practical" (실용적) |
| 문서화 | AI_summary/AI_detail (예시와 혼재) | 정확한 파일명(`AI_Rearch_summary.md`, `AI_Rearch_detail.md`) 명시 |
| 신규 추가 | — | scope control, "no implicit behavior", rubber-duck agent 활용 |

#### 성능 최적화 근거

- **토큰 절감**: 지시문이 58% 줄어 모델이 실제 작업에 더 많은 컨텍스트 윈도우를 할당 가능
- **중복 제거**: 동일 규칙의 반복이 해석 혼란을 줄이고 일관된 행동을 유도
- **실현 가능한 규칙**: 가상 에이전트 역할극 대신 실제 도구(rubber-duck agent)를 활용하는 실용적 검증 프로세스
- **정확한 컨텍스트**: 실제 기술 스택과 일치하는 지시로 불필요한 추론 제거

---

## 변경 이력 (v0.9.28 — 2026-04-05)

### Detailed Change Description

Viewer 팝업에서 데이터 조회 시 최신 순이 아닌 임의 순서의 1000건이 반환되던 문제를 수정하였다.

#### 문제 원인

`get_viewer_data()` 엔드포인트의 쿼리가 `SELECT TOP 1000 * FROM {table}` 으로, `ORDER BY` 절이 없었다.  
SQL Server는 `ORDER BY` 없는 `TOP N`을 물리적 페이지 할당 순서(heap scan 또는 clustered index leaf 순서)로 반환하므로, 가장 오래된 행이 먼저 나오게 된다.

#### 수정 내역

**`backend/routes/db_api.py` — `get_viewer_data()`**

```python
# Before (임의 순서)
df = g.current_db.execute_query(f"SELECT TOP 1000 * FROM {selected_table}")

# After (IDENTITY 컬럼 탐지 → 최신 순)
order_clause = ""
try:
    id_df = g.current_db.execute_query(
        f"SELECT TOP 1 c.name FROM sys.columns c "
        f"JOIN sys.tables t ON c.object_id = t.object_id "
        f"WHERE t.name = N'{selected_table}' AND c.is_identity = 1"
    )
    if id_df is not None and not id_df.empty:
        identity_col = id_df.iloc[0, 0]
        order_clause = f" ORDER BY [{identity_col}] DESC"
except Exception:
    pass
df = g.current_db.execute_query(f"SELECT TOP 1000 * FROM {selected_table}{order_clause}")
```

| 항목 | 내용 |
|------|------|
| IDENTITY 탐지 | `sys.columns JOIN sys.tables WHERE is_identity = 1` |
| 정렬 방향 | `DESC` — 최신(가장 큰 ID) 1000건 우선 반환 |
| 폴백 동작 | IDENTITY 없거나 쿼리 실패 시 기존 `TOP 1000` (비정렬) 유지 |
| 보안 | `selected_table`은 allowlist 검증 통과 후 사용, `identity_col`은 DB 카탈로그 직접 조회값이므로 SQL 인젝션 위험 없음 |

---



### Detailed Change Description

창 크기 변화 시 Navbar 메뉴 아이템이 겹치는 반응형 레이아웃 문제를 업계 표준 방식으로 해결하였다.

#### 문제 원인

1. **`flex-shrink: 0` on `.navbar-link`** — 각 메뉴 아이템이 축소를 거부하여 공간 부족 시 하드 오버플로우 발생
2. **Two-phase 브레이크포인트 충돌** — 900px에서 아이콘 전용 상태로 전환, 640px에서 햄버거로 전환하는 260px 간격의 이중 상태가 불안정한 레이아웃 유발
3. **사용자명 텍스트 미처리** — `whiteSpace: nowrap` 인라인 스타일로 고정된 사용자명이 중간 뷰포트에서 auth 섹션을 밀어냄

#### 수정 내역

**`src/globals.css`**

| 항목 | 변경 내용 |
|------|-----------|
| `.navbar-mobile-menu` 기본 | `display: none` 유지, `padding` 제거 (미디어쿼리로 이관) |
| `.navbar-mobile-menu.open` | `display: flex` 직접 토글 제거 |
| `.navbar-username` | 신규 클래스 정의 (`font-size`, `color`, `white-space`) |
| `@media (max-width: 900px)` | 단일 브레이크포인트로 통합: `navbar-divider` 숨김, `navbar-links` 숨김, `navbar-toggle` 표시, `navbar-username` 숨김, 모바일 메뉴 `max-height` 애니메이션 적용 |
| `@media (max-width: 640px)` | **삭제** (900px로 통합) |
| Dark mode | `[data-theme="dark"] .navbar-username { color: var(--text-sec); }` 추가 |

**`src/components/Navbar.js`**

| 항목 | 변경 내용 |
|------|-----------|
| 사용자명 span | 인라인 스타일 제거 → `className="navbar-username"` 적용 |
| `resize` 이벤트 핸들러 | `useEffect`로 `window.innerWidth > 900`일 때 `setMenuOpen(false)` 호출. 마운트 즉시 초기 검사, cleanup에서 removeEventListener 완비 |

#### 적용된 업계 표준 패턴

- **GitHub, Vercel, Linear** 모두 단일 브레이크포인트에서 데스크톱 메뉴 → 햄버거 전환
- **max-height 트랜지션** 패턴: `max-height: 0 → 500px` + `overflow: hidden`으로 JS 없이 슬라이드 애니메이션 구현 (GPU 가속)
- **반응형 메뉴 닫기**: resize 이벤트로 뷰포트가 데스크톱으로 복귀 시 모바일 메뉴 자동 닫기

---



### Detailed Change Description

Viewer 메뉴 진입 시 발생하는 React 하이드레이션 에러를 수정하였다.

#### 문제 원인

**1. 하이드레이션 불일치 (`suppressHydrationWarning` 누락)**

모든 루트 레이아웃은 인라인 `<script>`로 `data-theme` 속성을 `<html>` 요소에 동기적으로 적용한다.  
이 스크립트는 브라우저가 JS를 파싱하는 시점에 즉시 실행되므로, React가 하이드레이션을 시작할 때 이미 `<html data-theme="dark">` 상태다.  
그러나 서버는 `<html lang="en">`만 렌더링하므로 React가 서버/클라이언트 HTML 불일치를 감지 → 하이드레이션 에러.

**2. 중첩된 `<html>` 구조 (무효한 HTML)**

Next.js App Router에서 `viewer/layout.js`(부모)와 `viewer/data-view-standalone/layout.js`(자식)가 각각 독립적으로 `<html><body>`를 렌더링하고 있었다.  
Next.js는 이 두 레이아웃을 컴포넌트 트리에 중첩하여 합성하므로, 실제 DOM에 `<html>` 안에 `<html>`이 중첩되는 구조가 생성된다.  
이는 HTML 명세상 무효하며 React가 추가 하이드레이션 불일치를 보고한다.

#### 수정 내역

| 파일 | 수정 내용 |
|------|-----------|
| `app/viewer/layout.js` | `<html>` → `<html suppressHydrationWarning>` 추가 |
| `app/viewer/data-view-standalone/layout.js` | `<html><body>…</body></html>` 전체 제거, `<div className="standalone-viewer">` 래퍼만 유지. `ThemeInit` import 제거 (부모 레이아웃이 처리) |
| `app/verification-report/data-view-standalone/layout.js` | 동일하게 `<html><body>` 제거 → `<div>` 래퍼만 유지 |
| `app/(home)/layout.js` | `<html>` → `<html suppressHydrationWarning>` 추가 |
| `app/verification-report/layout.js` | `<html>` → `<html suppressHydrationWarning>` 추가 |

> `suppressHydrationWarning`은 해당 요소 1-depth 속성에만 적용되며 자식 트리로 전파되지 않는다. 테마 초기화 패턴에서 공식적으로 권장되는 해결책이다.

---

## 변경 이력 (v0.9.20 — 2026-04-04)

### Detailed Change Description

다크모드 전환 시 테이블 숫자 가독성 저하 및 Machine Learning 그래프 라인·텍스트 미표시 문제를 수정하였다.

#### 문제 원인 및 수정 내역

**1. DataTable 다크모드 가독성 (`frontend/src/app/data-view/components/DataTable/index.jsx`)**
- **원인**: `styled-jsx` 블록 내 `background-color: white`, `color: #374151` 등 하드코딩된 라이트모드 색상 사용. 다크모드에서 body 텍스트는 `#f1f5f9`(밝음)로 설정되지만 테이블 배경은 흰색 그대로여서 밝은 글자가 흰 배경에 렌더되어 숫자가 보이지 않음.
- **수정**: 모든 하드코딩 색상을 CSS 변수로 대체
  - `background-color: white` → `var(--surface)`
  - `border: 1px solid #e5e7eb` → `var(--border)`
  - `color: #374151` → `var(--text)`
  - `background-color: #f9fafb` (hover) → `var(--table-hover)`
  - 헤더 그라디언트 → `var(--surface)` 단일 색상
  - filter row `#fafafa` → `var(--bg)`

**2. Bootstrap 점수 색상 다크모드 재정의 (`frontend/src/globals.css`)**
- **원인**: `text-primary(#0d6efd)`는 다크 배경에서 대비비 2.6:1로 WCAG AA 미달. `text-success`, `text-danger`도 3.9:1, 3.7:1로 경계선.
- **수정**: `[data-theme="dark"]` 블록에 색상 오버라이드 추가
  ```css
  [data-theme="dark"] .text-success { color: #4ade80 !important; }  /* 대비비 8.5:1 */
  [data-theme="dark"] .text-primary { color: #93c5fd !important; }  /* 대비비 8.5:1 */
  [data-theme="dark"] .text-warning { color: #fbbf24 !important; }  /* 대비비 9.0:1 */
  [data-theme="dark"] .text-danger  { color: #f87171 !important; }  /* 대비비 7.2:1 */
  ```
- `globals.css`에 `--table-hover` 토큰 추가 (라이트: `#f1f5f9`, 다크: `#263347`)

**3. Chart.js 다크모드 지원 (`frontend/src/app/machine-learning/_constants.js`)**
- **원인**: `makeLineChartOptions`와 `SCATTER_CHART_OPTIONS`에 색상 미지정으로 Chart.js 기본값(다크 텍스트) 사용. 다크 배경에서 축 레이블·그리드·범례가 거의 보이지 않음.
- **수정**:
  - `makeLineChartOptions(onClickHandler, isDark)` — `isDark` 파라미터 추가
  - `SCATTER_CHART_OPTIONS` 정적 상수 → `makeScatterChartOptions(isDark)` 팩토리 함수로 교체
  - 공통 `chartColors(isDark)` 헬퍼 추가 (text/tick/grid/border 색상)
  - 다크: grid `rgba(241,245,249,0.12)`, text `#f1f5f9`, tick `#94a3b8`
  - 라이트: grid `rgba(0,0,0,0.1)`, text `#374151`, tick `#6b7280`

**4. Scatter 기준선 색상 (`frontend/src/app/machine-learning/_helpers.js`)**
- **원인**: Ideal (y=x) 기준선 색상 `rgba(0,0,0,0.3)`이 다크 배경에서 거의 투명하게 보임.
- **수정**: `buildScatterChartData(scatterData, isDark)` — `isDark` 파라미터 추가
  - 다크모드: `rgba(255, 255, 255, 0.55)` (흰색 반투명)
  - 라이트모드: `rgba(0, 0, 0, 0.3)` (기존 유지)

**5. 다크모드 감지 (`frontend/src/app/machine-learning/_hooks.js`)**
- `isDark` state + `MutationObserver`로 `document.documentElement`의 `data-theme` 속성 실시간 추적
- `chartOptions`, `scatterChartData`, `scatterChartOptions` useMemo에 `isDark` 의존성 추가
- `makeScatterChartOptions` import 추가, `scatterChartOptions` 반환값에 포함

**6. ScatterPlotCard prop 업데이트 (`frontend/src/app/machine-learning/components/ScatterPlotCard.js`, `page.js`)**
- `SCATTER_CHART_OPTIONS` import 제거, `scatterChartOptions` prop으로 수신
- `page.js`에서 `scatterChartOptions` destructure 후 `ScatterPlotCard`에 전달

---

## 변경 이력 (v0.9.19 — 2026-04-04)

### Detailed Change Description

화면 축소(반응형) 시 Navbar 메뉴 링크와 로그인/로그아웃 버튼이 겹치는 문제를 CSS 간격 조정만으로 수정하였다.

#### 수정 파일 및 내용

| 파일 | 변경 내용 |
|------|---------|
| `frontend/src/globals.css` | `@media (max-width: 900px)` 블록에 간격 축소 규칙 추가: `navbar-inner` padding `1.5rem→1rem`, `navbar-divider` margin `1.25rem→0.625rem`, `navbar-link` padding `0.4rem 0.6rem→0.375rem 0.5rem`, `navbar-links` gap `0.25rem→0.125rem`, `navbar-auth` gap `0.75rem→0.5rem` + padding-left `1rem→0.5rem` |

#### 간격 축소 효과 (900px 이하 기준)

| 요소 | 변경 전 공간 | 변경 후 공간 | 절약 |
|------|------------|------------|------|
| navbar-inner 좌우 패딩 | 48px | 32px | 16px |
| navbar-divider 좌우 마진 | 40px | 20px | 20px |
| navbar-auth gap+padding | ~28px | ~16px | 12px |
| 링크 5개 총 패딩 | ~90px | ~50px | 40px |
| **합계** | | | **~88px 절약** |

---

## 변경 이력 (v0.9.18 — 2026-04-04)

### Detailed Change Description

사용자 요청에 따라 전체 코드베이스를 3개의 병렬 AI 탐색 에이전트로 분석 후, 아래 18건의 버그를 수정하였다.

#### 🔴 Critical

| # | 파일 | 수정 내용 |
|---|------|---------|
| 1 | `frontend/src/app/api/viewer/route.js` | 하드코딩된 DB 자격증명 제거 → 환경변수(`DB_USER`, `DB_PASSWORD`, `DB_SERVER`) 사용; 테이블명 allowlist 검증으로 SQL 인젝션 차단 |
| 2 | `frontend/src/app/data-view/page.js` | `MESSAGES.ERROR_DOWNLOAD` 참조 오류 → `MESSAGES` 상수 import 추가 |
| 3 | `backend/pkg_MeasSetGen/create_groupidx.py` | 생성자(`__init__`)에서 `return jsonify(...)` 반환 → `raise ValueError`로 교체; `f"WHERE probeid = {self.probeId}"` SQL 인젝션 → 파라미터화된 쿼리(`?`)로 수정; `except Exception: pass` → 로깅 추가 |
| 4 | `backend/pkg_MeasSetGen/predictML.py` | 생성자에서 `return jsonify(...)` 반환 → `raise ValueError`로 교체; 3개 쿼리의 SQL 인젝션 → 파라미터화 수정; 불필요한 `from flask import jsonify` 제거 |

#### 🟠 High

| # | 파일 | 수정 내용 |
|---|------|---------|
| 5 | `backend/pkg_MachineLearning/data_preprocessing.py` | 가변 기본 인수 `scaler=StandardScaler()` → `scaler=None`으로 변경, 호출 시마다 새 인스턴스 생성 |
| 6 | `backend/routes/auth.py` | 인증 쿠키에 `secure=True` 추가 (HTTPS 전용 전송) |
| 7 | `backend/routes/db_api.py` | (a) 빈 ENV 변수 `.split(",")` → `[""]` 반환 버그 수정 (빈 항목 필터링); (b) `export_table_to_word` 테이블명 allowlist 검증 추가; (c) `software_version` 필터 case mismatch (`"empty"` vs `"Empty"`) → `.str.lower()` 비교로 통일 |
| 8 | `backend/db/manager.py` | 잘못된 config 경로 `./backend/AOP_config.cfg` → `__file__` 기준 상대 경로로 수정 |
| 9 | `backend/pkg_SQL/database.py` | `execute_procedure`의 `raw_conn` 리소스 누수 → `try/finally`로 `raw_conn.close()` 보장 |
| 10 | `backend/pkg_MachineLearning/fetch_selectFeature.py` | `except Exception as e: pass` (2곳) → 로깅 추가; `import logging` 추가 |
| 11 | `backend/pkg_MachineLearning/training_evaluation.py` | `modelSave`의 `except Exception as e: raise` (컨텍스트 없음) → 에러 로깅 추가 |

#### 🟡 Medium

| # | 파일 | 수정 내용 |
|---|------|---------|
| 12 | `backend/utils/logger.py` | `basicConfig` 중복 호출 방지 → `if not logging.root.handlers:` 가드 추가 |
| 13 | `frontend/src/app/data-view/hooks/useDataManagement.js` | `postMessage({}, '*')` → `postMessage({}, window.location.origin)`으로 동일 출처만 허용 |
| 14 | `frontend/src/app/SSR_DocOut/page.js` | 두 `useEffect`의 누락된 `API_BASE_URL` 의존성 추가 |
| 15 | `frontend/src/app/machine-learning/_hooks.js` | (a) `refreshVersionsPerformance`에 `API_BASE_URL` 의존성 추가 및 `eslint-disable` 제거; (b) `handleTraining` 의존성 배열에 `API_BASE_URL` 추가 및 `eslint-disable` 제거 |

#### 🟢 Low

| # | 파일 | 수정 내용 |
|---|------|---------|
| 16 | `backend/app.py` | `etc_bp` 블루프린트 미등록 → `import` 및 `register_blueprint(etc_bp)` 추가 |
| 17 | `frontend/src/components/Navbar.js` | 모바일 메뉴 토글 버튼에 `aria-expanded={menuOpen}` 접근성 속성 추가 |

---

## 1. Backend 핵심 모듈 분석
> 🔗 요약: [Summary §구조](./AI_Rearch_summary.md#2-아키텍처-구조) · [Summary §기능](./AI_Rearch_summary.md#3-주요-기능별-요약)

### 1.1 `app.py` — Flask 앱 팩토리 (56줄)

```python
# 주요 구조
def create_app():
    app = Flask(__name__)
    Config.load_config()
    app.config.from_object(Config)
    CORS(app, supports_credentials=True, origins=Config.ALLOWED_ORIGINS)
    # Blueprint 등록: auth_bp, measset_gen_bp, db_api_bp, ml_bp
    return app
```

**발견사항:**
- ✅ Blueprint 기반 모듈화 잘 구성됨
- ⚠️ `ALLOWED_ORIGINS = ["*"]` — 프로덕션에서 특정 도메인으로 제한 필요
- ⚠️ `app.secret_key = "your_secret_key"` — 하드코딩된 시크릿 키는 환경변수로 관리 필요
- ✅ `teardown_appcontext`로 DB 연결 정리 구현됨

### 1.2 `config.py` — 설정 관리 (36줄)

- `AOP_config.cfg`에서 설정을 로드하여 `os.environ`에 저장
- 서버 주소, DB 이름 목록, ML 모델 목록, MLflow DB 이름 등을 관리
- ⚠️ `EXPIRATION_TIME = 36000` (10시간) — 토큰 만료 시간이 다소 길음

### 1.3 `routes/auth.py` — 인증 라우트 (64줄)

| 엔드포인트 | 기능 |
|-----------|------|
| `POST /login` | JWT 생성, `httponly` 쿠키 설정, 세션에 username/password 저장 |
| `GET /status` | 쿠키에서 JWT 디코드하여 인증 상태 확인 |
| `POST /logout` | 쿠키 삭제, 세션 클리어 |

**보안 이슈:**
- 🔴 `session["password"] = password` — **평문 비밀번호가 세션에 저장됨**. DB 접속 시 필요하지만, 암호화하거나 토큰 기반으로 변경 권장
- ⚠️ `samesite="Lax"` 설정은 CSRF 공격에 부분적으로만 방어

### 1.4 `routes/db_api.py` — 데이터베이스 API (295줄)

| 엔드포인트 | 기능 |
|-----------|------|
| `POST /insert-sql` | JSON 데이터를 지정 테이블에 INSERT |
| `GET /csv-data` | 세션 키로 CSV 데이터 반환 |
| `GET /get_list_database` | 설정 파일의 DB 목록 반환 |
| `GET /get_probes` | 프로브 목록 조회 |
| `GET /get_table_data` | 테이블 데이터 조회 (Tx_summary, WCS, meas_station_setup 특별 처리) |
| `POST /extract-summary-table` | 요약 테이블 데이터 추출 |
| `POST /run_tx_compare` | 저장 프로시저 실행 및 결과 반환 |
| `POST /export-word` | 테이블 데이터를 Word 문서로 내보내기 |

**발견사항:**
- 🔴 **SQL 인젝션 위험:** `insert-sql` 엔드포인트에서 클라이언트가 테이블명과 데이터를 직접 전달
- ⚠️ `get_table_data`에서 테이블별 분기 처리가 복잡 — 전략 패턴으로 리팩토링 가능
- ✅ Word 내보내기 기능에서 `python-docx` 활용

### 1.5 `routes/ml.py` — 머신러닝 API (397줄)
> 🔗 요약: [Summary §머신러닝](./AI_Rearch_summary.md#33-머신러닝-파이프라인) · 이력: [RearchAI.md](./frontend/src/app/machine-learning/RearchAI.md)

| 엔드포인트 | 기능 |
|-----------|------|
| `GET /get_ml_models` | 설정 파일에서 모델 목록 반환 |
| `POST /train_model` | 모델 훈련 실행 (메인 스레드에서) |
| `GET /model_versions_performance` | 모델별 버전 성능 메트릭 조회 |
| `GET /prediction_points` | 산점도용 Target vs Estimation 데이터 |

**발견사항:**
- ⚠️ `train_model`이 동기 실행 — 대용량 데이터 시 HTTP 타임아웃 위험 → 비동기 태스크 큐(Celery 등) 도입 권장
- ✅ `prediction_points`에서 prediction_type별 필터링 지원
- ✅ 모델 버전별 성능 비교와 산점도 시각화를 위한 데이터 API 잘 설계됨

### 1.6 `routes/measset_gen.py` — MeasSet 생성 API (46줄)

- 파일 업로드 → `MeasSetGen.generate()` 호출 → CSV 결과 반환
- ✅ 간결하고 단일 책임 원칙 준수

---

## 2. 유틸리티 모듈 분석
> 🔗 요약: [Summary §코드 품질](./AI_Rearch_summary.md#4-코드-품질-주요-발견사항) (데코레이터 패턴 강점 참조)

### 2.1 `utils/decorators.py` (62줄)

```python
@handle_exceptions   # try/except + error_response 반환
@require_auth        # JWT 쿠키 검증
@with_db_connection  # Flask g 컨텍스트에 DB 연결 설정
```

- ✅ 횡단 관심사를 데코레이터로 깔끔하게 분리
- ⚠️ `with_db_connection`에서 exception 시 `pass`로 무시하는 부분 있음

### 2.2 `utils/database_manager.py` (158줄)

- **싱글톤 패턴** `DatabaseManager` 클래스
- Flask `g` 컨텍스트 기반 연결 풀링
- `get_db_connection()`, `get_mlflow_db()` 편의 함수 제공
- ⚠️ `session.get("password")`로 DB 비밀번호 접근 — 세션 보안 의존

### 2.3 `db/manager.py` (25줄) — ⚠️ 중복 모듈

- `utils/database_manager.py`와 **기능 중복**
- `AOP_config.cfg`에서 직접 설정 로드
- 🔴 **통합 필요:** 하나의 `DatabaseManager`로 통합하고 불필요한 모듈 제거 권장

---

## 3. ML 파이프라인 상세 분석
> 🔗 요약: [Summary §머신러닝](./AI_Rearch_summary.md#33-머신러닝-파이프라인) · 이력: [RearchAI.md](./frontend/src/app/machine-learning/RearchAI.md)

### 3.1 `pkg_MachineLearning/machine_learning.py` (191줄)

**ML 파이프라인 흐름:**
```
fetchData → merge_selectionFeature → dataSplit → DataPreprocess
→ MLModel.select_model → ModelEvaluator.evaluate_model
→ modelSave → AOP_MLflowTracker.register_model
```

- ✅ 파이프라인 각 단계가 독립 모듈로 분리
- ✅ MLflow 추적기와 연동하여 전체 실험 이력 관리
- ⚠️ `except Exception as e: pass` — 에러 무시 패턴 존재

### 3.2 `pkg_MachineLearning/mlflow_integration.py` (1,455줄) — 핵심 모듈

**주요 기능:**

| 기능 | 메서드 |
|------|--------|
| 실험 관리 | `_get_or_create_experiment()` |
| 실행 관리 | `start_run()`, `end_run()` |
| 모델 라이프사이클 | `register_model()`, `_auto_promote_best_model()` |
| 모델 직렬화 | `_serialize_model()`, `_deserialize_model()` |
| 모델 로드 | `load_model_from_db()`, `load_best_model()` |
| 데이터 로깅 | `log_data_info()`, `log_preprocessing()`, `log_model_params()` |
| 성능 로깅 | `_log_model_performance()`, `log_prediction_points()` |
| 예측 로깅 | `log_prediction()`, `log_simple_prediction()` |
| 무결성 검증 | `_verify_checksum()` (MD5) |

**핵심 설계 결정:**
- ✅ **모델 바이너리 DB 저장 (Option 1):** `pickle` 직렬화 → `zlib` 압축 → `VARBINARY(MAX)`에 저장
- ✅ **체크섬 무결성:** MD5 해시로 저장/로드 시 데이터 무결성 검증
- ✅ **자동 승격:** 새 모델의 test_score가 기존 Production보다 높으면 자동 승격
- ✅ **예측 타입별 모델 관리:** `_normalize_model_name()`으로 `XGBoost_intensity`, `XGBoost_power` 등으로 분리
- ⚠️ `fast_executemany = True` 사용 — 대량 데이터 배치 INSERT 최적화 (좋음)
- ⚠️ 클래스 규모가 1,455줄 — 로깅/모델관리/예측 기능별 하위 클래스 분리 검토

### 3.3 `model_selection.py` (115줄)

**지원 모델 목록:**

| 모델 | 주요 하이퍼파라미터 |
|------|-----------------|
| RandomForestRegressor | max_depth=40, n_estimators=90 |
| GradientBoostingRegressor | n_estimators=100, lr=0.1, max_depth=6 |
| HistGradientBoostingRegressor | max_iter=100, lr=0.1 |
| XGBRegressor | tree_method="hist", n_estimators=100 |
| VotingRegressor | Ridge + RandomForest + KNeighbors 앙상블 |
| LinearRegression | 기본 |
| PolynomialFeatures + LR | 2차 다항식 |
| Ridge (L2) | alpha=1.0 |
| DecisionTreeRegressor | max_depth=10 |

- ⚠️ 하이퍼파라미터가 하드코딩 — 튜닝 설정을 config로 외부화 권장
- 💡 DNN 모델(TensorFlow) 코드가 주석 처리되어 있음 — 향후 확장 고려

### 3.4 `training_evaluation.py` (110줄)

- 5-fold Cross Validation 수행 후 전체 훈련 데이터로 최종 훈련
- `joblib.dump()`으로 모델 파일 저장 (파일명에 Python/sklearn 버전 포함)
- ✅ train_cv_score, validation_cv_score, test_score 체계적 반환

### 3.5 `data_preprocessing.py` (37줄)

- Polynomial + Standard 모델: `PolynomialFeatures(degree=2)` + `StandardScaler`
- 기타 모델: 원본 DataFrame 유지 (`feature_names_in_` 보존)
- ⚠️ 비다항식 모델에서 스케일링 미적용 — 모델별 스케일링 전략 검토 필요

### 3.6 `data_splitting.py` (9줄)

- `train_test_split(test_size=0.2)` 단순 분할
- ⚠️ `random_state` 미지정 — 재현성 보장 안됨

### 3.7 `fetch_selectFeature.py` (159줄)

- **병렬 DB 조회:** `ThreadPoolExecutor`로 다중 DB에서 데이터 수집
- 13개 feature 선택 (주파수, 포커스 범위, 엘리먼트 수 등)
- target: `zt` (음향 출력 강도)
- ✅ SQL 결과를 CSV 파일로 타임스탬프 포함 저장 (데이터 이력 관리)
- ⚠️ 결측치 처리: `fillna(0)` — 도메인 지식 기반 대체 권장

---

## 4. MeasSetGen 패키지 분석
> 🔗 요약: [Summary §MeasSet](./AI_Rearch_summary.md#34-measset-generation)

### 4.1 `meas_generation.py` (86줄) — 오케스트레이터

```
파일 로드 → 중복 제거 → GroupIndex 생성 → 파라미터 생성
→ ML 예측 (Intensity/Power/Temperature) → CSV 저장
```

### 4.2 `predictML.py` (407줄) — ML 예측 엔진

**3가지 예측 타입:**

| 타입 | 메서드 | 로직 |
|------|--------|------|
| Intensity | `intensity_zt_est()` | DB에서 best 모델 로드 → 예측 |
| Power | `power_PRF_est()` | 규칙 기반 (PRF=1000, 1cm 엘리먼트) |
| Temperature | `temperature_PRF_est()` | 배치 PRF 예측 (`find_prr_for_temprise_batch`) |

**발견사항:**
- 🔴 `__init__`에서 `return jsonify(...)` — **생성자에서 HTTP 응답 반환은 작동하지 않음**
- 🔴 `f"WHERE probeid = {self.probeId}"` — **SQL 인젝션 취약점**, 파라미터 바인딩 사용 필요
- ✅ MLflow prediction logging 통합 — 예측 이력 추적 가능

### 4.3 `param_gen.py` (199줄)

- 주파수 인덱스 → Hz 변환 테이블 (48개 주파수)
- 모드별 OrgBeamstyleIdx 매핑 (B, Cb, D, M, Contrast)
- RLE 코드 기반 사이클 수 계산
- VTxIndex에 따른 최대/상한 전압 설정

### 4.4 `create_groupidx.py` (70줄)

- 🔴 `__init__`에서 `return jsonify(...)` — 생성자 반환값 무시됨 (predictML.py와 동일 이슈)
- ⚠️ `f"WHERE probeid = {self.probeId}"` — SQL 인젝션 위험

### 4.5 `data_inout.py` (136줄)

- `loadfile()`: CP949 인코딩 TSV 파일 로드
- `DataOut`: CSV/Excel 파일 저장, `@arrangeParam`/`@renameColumns` 데코레이터로 컬럼 정리
- 📁 저장 경로: `./1_uploads/0_MeasSetGen_files/{database}/`

### 4.6 `remove_duplicate.py` (88줄)

- B/M 모드와 C/D 모드 각각에서 중복 행 식별 및 제거
- `isDuplicate` 플래그로 중복 여부 표시

---

## 5. SQL 데이터베이스 모듈 분석
> 🔗 요약: [Summary §DB API](./AI_Rearch_summary.md#32-데이터베이스-api)

### 5.1 `pkg_SQL/database.py` (303줄)

**SQL 클래스 핵심 기능:**
- SQLAlchemy `create_engine` + pyodbc (ODBC Driver 17)
- `sys.sql_logins` 기반 사용자 인증
- `HASHBYTES('SHA2_256')` 기반 비밀번호 검증
- SELECT → DataFrame 반환, INSERT → `OUTPUT INSERTED` 또는 `SCOPE_IDENTITY()` 지원
- 저장 프로시저 실행 (`sp_txCompare`)

**발견사항:**
- ✅ 인증 로직이 DB 레벨에서 분리되어 안전
- ⚠️ `fast_executemany = True` — 대량 INSERT 최적화 적용됨
- ⚠️ 연결 문자열에 `Encrypt=no, TrustServerCertificate=yes` — 개발 환경 전용, 프로덕션에서는 암호화 필요

### 5.2 `db/Database_setup.sql` (253줄)

**MLflow 추적 DB 스키마:**

| 테이블 | 역할 |
|--------|------|
| `ml_experiments` | 실험 메타데이터 |
| `ml_runs` | 개별 실행 이력 |
| `ml_run_params` | 실행별 파라미터 |
| `ml_run_metrics` | 실행별 메트릭 |
| `ml_registered_models` | 등록된 모델 목록 |
| `ml_model_versions` | 모델 버전 (바이너리 포함) |
| `ml_model_performance` | 버전별 성능 메트릭 |
| `aop_prediction_logs` | 예측 요청 로그 |
| `ml_prediction_points` | 산점도용 데이터 포인트 |

- ✅ 인덱스 적절히 설정됨 (experiment_name, model_name, run_id 등)
- ✅ `model_binary VARBINARY(MAX)` — 모델 바이너리 직접 저장 지원

---

## 6. Frontend 분석
> 🔗 요약: [Summary §Frontend](./AI_Rearch_summary.md#35-frontend-페이지-구성) · 이력: [RearchAI.md](./frontend/src/app/machine-learning/RearchAI.md) (ML 페이지 리팩터링)

### 6.1 기술 스택 (`package.json`)

| 라이브러리 | 버전 | 용도 |
|-----------|------|------|
| Next.js | 15.1.4 | SSR/SSG 프레임워크 |
| React | 18.3.1 | UI 라이브러리 |
| Bootstrap | 5.3.3 | CSS 프레임워크 |
| Chart.js + react-chartjs-2 | 4.5.1 | 차트 시각화 |
| Framer Motion | 11.11.13 | 애니메이션 |
| zustand | 5.0.2 | 상태 관리 |
| papaparse | 5.5.2 | CSV 파싱 |
| zod + react-hook-form | 최신 | 폼 유효성 검증 |

**발견사항:**
- ⚠️ `mssql`, `tedious`, `msnodesqlv8` — 프론트엔드에 DB 드라이버가 포함됨 (SSR API 라우트용으로 추정)
- ⚠️ `@shadcn/ui`와 `shadcn-ui` 두 개의 패키지가 모두 설치됨 (중복 가능)
- ⚠️ `jsonwebtoken` — 프론트엔드에서 JWT 처리 (API 라우트용)

### 6.2 Navbar 컴포넌트 (160줄)

- 인증 상태에 따른 메뉴 활성화/비활성화
- FontAwesome 아이콘 사용
- 그라디언트 로고 (purple-blue)
- ✅ `credentials: 'include'`로 쿠키 기반 인증 일관 적용

### 6.3 Machine Learning 페이지 (174줄)
> 🔗 이력: [RearchAI.md](./frontend/src/app/machine-learning/RearchAI.md) — 초기 리팩터링(8개 파일 분리), 버그 수정 4건, 유지보수 전 이력 참조

- **4분할 대시보드:** R² 추이 라인 차트, 산점도, 버전 테이블, 모델 훈련
- ✅ `_hooks.js`, `_helpers.js`, `_constants.js`로 모듈 분리 우수
- ✅ Chart.js 모듈 최상위 등록으로 중복 방지

### 6.4 MeasSet Generation 페이지 (892줄) — ⚠️ 리팩토링 필요
> 🔗 요약: [Summary §코드 품질 §개선권고](./AI_Rearch_summary.md#%EF%B8%8F-개선-권장-사항) (프론트엔드 모놀리식 페이지 항목)

- 단일 파일에 전체 로직 포함 (DB 선택, 프로브 선택, 파일 업로드, CSV 처리, SQL 저장)
- **팝업 창 기반 데이터 편집:** `window.open('/data-view')` + `sessionStorage` 동기화
- ⚠️ `normalizeKey()` 함수가 동일 파일 내에서 **3번 중복 정의**
- ⚠️ `window.postMessage('*')` — 모든 origin 허용은 보안 위험
- 💡 커스텀 훅으로 상태/로직 분리 권장 (machine-learning 페이지 패턴 참고)

### 6.5 Verification Report 페이지 (739줄)

- DB/프로브/소프트웨어/WCS 선택 → TxCompare 실행 → 결과 팝업 표시
- Temperature, MI, Ispta 별 개별 저장 프로시저 호출
- ⚠️ 단일 파일에 모든 로직 — 컴포넌트 분리 권장

### 6.6 Data View 페이지 (206줄)

- ✅ **커스텀 훅 기반 모듈화 우수:**
  - `useDataManagement` — 데이터 로드/저장
  - `useDataFilter` — 필터링
  - `useDataSort` — 정렬
  - `useDataEdit` — 셀 편집
  - `useRowOperations` — 행 삭제/복원
  - `useWindowSync` — 팝업 창 동기화

---

## 7. DevOps 스크립트 분석
> 🔗 요약: [Summary §아키텍처](./AI_Rearch_summary.md#2-아키텍처-구조) (운영 자동화 항목)

### 7.1 `Start_AOP_Web.ps1` (504줄)

**기능:**
- `-Production` / `-Debug` / `-Diagnose` / `-Help` 모드 지원
- 자동 환경 진단 (Python, Node.js, 프로젝트 구조)
- 포트 충돌 감지 및 자동 프로세스 종료
- **로그 로테이션:** 30일 보관, 500MB 한도
- **JSON + 텍스트 이중 로깅**
- Production 모드: 60초 간격 헬스체크 (Port 5000/3000)
- 에러 시 자동 클린업 (시작된 프로세스 종료)

- ✅ 프로덕션 운영에 필요한 자동화가 잘 구현됨
- ✅ 가상환경 우선 탐색 → 시스템 Python 폴백 전략

---

## 8. 보안 점검 결과
> 🔗 요약: [Summary §코드 품질 §개선권고](./AI_Rearch_summary.md#%EF%B8%8F-개선-권장-사항)

| 중요도 | 항목 | 현재 상태 | 권장 조치 |
|--------|------|----------|----------|
| 🔴 높음 | SQL Injection | f-string 직접 삽입 (predictML, create_groupidx) | 파라미터 바인딩(`?`) 사용 |
| 🔴 높음 | 세션 비밀번호 | `session["password"]` 평문 저장 | 암호화 또는 토큰 기반 인증 |
| 🔴 높음 | Secret Key | `"your_secret_key"` 하드코딩 | 환경변수로 관리 |
| ⚠️ 중간 | CORS | `ALLOWED_ORIGINS = ["*"]` | 특정 도메인으로 제한 |
| ⚠️ 중간 | postMessage | `'*'` origin 허용 | 특정 origin 지정 |
| ⚠️ 중간 | DB 연결 암호화 | `Encrypt=no` | 프로덕션에서 `Encrypt=yes` |

---

## 9. 코드 품질 메트릭
> 🔗 요약: [Summary §코드 품질](./AI_Rearch_summary.md#4-코드-품질-주요-발견사항)

| 지표 | 현황 | 평가 |
|------|------|------|
| 모듈화 | ML: 우수, MeasSetGen: 양호, Frontend: 혼합 | ⭐⭐⭐⭐ |
| 에러 처리 | 데코레이터 패턴 + 일부 `pass` 무시 | ⭐⭐⭐ |
| 보안 | 기본 JWT 구현, SQL 인젝션 위험 | ⭐⭐ |
| 테스트 | 자동화 테스트 거의 없음 | ⭐ |
| 문서화 | 한국어 주석 풍부, README 존재 | ⭐⭐⭐⭐ |
| 코드 중복 | DatabaseManager 2개, normalizeKey 3중 정의 | ⭐⭐ |

---

## 10. 우선순위별 개선 로드맵
> 🔗 요약: [Summary §결론](./AI_Rearch_summary.md#6-결론)

### Phase 1: 긴급 보안 (1-2주)
1. 모든 SQL 쿼리에 파라미터 바인딩 적용
2. `app.secret_key` 환경변수로 이동
3. `ALLOWED_ORIGINS` 특정 도메인으로 제한
4. 세션 비밀번호 암호화 또는 제거

### Phase 2: 코드 정리 (2-4주)
1. `db/manager.py` 제거, `utils/database_manager.py`로 통합
2. `measset-generation/page.js` 커스텀 훅 분리
3. `verification-report/page.js` 컴포넌트 분리
4. `normalizeKey()` 등 중복 함수 공통 유틸로 추출

### Phase 3: 안정성 강화 (1-2개월)
1. 단위 테스트 추가 (pytest, Jest)
2. `train_model` 비동기 처리 (Celery/Redis)
3. `data_splitting.py`에 `random_state` 추가
4. 에러 로깅 강화 (`pass` 제거, 적절한 로깅 추가)

### Phase 4: 운영 최적화 (지속적)
1. DB 연결 암호화 (`Encrypt=yes`)
2. 프론트엔드 불필요 패키지 제거 (mssql, tedious)
3. 모델 하이퍼파라미터 외부 config화
4. CI/CD 파이프라인 구축

---

> 📌 **본 리뷰는 코드 정적 분석 기반이며, 실행 환경 테스트는 포함하지 않았습니다.**  
> 📌 **요약은 [AI_Rearch_summary.md](./AI_Rearch_summary.md) 를 참조하세요.**  
> 📌 **ML 페이지 리팩터링 이력은 [RearchAI.md](./frontend/src/app/machine-learning/RearchAI.md) 를 참조하세요.**

---

## 2026-08-12 Verification Report 카드/소프트웨어/파일검증 개선

### 요청 요약
- Verification Report 메뉴에서
  1) 2개 카드가 서로 상태에 영향 주지 않도록 분리
  2) 카드 순서 변경
  3) Tx Summary Input의 `Tx Software`를 `Software version`으로 변경하고, Probe 기준 `meas_station_setup.[imagingSwVersion]` 드롭다운(최신 우선) 적용
  4) Input file 선택 시 파일 파라미터와 SQL(`Tx_summary`) 일치 여부 확인

### 변경 파일
- `frontend/src/app/verification-report/page.js`
- `backend/routes/db_api.py`

### 핵심 변경
1. **카드 상태 완전 분리 (프론트)**
   - 기존 공용 상태(`selectedDatabase`, `selectedProbe`, `selectedTxSW` 등) 제거
   - `report*` 상태(Verification Report)와 `tx*` 상태(Tx Summary Input)로 분리
   - 한 카드 선택/로딩/에러가 다른 카드에 영향을 주지 않게 개선

2. **카드 순서 변경 (프론트)**
   - 화면 상단: `Tx Summary Input`
   - 화면 하단: `Verification Report`

3. **Software version 소스 변경 (프론트+백엔드)**
   - 라벨 변경: `TX Software` → `Software version` (Tx Summary Input 카드)
   - 신규 API 추가: `GET /api/get_imaging_sw_versions`
   - 쿼리 소스: `meas_station_setup.imagingSwVersion`
   - 정렬 기준: `measSSId DESC`로 최신 데이터 우선
   - 중복 버전은 프론트 표시 전 제거

4. **Input file 선택 시 파라미터 검증 (프론트+백엔드)**
   - 신규 API 추가: `POST /api/validate_tx_summary_file`
   - 검증 항목:
     - CSV의 `ProbeID`, `Software_version` 컬럼 존재
     - 파일 내 값이 현재 선택된 `probeId/softwareVersion`과 일치하는지
     - 선택값 조합이 `Tx_summary` 테이블에 존재하는지
   - 프론트 동작:
     - 파일 선택 시(또는 선택값 변경 후) 자동 검증
     - 검증 메시지 표시(성공/경고)
     - 검증 성공 전 업로드 버튼 비활성화

### 동작 변화
- **Before**
  - 두 카드가 같은 선택 상태를 공유해 의도치 않은 상호 영향 발생
  - Tx Summary Input 소프트웨어 목록이 `Tx_summary` 기반
  - 파일 선택 시 DB 일치 검증 부재
- **After**
  - 카드 간 상태 독립
  - Tx Summary Input 소프트웨어 목록을 `imagingSwVersion` 최신 기준으로 제공
  - 파일-선택값-DB 일치 검증 후 업로드 진행

### 연관 링크
- 요약: [AI_Rearch_summary.md](./AI_Rearch_summary.md)

---

## 2026-08-12 Tx Summary Input Software version 404 수정

### 증상
- Tx Summary Input에서 Probe 선택 후 Software version 조회 시:
  - `Software version 조회 실패: ... 404 Not Found`

### 원인
- 프론트는 `/api/get_imaging_sw_versions` 호출을 전제로 동작
- 실행 중 서버가 해당 라우트를 아직 반영하지 않은 경우 404 발생 가능

### 조치
1. **프론트 폴백 추가**
   - `frontend/src/app/verification-report/page.js`
   - `/api/get_imaging_sw_versions`가 404이면:
     - `/api/get_table_data?table=meas_station_setup` 호출
     - 선택 probe 기준 `imagingSwVersion`을 추출/중복 제거해 드롭다운 구성

2. **백엔드 응답 보강**
   - `backend/routes/db_api.py`
   - `get_table_data(meas_station_setup)` 조회 컬럼에 `imagingSwVersion` 추가
   - 폴백 경로에서도 Software version 표시 가능하도록 보장

### 결과
- 최신 서버 반영 전/후 환경 모두에서 Software version 드롭다운이 동작하도록 호환성 확보

---

## 2026-08-12 probeId nvarchar→int 변환 실패 수정

### 증상
- Software version 조회 시 SQL 에러:
  - `Conversion failed when converting the nvarchar value '11821684.0' to data type int`

### 원인
- `probeId`가 int 컬럼임에도 프론트/백엔드 경로에서 `'11821684.0'` 형태 문자열로 전달됨

### 조치
1. **백엔드 정수 강제 변환**
   - 파일: `backend/routes/db_api.py`
   - `/api/get_imaging_sw_versions`에서 `probeId`를 `_normalize_probe_id`로 정규화 후 `int`로 변환
   - 변환 실패 시 400 에러 반환(`probeId는 정수 값이어야 합니다.`)

2. **프론트 probeId 정규화**
   - 파일: `frontend/src/app/verification-report/page.js`
   - `normalizeProbeId()` 추가
   - Software version 조회 API 호출 전 `probeId`를 정수 문자열로 변환해 전달
   - 폴백 필터링에서도 동일 정규화 적용

### 결과
- `11821684.0` 형태 입력에서도 정수 probeId로 조회되어 변환 에러 없이 Software version 목록이 정상 조회됨

---

## 2026-08-12 Input file 선택 시 Tx_summary 매칭 결과 창 추가

### 요청
- Input file 선택 시, 선택한 database 기준 `Tx_summary` 파라미터 매칭 여부를 창으로 확인하고 싶음

### 변경
1. **백엔드 검증 응답 확장**
   - 파일: `backend/routes/db_api.py`
   - `/api/validate_tx_summary_file` 응답에 아래 필드 추가:
     - `matchingCount`: 매칭된 Tx_summary 행 수
     - `matchingRows`: 매칭 상세 행(최대 200행)

2. **프론트 팝업 표시 추가**
   - 파일: `frontend/src/app/verification-report/page.js`
   - 파일 검증 완료 시 `openTxValidationWindow()` 실행
   - `verification-report/data-view-standalone` 페이지를 팝업으로 열어 결과 표시
   - 매칭 상세 행이 있으면 상세 테이블, 없으면 요약(선택값/파일값/일치 여부/메시지) 표시

### 결과
- Input file 선택 후 검증이 수행되면, 사용자가 즉시 매칭 결과를 별도 창에서 확인 가능

---

## 2026-08-12 `No database specified` 오류 수정

### 증상
- Input file 선택/검증 시 `No database specified` 오류 발생

### 원인
- 신규 API에서 `database` 파라미터를 받았지만 실제 쿼리의 FROM 절에 선택 DB가 반영되지 않아
  DB 컨텍스트가 비어 있는 환경에서 조회 실패

### 조치
1. `backend/routes/db_api.py`
   - `_is_allowed_database()` 추가 (`DATABASE_NAME` allowlist 기준 검증)
   - `get_imaging_sw_versions`:
     - database 유효성 검증 추가
     - 조회 대상을 `[{database}].[dbo].[meas_station_setup]`로 명시
   - `validate_tx_summary_file`:
     - database 유효성 검증 추가
     - 매칭 조회 대상을 `[{database}].[dbo].[Tx_summary]`로 명시

### 결과
- 선택한 database 기준으로 쿼리가 실행되어 `No database specified` 오류 해소

---

## 2026-08-12 파일 선택 즉시 미리보기 팝업 + 업로드 전 검증 분리

### 요청
- Input file 선택 시점에 DB 입력 전에 먼저 데이터 창(팝업)으로 내용을 확인하고 싶음

### 변경
1. **백엔드 미리보기 API 추가**
   - 파일: `backend/routes/db_api.py`
   - `POST /api/preview_tx_summary_file`
   - 동작: CSV를 파싱해 상위 300행 + 컬럼 + 전체 행수 반환
   - DB 연결/매칭 조회 없이 동작

2. **프론트 흐름 변경**
   - 파일: `frontend/src/app/verification-report/page.js`
   - 파일 선택 시:
     - `preview_tx_summary_file` 호출
     - `verification-report/data-view-standalone` 팝업으로 미리보기 즉시 표시
   - 자동 DB 매칭 검증(useEffect) 제거
   - DB 매칭 검증은 **업로드 버튼 클릭 직전**에 수행
     - 검증 실패 시 업로드 중단
     - 검증 팝업(`Tx Summary Parameter Matching`)은 유지

### 결과
- 파일 선택 직후에는 DB 미조회 상태로 미리보기 팝업만 표시
- 실제 DB 매칭 검증은 업로드 직전에 실행되어 사용자 의도와 순서가 일치

---

## 2026-08-12 `Unexpected token '<'` JSON 파싱 오류 수정

### 증상
- 파일 선택 직후:
  - `Unexpected token '<', "<!doctype ... is not valid JSON`

### 원인
- 미리보기/검증 경로에서 HTML 에러 응답(404/예외 페이지)을 JSON으로 직접 파싱

### 조치
1. **파일 미리보기 경로를 로컬 파싱으로 전환**
   - 파일: `frontend/src/app/verification-report/page.js`
   - `previewTxFile()`에서 `file.text()`로 CSV를 직접 파싱해 팝업 표시
   - 서버 JSON 응답 의존 제거

2. **검증 응답 파싱 보강**
   - `validateTxFile()`에서 `response.text()`를 우선 읽고 JSON 파싱 시도
   - 파싱 실패 시 원문 텍스트로 에러 처리해 예외 원인 노출

### 결과
- 파일 선택 시 JSON 파싱 예외 없이 안정적으로 미리보기 팝업 표시

---

## 2026-08-12 파일 선택 후 검증/팝업 출력 로직 복원

### 요청
- 과거 세션에서 구현했던 “파일 선택 시 검증 + 출력(팝업)” 코드가 삭제되어 복원 필요

### 조치
- 파일: `frontend/src/app/verification-report/page.js`
1. `handleTxFileChange`
   - 선택값(Database/Probe/Software version)이 모두 있으면 파일 선택 즉시 `validateTxFile` 실행
2. 자동 재검증 복원
   - `txFile`, `txDatabase`, `txProbe`, `txSoftwareVersion` 변경 시 `useEffect`로 재검증 수행
3. 업로드 게이트 복원
   - 업로드 버튼 조건에 `txValidationOk` 재적용
4. 검증 결과 출력 유지
   - `validateTxFile` 내부 `openTxValidationWindow` 팝업 출력 흐름 유지

### 결과
- 파일 선택 후 검증과 결과 팝업 출력 동작이 과거 구현 방식대로 복원됨

---

## 2026-08-15 전역 병목 개선 (속도 + 정확도)

### 요청
- 전체 프로젝트에서 기능 삭제 없이 병목 지점을 전반적으로 개선하고 정확도를 높이기

### 조치
1. **프론트 필터 병목 최적화**
   - 파일:
     - `frontend/src/components/DataViewer.js`
     - `frontend/src/app/data-view/hooks/useDataFilter.js`
   - 변경:
     - 필터 값 정규화(`toLowerCase().trim()`)를 행 반복마다 수행하던 구조를 사전 계산으로 이동
     - `vals.some(...)` 선형 비교를 `Set.has(...)` O(1) 조회로 전환
     - 연쇄 필터(cascaded) 계산에서도 동일한 정규화/Set 캐시를 재사용
   - 효과:
     - 데이터가 클수록 필터 반응 지연이 줄고, 필터 기준 대소문자/공백 일관성이 강화됨

2. **소프트웨어 버전 조회 경로 최적화**
   - 파일: `backend/routes/db_api.py` (`get_imaging_sw_versions`)
   - 변경:
     - 기존: `meas_station_setup` 전체 후보를 가져와 Python `iterrows`로 중복 제거
     - 변경: SQL에서 `GROUP BY + MAX(measSSId)`로 최신순 고유 버전을 먼저 계산
   - 효과:
     - DB가 더 효율적으로 집계 수행, 애플리케이션 레벨 순회 비용 감소

3. **TX 파일 검증 필터 벡터화**
   - 파일: `backend/routes/db_api.py` (`validate_tx_summary_file`)
   - 변경:
     - 기존: `ProbeID`, `Software_version` 비교를 `Series.apply(lambda)`로 행 단위 처리
     - 변경: 정규화 Series를 생성한 뒤 불리언 마스크로 벡터화 필터 처리
   - 효과:
     - 대용량 파일에서 검증 응답시간 단축, 동일 규칙의 반복 계산 감소

4. **컬럼 스키마 조회 정확도 개선**
   - 파일: `backend/routes/db_api.py` (`_get_column_lookup`)
   - 변경:
     - `INFORMATION_SCHEMA.COLUMNS` 조회를 선택된 DB(`[database].INFORMATION_SCHEMA...`)로 명시
     - 캐시 키를 소문자 정규화해 캐시 히트 안정성 개선
   - 효과:
     - 다중 DB 환경에서 스키마 참조 정확도 향상

5. **DB 연결 안정성 개선**
   - 파일: `backend/pkg_SQL/database.py`
   - 변경:
     - SQLAlchemy 엔진 생성 시 `pool_pre_ping=True`, `pool_recycle=1800` 적용
     - `params` 분기 조건을 `is not None`으로 정밀화해 파라미터 처리 일관성 강화
   - 효과:
     - 유휴 연결 재사용 시 끊어진 커넥션으로 인한 오동작/재시도 비용 완화

### 결과
- 기능 동작은 유지하면서, 필터/검증/버전조회 경로의 불필요 반복 연산을 제거해 체감 성능을 개선했다.
- 다중 DB 참조 및 연결 재사용 구간의 안정성을 높여 정확도 저하 가능성을 줄였다.

📎 **[→ Summary](./AI_Rearch_summary.md)**

---

