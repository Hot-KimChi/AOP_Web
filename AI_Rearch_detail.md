# AOP_Web 프로젝트 AI 코드 리뷰 상세 (Detail)

> **리뷰 일시:** 2026-04-04  
> **프로젝트 버전:** v0.9.19

### 📎 관련 문서
| 문서 | 설명 |
|------|------|
| **[AI_Rearch_summary.md](./AI_Rearch_summary.md)** | 프로젝트 전반 요약, 기능별 개요, 코드 품질 주요 발견사항 |
| **[RearchAI.md](./frontend/src/app/machine-learning/RearchAI.md)** | Machine Learning 페이지 리팩터링 이력 (버그 수정·구조 개선) |

---

## 변경 이력 (v0.9.27 — 2026-04-05)

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
