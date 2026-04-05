# Machine Learning 페이지 리팩터링 기록

> 최신 변경 사항이 위에, 오래된 기록이 아래에 위치합니다.

### 📎 관련 문서
| 문서 | 설명 |
|------|------|
| **[AI_Rearch_summary.md](../../../../../AI_Rearch_summary.md)** | 프로젝트 전반 요약 — [§머신러닝 파이프라인](../../../../../AI_Rearch_summary.md#33-머신러닝-파이프라인), [§Frontend 페이지](../../../../../AI_Rearch_summary.md#35-frontend-페이지-구성) |
| **[AI_Rearch_detail.md](../../../../../AI_Rearch_detail.md)** | 상세 코드 리뷰 — [§ML 파이프라인](../../../../../AI_Rearch_detail.md#3-ml-파이프라인-상세-분석), [§ML 페이지 분석](../../../../../AI_Rearch_detail.md#63-machine-learning-페이지-174줄), [§ml.py API](../../../../../AI_Rearch_detail.md#15-routesmlpy--머신러닝-api-397줄) |

---

## 2026-03-02 — 초기화 버튼 오류 + 전체 코드 정밀 리뷰 3종 버그 수정

### 변경 파일
`_hooks.js`, `components/ScatterPlotCard.js`

---

### ① 초기화(↺) 버튼 클릭 시 `event.forEach is not a function` 오류 (CRITICAL)

**근본 원인**: `ScatterPlotCard` 에서 `onClick={onReset}` 으로 연결하면
브라우저가 `SyntheticEvent` 객체를 **첫 번째 인수**로 그대로 전달합니다.

```javascript
// 수정 전 (버그)
const resetTobestScatter = useCallback(async (currentVersionsData) => {
  const data = currentVersionsData || versionsData; // event 객체가 truthy → data = event
  const best = findBestVersion(data);               // data.forEach is not a function!

// ScatterPlotCard (버그)
onClick={onReset}   // ← SyntheticEvent 전달됨
```

**수정**:
- `resetTobestScatter` 파라미터 제거 → 항상 `versionsData` state 사용
- `ScatterPlotCard` 버튼을 `onClick={() => onReset()}` 으로 래핑하여 이중 방어

```javascript
// 수정 후 (_hooks.js)
const resetTobestScatter = useCallback(async () => {
  const best = findBestVersion(versionsData);  // 파라미터 없이 state 직접 참조
  ...
}, [versionsData, applyScatterVersion]);

// 수정 후 (ScatterPlotCard.js)
onClick={() => onReset()}   // ← 이벤트 객체가 onReset 에 전달되지 않음
```

---

### ② 산점도 캐시가 실제로 작동하지 않던 버그 (BUG)

**근본 원인**: `fetchScatterByVersionId` 에서 캐시 확인(`scatterCacheRef.current[versionId]`)은 하지만
API 결과를 **캐시에 저장하는 코드가 없었음** → 같은 버전을 클릭할 때마다 매번 API 재호출 발생.

```javascript
// 수정 전 (캐시 저장 누락)
if (json.status === 'success' && json.data.length > 0) {
  return json.data[0];  // ← 캐시에 저장 안 함
}

// 수정 후
if (json.status === 'success' && json.data.length > 0) {
  scatterCacheRef.current[versionId] = json.data[0];  // ← 캐시 저장
  return json.data[0];
}
```

---

### ③ 훈련 성공 후 `scatterNoDataMsg` 미초기화 (MINOR)

훈련 완료 후 새 scatter 데이터를 `setScatterData([m])` 으로 세팅할 때
`scatterNoDataMsg` 를 초기화하지 않아, 이후 reset 시 이전 에러 메시지가 남아있을 수 있었음.

```javascript
// 수정 후 (handleTraining 내부)
setScatterData([m]);
setScatterNoDataMsg('');  // ← 추가
```

---

## 2026-03-02 — 데이터 없는 버전 클릭 시 이전 모델 산점도 잔류 버그 수정

### 변경 파일
`_hooks.js`, `components/ScatterPlotCard.js`, `page.js`

---

### 문제 설명

모델 A를 클릭해 산점도를 표시한 뒤, DB에 예측 포인트 데이터가 **없는** 모델 B를 클릭하면
B를 선택했음에도 A의 데이터가 그대로 남아 사용자에게 **잘못된 데이터**가 표시되는 버그.

### 근본 원인 (`_hooks.js` · `applyScatterVersion`)

```javascript
// 수정 전 (버그)
const pointData = await fetchScatterByVersionId(versionId);
if (!pointData) return;   // ← 데이터 없으면 아무것도 안 함 → 이전 scatterData 잔류
```

`fetchScatterByVersionId` 가 `null` 을 반환할 때 조기 종료만 하고 `scatterData` 를 클리어하지 않아,
이전에 로드된 모델의 차트 데이터가 화면에 그대로 유지되었다.

### 수정 내용

#### `_hooks.js`
1. **`scatterNoDataMsg` state 추가**: 빈 문자열 = 초기·일반 빈 상태, 비어있지 않으면 해당 버전 전용 안내
2. **`applyScatterVersion` 로직 분기**:
   - `addMode = false` (일반 클릭) + 데이터 없음 → `setScatterData([])` 로 명확히 클리어 + `scatterNoDataMsg` 세팅
   - `addMode = true` (Ctrl+클릭) + 데이터 없음 → 조용히 무시 (기존 다중 선택 보존)
   - 데이터 있음 → `scatterNoDataMsg` 초기화 후 기존 로직 실행
3. **PowerShell heredoc 오염 잔여분 수정** (`||` → `;` 4곳):
   - `NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'`
   - `json.data || []` (fetchVersionsAndScatter, refreshVersionsPerformance 2곳)
   - `currentVersionsData || versionsData` (resetTobestScatter)

#### `components/ScatterPlotCard.js`
- `scatterNoDataMsg` prop 추가
- 빈 상태 알림을 두 가지로 구분:
  - `scatterNoDataMsg` 있음 → `alert-danger` + "**데이터 없음**" + 버전별 메시지
  - `scatterNoDataMsg` 없음 → `alert-warning` + 기존 초기 안내 메시지

#### `page.js`
- `scatterNoDataMsg` 훅에서 구조분해 후 `ScatterPlotCard` 에 전달

---

## 2026-03-01 — 단일 클릭 시 멀티 선택 버그 + 코드 품질 개선

### 변경 파일
`_hooks.js`, `components/ScoreLineChart.js`, `components/ScatterPlotCard.js`

---

### ① 단일 클릭 → 2개 모델 선택되는 버그 (구조적 원인 해결)

**근본 원인: `scatterData` 와 `selectedVersionsMeta` 의 구조적 desync**

기존에는 두 값을 **별개 state 변수**로 관리했다. async 환경에서 두 setter 가 다른 시점에 실행되거나, race condition 이 발생할 경우 두 값이 일치하지 않아 헤더 배지 수 ≠ 차트 데이터 수 불일치가 발생했다.

```javascript
// ❌ 기존 — 두 별개 state, async 타이밍에 따라 desync 가능
const [scatterData, setScatterData] = useState([]);
const [selectedVersionsMeta, setSelectedVersionsMeta] = useState([]);
```

**해결 방법: `selectedVersionsMeta` 를 `scatterData` 에서 파생(useMemo)**

`scatterData` 의 각 항목에는 이미 `version_id / model_name / version_number` 가 포함되어 있어, `selectedVersionsMeta` 는 `scatterData` 에서 완전히 파생 가능하다. 파생값으로 처리하면 **구조적으로 불일치가 불가능**하다.

```javascript
// ✅ 해결 — scatterData에서 결정론적으로 파생
const selectedVersionsMeta = useMemo(
  () => scatterData.map((item) => ({
    version_id:     item.version_id,
    model_name:     item.model_name,
    version_number: item.version_number,
  })),
  [scatterData]
);
```

이에 따라 `setSelectedVersionsMeta` 호출이 `applyScatterVersion`, `removeVersionFromScatter`, `handleTraining`, 초기 로드에서 **모두 제거**됐다. `scatterData` 만 관리하면 된다.

---

### ② 경쟁 조건(Race Condition) 방지: 시퀀스 카운터 도입

**원인**: 사용자가 포인트를 빠르게 클릭하거나, 초기 로드의 scatter fetch 가 사용자 클릭보다 늦게 완료될 경우, 이전 요청의 결과가 최신 상태를 덮어쓸 수 있었다.

**해결 방법**: `scatterSeqRef` 시퀀스 카운터를 도입.
- 새 클릭/요청이 발생할 때마다 `++scatterSeqRef.current` 로 seq 를 증가
- async 작업 완료 후 `scatterSeqRef.current !== seq` 이면 자동 폐기

```javascript
const seq = ++scatterSeqRef.current;
const pointData = await fetchScatterByVersionId(versionId);
if (scatterSeqRef.current !== seq) return; // 더 최신 요청이 생겼으면 폐기
setScatterData([pointData]);
```

초기 로드 역시 같은 `scatterSeqRef` 를 공유하므로, 사용자가 먼저 클릭하면 초기 로드 결과가 자동으로 무시된다.

---

### ③ 코드 품질 개선

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| `fetchScatterByVersionId` | 매 렌더마다 재생성되는 일반 함수 | `useCallback([], [...])` 으로 안정적 참조 유지 |
| `refreshVersionsPerformance` | 일반 async 함수 | `useCallback` 적용 |
| `handleTraining` | 일반 async 함수 | `useCallback([selectedModel, refreshVersionsPerformance])` 적용 |
| `fetchScatterByVersionId` 위치 | `useEffect` 뒤에 선언 (호이스팅 의존) | `useEffect` **앞으로** 이동하여 명확한 선언 순서 확보 |

---

### ④ Chart.js flex-grow 컨테이너 높이 안정화

**원인**: Chart.js 는 `flex-grow-1` 컨테이너 안에서 canvas 높이를 `0` 으로 계산하는 알려진 버그가 있다. `responsive: true` + `maintainAspectRatio: false` 조합에서 컨테이너가 flex item 일 때 발생한다.

**해결 방법**: 차트를 `position: absolute; inset: 0` 인 wrapper div 로 감싸 Chart.js 가 명확한 픽셀 크기를 읽을 수 있도록 처리. 카드 body 의 `position: relative` 가 기준점 역할을 한다.

```jsx
<div style={{ position: 'absolute', inset: 0, padding: '4px' }}>
  <Line data={chartData} options={chartOptions} />
</div>
```

적용 파일: `components/ScoreLineChart.js`, `components/ScatterPlotCard.js`

---

## 2026-02-28 — UI 버그 수정 3건

### 변경 파일
`page.js`, `components/ScoreLineChart.js`, `components/ScatterPlotCard.js`, `_hooks.js`

---

### ① 상단 카드 높이 불일치

**원인 분석**
기존 구조는 하나의 `row` 안에 두 개의 `col-xl-6`이 있고, 각 컬럼 내부에 `d-flex flex-column`으로 두 카드(상단+하단)를 수직 배치했다. Bootstrap의 `align-items: stretch`는 **같은 row에 속한 col 간의 높이**를 동일하게 맞추지만, 각 **col 내부**의 개별 카드 높이까지 교차 정렬해주지는 않는다. 따라서 좌측 상단 카드(ScoreLineChart)와 우측 상단 카드(ScatterPlotCard)의 높이가 콘텐츠에 따라 달라졌다.

**해결 방법**
`page.js`를 **상단 row / 하단 row** 2개 행 구조로 재편하여, ScoreLineChart와 ScatterPlotCard를 **같은 row** 안에 배치. 두 카드에 `h-100 d-flex flex-column`을 추가하여 Bootstrap row equalization이 두 카드 높이를 자동 통일하도록 처리. 차트 body에는 `flex-grow-1` + `position: relative` + `minHeight: 300px` 적용.

| 변경 전 | 변경 후 |
|---------|---------|
| 1개 row, 각 col 내부 flex-column (상단+하단 2개 카드) | 2개 row: 상단 row (ScoreLineChart + ScatterPlotCard), 하단 row (테이블 + 훈련 카드) |
| 카드 `style={{ height: '380px' }}` 고정 | 카드 `h-100 d-flex flex-column` + body `flex-grow-1` |

---

### ② 상단 메뉴와의 여백 부족

**해결 방법**
`page.js` return의 최외곽 컨테이너에 `mt-4` 클래스 추가 (상단 24px 여백).

---

### ③ 멀티 선택 시 헤더 배지 3개 / 데이터 2개 불일치 버그

**원인 분석 (중요)**
`_hooks.js`의 `applyScatterVersion` 함수에서 `addMode=true` 시 아래와 같은 코드가 있었다:
```javascript
// ❌ 잘못된 패턴 — updater 함수 내부에서 다른 setState 호출
setSelectedVersionsMeta((prev) => {
  if (exists) {
    setScatterData(...);   // ← updater 안에서 side effect 발생!
    return ...;
  }
  setScatterData(...);     // ← 마찬가지
  return [...prev, meta];
});
```
React StrictMode는 개발 환경에서 updater 함수를 **의도적으로 2회 실행**한다 (순수성 검증 목적). 이 때 `setScatterData` 호출이 2번 발생하므로, `selectedVersionsMeta`는 1개가 추가되는 반면 `scatterData`에는 같은 항목이 2번 추가될 수 있다. 또는 상태 배치(batch) 타이밍에 따라 meta/data 간 불일치가 발생한다.

**해결 방법**
두 setter를 완전히 분리하고, 각각 **pure functional update**로 처리하여 side effect 없는 순수 함수로 변경:
```javascript
// ✅ 올바른 패턴 — 각 setter를 독립적인 pure functional update로 분리
setScatterData((prevData) => {
  const exists = prevData.some((item) => item.version_id === versionId);
  return exists ? prevData.filter(...) : [...prevData, pointData];
});
setSelectedVersionsMeta((prev) => {
  const exists = prev.some((m) => m.version_id === versionId);
  return exists ? prev.filter(...) : [...prev, meta];
});
```
StrictMode 이중 실행 시에도 각 updater가 멱등(idempotent)하므로 상태 불일치가 발생하지 않는다.

---

## 2026-02-28 — UI 레이아웃 조정

### 변경 파일
`page.js`

### 변경 내용

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 페이지 상단 제목 (`"머신러닝 모델 관리"`) | 표시됨 | **제거** |
| 좌측 열 너비 | `col-12 col-xl-7` (58.3%) | `col-12 col-xl-6` (50%) |
| 우측 열 너비 | `col-12 col-xl-5` (41.7%) | `col-12 col-xl-6` (50%) |

### 이유
- 레이아웃 내부 `<Layout>` 컴포넌트의 헤더가 이미 페이지 식별 역할을 하므로 중복 제목 제거.
- 좌우 카드(라인 차트 ↔ 산점도)의 시각적 비중이 동일하여 1:1 너비가 더 균형 있음.

---

## 2026-02-28 — 초기 리팩터링 (대규모 분리)

### 배경
`page.js` 단일 파일이 ~990줄로 비대해져 가독성·유지보수성 저하 문제 발생.

### 변경 내용
기존 `page.js` 1개 파일을 아래 **8개 파일**로 분리.

| 파일 | 역할 |
|------|------|
| `page.js` | 최상위 오케스트레이터 (~160줄) |
| `_constants.js` | Chart.js 색상·옵션 상수 (`MODEL_COLORS`, `makeLineChartOptions`, `SCATTER_CHART_OPTIONS`) |
| `_helpers.js` | 순수 유틸 함수 (`findBestVersion`, `buildLineChartData`, `buildScatterChartData`, `getScoreClass`, `getStageBadge`) |
| `_hooks.js` | 커스텀 훅 `useMLPageData()` — 모든 상태 + API 로직 |
| `components/ScoreLineChart.js` | 좌상단: R² 추이 라인 차트 카드 |
| `components/ScatterPlotCard.js` | 우상단: Target vs Estimation 산점도 카드 |
| `components/ModelVersionsTable.js` | 좌하단: 버전별 성능 테이블 (아코디언) |
| `components/ModelTrainingCard.js` | 우하단: 모델 선택 + Training 버튼 카드 |

### 주요 설계 결정
- `_hooks.js` 내 `initialLoadDoneRef` 로 React StrictMode 이중 실행 방지
- `scatterCacheRef` 로 산점도 API 중복 호출 캐싱
- Chart datasets 에 `_modelName` 커스텀 프로퍼티 → 필터 후에도 모델명 안전하게 추적
- 버전 목록 + 최고 모델 산점도를 단일 async 흐름으로 초기 로드 (React 렌더 사이클 delay 제거)
