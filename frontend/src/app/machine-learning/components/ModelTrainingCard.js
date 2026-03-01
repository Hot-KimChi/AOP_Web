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
      <div className="card-header bg-primary text-white py-2">
        <h6 className="mb-0">머신러닝 모델 선택</h6>
      </div>

      <div className="card-body">
        {/* 모델 선택 드롭다운 */}
        <div className="mb-3">
          <label htmlFor="ml-model" className="form-label">모델 선택</label>
          <select
            id="ml-model"
            className="form-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loading}
          >
            <option value="">모델을 선택하세요</option>
            {models.map((model, idx) => (
              <option key={idx} value={model}>{model}</option>
            ))}
          </select>
        </div>

        {/* Training 버튼 */}
        <div className="d-grid">
          <button
            type="button"
            className="btn btn-success btn-lg"
            onClick={onTrain}
            disabled={!selectedModel || loading || trainingLoading}
          >
            {trainingLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                Training 중...
              </>
            ) : (
              'Training'
            )}
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
      <div className="mt-3 p-3 bg-light rounded text-center border">
        <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
          <span className="visually-hidden">로딩 중...</span>
        </div>
        <span className="text-muted">로딩 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 p-3 bg-danger bg-opacity-10 rounded border border-danger">
        <div className="d-flex align-items-center">
          {/* 경고 아이콘 */}
          <svg
            xmlns="http://www.w3.org/2000/svg" width="20" height="20"
            fill="currentColor"
            className="bi bi-exclamation-triangle-fill text-danger flex-shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
          </svg>
          <span className="ms-2 text-danger small">{error}</span>
        </div>
      </div>
    );
  }

  if (trainingResult) {
    return (
      <div className="mt-3 p-3 bg-success bg-opacity-10 rounded border border-success">
        <div className="d-flex align-items-center">
          {/* 완료 체크 아이콘 */}
          <svg
            xmlns="http://www.w3.org/2000/svg" width="20" height="20"
            fill="currentColor"
            className="bi bi-check-circle-fill text-success flex-shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
          </svg>
          <span className="ms-2 text-success small fw-semibold">{trainingResult}</span>
        </div>
      </div>
    );
  }

  if (selectedModel) {
    return (
      <div className="mt-3 p-3 bg-primary bg-opacity-10 rounded border border-primary">
        <p className="mb-1 small text-primary fw-semibold">✓ 선택된 모델</p>
        <p className="mb-0 small text-dark">{selectedModel}</p>
      </div>
    );
  }

  return null;
}
