# AOP Web Application

AOP Web Application은 Flask 기반 백엔드 API와 Next.js 15 (App Router) 기반 프론트엔드 웹 인터페이스, 그리고 MS-SQL Server를 연동한 풀스택 웹 애플리케이션입니다.

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

## 3. 빠른 시작 및 구동 가이드 (Quick Start)

통합 구동 스크립트(`AOP_Web_Auto.bat` 및 `AOP_Web.ps1`)를 사용하여 애플리케이션 시작, 종료, 재시작, 상태 점검을 한 번에 수행할 수 있습니다.

### 3.1 배치 파일 명령어 (`AOP_Web_Auto.bat`)

프로젝트 루트 디렉토리에서 `AOP_Web_Auto.bat`를 실행하거나 명령 프롬프트(CMD)에서 아래 명령어들을 수행합니다.

| 명령어 | 설명 |
|--------|------|
| `AOP_Web_Auto.bat` | 개발 모드로 애플리케이션 시작 (기본값) |
| `AOP_Web_Auto.bat start` | 서버 시작 (개발 모드) |
| `AOP_Web_Auto.bat stop` | 실행 중인 백엔드(5000) 및 프론트엔드(3000) 종료 |
| `AOP_Web_Auto.bat restart` | 서버 재시작 |
| `AOP_Web_Auto.bat status` | 현재 백엔드/프론트엔드 포트 리스닝 및 프로세스 상태 확인 |
| `AOP_Web_Auto.bat prod` | 운영 모드(Production)로 빌드 및 백그라운드 구동 |

### 3.2 PowerShell 직접 실행 (`AOP_Web.ps1`)

PowerShell 환경에서 직접 세부 옵션과 함께 제어할 수도 있습니다.

```powershell
# 개발 모드 시작
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\AOP_Web.ps1 -Action Start

# 운영 모드 시작
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\AOP_Web.ps1 -Action Start -Production

# 강제 종료
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\AOP_Web.ps1 -Action Stop -Force

# 환경 상태 진단
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\AOP_Web.ps1 -Diagnose
```

---

## 4. Windows 시작프로그램 무인 자동 등록 (Auto-Start setup)

서버 부팅 시 로그인과 함께 애플리케이션이 자동으로 기동되도록 설정하는 방법입니다.

### 방법 1: Windows 시작프로그램 폴더(`shell:startup`) 이용
1. `Win + R` 키를 눌러 실행 창을 엽니다.
2. `shell:startup` 을 입력하여 시작프로그램 폴더를 엽니다.
3. `AOP_Web_Auto.bat` 파일의 바로 가기(Shortcut)를 해당 폴더 안에 만듭니다.
4. 서버 재부팅 시 백그라운드/독립 프로세스로 무인 자동 실행됩니다.

### 방법 2: Windows 작업 스케줄러(Task Scheduler) 이용
1. 작업 스케줄러 실행 후 **[기본 작업 만들기]** 선택.
2. 트리거: **[컴퓨터 시작 시]** 또는 **[로그온할 때]** 선택.
3. 동작: **[프로그램 시작]** 선택.
4. 프로그램/스크립트: `D:\GitHub\AOP_Web\AOP_Web_Auto.bat` 지정.
5. 시작 위치: `D:\GitHub\AOP_Web\` 지정.

---

## 5. 수동 개별 구동 방법 (Manual Execution)

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

## 6. 디렉토리 구조 (Directory Structure)

```
AOP_Web/
├── AOP_Web_Auto.bat        # 통합 구동/종료 배치 스크립트 (메인 컨트롤러)
├── AOP_Web.ps1             # 통합 PowerShell 구동 제어 모듈
├── AOP_Web_Common.ps1      # 공통 유틸리티 (포트 조작, 로깅, 로그 정리)
├── Implementation_list.md  # 작업 수행 내역 및 요구사항 관리 파일
├── README.md               # 프로젝트 설치 및 구동 설명 문서
├── backend/                # Flask 백엔드 서비스
│   ├── app.py              # Flask 메인 엔트리포인트
│   ├── routes/             # API 라우터
│   └── .venv/              # Python 가상환경
├── frontend/               # Next.js 프론트엔드 앱
│   ├── src/                # Next.js App Router 페이지 및 컴포넌트
│   └── package.json
└── logs/                   # 구동/종료 로그 파일 보관 디렉토리
```

---

## 7. 로깅 및 트러블슈팅 (Logging & Troubleshooting)

- **로그 저장 경로**: `logs/` 디렉토리에 텍스트(`.log`) 및 JSON(`.json`) 형태로 날짜별 자동 보관됩니다.
- **로그 자동 정리**: 30일이 지나거나 로그 용량이 500MB를 초과할 경우 자동으로 오래된 로그가 정돈됩니다.
- **포트 충돌 해결**: `AOP_Web_Auto.bat start` 실행 시 5000/3000 포트가 이미 사용 중이면 기존 프로세스를 자동으로 탐지하고 정리 후 새로 기동합니다.
- **환경 진단**: 실행에 문제가 있을 경우 `-Diagnose` 명령을 통해 Python, Node.js, 가상환경, 필수 디렉토리 상태를 점검할 수 있습니다.
