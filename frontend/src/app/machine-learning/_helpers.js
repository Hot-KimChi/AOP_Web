/**
 * machine-learning/_helpers.js
 *
 * React 컴포넌트·훅에 의존하지 않는 순수 함수 모음입니다.
 *  - findBestVersion      : versionsData 에서 test_score 최고 버전 탐색
 *  - buildLineChartData   : 추이 라인 차트용 데이터셋 생성
 *  - buildScatterChartData: 산점도용 데이터셋 생성 (y=x 기준선 포함)
 *  - getScoreClass        : test_score 값 → Bootstrap 텍스트 색상 클래스
 *  - getStageBadge        : MLflow stage → Bootstrap 배지 클래스
 */

import { MODEL_COLORS } from './_constants';

// ── findBestVersion ───────────────────────────────────────────
/**
 * versionsData 배열을 순회하여 test_score 가 가장 높은 버전 정보를 반환합니다.
 * 컴포넌트 외부에서도 호출하기 위해 모듈 레벨로 export 합니다.
 *
 * @param {Array}  versionsData - API 응답의 모델 버전 배열
 * @returns {{ version_id, model_name, version_number, score } | null}
 */
export function findBestVersion(versionsData) {
  let bestScore = -Infinity;
  let best = null;

  versionsData.forEach((model) => {
    model.versions.forEach((v) => {
      const score = v.metrics?.test_score;
      if (score !== undefined && score > bestScore) {
        bestScore = score;
        best = {
          version_id: v.version_id,
          model_name: model.model_name,
          version_number: v.version_number,
          score,
        };
      }
    });
  });

  return best;
}

// ── buildLineChartData ────────────────────────────────────────
/**
 * versionsData 로부터 Chart.js 라인 차트용 데이터 객체를 생성합니다.
 *
 * - 전체 최고 score 포인트에 골드 별(star) 스타일을 자동 적용합니다.
 * - dataset 에 _modelName 프로퍼티를 부여해 클릭 시 모델 식별에 사용합니다.
 *
 * @param {Array} versionsData
 * @returns {{ datasets: Array } | null}
 */
export function buildLineChartData(versionsData) {
  if (!versionsData || versionsData.length === 0) return null;

  // 전체 데이터에서 best 포인트 미리 탐색 (골드 별 표시용)
  const best = findBestVersion(versionsData);

  const datasets = versionsData
    .map((model, idx) => {
      const color = MODEL_COLORS[idx % MODEL_COLORS.length];

      // x: 버전 번호, y: test_score — 버전 번호 오름차순 정렬
      const data = model.versions
        .filter((v) => v.metrics?.test_score !== undefined)
        .map((v) => ({ x: v.version_number, y: v.metrics.test_score }))
        .sort((a, b) => a.x - b.x);

      // 해당 모델이 best 모델인지 여부
      const isBestModel = best && model.model_name === best.model_name;

      // 포인트별 스타일 배열 (best 포인트만 star, 나머지 circle)
      const pointStyles         = data.map((pt) => isBestModel && pt.x === best.version_number ? 'star'                    : 'circle');
      const pointRadii          = data.map((pt) => isBestModel && pt.x === best.version_number ? 12                        : 5);
      const pointBgColors       = data.map((pt) => isBestModel && pt.x === best.version_number ? 'rgba(255, 215,  0, 1)'   : color.replace('rgb', 'rgba').replace(')', ', 0.8)'));
      const pointBorderColors   = data.map((pt) => isBestModel && pt.x === best.version_number ? 'rgba(218, 165, 32, 1)'   : color);
      const pointBorderWidths   = data.map((pt) => isBestModel && pt.x === best.version_number ? 3                         : 2);

      return {
        label:               model.model_name.replace('_AOP_Intensity', ''),
        _modelName:          model.model_name,  // ← handleChartClick 에서 인덱스 불일치 없이 모델 식별
        data,
        borderColor:         color,
        backgroundColor:     color.replace('rgb', 'rgba').replace(')', ', 0.5)'),
        borderWidth:         2,
        pointRadius:         pointRadii,
        pointStyle:          pointStyles,
        pointBackgroundColor: pointBgColors,
        pointBorderColor:    pointBorderColors,
        pointBorderWidth:    pointBorderWidths,
        pointHoverRadius:    14,
        pointHoverBorderWidth: 4,
        tension:             0.1,
      };
    })
    .filter((ds) => ds.data.length > 0); // 메트릭이 없는 모델 제외

  return { datasets };
}

// ── buildScatterChartData ─────────────────────────────────────
/**
 * scatterData 로부터 Chart.js 산점도용 데이터 객체를 생성합니다.
 *
 * - 여러 모델이 있으면 색상을 달리해 동시에 표시합니다.
 * - 첫 번째 데이터셋으로 y=x 이상적 예측 기준선을 삽입합니다.
 *
 * @param {Array}   scatterData - [{model_name, version_number, stage, points:[{target_value, estimation_value}]}]
 * @param {boolean} isDark      - 다크모드 여부 (기준선 색상 결정)
 * @returns {{ datasets: Array } | null}
 */
export function buildScatterChartData(scatterData, isDark = false) {
  if (!scatterData || scatterData.length === 0) return null;

  // 전체 포인트 범위 계산 (y=x 기준선 범위 결정용)
  let globalMin = Infinity;
  let globalMax = -Infinity;
  scatterData.forEach((model) => {
    model.points.forEach((p) => {
      const lo = Math.min(p.target_value, p.estimation_value);
      const hi = Math.max(p.target_value, p.estimation_value);
      if (lo < globalMin) globalMin = lo;
      if (hi > globalMax) globalMax = hi;
    });
  });
  // 여백 5% 추가
  const margin = (globalMax - globalMin) * 0.05;
  globalMin -= margin;
  globalMax += margin;

  // 모델별 scatter dataset
  const datasets = scatterData.map((model, idx) => {
    const color     = MODEL_COLORS[idx % MODEL_COLORS.length];
    const stageMark = model.stage === 'Production' ? ' ⭐' : '';

    return {
      label:           `${model.model_name.replace('_AOP_Intensity', '')} v${model.version_number}${stageMark}`,
      data:            model.points.map((p) => ({ x: p.target_value, y: p.estimation_value })),
      backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.6)'),
      borderColor:     color,
      borderWidth:     1,
      pointRadius:     4,
      pointHoverRadius: 7,
      showLine:        false,
    };
  });

  // y=x 이상적 기준선을 배열 맨 앞에 삽입
  datasets.unshift({
    label:           'Ideal (y = x)',
    data:            [{ x: globalMin, y: globalMin }, { x: globalMax, y: globalMax }],
    borderColor:     isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.3)',
    backgroundColor: 'transparent',
    borderWidth:     2,
    borderDash:      [6, 4],
    pointRadius:     0,
    pointHoverRadius: 0,
    showLine:        true,
    fill:            false,
  });

  return { datasets };
}

// ── UI 클래스 헬퍼 ────────────────────────────────────────────
/**
 * test_score 수치에 따라 Bootstrap 텍스트 색상 클래스를 반환합니다.
 * @param {number} score - R² 값 (0 ~ 1)
 * @returns {string} Bootstrap class string
 */
export function getScoreClass(score) {
  if (score >= 0.9) return 'text-success fw-bold';
  if (score >= 0.8) return 'text-primary fw-bold';
  if (score >= 0.7) return 'text-warning';
  return 'text-danger';
}

/**
 * MLflow 모델 stage 값에 따라 Bootstrap 배지 클래스를 반환합니다.
 * @param {string} stage - 'Production' | 'Staging' | 그 외
 * @returns {string} Bootstrap class string
 */
export function getStageBadge(stage) {
  if (stage === 'Production') return 'badge bg-success';
  if (stage === 'Staging')    return 'badge bg-warning text-dark';
  return 'badge bg-secondary';
}
