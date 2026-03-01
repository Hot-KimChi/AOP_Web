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
      <div className="card-header bg-success text-white py-2">
        <h6 className="mb-0">모델 Test Score (R²) 추이 그래프</h6>
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

      {/* 사용 안내 푸터 — ScatterPlotCard 와 높이 통일 */}
      <div className="card-footer bg-light py-1" style={{ minHeight: '56px' }}>
        <p className="mb-0 small text-muted">
          💡 포인트 <strong>클릭</strong> → 해당 버전 단일 표시&nbsp;&nbsp;|&nbsp;&nbsp;
          <strong>Ctrl+클릭</strong> → 산점도에 추가/제거 (멀티 비교)
        </p>
      </div>
    </div>
  );
}

// ── 내부 서브 컴포넌트 ─────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="text-center py-5">
      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
      로딩 중...
    </div>
  );
}

function EmptyAlert() {
  return (
    <div className="alert alert-warning mb-0">
      훈련된 모델 버전이 없습니다. Training을 먼저 실행해주세요.
    </div>
  );
}
