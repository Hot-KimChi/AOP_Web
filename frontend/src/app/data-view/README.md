# Data View 페이지 구조

## 📁 폴더 구조

```
data-view/
├── page.js                    # 메인 페이지 (216줄)
├── constants/                 # 상수 정의
│   ├── editableColumns.js    # 편집 가능한 컬럼 정의
│   ├── messages.js           # 사용자 메시지 상수
│   └── storageKeys.js        # SessionStorage 키 상수
├── utils/                    # 유틸리티 함수
│   ├── dataFormatters.js     # 데이터 포맷팅
│   ├── csvExport.js          # CSV 파일 내보내기
│   ├── dataValidation.js     # 데이터 유효성 검사
│   └── comboBoxHelpers.js    # 콤보박스 옵션 생성
├── hooks/                    # Custom Hooks
│   ├── useDataManagement.js  # 데이터 관리
│   ├── useDataFilter.js      # 필터링
│   ├── useDataSort.js        # 정렬
│   ├── useDataEdit.js        # 편집
│   ├── useRowOperations.js   # 행 조작
│   └── useWindowSync.js      # 윈도우 동기화
└── components/               # UI 컴포넌트
    ├── LoadingSpinner.jsx    # 로딩 표시
    ├── ErrorMessage.jsx      # 에러 메시지
    ├── ChangeSummary.jsx     # 변경 요약
    ├── ActionButtons.jsx     # 액션 버튼 그룹
    ├── EditableCell.jsx      # 편집 가능한 셀
    ├── RowActions.jsx        # 행 액션 버튼
    └── DataTable/            # 테이블 컴포넌트
        ├── index.jsx         # 메인 테이블
        ├── TableHeader.jsx   # 테이블 헤더
        ├── FilterRow.jsx     # 필터 행
        └── TableBody.jsx     # 테이블 바디
```

## 🎯 각 파일의 역할

### 메인 페이지
- **page.js**: Hook과 컴포넌트를 조합하는 컨테이너 역할

### 상수 (constants/)
- **editableColumns.js**: 편집 가능한 컬럼 목록과 유효성 검사 타입 정의
- **messages.js**: 사용자에게 표시되는 모든 메시지 중앙 관리
- **storageKeys.js**: sessionStorage 키와 상태값 상수화

### 유틸리티 (utils/)
- **dataFormatters.js**: 숫자/텍스트 포맷팅, 깊은 복사
- **csvExport.js**: CSV 파일 생성 및 다운로드
- **dataValidation.js**: 셀 데이터 유효성 검증
- **comboBoxHelpers.js**: 필터 옵션 자동 생성

### Custom Hooks (hooks/)
- **useDataManagement**: CSV 데이터 로드, 저장, sessionStorage 관리
- **useDataFilter**: 필터링 로직 (콤보박스 필터)
- **useDataSort**: 정렬 로직 (오름차순/내림차순)
- **useDataEdit**: 셀 편집, 유효성 검사, 저장/복원
- **useRowOperations**: 행 복사, 삭제, 복원
- **useWindowSync**: 부모 창과의 메시지 통신

### 컴포넌트 (components/)
- **LoadingSpinner**: 로딩 중 표시
- **ErrorMessage**: 에러 메시지 표시
- **ChangeSummary**: 변경 사항 요약 정보
- **ActionButtons**: 상단 액션 버튼 그룹
- **EditableCell**: 편집 가능한 셀 (입력, 에러 표시)
- **RowActions**: 행별 복사/삭제 버튼
- **DataTable**: 전체 테이블 통합 컴포넌트
  - TableHeader: 정렬 버튼이 있는 헤더
  - FilterRow: 필터 콤보박스 행
  - TableBody: 데이터 행 렌더링

## 🔄 데이터 흐름

```
1. 초기 로드
   useDataManagement → sessionStorage → csvData/displayData

2. 필터링
   사용자 입력 → useDataFilter → displayData 업데이트

3. 정렬
   헤더 클릭 → useDataSort → displayData 재정렬

4. 편집
   셀 수정 → useDataEdit → editedData 추적 → 유효성 검사

5. 저장
   저장 버튼 → editedData 적용 → csvData 업데이트 → sessionStorage 저장

6. 부모 창 동기화
   useWindowSync → window.postMessage → 부모 창 업데이트
```

## 📚 학습 경로 (초보자용)

1. **Step 1**: `constants/` 파일들 읽기
   - 어떤 상수들이 사용되는지 파악

2. **Step 2**: `utils/` 유틸리티 함수 이해
   - 각 함수의 입력/출력 확인

3. **Step 3**: 작은 컴포넌트부터 (`LoadingSpinner`, `ErrorMessage`)
   - 단순한 UI 컴포넌트 구조 학습

4. **Step 4**: Custom Hooks 이해
   - `useDataFilter` (가장 단순)부터 시작
   - `useDataManagement` (가장 복잡)는 마지막에

5. **Step 5**: 테이블 컴포넌트
   - TableHeader → FilterRow → TableBody 순서로

6. **Step 6**: 메인 page.js
   - 전체 데이터 흐름 파악

## 🛠️ 유지보수 가이드

### 메시지 변경
→ `constants/messages.js` 파일만 수정

### 편집 가능한 컬럼 추가
→ `constants/editableColumns.js`에 컬럼명 추가

### 유효성 검사 로직 변경
→ `utils/dataValidation.js` 수정

### UI 변경
→ 해당 컴포넌트 파일만 수정 (다른 코드에 영향 없음)

### 비즈니스 로직 변경
→ 해당 Hook 파일만 수정
