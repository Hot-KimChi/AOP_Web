/**
 * machine-learning/page.js
 *
 * 머신러닝 페이지 최상위 오케스트레이터.
 * 모든 상태·API 로직은 _hooks.js(useMLPageData)에,
 * 각 카드 UI는 components/ 하위 파일에 위임합니다.
 *
 * 파일 구조:
 *  _constants.js             — 차트 색상 및 옵션 상수
 *  _helpers.js               — 순수 유틸 함수 (데이터 변환 등)
 *  _hooks.js                 — 커스텀 훅 (상태 + API 호출)
 *  components/
 *    ScoreLineChart.js       — 좌상단: R² 추이 라인 차트
 *    ScatterPlotCard.js      — 우상단: Target vs Estimation 산점도
 *    ModelVersionsTable.js   — 좌하단: 버전별 성능 테이블
 *    ModelTrainingCard.js    — 우하단: 모델 선택 및 훈련 버튼
 */
'use client';

// ── Chart.js 관련 모듈 등록 (최상위에서 1회만 실행) ──────────
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Filler,
  Title,
  Tooltip,
  Legend
);

// ── 레이아웃 및 커스텀 훅 ────────────────────────────────────
import Layout from '../../components/Layout';
import { useMLPageData } from './_hooks';

// ── UI 카드 컴포넌트 ──────────────────────────────────────────
import ScoreLineChart    from './components/ScoreLineChart';
import ScatterPlotCard   from './components/ScatterPlotCard';
import ModelVersionsTable from './components/ModelVersionsTable';
import ModelTrainingCard  from './components/ModelTrainingCard';

// ─────────────────────────────────────────────────────────────
// 페이지 컴포넌트
// ─────────────────────────────────────────────────────────────
export default function MachineLearningPage() {
  // 모든 상태와 핸들러를 훅에서 가져옵니다
  const {
    // 모델 목록
    models,
    loading,

    // 버전 성능 데이터
    versionsData,
    versionsLoading,
    expandedModels,
    setExpandedModels,

    // 산점도 데이터
    scatterData,
    scatterLoading,
    scatterNoDataMsg,
    selectedVersionsMeta,

    // 훈련 관련
    selectedModel,
    setSelectedModel,
    trainingLoading,
    error,
    trainingResult,

    // 이벤트 핸들러
    handleRemoveVersion,
    handleResetScatter,
    handleTraining,

    // Chart.js 용 data / options 객체
    chartData,
    chartOptions,
    scatterChartData,
  } = useMLPageData();

  return (
    <Layout>
      {/* mt-4: 상단 메뉴 레이아웃과의 여백 확보 */}
      <div className="mt-4">

        {/*
         * 상단 행: ScoreLineChart ↔ ScatterPlotCard
         * 같은 row 안에 배치해야 Bootstrap flex의 align-items:stretch 가
         * 두 카드의 높이를 자동으로 동일하게 맞춰줍니다.
         * 각 카드에 h-100 을 적용하여 컬럼 높이 전체를 채웁니다.
         */}
        {/*
         * minHeight: 560px — 상단 두 카드의 기준 높이.
         * 양쪽 col 이 h-100 이므로 row 높이 전체를 카드가 채웁니다.
         * 카드 body 는 flex-grow-1 + absolute 차트 wrapper 로 남은 공간을 모두 사용합니다.
         */}
        <div className="row g-3 mb-3" style={{ minHeight: '560px' }}>

          {/* 좌상단: R² 추이 라인 차트 */}
          <div className="col-12 col-xl-6">
            <ScoreLineChart
              versionsData={versionsData}
              versionsLoading={versionsLoading}
              chartData={chartData}
              chartOptions={chartOptions}
            />
          </div>

          {/* 우상단: Target vs Estimation 산점도 */}
          <div className="col-12 col-xl-6">
            <ScatterPlotCard
              scatterData={scatterData}
              scatterLoading={scatterLoading}
              scatterChartData={scatterChartData}
              scatterNoDataMsg={scatterNoDataMsg}
              selectedVersionsMeta={selectedVersionsMeta}
              onRemove={handleRemoveVersion}
              onReset={handleResetScatter}
            />
          </div>

        </div>

        {/* 하단 행: ModelVersionsTable ↔ ModelTrainingCard */}
        <div className="row g-3">

          {/* 좌하단: 버전별 성능 테이블 */}
          <div className="col-12 col-xl-6">
            <ModelVersionsTable
              versionsData={versionsData}
              versionsLoading={versionsLoading}
              expandedModels={expandedModels}
              setExpandedModels={setExpandedModels}
            />
          </div>

          {/* 우하단: 모델 선택 + Training 버튼 */}
          <div className="col-12 col-xl-6">
            <ModelTrainingCard
              models={models}
              loading={loading}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              trainingLoading={trainingLoading}
              error={error}
              trainingResult={trainingResult}
              onTrain={handleTraining}
            />
          </div>

        </div>

      </div>
    </Layout>
  );
}
