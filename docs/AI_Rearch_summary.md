# AOP_Web 변경 이력 요약 (Summary)

> 사용자 요청 요약 + 해결 사항 간략 기술. 상세 내용은 각 항목의 `→ Detail` 링크 참조.
> 
> 📎 **[→ 상세 변경 이력 (Detail)](./AI_Rearch_detail.md)**

---

## 변경 이력 (v0.9.59 — 2026-09-12)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | Agent 성능 최대화를 위한 스텝별 모델 분담 설정 (design·구현=Claude Opus 최신, 검증=GPT 최신, 문제 시 iteration으로 상호보완) 및 하네스·스킬 최신화 | `.github/instructions/model-routing.instructions.md`를 신설해 3스텝 파이프라인(Design/Implement=Claude Opus 최신 직접 수행, Verify=GPT 최신 위임)을 규정. 같은 모델의 자기 검증은 구현 시 추론 오류를 그대로 재현하므로 **계열이 바뀌는 지점을 Verify 하나로 두는 것**이 설계 핵심. 승격 기준을 파일 수가 아닌 **위험도**(인증·SQL·데이터 손실·구동 스크립트·확신 없는 변경)로 설계하고 `필수 > 생략` 우선순위를 명문화. iteration 프로토콜(Blocker/Major/Minor, finding ID 추적, `write_agent` 멀티턴 재검증, 라운드 상한 3회, 완료 조건 `Blocker 0 AND Major 0`, **증거 우선(Evidence Wins)** 이견 해소), Verify 프롬프트 9블록 규격, 검증자 실패 모드 대응을 정의. 라우터·오케스트레이션·검증 문서 3종을 갱신. **이 변경 자체를 새 파이프라인으로 검증해 Blocker 1·Major 8을 발견·수정**하고 완료 조건을 충족시킴 | [→ Detail](./AI_Rearch_detail.md#v0959--1-스텝별-모델-분담-파이프라인-도입) |

---

## 변경 이력 (v0.9.58 — 2026-09-11)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | 루트 폴더 파일 과다·가독성 저하 해소 (start/stop/AOP_Web.ps1 혼재) | 하위 호환 래퍼 4종(`Start_AOP_Web.ps1`, `Start_AOP_Web_Auto.bat`, `Stop_AOP_Web.ps1`, `Stop_AOP_Web_Auto.bat`)과 미사용 `AOP_Web_Common.ps1` 삭제. 실행 로직은 `scripts/`, 변경이력 문서는 `docs/`로 이동하고 진입점을 `AOP_Web.bat` 하나로 단일화(루트 추적 파일 14 → 6개). 정리 중 발견한 실제 버그 3건 수정 — ① 단일 프로세스 서비스 미탐지(배열 언롤링으로 `.Count`가 `$null`) → `stop`이 프론트엔드를 종료하지 못하던 문제, ② 종료된 PID의 잔존 소켓을 RUNNING으로 오탐, ③ 배치가 항상 `exit /b 0`으로 실패를 은폐 | [→ Detail](./AI_Rearch_detail.md#v0958--1-루트-폴더-구조-단순화-및-진입점-단일화) |

---

## 변경 이력 (v0.9.57 — 2026-09-11)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | `README.md` 작성 및 AI 구동 컨텍스트 보완 | 프로젝트 구동 방법, 기술 스택, 사전 요구사항, `AOP_Web_Auto.bat` 사용법, Windows 시작프로그램 자동 기동 등록법을 기술한 `README.md`를 신규 생성하고, `.github/copilot-instructions.md` 라우팅 컨텍스트를 보완함 | [→ Detail](./AI_Rearch_detail.md#v0957--1-readme-작성-및-구동-컨텍스트-보완) |

---

## 변경 이력 (v0.9.56 — 2026-09-11)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | 루트 디렉토리 파일 정리 및 구동/종료 단일 파일 통합(`AOP_Web_Auto.bat`, `AOP_Web.ps1`), 시작프로그램 자동 실행 최적화 | 단일 통합 컨트롤러(`AOP_Web_Auto.bat`, `AOP_Web.ps1`)를 구축하여 Start/Stop/Restart/Status를 한 파일에서 수행 가능하도록 통합. 불필요한 `.lnk` 파일 제거 및 기존 스크립트 래퍼화로 중복 정리. 시작프로그램 등록 시 파라미터 없이 실행해도 무인 자동 기동되도록 `-NonInteractive` 옵션 및 포트 충돌 자동 정리를 적용함 | [→ Detail](./AI_Rearch_detail.md#v0956--1-루트-파일-정리-및-단일-통합-스크립트-구축) |

---

## 변경 이력 (v0.9.55 — 2026-09-11)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | `Start_AOP_Web_auto.bat` 실행 시 병목 및 속도 최적화, 수행 내역 기록 | PowerShell 호출 시 `-NoProfile` 옵션 추가로 프로필 로딩에 따른 초기 1~3초 지연 제거, 배치 종료 고정 대기시간(`timeout /t 3` -> `timeout /t 1`) 단축, `Start_AOP_Web.ps1` 자식 창 기동에도 `-NoProfile` 옵션 적용, `Implementation_list.md`에 버전(v0.9.55) 포함 2줄 요약 수행 내역 기록 | [→ Detail](./AI_Rearch_detail.md#v0955--1-start_aop_web_auto-구동-속도-및-병목-최적화) |

---

## 변경 이력 (v0.9.54 — 2026-08-16)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | Backend 코드 수정 시 서버 재시작 필요 여부 개선 요청 → 개발 모드 자동 재시작 적용 | `app.py`가 `debug=True, use_reloader=False`로 고정돼 있어 백엔드 코드 수정 시 항상 수동 재시작이 필요했음. `AOP_ENV` 환경변수(운영/개발)를 도입해 개발 모드에서는 `use_reloader=True`로 코드 저장 시 자동 재시작되도록 변경, 운영 모드는 보안을 위해 기존처럼 비활성 유지. `Start_AOP_Web.ps1`이 `-Production` 여부에 따라 `$env:AOP_ENV`를 설정해 백엔드 자식 프로세스에 전달 | [→ Detail](./AI_Rearch_detail.md#v0954--1-backend-개발모드-자동-재시작-reloader-도입) |

---

## 변경 이력 (v0.9.53 — 2026-08-16)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | `Start_AOP_Web_Auto.bat`(서버 기동) 관련 속도·정확도 개선, 중복/병목 제거 | ① 포트 확인을 `Get-NetTCPConnection`(CIM, 실측 2.5~4.5초/호출)에서 `netstat` 파싱(실측 70~120ms)으로 전환해 30배 이상 고속화. ② 백엔드 검증의 고정 `Start-Sleep 5초` + 별도 포트 폴링 루프를 즉시 폴링(`Wait-ForPortListening`)으로 통합해 평균 대기시간 단축. ③ 프론트엔드도 무검증 고정 대기 대신 포트 리스닝 폴링으로 검증 추가(실패해도 비차단). ④ Start/Stop 스크립트에 중복돼 있던 "포트→PID→프로세스명" 탐지 로직을 `AOP_Web_Common.ps1`의 `Get-ProcessesOnPort`로 통합하고 LISTENING 상태만 필터링(오탐 방지, 정확도 개선). ⑤ `Clean-OldLogs`의 로그 디렉터리 2회 스캔을 1회로 통합 | [→ Detail](./AI_Rearch_detail.md#v0953--1-server-start-script-성능-개선) |

---

## 변경 이력 (v0.9.51 — 2026-08-12)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | 매 수정마다 자동 커밋 + 한글 커밋 설명 | `copilot-instructions.md`에 §7 자동 커밋 정책 신설. 논리적 변경 단위마다 검증 후 즉시 커밋, 변경 파일만 명시 스테이징(생성물·시크릿 제외), 한글 제목+본문+Co-authored-by 트레일러 규칙 명문화. Do-Not-Touch 섹션 §8로 이동 | [→ Detail](#v0951--1-자동-커밋-정책-신설) |
| 2 | Tx Summary Input의 Input file 선택 시 매칭 팝업을 이전 상태로 복구 | 복원 커밋 `e6d0b9a`가 **불완전**했던 것이 원인. ① `handleTxFileChange`와 `useEffect`가 **둘 다 검증을 실행**해 매칭 팝업이 2번 열림 → 검증 실행 주체를 `useEffect` 단독으로 정리. ② `uploadTxSummary`가 검증을 재실행(`ebb4a26`에서 도입)해 업로드 시 팝업이 또 열림 → 원래 방식인 `txValidationOk` 게이트로 복원. 팝업 내용·API·다른 카드는 변경 없음 | [→ Detail](./AI_Rearch_detail.md) |
| 3 | Tx summary 입력 파일이 **txt 형태**인데 `Only CSV files are allowed` 에러 발생 | 백엔드 3개 엔드포인트(`preview`/`validate`/`upload_tx_summary`)가 `.csv`만 허용하고 있었음. 공용 헬퍼 `_is_allowed_tx_file`(csv/txt, 대소문자 무관) + `_read_tx_dataframe`(txt는 구분자 자동 감지 → tab 폴백, utf-8-sig/cp949 인코딩 폴백) 추가로 통일. 프론트 `accept=".csv,.txt"` 반영 | [→ Detail](./AI_Rearch_detail.md#v0951--3-tx-summary-txt-파일-입력-지원) |

---

## 변경 이력 (v0.9.52 — 2026-08-14)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | Tx Summary 매칭 팝업 컬럼 순서 고정 + 파생값 규칙 반영 + 없는 데이터 X/NULL 표기 | 팝업 컬럼을 지정된 SQL 순서(`TxSummaryID ... TxFrequency`)로 고정. `ProbeID`/`Software_version`은 선택값 주입, `ProbeName`은 드롭다운 선택값 주입, `ExamName`은 txt의 `Exam` 컬럼 우선 매핑, `Combined_mode`는 `Mode` 길이(1→0, 2+→1), `IsProcessed`는 `1`로 채움. 파일에 없는 값은 셀에 `X`와 `NULL(빨간색)`을 함께 표시하도록 UI 수정 | [→ Detail](./AI_Rearch_detail.md#v0952--1-tx-summary-매칭-팝업-컬럼순서파생값-표시-규칙-정렬) |

---

## 변경 이력 (v0.9.38 — 2026-05-12)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | 전체 프로젝트 코드 리뷰: 버그·보안·중복·가독성 개선 | Backend 8개 파일 + Frontend 1개 파일에서 11개 이슈 수정. 런타임 버그 2건, 보안 취약점 2건, 코드 품질 7건 해결 | [→ Detail](#v0938--1-전체-프로젝트-코드-리뷰) |

---

## 변경 이력 (v0.9.37 — 2026-05-11)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | awesome-copilot에서 프로젝트에 맞는 instructions/skills/agents 적용 및 최적화 | 설치 후 심층 감사: Instructions 6→3개, Skills 7→6개, Agents 5→4개로 정리. 컨텍스트 로드 51.8→5.0KB (90% 감소) | [→ Detail](#v0937--1-awesome-copilot-확장-설치) |

---

## 변경 이력 (v0.9.36 — 2026-04-29)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | MeasSet Generation 페이지에 Data Preview 버튼 추가 — GroupIndex별 Temperature/Power/Intensity 데이터 관계도 시각화 | `DataPreviewModal` 컴포넌트 신규 생성, 아코디언 UI로 그룹별 데이터 구조 표시, 다크모드 지원 | [→ Detail](#v0936--1-data-preview-모달-추가) |
| 2 | Data Preview 아이콘 변경 및 GroupIndex 메타정보 추가 | Power ⚡→⚖️, Intensity 📐→💧 아이콘 변경. GroupIndex 헤더에 Freq/WF/Cycle 정보 표시, 배지를 오른쪽 정렬 | [→ Detail](#v0936--2-data-preview-아이콘-및-메타정보-변경) |
| 3 | Data Preview 아이콘 배지 위치 통일 | 그룹별로 데이터 유무에 따라 배지 위치가 밀리는 문제 수정. 모든 배지를 항상 표시하고 0일 때 흐리게 처리 | [→ Detail](#v0936--3-data-preview-배지-위치-통일) |

---

## 변경 이력 (v0.9.35 — 2026-04-25)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | Start/Stop 스크립트 중복 제거, 버그 수정, 미사용 코드 정리 | 공통 함수를 `AOP_Web_Common.ps1`로 추출, PID 0 버그 수정, 미사용 `-NoAdmin`·`Test-PortAvailability` 제거 | [→ Detail](#v0935--1-스크립트-리팩토링) |
| 2 | Copilot CLI 5대 엔지니어링(프롬프트·컨텍스트·스킬·MCP·하네스) 적용 및 지침 최적화 | 루트 라우터 재설계, `.instructions.md` 2개 신규 생성, AGENTS.md 강화, 중복 제거 | [→ Detail](#v0935--2-copilot-cli-5대-엔지니어링-최적화) |

---

## 변경 이력 (v0.9.34 — 2026-04-18)

| # | 요청 | 해결 | Detail |
|---|------|------|--------|
| 1 | 네비바 반응형 — 창 축소 시 로그인 버튼이 메뉴 위로 올라오는 문제 | 중간 브레이크포인트(≤1100px) 아이콘 전용 모드 추가, 모바일(≤900px) 햄버거 메뉴에 인증·테마 컨트롤 통합 | [→ Detail](#v0934--1-네비바-반응형-개선) |

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

---

## 2026-08-12 Verification Report 개선

- 요청: Verification Report 2개 카드 독립화, 카드 순서 변경, Tx Summary Input의 Software version 소스 변경, 파일 선택 시 Tx_summary 일치 검증 추가
- 반영:
  - 카드 상태를 분리해 상호 영향 제거
  - 카드 순서를 `Tx Summary Input` → `Verification Report`로 변경
  - Tx Summary Input의 Software version을 `meas_station_setup.imagingSwVersion` 기반(최신 우선)으로 변경
  - Input file 선택 시 파일 내 `ProbeID/Software_version`과 선택값 및 `Tx_summary` 존재 여부를 검증하는 API 연동 추가
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-12 Software version 404 보완

- 요청: Tx Summary Input에서 Probe 선택 후 Software version 조회 시 404 발생
- 반영:
  - 프론트에 `/api/get_imaging_sw_versions` 404 시 `get_table_data(meas_station_setup)`로 자동 폴백 추가
  - 백엔드 `get_table_data(meas_station_setup)` 응답에 `imagingSwVersion` 컬럼 포함
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-12 probeId 정수 변환 오류 수정

- 요청: `probeId`가 int 컬럼인데 `11821684.0`(nvarchar)로 전달되어 SQL 변환 실패
- 반영:
  - 백엔드 `/get_imaging_sw_versions`에서 `probeId`를 정규화 후 int 변환해 쿼리 파라미터로 사용
  - 프론트에서 Software version 조회 시 `probeId`를 정수 문자열로 정규화하여 전송
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-12 Input file 선택 시 매칭 결과 창 출력

- 요청: Input file 선택 시 선택한 database의 `Tx_summary` 파라미터 매칭 결과를 창으로 표시
- 반영:
  - 파일 검증 API 응답에 `matchingCount`, `matchingRows` 추가
  - 파일 검증 완료 시 `verification-report/data-view-standalone` 팝업을 열어 매칭 결과 표시
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-12 No database specified 오류 수정

- 요청: Input file 선택 후 `No database specified` 에러 발생
- 반영:
  - 새 API에서 선택 database를 allowlist 검증 후 쿼리에 `[database].[dbo].[table]`로 명시
  - 대상 API: `get_imaging_sw_versions`, `validate_tx_summary_file`
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-12 Input file 선택 시 선미리보기 팝업 분리

- 요청: 데이터베이스 입력 전에 먼저 팝업 창으로 데이터 확인
- 반영:
  - `POST /api/preview_tx_summary_file` 추가 (DB 미조회, CSV 미리보기 전용)
  - 파일 선택 시 즉시 미리보기 팝업 출력
  - DB 매칭 검증은 업로드 버튼 클릭 시점으로 이동
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-12 JSON 파싱 에러(Unexpected token '<') 수정

- 요청: 파일 선택 시 `Unexpected token '<', "<!doctype ..."` 에러 발생
- 반영:
  - 파일 미리보기를 서버 응답(JSON)에 의존하지 않고 브라우저 로컬 CSV 파싱으로 변경
  - 검증 API 응답은 text 기반 파싱 후 JSON 변환해 HTML 에러 응답도 안전 처리
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-12 파일 선택 즉시 검증/출력 로직 복원

- 요청: 과거 Copilot 세션에서 구현했던 파일 선택 후 검증 + 결과 출력 코드 복원
- 반영:
  - `handleTxFileChange`에서 조건 충족 시 즉시 `validateTxFile` 실행
  - 파일/선택값 변경 시 자동 재검증(useEffect) 복원
  - 업로드 버튼에 `txValidationOk` 게이트 복원
  - 검증 결과 팝업(`Tx Summary Parameter Matching`) 출력 흐름 복원
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-15 전역 병목 개선 (속도 + 정확도)

- 요청: 전체 프로젝트에서 기능 유지한 채 병목을 완화하고 정확도를 개선
- 반영:
  - 프론트 `DataViewer`/`useDataFilter`의 연쇄 필터 계산에서 반복 소문자 변환+`some` 탐색을 `Set` 기반 O(1) 조회로 변경
  - 백엔드 `get_imaging_sw_versions`를 SQL 집계(`GROUP BY + MAX`) 기반으로 변경해 Python `iterrows` 중복 제거
  - 백엔드 `validate_tx_summary_file`의 `ProbeID/Software_version` 필터를 `apply(lambda)`에서 벡터화 연산으로 전환
  - 백엔드 컬럼 스키마 조회를 선택 DB의 `INFORMATION_SCHEMA`로 명시해 잘못된 DB 참조 가능성 제거
  - SQL 엔진에 `pool_pre_ping`, `pool_recycle`을 적용해 장시간 세션의 연결 정확도/안정성 개선
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)

## 2026-08-16 전역 병목 2차 개선 (기능 동일)

- 요청: 기능 유지 조건에서 전역 병목을 한 번 더 줄여 속도 개선
- 반영:
  - 데이터뷰 공통 필터 유틸(`filterHelpers`)을 추가해 정규화/Set 필터 매칭 로직을 훅 간 중복 없이 재사용
  - `useDataEdit`, `useRowOperations`의 필터 재계산 경로를 `some` 반복 비교에서 Set 기반 필터로 통일
  - `TableBody`에서 `editableKeys.includes` 반복 탐색을 `Set` 조회로 전환하고 헤더 순회/포맷 재사용으로 셀 렌더 비용 절감
  - `validate_tx_summary_file` 비교 루프에서 `iterrows`/컬럼 lookup 재생성을 제거하고 record 기반 단일 lookup으로 전환
  - SQL 엔진 `fast_executemany` + `to_sql(chunksize, multi)`로 대량 업로드 삽입 경로 처리량 개선
- 상세: [AI_Rearch_detail.md](./AI_Rearch_detail.md)
