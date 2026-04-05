/**
 * machine-learning/components/ModelVersionsTable.js
 *
 * 좌측 하단: 모델 버전별 Test 성능(R² Score) 테이블 카드.
 * 모델 행을 클릭하면 해당 모델의 이전 버전 목록을 펼치거나 접습니다.
 *
 * Props:
 *  - versionsData    {Array}    모델 버전 데이터 배열
 *  - versionsLoading {boolean}  로딩 여부
 *  - expandedModels  {object}   { [model_name]: boolean } 확장 상태 맵
 *  - setExpandedModels {Function} 확장 상태 setter
 */

'use client';

import React from 'react';
import { getScoreClass, getStageBadge } from '../_helpers';

// ── ModelVersionsTable ────────────────────────────────────────
export default function ModelVersionsTable({
  versionsData,
  versionsLoading,
  expandedModels,
  setExpandedModels,
}) {
  // 모델 행 클릭 시 해당 모델의 확장/축소 토글
  const toggleExpand = (modelName) =>
    setExpandedModels((prev) => ({ ...prev, [modelName]: !prev[modelName] }));

  return (
    <div
      className="card shadow-sm flex-grow-1 d-flex flex-column"
      style={{ minHeight: 0, maxHeight: '550px', overflow: 'hidden' }}
    >
      {/* 카드 헤더 */}
      <div className="card-header">
        <div className="card-title-row">
          <span style={{ fontSize: '0.875rem' }}>📊</span>
          <h6>Model Version Performance (R² Score)</h6>
        </div>
      </div>

      {/* 카드 바디 — 스크롤 가능 */}
      <div className="card-body flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
        {versionsLoading ? (
          <div className="spinner-center">
            <div className="spinner-border spinner-border-sm text-secondary" role="status" />
            Loading…
          </div>
        ) : versionsData.length === 0 ? (
          <div className="alert" style={{ background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', color: 'var(--status-warning-text)', fontSize: '0.875rem' }}>
            No trained model versions found. Run Training first.
          </div>
        ) : (
          <VersionsTable
            versionsData={versionsData}
            expandedModels={expandedModels}
            onToggle={toggleExpand}
          />
        )}

        {/* 성능 지표 안내 박스 */}
        <ScoreGuide />
      </div>
    </div>
  );
}

// ── VersionsTable 서브 컴포넌트 ───────────────────────────────
/**
 * 실제 테이블을 렌더합니다.
 * 최신 버전 1행만 보이고, 클릭하면 이전 버전이 펼쳐집니다.
 */
function VersionsTable({ versionsData, expandedModels, onToggle }) {
  return (
    <div className="table-responsive">
      <table className="table table-bordered table-hover table-sm mb-0">
        <thead className="table-light">
          <tr>
            <th style={{ width: '30px' }} />
            <th>Model</th>
            <th style={{ width: '80px'  }}>Version</th>
            <th style={{ width: '100px' }}>Stage</th>
            <th style={{ width: '130px' }}>Test Score (R²)</th>
            <th style={{ width: '130px' }}>Train Score (R²)</th>
            <th>Created</th>
            <th style={{ width: '100px' }}>User</th>
          </tr>
        </thead>
        <tbody>
          {versionsData.map((model, idx) => {
            if (!model.versions?.length) return null;

            const isExpanded     = expandedModels[model.model_name];
            const displayVersions = isExpanded ? model.versions : [model.versions[0]];

            return (
              <ModelRows
                key={idx}
                model={model}
                displayVersions={displayVersions}
                isExpanded={isExpanded}
                onToggle={onToggle}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── ModelRows 서브 컴포넌트 ───────────────────────────────────
/**
 * 하나의 모델에 대한 테이블 행(들)을 렌더합니다.
 * 첫 행만 클릭 가능(확장/축소), 나머지 행은 하위 버전입니다.
 */
function ModelRows({ model, displayVersions, isExpanded, onToggle }) {
  return (
    <React.Fragment>
      {displayVersions.map((version, vIdx) => {
        const isFirstRow = vIdx === 0;
        const testScore  = version.metrics?.test_score;
        const trainScore = version.metrics?.train_cv_score ?? version.metrics?.train_score;

        return (
          <tr
            key={vIdx}
            style={isFirstRow ? { cursor: 'pointer' } : {}}
            onClick={isFirstRow ? () => onToggle(model.model_name) : undefined}
            className={!isFirstRow ? 'table-light' : ''}
          >
            {/* 확장 아이콘 + 버전 수 배지 (첫 행만) */}
            {isFirstRow ? (
              <td className="text-center">
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
                {model.versions.length > 1 && (
                  <span className="badge bg-secondary ms-1" style={{ fontSize: '9px' }}>
                    {model.versions.length}
                  </span>
                )}
              </td>
            ) : (
              <td />
            )}

            {/* 모델명 (첫 행만 표시) */}
            <td className={isFirstRow ? 'fw-semibold' : 'small text-muted'}>
              {isFirstRow && (
                <>
                  {model.model_name}{' '}
                  <small className="text-muted">({model.model_type})</small>
                </>
              )}
            </td>

            <td className="text-center">
              <strong>v{version.version_number}</strong>
            </td>

            <td>
              <span className={getStageBadge(version.stage)}>{version.stage}</span>
            </td>

            <td className={testScore  !== undefined ? getScoreClass(testScore)  : ''}>
              {testScore  !== undefined ? testScore.toFixed(4)  : '-'}
            </td>

            <td className={trainScore !== undefined ? getScoreClass(trainScore) : ''}>
              {trainScore !== undefined ? trainScore.toFixed(4) : '-'}
            </td>

            <td className="small">
              {version.creation_time
                ? new Date(version.creation_time).toLocaleString('ko-KR')
                : '-'}
            </td>

            <td className="small">{version.user_id || '-'}</td>
          </tr>
        );
      })}
    </React.Fragment>
  );
}

function ScoreGuide() {
  return (
    <div className="mt-4 p-3 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--brand)' }}>
      <div className="d-flex align-items-start gap-3">
        <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '2px' }}>ℹ️</span>
        <div>
          <p className="mb-2 fw-semibold" style={{ color: 'var(--text)', fontSize: '0.875rem' }}>Performance Guide</p>
          <p className="mb-2 small" style={{ color: 'var(--text-sec)', fontSize: '0.8rem' }}>
            • Higher Test Score (R²) indicates better prediction accuracy.<br />
            • <span className="badge" style={{ background: '#fef9c3', color: '#854d0e' }}>⭐ Gold star</span>{' '}
            marks the best-performing version across all models.
          </p>
          <p className="mb-0 small" style={{ fontSize: '0.8rem' }}>
            <span className="badge bg-success me-2">Production</span>
            <span style={{ color: 'var(--text-sec)' }}>stage models with the highest R² are automatically applied in MeasSet Generation.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
