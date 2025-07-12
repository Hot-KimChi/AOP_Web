# AOP_Web Backend 구조 분석 문서

## 📋 개요
AOP_Web 백엔드는 Flask 프레임워크 기반으로 구축되어 있으며, Blueprint 패턴을 사용하여 모듈화된 구조를 가지고 있습니다. 리팩토링을 통해 가독성과 유지보수성을 크게 향상시켰습니다.

## 🏗️ 전체 아키텍처

### 계층 구조
```
Flask App (app.py)
├── Configuration (config.py)
├── Routes (Blueprint 기반)
│   ├── Authentication (auth.py)
│   ├── File Processing (file.py)
│   ├── Database API (db_api.py)
│   └── Machine Learning (ml.py)
├── Utilities (utils/)
│   ├── Decorators (decorators.py)
│   ├── Error Handler (error_handler.py)
│   └── Logger (logger.py)
├── Database Manager (db/manager.py)
└── Business Logic Packages
    ├── Machine Learning (pkg_MachineLearning/)
    ├── Measurement Set Generation (pkg_MeasSetGen/)
    └── SQL Operations (pkg_SQL/)
```

## 📁 상세 구조 분석

### 1. 핵심 파일들

#### `app.py` - 애플리케이션 팩토리
- Flask 애플리케이션 인스턴스 생성
- CORS 설정 및 Blueprint 등록
- 전역 설정 관리
- 애플리케이션 컨텍스트 정리

#### `config.py` - 설정 관리
- 환경변수 기반 설정
- 파일 업로드 경로 설정
- JWT 인증 설정
- 데이터베이스 설정 로드

### 2. Routes 모듈 (Blueprint 기반)

#### `auth.py` - 인증 관리
- **엔드포인트**: `/api/auth/*`
- **기능**: 로그인, 로그아웃, 인증 상태 확인
- **보안**: JWT 토큰 기반 인증
- **세션**: 사용자 인증 정보 관리

#### `file.py` - 파일 처리
- **엔드포인트**: `/api/measset-generation`
- **기능**: 파일 업로드 및 측정 세트 생성
- **보안**: 파일명 보안 처리 (secure_filename)
- **연동**: MeasSetGen 패키지와 연동

#### `db_api.py` - 데이터베이스 API
- **엔드포인트**: `/api/*` (다수)
- **기능**: 
  - SQL 데이터 삽입
  - CSV 데이터 조회
  - 데이터베이스/테이블 목록 조회
  - 프로브 정보 조회
  - TxCompare 실행
  - Word 문서 내보내기
- **보안**: SQL 인젝션 방지 처리

#### `ml.py` - 머신러닝 API
- **엔드포인트**: `/api/get_ml_models`
- **기능**: 사용 가능한 ML 모델 목록 조회
- **연동**: MachineLearning 패키지와 연동

### 3. 유틸리티 모듈

#### `decorators.py` - 데코레이터 모음
- **`handle_exceptions`**: 전역 예외 처리
- **`require_auth`**: JWT 인증 검증
- **`with_db_connection`**: 데이터베이스 연결 관리

#### `error_handler.py` - 에러 응답 관리
- 표준화된 JSON 에러 응답 생성
- HTTP 상태 코드 관리

#### `logger.py` - 로깅 설정
- 통합 로깅 설정
- 포맷팅 및 레벨 관리

### 4. 데이터베이스 관리

#### `db/manager.py` - DatabaseManager
- **역할**: 데이터베이스 연결 관리
- **패턴**: Context Manager 패턴 사용
- **연결**: SQL Server ODBC 연결
- **자동 정리**: 연결 자동 해제

### 5. 비즈니스 로직 패키지

#### `pkg_SQL/` - SQL 연산 패키지
- **`database.py`**: SQL Server 연결 및 쿼리 실행
- **기능**: 
  - 연결 문자열 생성
  - 쿼리 실행 (SELECT, INSERT, 저장 프로시저)
  - 사용자 인증
  - 데이터 삽입/조회

#### `pkg_MeasSetGen/` - 측정 세트 생성 패키지
- **`meas_generation.py`**: 메인 로직
- **`data_inout.py`**: 데이터 입출력
- **`remove_duplicate.py`**: 중복 제거
- **`param_gen.py`**: 파라미터 생성
- **`predictML.py`**: ML 예측
- **`create_groupidx.py`**: 그룹 인덱스 생성

#### `pkg_MachineLearning/` - 머신러닝 패키지
- **`machine_learning.py`**: ML 모델 관리
- **기능**: 
  - 설정 파일에서 모델 목록 조회
  - 모델 경로 관리

### 6. 머신러닝 모델 저장소

#### `ML_Models/` - 모델 파일 저장소
- **현재 모델**: RandomForestRegressor (Python 3.10, sklearn 1.4.2)
- **이전 모델들**: 
  - DecisionTreeRegressor
  - Neural Networks (DNN, ANN)
  - Gradient Boosting 계열
  - Linear Regression 계열
  - XGBoost

## 🔧 설정 파일들

### `AOP_config.cfg`
- 데이터베이스 연결 정보
- 서버 주소 설정
- 머신러닝 모델 설정

### `requirements.txt`
- Python 의존성 패키지 목록
- Flask, pandas, scikit-learn 등

## 🚀 실행 플로우

### 1. 애플리케이션 시작
```
Config.load_config() → create_app() → app.run()
```

### 2. 요청 처리 플로우
```
HTTP Request → Blueprint Route → Decorators → Business Logic → Response
```

### 3. 데이터베이스 연결 플로우
```
@with_db_connection → DatabaseManager → SQL 클래스 → 쿼리 실행
```

## 🔐 보안 특징

### 인증 및 인가
- JWT 토큰 기반 인증
- 쿠키 기반 토큰 저장
- 세션 관리

### 데이터 보안
- SQL 인젝션 방지
- 파일 업로드 보안 (secure_filename)
- 파라미터 유효성 검증

## 📊 성능 최적화

### 데이터베이스
- SQLAlchemy 엔진 재사용
- 연결 풀링 지원
- Context Manager 패턴으로 자동 정리

### 메모리 관리
- 임시 파일 자동 삭제
- DataFrame 효율적 처리
- 불필요한 복사 최소화

## 🔄 확장성 고려사항

### 모듈화
- Blueprint 기반 분리
- 패키지별 독립성
- 인터페이스 일관성

### 유지보수성
- 표준화된 에러 처리
- 통합 로깅
- 설정 파일 중앙화

## 📝 주요 개선사항 (리팩토링 후)

1. **모듈화**: 단일 파일에서 기능별 모듈로 분리
2. **재사용성**: 공통 유틸리티 분리
3. **확장성**: Blueprint 패턴 도입
4. **유지보수성**: 표준화된 구조 및 에러 처리
5. **성능**: 불필요한 import 및 연산 최소화
6. **보안**: 체계적인 인증 및 검증 로직
