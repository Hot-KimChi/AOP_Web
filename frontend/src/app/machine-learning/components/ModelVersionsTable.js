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
      <div className="card-header bg-info text-white py-2">
        <h6 className="mb-0">모델 버전별 Test 성능 (R² Score)</h6>
      </div>

      {/* 카드 바디 — 스크롤 가능 */}
      <div className="card-body flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
        {versionsLoading ? (
          <div className="text-center py-4">
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            로딩 중...
          </div>
        ) : versionsData.length === 0 ? (
          <div className="alert alert-warning mb-0">
            훈련된 모델 버전이 없습니다. Training을 먼저 실행해주세요.
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
                <span style={{ fontSize: '10px', color: '#6c757d' }}>
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

// ── ScoreGuide 서브 컴포넌트 ─────────────────────────────────
/** 테이블 하단 성능 지표 안내 박스 */
function ScoreGuide() {
  return (
    <div className="mt-4 p-3 bg-light rounded border-start border-4 border-info">
      <div className="d-flex align-items-start">
        {/* 정보 아이콘 */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20" height="20"
          fill="currentColor"
          className="bi bi-info-circle-fill text-info flex-shrink-0 mt-1"
          viewBox="0 0 16 16"
        >
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/>
        </svg>

        <div className="flex-grow-1 ms-3">
          <p className="mb-2 fw-semibold text-dark">💡 성능 지표 안내</p>
          <p className="mb-2 small text-secondary">
            • Test Score (R²)가{' '}
            <strong className="text-primary">높을수록</strong> 예측 성능이 우수합니다.<br />
            • <span className="badge bg-warning text-dark">⭐ 골드 별</span>{' '}
            표시는 전체 모델 중 최고 성능을 나타냅니다.
          </p>
          <p className="mb-0 small">
            <span className="badge bg-success me-2">Production</span>
            <span className="text-muted">
              단계의 R² 최고값 모델이 MeasSet Generation에 자동 적용됩니다.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
