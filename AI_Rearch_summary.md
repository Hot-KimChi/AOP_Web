# AOP_Web 변경 이력 요약 (Summary)

> 사용자 요청 요약 + 해결 사항 간략 기술. 상세 내용은 각 항목의 `→ Detail` 링크 참조.
> 
> 📎 **[→ 상세 변경 이력 (Detail)](./AI_Rearch_detail.md)**

---

## 변경 이력 (v0.9.33 — 2026-04-17)

### User Request
프로젝트 전체 분석 — 버그, 성능 저하, 가독성/효율성 개선. [→ Detail](./AI_Rearch_detail.md#변경-이력-v0933--2026-04-17)

### Change Summary
- **`backend/routes/auth.py`**: `get_json()` None 안전 처리, 에러 핸들링 중복 코드 제거
- **`backend/routes/db_api.py`**: SQL 테이블명 bracket 이스케이프, IN절 파라미터화, NaN 상수 통일
- **`backend/routes/ml.py`**: 미사용 import 제거, metric_value float 변환 안전 처리, data_index 일괄 변환
- **`backend/pkg_SQL/database.py`**: execute_query 가독성 개선(헬퍼 메서드 분리), logging→logger 통일
- **`backend/pkg_MeasSetGen/create_groupidx.py`**: for 루프 → pandas 벡터화 (10x+ 성능 향상)
- **`backend/pkg_MeasSetGen/predictML.py`**: iterrows → to_dict('records'), 예외 무시(pass) → 로깅
- **`backend/pkg_MeasSetGen/data_inout.py`**: `except OSError: pass` → 로깅 후 재발생
- **`backend/pkg_MeasSetGen/remove_duplicate.py`**: concat 최적화, CEUS 모드 isDuplicate 누락 수정
- **`backend/pkg_MachineLearning/data_splitting.py`**: random_state 파라미터 추가 (재현성)
- **`backend/pkg_MachineLearning/training_evaluation.py`**: np.round_ → np.round, 로거 모듈화, 주석 코드 제거
- **`frontend/src/components/Navbar.js`**: 테마 초기화 중복 제거 (localStorage → DOM 읽기)
- **`frontend/src/app/(home)/layout.js`**: Bootstrap/globals.css 중복 import 제거
- **`frontend/src/app/measset-generation/layout.js`**: globals.css 중복 import 제거
- **`frontend/src/app/data-view/utils/csvExport.js`**: try/finally로 URL.revokeObjectURL 보장
- **`frontend/src/app/data-view/hooks/useWindowSync.js`**: postMessage origin 검증 추가
- **`frontend/src/app/data-view/components/DataTable/TableBody.jsx`**: displayData[0] undefined 접근 버그 수정
- **`frontend/src/app/data-view/components/EditableCell.jsx`**: borderColor split 파싱 → 직접 CSS 변수 참조

---

## 변경 이력 (v0.9.32 — 2026-04-17)

### User Request
Machine Learning 페이지 다크모드에서 Model Version Performance 테이블 가독성 개선 + Viewer 페이지 테이블 셀렉트 중복 key 에러 수정. [→ Detail](./AI_Rearch_detail.md#변경-이력-v0932--2026-04-17)

### Change Summary
- **`frontend/src/globals.css`**: 다크모드 테이블에 Bootstrap 5.3 내부 CSS 변수(`--bs-table-color-type`, `--bs-table-color-state`) 오버라이드 추가. 모든 테이블 셀 텍스트·배경·hover 색상이 다크 테마 토큰을 사용하도록 수정.
- **`frontend/src/app/viewer/page.js`**: `tableList.map()` key에 인덱스 포함하여 중복 key 에러 해결. 구분선 항목 `disabled` 처리.

---

## 변경 이력 (v0.9.31 — 2026-04-15)

### User Request
프로젝트 전체 코드 리뷰 — 보안·버그·코드 품질 문제 점검 및 수정. [→ Detail](./AI_Rearch_detail.md#변경-이력-v0931--2026-04-15)

### Change Summary
- **`backend/routes/auth.py`**: `datetime.utcnow()` → `datetime.now(timezone.utc)` 마이그레이션. 로그인 실패 시 경고 로깅 추가. `/api/auth/status`에 세션 자격증명 존재 여부(`has_credentials`) 반환 추가.
- **`backend/routes/db_api.py`**: `get_viewer_data` identity 컬럼 조회를 파라미터화 쿼리로 변경 (SQL 인젝션 방어).
- **`backend/pkg_SQL/database.py`**: 미사용 `verify_password` 메서드 및 `bcrypt` import 제거.
- **`backend/utils/database_manager.py`**: 미사용 `_connections` 클래스 변수 제거.
- **`frontend/src/components/Navbar.js`**: 빈 catch 블록에 `console.error` 추가. `has_credentials` false 시 재로그인 유도.
- **`frontend/src/app/SSR_DocOut/page.js`**: 하드코딩 색상(`#10b981`, `#d1d5db`) → CSS 변수로 교체. 빈 catch 블록에 에러 로깅 추가. `<option key>` 인덱스 → 값 기반으로 변경.
- **`frontend/src/app/viewer/page.js`**: 빈 catch 블록에 에러 로깅 추가. `<option key>` 인덱스 → 값 기반으로 변경.
- **`frontend/src/app/auth/login/page.js`**: `useCallback` 의존성 배열에 `API_BASE_URL` 추가.

---

## 변경 이력 (v0.9.30 — 2026-04-15)

### User Request
하네스 엔지니어링 적용 — 프롬프트/컨텍스트 최적화 및 폴더별 AGENTS.md 도입. [→ Detail](./AI_Rearch_detail.md#변경-이력-v0930--2026-04-15)

### Change Summary
- **`.github/copilot-instructions.md`**: "Map, not encyclopedia" 원칙 적용. Context Architecture·Do-Not-Touch Zones·Change Log 섹션 추가.
- **`.github/instructions/backend.instructions.md`**: 데코레이터 순서, 응답 포맷, Critical Invariants 명시.
- **`.github/instructions/frontend.instructions.md`**: 'use client' 필수, 테마 상세, Critical Invariants 추가.
- **`backend/AGENTS.md`** (신규): 백엔드 아키텍처 맵.
- **`frontend/AGENTS.md`** (신규): 프론트엔드 아키텍처 맵.

---

## 변경 이력 (v0.9.29 — 2026-04-11)

### User Request
Copilot 에이전트 성능 최적화를 위한 `.github/copilot-instructions.md` 재작성 요청.

### Change Summary
- **`.github/copilot-instructions.md`**: 253줄 → 106줄 (58% 감소). 가상 3-에이전트 모델·교차검증 매트릭스·중복 체크리스트 제거. 실용적 "Plan → Implement → Review" 워크플로우로 교체. 기술 스택을 실제 프로젝트(Flask, Next.js 15, MS-SQL Server)에 맞게 수정. Quality Gate를 scope/verification 체크 포함하여 재구성.

---

## 변경 이력 (v0.9.28 — 2026-04-05)

### User Request
Viewer 메뉴에서 데이터를 가져올 때 최신 데이터 1000건이 아닌 임의 순서의 1000건이 반환되는 문제 수정 요청.

### Change Summary
- **`backend/routes/db_api.py` — `get_viewer_data()`**: `SELECT TOP 1000 * FROM {table}` (ORDER BY 없음) → SQL Server `sys.columns`·`sys.tables`로 IDENTITY 컬럼을 런타임에 자동 탐지하여 `ORDER BY [identity_col] DESC` 추가. IDENTITY 컬럼이 없는 테이블은 기존 동작(비정렬 TOP 1000)으로 안전하게 폴백.

---



### User Request
창 크기 변화에 따라 Navbar 메뉴 아이템이 서로 겹치는 문제 수정 — 업계 표준 방식 반영 요청.

### Change Summary
- **`src/globals.css`**: 두 단계 반응형(900px 아이콘 전용 + 640px 햄버거)을 **단일 900px 햄버거 브레이크포인트**로 통합. `.navbar-mobile-menu`를 `display:none/flex` 토글 대신 `max-height: 0 → 500px` + `overflow: hidden` 트랜지션으로 교체하여 슬라이드 애니메이션 추가. `.navbar-username` 클래스 신규 정의. 다크모드 `[data-theme="dark"] .navbar-username` 셀렉터 추가.
- **`src/components/Navbar.js`**: 사용자명 span에 `className="navbar-username"` 적용. 창 크기 변경 시(`window.innerWidth > 900`) 모바일 메뉴를 자동으로 닫는 `resize` 이벤트 핸들러 추가 (마운트 시 초기 검사 포함, cleanup 완비).

| 변경 항목 | Before | After |
|-----------|--------|-------|
| 햄버거 브레이크포인트 | 640px | 900px (단일) |
| 아이콘 전용 중간 상태 | ✅ 있음 (640~900px) | ❌ 제거 |
| 모바일 메뉴 애니메이션 | 없음 (즉시 표시) | max-height 슬라이드 0.28s |
| 사용자명 모바일 숨김 | ❌ 미처리 | ✅ 900px 이하 hidden |
| 리사이즈 시 메뉴 닫기 | ❌ 없음 | ✅ resize 핸들러 추가 |

---



### User Request
1) 다크모드에서 DataViewer(viewer, data-view), ML Model Version Performance 테이블 가독성 저하 수정 요청.  
2) Viewer에서 파라미터(컬럼)를 정렬하지 말고 DB 원본 순서 그대로 표시 요청.

### Change Summary
- **`src/components/DataViewer.js`**: `<style jsx>` 블록의 하드코딩 색상 (`white`, `#f8f8f8`, `#fafafa`, `#dee2e6`, `#888`) 전부 CSS 변수(`var(--surface)`, `var(--bg)`, `var(--border)`, `var(--text-muted)`)로 교체. 헤더 span 인라인 `color: '#374151'` → `'var(--text)'` 변경. `.sticky-header`/`.sticky-filter` 배경을 `tr`이 아닌 `th`에 명시 적용(sticky 시 투명 방지). tbody 호버 CSS 추가. 비동작 Tailwind 클래스(`bg-gray-100`, `hover:bg-gray-50`, `bg-gray-50`) 제거.
- **`src/app/data-view/components/DataTable/TableHeader.jsx`**: 인라인 색상 `'#374151'`→`'var(--text)'`, `'#3b82f6'`→`'var(--brand)'`으로 교체. 비동작 `text-gray-700` 클래스 제거.
- **`src/app/data-view/components/DataTable/TableBody.jsx`**: 비동작 `hover:bg-gray-50` 클래스 제거 (부모 CSS로 hover 처리됨).
- **`src/app/data-view/components/DataTable/FilterRow.jsx`**: 비동작 `bg-gray-50` 클래스 제거.
- **`src/globals.css`**: `table-light` Bootstrap 다크모드 override 강화 — `tr.table-light > td/th` 및 `.table-light > tr > td/th` 셀 레벨에 `background-color`, `color`, `border-color` 명시 추가(`!important`)하여 CSS 변수 상속 방식의 불확실성 제거.
- **`src/app/viewer/data-view-standalone/page.js`**: `columns` 상태 추가, API 응답의 `result.columns`를 저장 후 `<DataViewer columns={columns} />`에 전달 → SQL Server 스키마 정의 순서 그대로 컬럼 표시(정렬 없음).

---

## 변경 이력 (v0.9.25 — 2026-04-05)

### User Request
로그인 버튼 클릭 시 Internal Server Error 발생 — 정리 작업 후 버그 수정 요청.

### Change Summary
- **`routes/auth.py`**: 잘못된 자격증명 입력 시 `pyodbc.InterfaceError`/`sqlalchemy.exc.InterfaceError`가 500으로 반환되던 문제 수정 → `try/except`로 SQL 인증 에러를 명시 포착하여 **401** 반환. 빈 username/password 검사 추가 (400). 이 버그는 `db/manager.py` 시절부터 존재했으나 이번 정리 과정에서 발견·수정됨.
- **백엔드 재시작**: 코드 변경 반영을 위해 기존 PID(11:17 시작, 구 코드)를 종료하고 신규 코드로 재시작 완료.

---


### User Request
전체 프로젝트 불필요·중복 파일/코드 일괄 정리 요청. 병렬 에이전트(백엔드·프론트엔드·루트 감사)로 완전 검토 후 삭제/마이그레이션.

### Change Summary
- **보안**: `backend/test_xgboost_mlflow.py` 삭제 — 하드코딩 DB 자격증명 포함
- **백엔드**: `db/manager.py` 제거 — `utils/database_manager.py`로 통합(중복 클래스 제거). `routes/etc.py` 삭제(빈 블루프린트). `backend/__init__.py`·`backend/etc/` 삭제.
- **프론트엔드**: `src/app/api/viewer/route.js` 삭제(Flask 엔드포인트로 교체 후 미사용). `src/context/`·`src/styles/viewer.module.css` 삭제(빈/미사용). npm 미사용 패키지 20개 제거(197개 의존성 감소).
- **루트**: `*.lnk` 파일 삭제, 빈 `README.md`·`.vscode/settings.json` 삭제, 루트 `.gitignore` 신규 생성(`logs/`, `1_uploads/`, `__pycache__/` 등 포함).
- **pkg 패키지화**: `pkg_SQL`, `pkg_MachineLearning`, `pkg_MeasSetGen`에 `__init__.py` 추가.
- **설정 정리**: `.env.development`·`.env.production`에서 빈 `DB_*` 변수 제거.

---


### User Request
전체 코드 완전 리뷰 — 로그인 자격증명(세션 username/password)이 모든 DB 접속에 올바르게 사용되는지 검증 및 수정 요청.

### Change Summary
- **전체 리뷰 결과**: 프론트엔드 26개 fetch 호출 전부 `credentials: 'include'` 및 `API_BASE_URL` 일관 사용 확인. ML 라우트는 `utils.database_manager.DatabaseManager`를 통해 세션 자격증명 자동 활용 확인.
- **`config.py`**: `ALLOWED_ORIGINS = ["*"]` → 환경변수(`ALLOWED_ORIGINS`) 기반 동적 설정 추가. `FLASK_SECRET_KEY`, `COOKIE_SECURE` 환경변수 추가
- **`app.py`**: `app.secret_key` 하드코딩 제거 → `Config.FLASK_SECRET_KEY` 사용. `SESSION_COOKIE_HTTPONLY/SAMESITE/SECURE` 명시 설정. CORS 초기화 순서 재배치
- **`utils/error_handler.py`**: `CredentialsRequired` 예외 클래스 추가 — 세션 인증 없을 때 500 대신 422 반환
- **`utils/decorators.py`**: `handle_exceptions`에 `CredentialsRequired` 캐치 추가 → 422 응답 반환
- **`utils/database_manager.py`**: `ValueError` → `CredentialsRequired` 교체, 불필요한 try/except 제거, 주석 개선
- **`routes/auth.py`**: `set_cookie(secure=True)` 하드코딩 → `Config.COOKIE_SECURE` 사용 (개발 HTTP 환경 동작 보장), `session.permanent = False` 명시

---

## 변경 이력 (v0.9.22 — 2026-04-04)

### User Request
Viewer 페이지에서 데이터 로드 시 400 Bad Request 에러 수정 요청.

### Change Summary
- **Flask 백엔드 신규 엔드포인트 추가** (`/api/get_viewer_data`): DB Viewer 팝업 전용으로 `SELECT TOP 1000 * FROM {table}` 실행. `SERVER_TABLE_TABLE` 환경변수 기반 동적 allowlist로 `get_list_table`과 자동 동기화
- **`viewer/data-view-standalone/page.js` 수정**: Next.js API route(`/api/viewer`, DB 자격증명 미설정으로 실패) → Flask 백엔드(`/api/get_viewer_data`) 호출로 전환. `encodeURIComponent`로 파라미터 안전 인코딩, 에러 메시지 구체화

---

## 변경 이력 (v0.9.21 — 2026-04-04)

### User Request
Viewer 메뉴 클릭 시 React 하이드레이션 에러 발생 수정 요청.

### Change Summary
- **`viewer/layout.js`**: `<html>` 에 `suppressHydrationWarning` 추가 — 인라인 테마 스크립트가 서버/클라이언트 HTML 불일치를 일으키던 근본 원인 해소
- **`viewer/data-view-standalone/layout.js`**: 중첩된 `<html>/<body>` 제거 → `<div>` 래퍼만 유지 — 부모 `ViewerLayout`이 이미 루트 HTML 구조를 제공하므로 이중 `<html>` 구조(무효한 HTML) 제거
- **`verification-report/data-view-standalone/layout.js`**: 동일한 중첩 `<html>` 문제 예방 수정
- **`(home)/layout.js`, `verification-report/layout.js`**: `suppressHydrationWarning` 누락 레이아웃 일괄 추가

---

## 변경 이력 (v0.9.20 — 2026-04-04)

### User Request
다크모드에서 테이블 숫자 가독성 저하 및 Machine Learning 페이지 그래프 라인 미표시 문제 수정 요청.

### Change Summary
- **DataTable 다크모드 수정**: 하드코딩된 흰색 배경·테두리·텍스트 색상을 CSS 변수(`var(--surface)`, `var(--border)`, `var(--text)`, `var(--table-hover)`)로 교체하여 다크모드에서 숫자가 보이지 않던 문제 해결
- **Bootstrap 텍스트 색상 다크모드 재정의**: `text-success/primary/warning/danger` 클래스를 다크 배경에 맞는 밝은 색상으로 오버라이드하여 ML 테이블 점수 가독성 개선
- **Chart.js 다크모드 지원**: 라인·산점도 차트 옵션을 정적 상수에서 `isDark` 파라미터를 받는 팩토리 함수로 전환, 그리드·틱·축 제목·범례 색상이 테마에 따라 동적 변경
- **Scatter Ideal Line 색상 수정**: 다크모드에서 `rgba(0,0,0,0.3)` → `rgba(255,255,255,0.55)`로 변경하여 기준선 가시성 확보
- **다크모드 감지 훅 추가**: `MutationObserver`로 `data-theme` 속성 변경을 실시간 추적하여 차트가 테마 전환 즉시 반응

---

## 변경 이력 (v0.9.18 — 2026-04-04)

### User Request
전체 코드베이스를 검토하여 발생할 수 있는 모든 문제를 수정해달라는 요청.

### Change Summary
3개의 병렬 AI 에이전트(Backend, ML/MeasSetGen, Frontend)를 통해 전체 코드를 분석하고,  
Critical~Low 총 **18건**의 버그를 수정함. 상세 내역은 [AI_Rearch_detail.md](./AI_Rearch_detail.md#변경-이력-v0918--2026-04-04) 참조.

| 심각도 | 수정 건수 | 주요 항목 |
|--------|---------|---------|
| 🔴 Critical | 4 | 하드코딩 자격증명, 생성자 HTTP 반환, SQL 인젝션, 미임포트 참조 |
| 🟠 High | 7 | 가변 기본 인수, 리소스 누수, ENV 변수 버그, config 경로 오류 등 |
| 🟡 Medium | 5 | 로거 중복, postMessage origin, useEffect 의존성, case mismatch 등 |
| 🟢 Low | 2 | aria-expanded 접근성, etc_bp 미등록 |

---

## 변경 이력 (v0.9.19 — 2026-04-04)

### User Request
화면 축소 시 Navbar의 메뉴와 로그인 버튼이 겹치는 반응형 레이아웃 문제 수정 요청.

### Change Summary
Navbar CSS의 간격을 줄여 겹침 문제 해결. 상세 내역은 [AI_Rearch_detail.md](./AI_Rearch_detail.md#변경-이력-v0919--2026-04-04) 참조.

| 변경 항목 | 내용 |
|-----------|------|
| 내부 패딩 축소 | 900px 이하: `navbar-inner` 패딩 `1.5rem → 1rem` |
| 구분선 마진 축소 | 900px 이하: `navbar-divider` 마진 `1.25rem → 0.625rem` |
| 링크 패딩 축소 | 900px 이하: `navbar-link` 패딩 `0.4rem 0.6rem → 0.375rem 0.5rem` |
| 링크 gap 축소 | 900px 이하: `navbar-links` gap `0.25rem → 0.125rem` |
| auth gap 축소 | 900px 이하: `navbar-auth` gap `0.75rem → 0.5rem`, padding-left `1rem → 0.5rem` |

---

## 1. 프로젝트 개요
> 🔗 상세: [Backend 핵심 모듈 분석](./AI_Rearch_detail.md#1-backend-핵심-모듈-분석) · [SQL 모듈 분석](./AI_Rearch_detail.md#5-sql-데이터베이스-모듈-분석) · [Frontend 분석](./AI_Rearch_detail.md#6-frontend-분석)

**AOP_Web**은 초음파 프로브의 **Acoustic Output Power (AOP)** 측정 데이터를 관리하고,  
머신러닝 기반 예측 및 검증 보고서를 생성하는 풀스택 웹 애플리케이션입니다.

| 구분 | 기술 스택 |
|------|----------|
| **Backend** | Python 3.x, Flask, SQLAlchemy, pyodbc, scikit-learn, XGBoost |
| **Frontend** | Next.js 15, React 18, Bootstrap 5, Chart.js, Framer Motion |
| **Database** | MS-SQL Server (ODBC Driver 17), AOP_MLflow_Tracking DB |
| **DevOps** | PowerShell 자동 시작/중지 스크립트, 로그 관리 |

---

## 2. 아키텍처 구조
> 🔗 상세: [Backend 모듈](./AI_Rearch_detail.md#1-backend-핵심-모듈-분석) · [유틸리티](./AI_Rearch_detail.md#2-유틸리티-모듈-분석) · [ML 파이프라인](./AI_Rearch_detail.md#3-ml-파이프라인-상세-분석) · [MeasSetGen](./AI_Rearch_detail.md#4-meassetgen-패키지-분석) · [DevOps](./AI_Rearch_detail.md#7-devops-스크립트-분석)

```
AOP_Web/
├── backend/              # Flask REST API 서버 (Port 5000)
│   ├── app.py            # Flask 앱 팩토리
│   ├── config.py         # 설정 관리 (AOP_config.cfg 기반)
│   ├── routes/           # API 라우트 (auth, db_api, ml, measset_gen)
│   ├── utils/            # 유틸리티 (decorators, database_manager, logger)
│   ├── pkg_SQL/          # SQL 데이터베이스 접속 모듈
│   ├── pkg_MachineLearning/  # ML 훈련/평가/MLflow 추적 시스템
│   ├── pkg_MeasSetGen/   # 측정 셋 자동 생성 모듈
│   ├── db/               # DB 스키마 및 매니저
│   └── ML_Models/        # 훈련된 모델 파일 (.pkl)
├── frontend/             # Next.js 프론트엔드 (Port 3000)
│   └── src/
│       ├── app/          # 페이지 라우트 (9개 섹션)
│       ├── components/   # 공유 컴포넌트 (Navbar, Layout, DataViewer)
│       └── styles/       # CSS 모듈
└── Start_AOP_Web.ps1     # 자동 시작 스크립트 (504줄)
```

---

## 3. 주요 기능별 요약

### 3.1 인증 시스템
> 🔗 상세: [auth.py 분석](./AI_Rearch_detail.md#13-routesauthpy--인증-라우트-64줄)
- JWT 기반 쿠키 인증 (HS256)
- MS-SQL `sys.sql_logins` 기반 사용자 인증
- `require_auth` 데코레이터로 API 보호

### 3.2 데이터베이스 API
> 🔗 상세: [db_api.py 분석](./AI_Rearch_detail.md#14-routesdb_apipy--데이터베이스-api-295줄) · [SQL 모듈](./AI_Rearch_detail.md#5-sql-데이터베이스-모듈-분석)
- **CRUD 작업:** 테이블 조회, 데이터 삽입, 프로브 목록 조회
- **TxCompare 저장 프로시저** 호출을 통한 검증 보고서 데이터 추출
- **Word 문서 내보내기** 기능(docx)

### 3.3 머신러닝 파이프라인
> 🔗 상세: [ML 파이프라인 상세](./AI_Rearch_detail.md#3-ml-파이프라인-상세-분석) · [ml.py API](./AI_Rearch_detail.md#15-routesmlpy--머신러닝-api-397줄) · [ML 페이지 리팩터링 이력](./frontend/src/app/machine-learning/RearchAI.md)
- **10종 회귀 모델** 지원 (RandomForest, XGBoost, Ridge, GradientBoosting 등)
- **완전한 MLflow 추적 시스템** (1,455줄): 실험 관리, 모델 버전 관리, 바이너리 DB 저장
- **3가지 예측 타입** 지원: Intensity, Power, Temperature
- 모델 자동 승격(Production/Staging) 및 체크섬 무결성 검증

### 3.4 MeasSet Generation
> 🔗 상세: [MeasSetGen 패키지 분석](./AI_Rearch_detail.md#4-meassetgen-패키지-분석) · [measset_gen.py 라우트](./AI_Rearch_detail.md#16-routesmeasset_genpy--measset-생성-api-46줄)
- 프로브 설정 파일 업로드 → 중복 제거 → 파라미터 생성 → ML 예측 → CSV 출력
- Intensity/Power/Temperature 각각에 대한 AI 기반 예측값 생성

### 3.5 Frontend 페이지 구성
> 🔗 상세: [Frontend 분석](./AI_Rearch_detail.md#6-frontend-분석) · [ML 페이지 리팩터링 이력](./frontend/src/app/machine-learning/RearchAI.md)
| 페이지 | 주요 기능 |
|--------|----------|
| Home | 프로젝트 소개 랜딩 페이지 |
| MeasSet Generation | DB/프로브 선택 → 파일 업로드 → MeasSet 생성 → SQL 저장 |
| Viewer | DB 테이블 데이터 조회 |
| Verification Report | TxCompare 기반 검증 보고서 생성 |
| Machine Learning | 모델 훈련, R² 추이 차트, 산점도, 버전 테이블 |
| Data View | CSV 데이터 편집/필터링/정렬 (팝업 창 기반) |
| SSR DocOut | SSR 문서 출력 |

---

## 4. 코드 품질 주요 발견사항
> 🔗 상세: [보안 점검 결과](./AI_Rearch_detail.md#8-보안-점검-결과) · [코드 품질 메트릭](./AI_Rearch_detail.md#9-코드-품질-메트릭)

### ✅ 강점
1. **모듈화된 ML 파이프라인:** 데이터 로드 → 전처리 → 모델 선택 → 훈련 → 평가가 독립 모듈로 분리
2. **MLflow 통합 추적 시스템:** 실험/실행/파라미터/메트릭/모델 바이너리를 DB에 체계적으로 관리
3. **데코레이터 패턴 활용:** `@handle_exceptions`, `@require_auth`, `@with_db_connection` 으로 횡단 관심사 분리
4. **DB 연결 관리:** 싱글톤 `DatabaseManager`와 Flask `g` 컨텍스트 기반 연결 풀링
5. **운영 자동화:** PowerShell 스크립트로 환경 진단/시작/중지/로그 관리 완비

### ⚠️ 개선 권장 사항
1. **보안:** `app.secret_key`가 하드코딩됨, `ALLOWED_ORIGINS = ["*"]`는 프로덕션에서 제한 필요
2. **SQL 인젝션 위험:** 일부 쿼리에서 f-string 직접 삽입 사용 (예: `f"WHERE probeid = {self.probeId}"`)
3. **세션에 비밀번호 저장:** `session["password"]`에 평문 저장은 보안 위험
4. **코드 중복:** `DatabaseManager`가 `db/manager.py`와 `utils/database_manager.py` 두 곳에 존재
5. **프론트엔드 모놀리식 페이지:** `measset-generation/page.js`(892줄), `verification-report/page.js`(739줄)는 컴포넌트 분리 권장
6. **에러 처리:** 일부 `except` 블록에서 `pass`로 에러를 무시
7. **테스트 부재:** 자동화된 테스트 코드가 거의 없음 (`test_xgboost_mlflow.py` 1개만 존재)

---

## 5. 파일 통계
> 🔗 각 파일의 상세 분석은 [AI_Rearch_detail.md](./AI_Rearch_detail.md)의 해당 섹션을 참조하세요.

| 카테고리 | 파일 수 | 주요 파일(줄 수) |
|----------|---------|-----------------|
| Backend Routes | 5 | ml.py(397), db_api.py(295) |
| Backend Utils | 4 | database_manager.py(158), decorators.py(62) |
| ML Package | 7 | mlflow_integration.py(1,455), machine_learning.py(191) |
| MeasSetGen Package | 7 | predictML.py(407), param_gen.py(199) |
| SQL Package | 1 | database.py(303) |
| DB Schema | 1 | Database_setup.sql(253) |
| Frontend Pages | 9 | measset-generation(892), verification-report(739) |
| Frontend Components | 3 | Navbar.js(160), DataViewer.js(varies) |
| DevOps Scripts | 2 | Start_AOP_Web.ps1(504), Stop_AOP_Web.ps1 |

---

## 6. 결론
> 🔗 상세: [우선순위별 개선 로드맵](./AI_Rearch_detail.md#10-우선순위별-개선-로드맵)

AOP_Web은 **산업용 초음파 장비의 AOP 측정 관리를 위한 성숙한 풀스택 애플리케이션**으로,  
특히 **MLflow 통합 ML 파이프라인과 자동화된 MeasSet 생성 기능**이 핵심 차별점입니다.

보안 강화(SQL 인젝션 방지, 비밀번호 관리), 프론트엔드 리팩토링(대형 페이지 분리),  
테스트 코드 추가를 우선적으로 진행하면 프로덕션 수준의 안정성을 확보할 수 있습니다.

> 📌 **상세 분석 내용은 [AI_Rearch_detail.md](./AI_Rearch_detail.md) 파일을 참조하세요.**  
> 📌 **ML 페이지 리팩터링 이력은 [RearchAI.md](./frontend/src/app/machine-learning/RearchAI.md) 를 참조하세요.**
