/**
 * machine-learning/_constants.js
 *
 * 머신러닝 페이지에서 공유하는 상수 및 차트 옵션을 정의합니다.
 *  - MODEL_COLORS       : 모델별 포인트/선 색상 팔레트
 *  - makeLineChartOptions: 추이 라인 차트 옵션 팩토리 (onClick 동적 주입)
 *  - SCATTER_CHART_OPTIONS: 산점도 정적 옵션
 */

// ── 모델별 색상 팔레트 ──────────────────────────────────────────
// 인덱스를 순환(%)하여 모델 수에 관계없이 색상을 자동 배정합니다.
export const MODEL_COLORS = [
  'rgb(255, 99,  132)', // 빨강
  'rgb(54,  162, 235)', // 파랑
  'rgb(255, 206,  86)', // 노랑
  'rgb(75,  192, 192)', // 청록
  'rgb(153, 102, 255)', // 보라
  'rgb(255, 159,  64)', // 주황
  'rgb(199, 199, 199)', // 회색
  'rgb(83,  102, 255)', // 인디고
  'rgb(255,  99, 255)', // 마젠타
  'rgb(99,  255, 132)', // 연두
];

// ── 추이 라인 차트 옵션 팩토리 ────────────────────────────────────
/**
 * 버전별 Test Score 추이 라인 차트의 Chart.js 옵션 객체를 반환합니다.
 * onClick / onHover 는 컴포넌트 렌더 시점에서 주입해야 하므로
 * 팩토리 함수 형태로 제공합니다.
 *
 * @param {Function} onClickHandler - 포인트 클릭 시 호출될 이벤트 핸들러
 * @returns {object} Chart.js options 객체
 */
export function makeLineChartOptions(onClickHandler) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    onClick: onClickHandler,
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      title: {
        display: true,
        text: '모델 버전별 Test Score (R²) 추이',
        font: { size: 16, weight: 'bold' },
      },
      tooltip: {
        callbacks: {
          // 툴팁: 모델명·버전·R² 값만 표시 (클릭 안내는 카드 푸터에서 제공)
          label: (ctx) =>
            `${ctx.dataset.label} v${ctx.parsed.x}: R² = ${ctx.parsed.y.toFixed(4)}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: 'Version Number' },
        ticks: { stepSize: 1 },
      },
      y: {
        title: { display: true, text: 'Test Score (R²)' },
        min: 0.85,
        max: 1.0,
        ticks: { callback: (v) => v.toFixed(2) },
      },
    },
    interaction: { mode: 'nearest', intersect: true },
    // 포인트 위에 마우스를 올리면 커서를 pointer로 변경
    onHover: (event, elements) => {
      event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
    },
  };
}

// ── 산점도 옵션 ───────────────────────────────────────────────
/**
 * Target vs Estimation 산점도의 Chart.js 옵션 객체입니다.
 * 런타임에 변경되는 값이 없으므로 정적 상수로 정의합니다.
 */
export const SCATTER_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: { usePointStyle: true, font: { size: 11 } },
    },
    title: {
      display: true,
      text: 'Target vs Estimation (Test Set)',
      font: { size: 16, weight: 'bold' },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          // y=x 기준선은 툴팁 표시 생략
          if (ctx.dataset.label === 'Ideal (y = x)') return null;
          return (
            `${ctx.dataset.label}: `
            + `Target=${ctx.parsed.x.toFixed(2)}, `
            + `Est=${ctx.parsed.y.toFixed(2)}`
          );
        },
      },
    },
  },
  scales: {
    x: {
      type: 'linear',
      title: {
        display: true,
        text: 'Target Value (실제 값)',
        font: { size: 13, weight: 'bold' },
      },
    },
    y: {
      type: 'linear',
      title: {
        display: true,
        text: 'Estimation Value (예측 값)',
        font: { size: 13, weight: 'bold' },
      },
    },
  },
};
