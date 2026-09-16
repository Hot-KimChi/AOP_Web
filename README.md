# AOP Web Application

AOP Web Application은 Flask 기반 백엔드 API와 Next.js 15 (App Router) 기반 프론트엔드 웹 인터페이스, 그리고 MS-SQL Server를 연동한 풀스택 웹 애플리케이션입니다.

### 주요 기능

| 메뉴 | 경로 | 설명 |
|------|------|------|
| **홈** | `/` | 로그인 후 팀 주간 일정(SharePoint Excel) 임베드와 **접속 계정별 개인 "내 할 일" 패널**을 나란히 표시. 비로그인 시 로그인 안내 카드 노출 |
| **MeasSet Generation** | `/measset-generation` | 측정 설정(MeasSet) 파라미터 자동 생성 및 결과 CSV 산출 |
| **Viewer** | `/viewer` | 데이터베이스 테이블 조회 및 데이터 확인 |
| **Verification Report** | `/verification-report` | 검증 리포트 생성 및 Tx 매칭 확인 |
| **SSR DocOut** | `/SSR_DocOut` | SSR 문서 출력 |
| **Machine Learning** | `/machine-learning` | 모델 학습·평가 및 MLflow 기반 모델 버전 관리 |

> 조회·생성된 데이터는 별도 창(`/data-view`)에서 필터·정렬·셀 편집·행 삭제 후 CSV 로 내보낼 수 있으며, 편집 결과는 원본 창과 동기화됩니다.

---

## 1. 기술 스택 (Technology Stack)

| 구성 요소 | 기술 스택 | 설명 |
|-----------|-----------|------|
| **Backend** | Python 3.10+, Flask, SQLAlchemy, pyodbc | REST API 및 데이터 처리 서비스 (Port: `5000`) |
| **Frontend** | Next.js 15 (App Router), React 18, JavaScript | 사용자 웹 인터페이스 (Port: `3000`) |
| **Database** | MS-SQL Server (ODBC Driver 17) | 데이터베이스 파이프라인 |

---

## 2. 사전 요구사항 (Prerequisites)

- **OS**: Windows 10 / 11 / Windows Server
- **Python**: 3.10 이상 (`backend/.venv` 가상환경 권장)
- **Node.js**: LTS 버전 (v18 이상 및 `npm` 포함)
- **Database Driver**: ODBC Driver 17 for SQL Server

---

## 3. 최초 설치 (Initial Setup)

처음 클론한 직후 한 번만 수행합니다. 이후에는 4장의 구동 스크립트만 사용하면 됩니다.

### 3.1 백엔드 가상환경 및 의존성

구동 스크립트는 `backend\.venv` 가 있으면 그 Python 을 우선 사용하지만, **패키지 설치는 자동으로 수행하지 않습니다.**

```cmd
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

> `requirements.txt` 는 UTF-8(BOM 없음)로 저장되어 있습니다. 다른 인코딩으로 다시 저장하면 `pip` 가 읽지 못합니다.

### 3.2 프론트엔드 의존성

`AOP_Web.bat start` 는 `node_modules` 가 없으면 `npm install` 을 자동 실행하므로 보통 생략할 수 있습니다. 수동으로 설치하려면:

```cmd
cd frontend
npm install
```

### 3.3 데이터베이스 접속 정보

`backend\AOP_config.cfg` 에 서버 주소, 대상 데이터베이스 목록, 테이블 목록이 정의되어 있습니다.
**시크릿(서명 키)은 이 파일에 두지 않습니다** — 5장을 참고하여 환경변수로 주입합니다.

---

## 4. 빠른 시작 및 구동 가이드 (Quick Start)

통합 구동 스크립트(`AOP_Web.bat`)를 사용하여 애플리케이션 시작, 종료, 재시작, 상태 점검을 한 번에 수행할 수 있습니다.

### 4.1 배치 파일 명령어 (`AOP_Web.bat`)

프로젝트 루트 디렉토리에서 `AOP_Web.bat`를 실행하거나 명령 프롬프트(CMD)에서 아래 명령어들을 수행합니다.

| 명령어 | 설명 |
|--------|------|
| `AOP_Web.bat` | 개발 모드로 애플리케이션 시작 (기본값) |
| `AOP_Web.bat start` | 서버 시작 (개발 모드) |
| `AOP_Web.bat stop` | 실행 중인 백엔드(5000) 및 프론트엔드(3000) 종료 |
| `AOP_Web.bat restart` | 서버 재시작 |
| `AOP_Web.bat status` | 현재 백엔드/프론트엔드 포트 리스닝 및 프로세스 상태 확인 |
| `AOP_Web.bat prod` | 운영 모드(Production)로 빌드 및 백그라운드 구동 |

### 4.2 PowerShell 직접 실행 (`scripts\AOP_Web.ps1`)

PowerShell 환경에서 직접 세부 옵션과 함께 제어할 수도 있습니다.

```powershell
# 개발 모드 시작
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\AOP_Web.ps1 -Action Start

# 운영 모드 시작
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\AOP_Web.ps1 -Action Start -Production

# 강제 종료
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\AOP_Web.ps1 -Action Stop -Force

# 환경 상태 진단
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\AOP_Web.ps1 -Diagnose
```

---

## 5. 환경 변수 및 보안 설정 (Configuration & Security)

### 5.1 백엔드 환경 변수

`backend\AOP_config.cfg` 의 값은 `[섹션]_키` 형태의 환경변수로 변환되어 로드되지만, **이미 설정된 환경변수는 덮어쓰지 않습니다.** 따라서 운영 배포 시 환경변수로 주입한 시크릿이 저장소에 커밋된 설정 값으로 되돌아가지 않습니다.

| 환경 변수 | 기본값 | 설명 |
|-----------|--------|------|
| `AOP_ENV` | `development` | `production` 지정 시 운영 모드. 아래 검증이 활성화됩니다. |
| `AUTH_SECRET_KEY` | 개발용 기본값 | JWT 서명 키. **운영 모드에서 미지정 시 부팅 중단** |
| `FLASK_SECRET_KEY` | 개발용 기본값 | Flask 세션 서명 키. **운영 모드에서 미지정 시 부팅 중단** |
| `AUTH_EXPIRE_TIME` | `7200` | 인증 토큰 및 서버 측 자격증명 보관 TTL(초) |
| `AUTH_ALLOWED_USERS` | (비어 있음) | 쉼표로 구분한 **로그인 허용 계정 목록**(`selxxxxx` 형식, 대소문자 무관). 지정 시 목록에 없는 계정은 자격증명이 맞아도 403 으로 차단되며, **이미 발급된 토큰도 즉시 무효화**됩니다. 비워 두면 기존과 동일하게 DB 계정이 있는 전원 허용 |
| `ALLOWED_ORIGINS` | (비어 있음) | 쉼표로 구분한 CORS 허용 Origin. 운영 모드에서는 **반드시 명시** |
| `COOKIE_SECURE` | `false` | 세션 쿠키의 `Secure` 플래그. HTTPS 운영 시 `true` |

운영 모드 구동 예시(PowerShell):

```powershell
$env:AOP_ENV = "production"
$env:AUTH_SECRET_KEY = "<무작위 문자열>"
$env:FLASK_SECRET_KEY = "<무작위 문자열>"
$env:ALLOWED_ORIGINS = "https://aop.example.com"
$env:COOKIE_SECURE = "true"
.\AOP_Web.bat prod
```

> 개발 모드에서 `ALLOWED_ORIGINS` 를 지정하지 않으면 `localhost` 와 사설망 대역(10./192.168./172.16~31.)만 허용됩니다.
> 인증 쿠키를 함께 보내는 구성이므로 와일드카드(`*`) Origin 은 사용하지 않습니다.

### 5.2 인증·세션 동작

- 로그인 시 입력한 **DB 자격증명은 쿠키에 저장되지 않습니다.** 쿠키에는 추측 불가능한 불투명 토큰만 담기고, 실제 사용자명·비밀번호는 서버 프로세스 메모리에 TTL 기반으로 보관됩니다.
- 그 결과 **백엔드를 재시작하면 모든 사용자는 다시 로그인해야 합니다.** 이는 의도된 동작입니다.
- 요청이 이어지는 동안 TTL 은 갱신되며(슬라이딩), 유휴 상태가 `AUTH_EXPIRE_TIME` 을 넘기면 만료됩니다.

### 5.3 프론트엔드 환경 변수

프론트엔드는 **API 주소를 자동으로 결정합니다.** `frontend\src\lib\apiBase.js` 가 브라우저가 실제로 접속한 호스트를 그대로 사용합니다.

| 접속 주소 | 자동 산출되는 백엔드 주소 |
|-----------|---------------------------|
| `http://localhost:3000` | `http://localhost:5000` |
| `http://<서버IP>:3000` | `http://<서버IP>:5000` |

| 파일 | 변수 | 용도 |
|------|------|------|
| `frontend\.env.development` | `NEXT_PUBLIC_API_BASE_URL` | (기본 미지정) 지정 시 자동 산출을 덮어씀 |
| `frontend\.env.production` | `NEXT_PUBLIC_API_BASE_URL` | (기본 미지정) 지정 시 자동 산출을 덮어씀 |

> **주의**: 여기에 `http://localhost:5000` 을 지정하면 안 됩니다. `localhost` 는 서버가 아니라 **접속한 사용자의 PC** 를 가리키므로, 다른 PC 에서 서버 IP 로 접속한 사용자는 로그인부터 실패합니다.
>
> 백엔드가 프론트엔드와 **다른 호스트/포트**에 있는 경우에만 위 변수를 명시하고, 백엔드 쪽 `ALLOWED_ORIGINS` 에 프론트엔드 Origin 을 추가하세요.

### 5.4 생성 파일 저장 위치

MeasSet 생성 결과와 검증 리포트는 **저장소 루트의 `1_uploads\`** 아래에 절대 경로로 저장되며, 다운로드 API 도 동일한 경로를 기준으로 접근을 허용합니다. 백엔드를 어느 디렉터리에서 실행하든 저장 위치와 조회 위치가 일치합니다.

```
1_uploads/
├── 0_MeasSetGen_files/<DB명>/    # MeasSet 생성 결과 CSV
└── 1_Verification_Reports/<DB명>/ # 검증 리포트
```

---

## 6. Windows 자동 시작 등록 (Auto-Start setup)

권장 방식은 **서버 컴퓨터에서 현재 Windows 사용자 로그온 시 작업 스케줄러로 등록**하는 것입니다. 이 저장소에는 작업을 자동으로 등록하지 않으며, 아래 `install` 명령을 실행한 컴퓨터에만 등록됩니다. 해당 사용자의 Python/Node 환경변수와 프로젝트 권한을 그대로 사용하고, 개발 서버 창은 숨겨진 상태로 실행됩니다.

### 6.1 자동 시작 등록 및 해제

프로젝트 루트에서 관리자 권한이 아닌 일반 PowerShell/CMD로 실행합니다.

```cmd
AOP_Web.bat install
```

`install`은 현재 실행 중인 Windows 계정으로 `AOP_Web_AutoStart`를 등록합니다. 로그온 후 30초 지연을 두어 네트워크와 사용자 환경이 준비된 뒤 `scripts\AOP_Web.ps1 -Action Start -Unattended`를 직접 실행하므로, 경로에 공백이 있어도 배치 파일 재호출 과정에서 실패하지 않습니다. 등록 상태와 마지막 실행 결과는 다음 명령으로 확인할 수 있습니다.

```cmd
schtasks /Query /TN AOP_Web_AutoStart /FO LIST /V
```

자동 시작을 해제하려면 별도로 다음 명령을 실행합니다.

```cmd
AOP_Web.bat uninstall
```

서버에 등록한 뒤에는 `AOP_Web.bat status`로 5000/3000 포트가 `RUNNING`인지 확인합니다. 작업의 `Last Result`가 `0x0`이 아니면 `logs\start_*.log`에서 실패 원인을 확인하세요. `autostart`는 수동 재현이 필요한 경우에만 사용하며, 개발 모드로 백엔드(5000)와 프론트엔드(3000)를 무인 기동합니다. 운영 모드가 필요하면 작업 스케줄러의 동작을 `AOP_Web.bat prod`로 바꾸되, 운영 환경변수와 프론트엔드 프로덕션 빌드 조건을 먼저 준비해야 합니다.

### 6.2 수동 시작/중지

```cmd
AOP_Web.bat start
AOP_Web.bat stop
AOP_Web.bat restart
```

인자 없이 `AOP_Web.bat`를 실행해도 기존 호환성을 유지하면서 무인 시작(`autostart`와 동일)합니다.

---

## 7. 수동 개별 구동 방법 (Manual Execution)

디버깅이나 개별 서버만 기동해야 하는 경우 수동으로 각각 실행할 수 있습니다.

### 백엔드 (Backend - Flask)
```cmd
cd backend
.venv\Scripts\python.exe app.py
```
> 백엔드 서버 URL: `http://localhost:5000`

### 프론트엔드 (Frontend - Next.js)
```cmd
cd frontend
npm run dev
```
> 프론트엔드 웹 URL: `http://localhost:3000`

---

## 8. 테스트 (Testing)

프론트엔드 E2E 테스트는 Playwright 로 작성되어 있습니다.

```cmd
cd frontend
npx playwright install    # 최초 1회, 브라우저 바이너리 설치
npm test
```

- 테스트 파일: `frontend\tests\app.spec.js` (총 15 케이스)
- 설정: `frontend\playwright.config.js` (`baseURL`: `http://localhost:3000`)
- `reuseExistingServer: true` 이므로 **개발 서버가 이미 떠 있으면 그대로 재사용**하고, 없으면 `npm run dev` 를 자동 기동합니다.
- 테스트는 **비로그인 상태**를 전제로 합니다. 홈(`/`)은 인증 여부에 따라 화면이 달라지므로(비로그인: 로그인 안내 카드 / 로그인: 주간 일정 임베드), 로그인 세션이 남아 있으면 홈 관련 케이스가 실패할 수 있습니다.

프로덕션 빌드 검증은 다음으로 수행합니다.

```cmd
cd frontend
npm run build
```

> 개발 서버가 실행 중이면 `.next` 디렉터리 잠금으로 빌드가 실패할 수 있습니다. 이 경우 `AOP_Web.bat stop` 후 빌드하세요.

---

## 9. 디렉토리 구조 (Directory Structure)

```
AOP_Web/
├── AOP_Web.bat             # ★ 단일 진입점 (start/stop/restart/status/prod)
├── README.md               # 프로젝트 설치 및 구동 설명 문서
├── Implementation_list.md  # 작업 수행 내역 및 요구사항 관리 파일
├── AOP_Web.code-workspace  # VS Code 워크스페이스 설정
├── scripts/                # 실행 로직
│   └── AOP_Web.ps1         # 통합 PowerShell 구동 제어 모듈 (로깅·포트 제어 포함)
├── docs/                   # 변경 이력 문서
│   ├── AI_Rearch_summary.md
│   └── AI_Rearch_detail.md
├── backend/                # Flask 백엔드 서비스
│   ├── app.py              # Flask 메인 엔트리포인트
│   ├── config.py           # 설정 로딩 및 운영 모드 검증
│   ├── AOP_config.cfg      # 서버/DB/테이블 목록 (시크릿 미포함)
│   ├── requirements.txt    # Python 의존성 (UTF-8, BOM 없음)
│   ├── routes/             # API 라우터 (auth, db_api, ml, measset_gen)
│   ├── utils/              # 데코레이터, 자격증명 저장소, DB 매니저, 로거
│   ├── pkg_SQL/            # SQLAlchemy 엔진 및 쿼리 계층
│   ├── pkg_MeasSetGen/     # MeasSet 생성 · 파라미터 산출 · 온도상승 예측
│   ├── pkg_MachineLearning/# 학습 파이프라인 · MLflow 연동
│   └── .venv/              # Python 가상환경
├── frontend/               # Next.js 프론트엔드 앱
│   ├── src/app/            # App Router 페이지 (data-view, machine-learning 등)
│   ├── src/components/     # 공통 컴포넌트 (Layout, Navbar, DataViewer)
│   ├── src/globals.css     # 테마 토큰 (:root / [data-theme="dark"])
│   ├── tests/              # Playwright E2E 테스트
│   ├── .env.development    # 개발용 API 주소
│   ├── .env.production     # 운영용 API 주소
│   └── package.json
├── 1_uploads/              # 생성 CSV · 검증 리포트 저장소 (자동 생성)
└── logs/                   # 구동/종료 로그 파일 보관 디렉토리 (자동 생성)
```

---

## 10. 로깅 및 트러블슈팅 (Logging & Troubleshooting)

- **로그 저장 경로**: `logs/` 디렉토리에 텍스트(`.log`) 및 JSON(`.json`) 형태로 날짜별 자동 보관됩니다.
- **로그 자동 정리**: 30일이 지나거나 로그 용량이 500MB를 초과할 경우 자동으로 오래된 로그가 정돈됩니다.
- **포트 충돌 해결**: `AOP_Web.bat start` 실행 시 5000/3000 포트가 이미 사용 중이면 기존 프로세스를 자동으로 탐지하고 정리 후 새로 기동합니다.
- **환경 진단**: 실행에 문제가 있을 경우 `-Diagnose` 명령을 통해 Python, Node.js, 가상환경, 필수 디렉토리 상태를 점검할 수 있습니다.

### 자주 발생하는 증상

| 증상 | 원인 | 조치 |
|------|------|------|
| 운영 모드 기동 시 즉시 종료되고 "환경변수를 반드시 지정해야 합니다" 오류 | `AOP_ENV=production` 인데 `AUTH_SECRET_KEY` / `FLASK_SECRET_KEY` / `ALLOWED_ORIGINS` 미지정 | 5.1 표를 참고해 환경변수 주입 후 재기동 (의도된 fail-fast 동작) |
| 브라우저 콘솔에 CORS 차단 오류 | 프론트엔드 Origin 이 `ALLOWED_ORIGINS` 에 없음 | 백엔드 환경변수에 해당 Origin 추가. 개발 시에는 `localhost`·사설망 대역이 기본 허용 |
| 갑자기 로그인이 풀림 | 백엔드 재시작 또는 유휴 TTL(`AUTH_EXPIRE_TIME`) 만료. 자격증명은 서버 메모리에만 보관됨 | 다시 로그인 (의도된 동작) |
| API 응답이 401 | 인증 토큰 없음/만료 | 로그인 후 재시도. `status` 로 백엔드 기동 여부 확인 |
| API 오류 메시지가 추상적임 | 예외 원문은 클라이언트에 노출하지 않고 서버 로그에만 기록 | `logs/` 의 백엔드 로그에서 상세 원인 확인 |
| `npm run build` 가 `.next` 관련 권한 오류로 실패 | 개발 서버가 실행 중 | `AOP_Web.bat stop` 후 빌드 |
| `pip install -r requirements.txt` 가 파일을 읽지 못함 | 파일이 UTF-8 이외 인코딩으로 다시 저장됨 | UTF-8(BOM 없음)로 저장 |
| 예전에 생성한 CSV 가 목록/조회에서 보이지 않음 | 구버전은 실행 위치 기준 상대 경로를 써서 `backend\1_uploads\` 에 저장했음 | 해당 파일을 루트 `1_uploads\` 의 같은 하위 경로로 옮기면 조회됩니다 |
