# 백엔드 리팩토링 구조 안내

## 주요 변경점
- `backend_main.py` → `app.py`로 대체, 모든 라우트/핸들러/유틸 분리
- Blueprint 기반 모듈화: 인증, 파일, DB, ML 등
- 공통 유틸/데코레이터/로깅/에러처리 분리
- DB 매니저 별도 모듈화

## 폴더 구조
```
backend/
  app.py                # Flask 앱 생성 및 Blueprint 등록
  config.py             # Config 클래스 및 환경설정
  db/
    manager.py          # DatabaseManager
    __init__.py
  routes/
    auth.py             # 인증 관련
    file.py             # 파일 업로드/다운로드
    db_api.py           # DB 관련 API
    ml.py               # 머신러닝 관련
    etc.py              # 기타 라우트
    __init__.py
  utils/
    logger.py           # 로깅
    error_handler.py    # error_response
    decorators.py       # handle_exceptions 등
    __init__.py
  __init__.py
```

## 실행 방법
- `python app.py`로 실행
- 기존 `backend_main.py`는 더 이상 사용하지 않음

## 참고
- 각 Blueprint/유틸 모듈은 기존 함수/클래스와 1:1 매핑
- 필요시 각 routes/ 모듈에서 함수 추가/수정 가능
