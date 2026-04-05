/**
 * machine-learning/components/ModelTrainingCard.js
 *
 * 우측 하단: 모델 선택 드롭다운 + Training 버튼 카드.
 *
 * Props:
 *  - models          {Array}    선택 가능한 모델명 목록
 *  - loading         {boolean}  모델 목록 로딩 여부
 *  - selectedModel   {string}   현재 선택된 모델명
 *  - setSelectedModel {Function} 모델 선택 setter
 *  - trainingLoading {boolean}  훈련 진행 중 여부
 *  - error           {string}   에러 메시지 (빈 문자열이면 미표시)
 *  - trainingResult  {string}   훈련 완료 메시지 (빈 문자열이면 미표시)
 *  - onTrain         {Function} Training 버튼 클릭 핸들러
 */

'use client';

// ── ModelTrainingCard ─────────────────────────────────────────
export default function ModelTrainingCard({
  models,
  loading,
  selectedModel,
  setSelectedModel,
  trainingLoading,
  error,
  trainingResult,
  onTrain,
}) {
  return (
    <div
      className="card shadow-sm flex-grow-1"
      style={{ minHeight: 0, maxHeight: '550px', overflow: 'hidden' }}
    >
      {/* 카드 헤더 */}
      <div className="card-header">
        <div className="card-title-row">
          <span style={{ fontSize: '0.875rem' }}>🤖</span>
          <h6>Model Training</h6>
        </div>
      </div>

      <div className="card-body">
        {/* 모델 선택 드롭다운 */}
        <div className="mb-3">
          <label htmlFor="ml-model" className="form-label">Select Model</label>
          <select
            id="ml-model"
            className="form-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loading}
          >
            <option value="">Choose a model…</option>
            {models.map((model, idx) => (
              <option key={idx} value={model}>{model}</option>
            ))}
          </select>
        </div>

        {/* Training 버튼 */}
        <div className="d-grid">
          <button
            type="button"
            className="btn btn-lg"
            onClick={onTrain}
            disabled={!selectedModel || loading || trainingLoading}
            style={{
              background: !selectedModel || loading || trainingLoading ? 'var(--brand-light)' : 'var(--brand)',
              color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600',
              transition: 'background 0.15s',
            }}
          >
            {trainingLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                Training…
              </>
            ) : 'Start Training'}
          </button>
        </div>

        {/* 상태 메시지 — 로딩 / 에러 / 완료 / 선택 확인 순서로 표시 */}
        <StatusMessages
          loading={loading}
          error={error}
          trainingResult={trainingResult}
          selectedModel={selectedModel}
        />
      </div>
    </div>
  );
}

// ── 상태 메시지 서브 컴포넌트 ─────────────────────────────────
/**
 * 현재 상태에 따라 적절한 메시지 박스를 렌더합니다.
 * 우선순위: 로딩 > 에러 > 훈련 완료 > 선택 확인
 */
function StatusMessages({ loading, error, trainingResult, selectedModel }) {
  if (loading) {
    return (
      <div className="mt-3 p-3 rounded text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="spinner-border spinner-border-sm text-secondary me-2" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 p-3 rounded" style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)' }}>
        <div className="d-flex align-items-center gap-2">
          <span style={{ color: 'var(--status-error-text)', fontSize: '1rem' }}>⚠️</span>
          <span style={{ color: 'var(--status-error-text)', fontSize: '0.8125rem' }}>{error}</span>
        </div>
      </div>
    );
  }

  if (trainingResult) {
    return (
      <div className="mt-3 p-3 rounded" style={{ background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)' }}>
        <div className="d-flex align-items-center gap-2">
          <span style={{ fontSize: '1rem' }}>✅</span>
          <span style={{ color: 'var(--status-success-text)', fontSize: '0.8125rem', fontWeight: '600' }}>{trainingResult}</span>
        </div>
      </div>
    );
  }

  if (selectedModel) {
    return (
      <div className="mt-3 p-3 rounded" style={{ background: 'var(--brand-light)', border: '1px solid var(--border-focus)' }}>
        <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: '600', color: 'var(--brand)' }}>✓ Selected model</p>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text)' }}>{selectedModel}</p>
      </div>
    );
  }

  return null;
}
