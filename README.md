# AOP Web Application

AOP Web Application은 Flask 기반 백엔드 API와 React + Vite 기반 프론트엔드 웹 인터페이스(CSR SPA), 그리고 MS-SQL Server를 연동한 풀스택 웹 애플리케이션입니다.

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
| **Frontend** | React 18 + Vite 8, react-router-dom 7, JavaScript(JSX) | 사용자 웹 인터페이스 (Port: `3000`, `/api` 는 백엔드로 프록시) |
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
| `AOP_Web.bat help` | 명령어와 옵션 도움말 표시 |
| `AOP_Web.bat prod` | 운영 모드(Production)로 빌드 및 백그라운드 구동 |
| `AOP_Web.bat uninstall` | Windows 부팅 자동 시작 작업(`AOP_Web_AutoStart`) 해제 |

> 서버를 재부팅해도 로그인 전에 자동으로 서비스가 시작되도록 하려면 관리자 PowerShell에서 `RegisterStartup`을 한 번 실행해야 합니다. 자세한 내용은 [6. Windows 자동 시작 등록](#6-windows-자동-시작-등록-auto-start-setup)을 참고하세요.

`prod`는 운영 필수 환경변수(`AUTH_SECRET_KEY`, `FLASK_SECRET_KEY`, `ALLOWED_ORIGINS`)를 먼저 확인한 뒤 `npm run build`와 `npm start`를 순서대로 실행합니다. 필수값이 없으면 백엔드를 먼저 실행하지 않고 원인을 출력합니다.

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
| `AUTH_EXPIRE_TIME` | `0` | 로그인 유지 시간(초). `0` 이하 = 시간 만료 없음. 양수면 인증 토큰(JWT)은 로그인 후 N초 고정 만료, 서버 측 자격증명은 유휴 N초 슬라이딩 만료 |
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
- 기본값(`AUTH_EXPIRE_TIME=0`)은 시간 만료가 없으며 로그아웃·브라우저 종료·백엔드 재시작 시에만 해제됩니다. 양수로 지정하면 JWT 는 로그인 후 그 시간에 만료되고(고정), 서버 측 자격증명은 유휴 상태가 그 값을 넘기면 만료됩니다(슬라이딩). JWT 는 세션 토큰 해시(`cid`)로 서버 세션과 묶여 있어 로그아웃·재시작 후에는 재사용할 수 없습니다. 서버 메모리 보관 세션은 최대 2000개이며 초과 시 가장 오래 사용하지 않은 세션부터 해제됩니다.

### 5.3 프론트엔드 환경 변수

브라우저는 **자신이 접속한 주소(같은 출처)의 `/api/...`** 로 요청하고, 프론트엔드 서버가 이를 백엔드로 전달(프록시)합니다. 그래서 다른 PC 에서 `http://<서버IP>:3000` 으로 접속해도 백엔드 주소를 알 필요가 없고 CORS 도 거치지 않습니다.

| 모드 | 프론트엔드 서버 | `/api` 전달 대상 |
|------|----------------|------------------|
| 개발(`npm run dev`) | Vite 개발 서버 (`frontend\vite.config.mjs`) | `AOP_BACKEND_URL` (기본 `http://localhost:5000`) |
| 운영(`npm start`) | `frontend\server.mjs` (`dist\` 서빙 + 프록시) | `AOP_BACKEND_URL` (기본 `http://localhost:5000`) |

| 파일·변수 | 용도 |
|------|------|
| `AOP_BACKEND_URL` (프론트 서버 프로세스 환경변수) | 백엔드가 같은 PC 의 5000 이 아닐 때만 지정 |
| `frontend\.env.*` 의 `VITE_API_BASE_URL` | (기본 미지정) 프록시 없이 브라우저가 백엔드를 **직접** 호출해야 할 때만 지정. 이 경우 백엔드 `ALLOWED_ORIGINS` 에 프론트엔드 Origin 을 추가해야 합니다 |

> **주의**: `VITE_API_BASE_URL` 에 `http://localhost:5000` 을 지정하면 안 됩니다. `localhost` 는 서버가 아니라 **접속한 사용자의 PC** 를 가리키므로, 다른 PC 사용자는 로그인부터 실패합니다.

### 5.4 생성 파일 저장 위치

MeasSet 생성 결과와 검증 리포트는 **저장소 루트의 `1_uploads\`** 아래에 절대 경로로 저장되며, 다운로드 API 도 동일한 경로를 기준으로 접근을 허용합니다. 백엔드를 어느 디렉터리에서 실행하든 저장 위치와 조회 위치가 일치합니다.

```
1_uploads/
├── 0_MeasSetGen_files/<DB명>/    # MeasSet 생성 결과 CSV
└── 1_Verification_Reports/<DB명>/ # 검증 리포트
```

---

## 6. Windows 자동 시작 등록 (Auto-Start setup)

권장 방식은 **서버 컴퓨터 부팅 시 작업 스케줄러로 등록**하는 것입니다. 작업은 현재 Windows 사용자 권한(제한된 권한)으로 로그인 전에 실행되므로, 서버 PC에 로그인하지 않아도 클라이언트가 접속할 수 있습니다. 저장소와 실행 환경은 서버의 로컬 디스크에 있어야 합니다. S4U 로그온은 네트워크 공유·매핑 드라이브에 접근할 수 없으며, 작업에 비밀번호를 저장하지 않습니다.

### 6.1 자동 시작 등록 및 해제

작업 등록·갱신은 관리자 권한이 필요합니다. 서버 PC에서 관리자 PowerShell을 열고 운영 모드 기준으로 한 번 실행합니다. 이 명령은 서비스를 중지하거나 재기동하지 않고 자동 시작 작업만 등록합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\AOP_Web.ps1 -Action RegisterStartup -Production
```

개발 모드를 쓰는 경우 `-Production`을 생략합니다. 트리거는 시스템 부팅 후 60초 지연이며, `StartWhenAvailable`과 최대 3회 재시작을 설정합니다. 실행 전 서버의 현재 IP로 CORS 허용 Origin을 갱신하고, 3000/5000 포트 준비를 최대 60초 기다립니다. 시작이 실패하면 `logs\start_*.log`, `logs\backend_stderr_*.log`, `logs\frontend_build_*.log`를 확인합니다.

일반 사용자 권한으로 `start`/`prod`를 실행해도 서비스는 시작되지만, 자동 시작 작업 등록은 권한 부족 경고와 함께 건너뜁니다. 작업 스케줄러가 실행한 경로(`-Unattended`)에서는 재등록하지 않으며, 작업은 서비스를 분리 실행한 뒤 정상 종료되어 `Last Result`가 `0x0`으로 남습니다.

등록 상태와 마지막 실행 결과는 다음 명령으로 확인할 수 있습니다.

```cmd
schtasks /Query /TN AOP_Web_AutoStart /FO LIST /V
```

출력에서 트리거가 **At startup**이고, 마지막 결과가 `0x0`인지 확인합니다. 애플리케이션이 포트 3000/5000을 열었는지는 `AOP_Web.bat status`로 확인합니다.
`status`는 자동 시작 작업의 트리거와 로그온 유형도 함께 표시하며, 작업이 없거나 로그인 트리거로 등록된 경우 관리자 PowerShell에서 실행할 복구 명령을 안내합니다. 현재 서비스가 `RUNNING`이어도 부팅 트리거가 올바르게 등록됐다는 뜻은 아니므로 자동 시작 상태를 별도로 확인하세요.

자동 시작을 해제하려면 다음 명령을 실행합니다. 작업이 없어도 오류 없이 종료됩니다.

```cmd
AOP_Web.bat uninstall
```

### 6.2 운영 모드로 자동 시작할 때의 필수 준비

작업 스케줄러는 **대화형 셸의 임시 `set`/`$env:` 값을 물려받지 않습니다.** 운영 모드 등록은 `backend\.env.production`을 사용하며, 없으면 실행 스크립트가 시크릿을 생성하고 현재 서버 IP에 맞는 CORS Origin을 저장합니다. 이 파일은 시크릿을 포함하므로 저장소에 커밋하거나 네트워크 공유에 두지 마세요. 자동 시작 등록 후 `AOP_Web.bat status`와 `logs\backend_stderr_*.log`로 시작 결과를 확인합니다.

### 6.3 수동 시작/중지

```cmd
AOP_Web.bat start
AOP_Web.bat stop
AOP_Web.bat restart
```

인자 없이 `AOP_Web.bat`를 실행해도 기존 호환성을 유지하면서 무인 시작(`autostart`와 동일)합니다. 이 경로는 재등록을 수행하지 않습니다.

서버 기동 후에는 `AOP_Web.bat status`로 5000/3000 포트가 `RUNNING`인지 확인합니다. 작업의 `Last Result`가 `0x0`이 아니면 `logs\start_*.log`에서 실패 원인을 확인하세요.

---

## 7. 수동 개별 구동 방법 (Manual Execution)

디버깅이나 개별 서버만 기동해야 하는 경우 수동으로 각각 실행할 수 있습니다.

### 백엔드 (Backend - Flask)
```cmd
cd backend
.venv\Scripts\python.exe app.py
```
> 백엔드 서버 URL: `http://localhost:5000`

### 프론트엔드 (Frontend - React + Vite)
```cmd
cd frontend
npm run dev                  # 개발 서버(즉시 반영)
npm run build && npm start   # 운영: dist\ 빌드 후 server.mjs 로 서빙
```
> 프론트엔드 웹 URL: `http://localhost:3000` (두 모드 모두 `/api` 를 백엔드 5000 으로 전달)

---

## 8. 테스트 (Testing)

프론트엔드 E2E 테스트는 Playwright 로 작성되어 있습니다.

```cmd
cd frontend
npx playwright install    # 최초 1회, 브라우저 바이너리 설치
npm test
```

- 테스트 파일: `frontend\tests\app.spec.js` (총 23 케이스)
- 설정: `frontend\playwright.config.js` (`baseURL`: `http://localhost:3000`)
- `reuseExistingServer: true` 이므로 **개발 서버가 이미 떠 있으면 그대로 재사용**하고, 없으면 `npm run dev` 를 자동 기동합니다.
- 테스트는 **비로그인 상태**를 전제로 합니다. 홈(`/`)은 인증 여부에 따라 화면이 달라지므로(비로그인: 로그인 안내 카드 / 로그인: 주간 일정 임베드), 로그인 세션이 남아 있으면 홈 관련 케이스가 실패할 수 있습니다.

프로덕션 빌드 검증은 다음으로 수행합니다.

```cmd
cd frontend
npm run build
```

> 빌드 결과는 `frontend\dist\` 에 생성됩니다(약 3초). 운영 서버(`npm start`)는 실행 시점의 `dist\` 를 서빙하므로, 다시 빌드했다면 `AOP_Web.bat restart` 로 재기동하세요.

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
├── frontend/               # React + Vite 프론트엔드 앱 (CSR SPA)
│   ├── index.html          # 진입 HTML (테마 깜빡임 방지 스크립트)
│   ├── vite.config.mjs     # 개발 서버(3000)·/api 프록시·vendor 청크 분리
│   ├── server.mjs          # 운영 서버: dist 서빙 + /api 프록시 + 압축·캐시
│   ├── src/main.jsx        # 진입점 (bootstrap → globals.css → Router)
│   ├── src/App.jsx         # 라우트 표 (경로·탭 제목·레이아웃)
│   ├── src/app/            # 화면 (data-view, machine-learning 등)
│   ├── src/components/     # 공통 컴포넌트 (Layout, Navbar, DataViewer)
│   ├── src/globals.css     # 테마 토큰 (:root / [data-theme="dark"])
│   ├── tests/              # Playwright E2E 테스트
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
| 갑자기 로그인이 풀림 | 백엔드 재시작, 브라우저 종료, 또는 `AUTH_EXPIRE_TIME` 을 양수로 지정한 경우 유휴 TTL 만료. 자격증명은 서버 메모리에만 보관됨 | 다시 로그인 (의도된 동작) |
| API 응답이 401 | 인증 토큰 없음/만료 | 로그인 후 재시도. `status` 로 백엔드 기동 여부 확인 |
| API 오류 메시지가 추상적임 | 예외 원문은 클라이언트에 노출하지 않고 서버 로그에만 기록 | `logs/` 의 백엔드 로그에서 상세 원인 확인 |
| 화면에 "서버에 연결할 수 없습니다" | 프론트 서버의 `/api` 프록시가 백엔드(5000)에 닿지 못함(502) | `AOP_Web.bat status` 로 백엔드 기동 확인, 다른 호스트면 `AOP_BACKEND_URL` 지정 |
| `git pull` 후 프론트 기동 실패(모듈 없음) | `node_modules` 가 이전 의존성 | 실행 스크립트가 `package-lock.json` 변경을 감지해 `npm ci` 를 자동 실행. 수동이면 `cd frontend && npm ci` |
| `pip install -r requirements.txt` 가 파일을 읽지 못함 | 파일이 UTF-8 이외 인코딩으로 다시 저장됨 | UTF-8(BOM 없음)로 저장 |
| 예전에 생성한 CSV 가 목록/조회에서 보이지 않음 | 구버전은 실행 위치 기준 상대 경로를 써서 `backend\1_uploads\` 에 저장했음 | 해당 파일을 루트 `1_uploads\` 의 같은 하위 경로로 옮기면 조회됩니다 |
