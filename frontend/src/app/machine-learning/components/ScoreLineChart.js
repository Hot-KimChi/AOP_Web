/**
 * machine-learning/components/ScoreLineChart.js
 *
 * 좌측 상단: 모델 버전별 Test Score (R²) 추이 라인 차트 카드.
 *
 * Props:
 *  - versionsData    {Array}   버전 성능 데이터 배열
 *  - versionsLoading {boolean} 로딩 여부
 *  - chartData       {object}  Chart.js datasets 객체 (buildLineChartData 결과)
 *  - chartOptions    {object}  Chart.js options 객체 (makeLineChartOptions 결과)
 */

'use client';

import { Line } from 'react-chartjs-2';

// ── ScoreLineChart ────────────────────────────────────────────
export default function ScoreLineChart({ versionsData, versionsLoading, chartData, chartOptions }) {
  return (
    // h-100: 부모 col 의 전체 높이를 채움 (ScatterPlotCard 와 높이 동일)
    // d-flex flex-column: header / body(flex-grow) / footer 수직 분배
    <div className="card shadow-sm h-100 d-flex flex-column">
      {/* 카드 헤더 */}
      <div className="card-header">
        <div className="card-title-row">
          <span style={{ fontSize: '0.875rem' }}>📈</span>
          <h6>Model Test Score (R²) Trend</h6>
        </div>
      </div>

      {/* 차트 영역 — flex-grow-1 로 헤더·푸터를 제외한 나머지 높이를 차지 */}
      <div className="card-body p-2 flex-grow-1" style={{ position: 'relative', minHeight: '300px' }}>
        {versionsLoading ? (
          <LoadingSpinner />
        ) : versionsData.length === 0 ? (
          <EmptyAlert />
        ) : chartData ? (
          // Chart.js 는 flex-grow 컨테이너 안에서 canvas 높이를 100%로 채우려면
          // position:relative 인 wrapper 가 별도로 필요합니다.
          <div style={{ position: 'absolute', inset: 0, padding: '4px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        ) : null}
      </div>

      {/* 카드 푸터 */}
      <div className="card-footer py-2" style={{ minHeight: '52px' }}>
        <p className="mb-0 small text-muted" style={{ fontSize: '0.775rem' }}>
          💡 <strong>Click</strong> a point to show that version alone &nbsp;|&nbsp;
          <strong>Ctrl+Click</strong> to add/remove from scatter plot
        </p>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="spinner-center">
      <span className="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true" />
      Loading…
    </div>
  );
}

function EmptyAlert() {
  return (
    <div className="alert" style={{ background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', color: 'var(--status-warning-text)', fontSize: '0.875rem', margin: '1rem' }}>
      No trained model versions found. Run Training first.
    </div>
  );
}
