/**
 * machine-learning/components/ScatterPlotCard.js
 *
 * 우측 상단: Target vs Estimation 산점도 카드.
 *
 * Props:
 *  - scatterData          {Array}    현재 표시 중인 scatter 데이터 배열
 *  - scatterLoading       {boolean}  로딩 여부
 *  - scatterChartData     {object}   Chart.js datasets 객체 (buildScatterChartData 결과)
 *  - scatterNoDataMsg     {string}   DB에 데이터 없을 때 표시할 안내 메시지
 *  - selectedVersionsMeta {Array}    선택된 버전 메타 [{version_id, model_name, version_number}]
 *  - onRemove             {Function} 특정 버전 제거 콜백 (version_id)
 *  - onReset              {Function} best model 로 초기화 콜백
 */

'use client';

import { Scatter } from 'react-chartjs-2';
import { SCATTER_CHART_OPTIONS } from '../_constants';

// ── ScatterPlotCard ───────────────────────────────────────────
export default function ScatterPlotCard({
  scatterData,
  scatterLoading,
  scatterChartData,
  scatterNoDataMsg,
  selectedVersionsMeta,
  onRemove,
  onReset,
}) {
  return (
    // h-100: 부모 col 의 전체 높이를 채움 (ScoreLineChart 와 높이 동일)
    // d-flex flex-column: header / body(flex-grow) / footer 수직 분배
    <div className="card shadow-sm h-100 d-flex flex-column">
      {/* 카드 헤더 — 선택된 버전 배지 + 초기화 버튼 */}
      <div
        className="card-header bg-warning text-dark d-flex justify-content-between align-items-center py-2"
        style={{ flexWrap: 'wrap', gap: '4px' }}
      >
        <h6 className="mb-0">
          Target vs Estimation 산점도
          <small className="ms-2 fw-normal">(Test Set)</small>
        </h6>

        {/* 선택된 버전 배지 목록 */}
        <div className="d-flex align-items-center gap-1 flex-wrap justify-content-end">
          {/* 로딩 중이고 아직 선택된 버전이 없을 때 표시 */}
          {selectedVersionsMeta.length === 0 && scatterLoading && (
            <span className="badge bg-secondary" style={{ fontSize: '10px' }}>로딩 중...</span>
          )}

          {/* 선택된 버전 배지 (× 버튼으로 개별 제거) */}
          {selectedVersionsMeta.map((meta) => (
            <span
              key={meta.version_id}
              className="badge bg-dark d-inline-flex align-items-center"
              style={{ fontSize: '11px', gap: '4px' }}
            >
              {meta.model_name.replace('_AOP_Intensity', '')} v{meta.version_number}
              <button
                type="button"
                className="btn-close btn-close-white"
                style={{ fontSize: '7px', marginLeft: '3px' }}
                onClick={() => onRemove(meta.version_id)}
                title="이 모델 제거"
              />
            </span>
          ))}

          {/* best model 초기화 버튼 */}
          {selectedVersionsMeta.length > 0 && (
            <button
              className="btn btn-sm btn-outline-dark py-0 px-2"
              onClick={() => onReset()}
              title="최고 score 모델로 초기화"
              style={{ fontSize: '11px' }}
            >
              ↺ 초기화
            </button>
          )}
        </div>
      </div>

      {/* 산점도 차트 영역 — flex-grow-1 로 헤더·푸터를 제외한 나머지 높이를 차지 */}
      <div className="card-body p-2 flex-grow-1" style={{ position: 'relative', minHeight: '300px' }}>
        {scatterLoading ? (
          <div className="text-center py-5">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            산점도 데이터 로딩 중...
          </div>
        ) : scatterData.length === 0 ? (
          // scatterNoDataMsg 가 있으면 특정 버전 데이터 없음, 없으면 초기 빈 상태
          <div className={`alert mb-0 ${scatterNoDataMsg ? 'alert-danger' : 'alert-warning'}`}>
            {scatterNoDataMsg
              ? <><strong>데이터 없음</strong><br />{scatterNoDataMsg}</>
              : '예측 포인트 데이터가 없습니다. Training을 먼저 실행해주세요.'}
          </div>
        ) : scatterChartData ? (
          // Chart.js 는 flex-grow 컨테이너 안에서 canvas 높이를 100%로 채우려면
          // position:relative 인 wrapper 가 별도로 필요합니다.
          <div style={{ position: 'absolute', inset: 0, padding: '4px' }}>
            <Scatter data={scatterChartData} options={SCATTER_CHART_OPTIONS} />
          </div>
        ) : null}
      </div>

      {/* 현재 표시 상태 안내 푸터 */}
      <div className="card-footer bg-light py-1" style={{ minHeight: '56px', overflowY: 'auto' }}>
        {scatterData.length > 0 ? (
          <ScatterFooterInfo
            scatterData={scatterData}
            selectedVersionsMeta={selectedVersionsMeta}
          />
        ) : (
          <p className="mb-0 small text-muted">&nbsp;</p>
        )}
      </div>
    </div>
  );
}

// ── 푸터 안내 서브 컴포넌트 ───────────────────────────────────
/**
 * 단일 모델 / 멀티 모델 여부에 따라 다른 안내 문구를 렌더합니다.
 */
function ScatterFooterInfo({ scatterData, selectedVersionsMeta }) {
  const isSingle = selectedVersionsMeta.length === 1;

  return (
    <div className="d-flex align-items-start">
      {/* 정보 아이콘 */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18" height="18"
        fill="currentColor"
        className="bi bi-info-circle-fill text-warning flex-shrink-0 mt-1"
        viewBox="0 0 16 16"
      >
        <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/>
      </svg>

      <div className="flex-grow-1 ms-2">
        {isSingle ? (
          // 단일 모델 안내
          <p className="mb-0 small text-muted">
            <strong>
              {selectedVersionsMeta[0].model_name.replace('_AOP_Intensity', '')}
              {' '}v{selectedVersionsMeta[0].version_number}
            </strong>
            {' — '}{scatterData[0]?.points?.length ?? 0}개 포인트.{' '}
            왼쪽 그래프를 <strong>Ctrl+클릭</strong>하면 모델을 추가해 비교할 수 있습니다.{' '}
            <strong>점선 대각선</strong>은 이상적인 예측(y=x)입니다.
          </p>
        ) : (
          // 멀티 모델 비교 안내
          <p className="mb-0 small text-muted">
            <strong>{selectedVersionsMeta.length}개 모델 비교 중</strong>{' — '}
            {selectedVersionsMeta.map((m) => (
              <span key={m.version_id} className="badge bg-secondary me-1" style={{ fontSize: '10px' }}>
                {m.model_name.replace('_AOP_Intensity', '')} v{m.version_number}
              </span>
            ))}
            {' '}왼쪽 그래프를 <strong>Ctrl+클릭</strong>으로 추가/제거,
            헤더의 × 로 개별 제거할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
