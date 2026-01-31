"use client";
import React, { useEffect, useState } from "react";
import Layout from '../../components/Layout';

export default function MachineLearningPage() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingResult, setTrainingResult] = useState("");
  
  // 새로운 state: 모델 버전 성능 데이터
  const [versionsData, setVersionsData] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    async function fetchModels() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE_URL}/api/get_ml_models`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.status === "success") {
          setModels(data.models);
        } else {
          setError("모델 정보를 불러오지 못했습니다.");
        }
      } catch (e) {
        setError("서버 연결 오류");
      } finally {
        setLoading(false);
      }
    }
    
    async function fetchVersionsPerformance() {
      setVersionsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/model_versions_performance?prediction_type=intensity`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.status === "success") {
          setVersionsData(data.data || []);
        }
      } catch (e) {
        console.error("Failed to fetch versions performance:", e);
      } finally {
        setVersionsLoading(false);
      }
    }
    
    fetchModels();
    fetchVersionsPerformance();
  }, [API_BASE_URL]);

  const handleTraining = async () => {
    if (!selectedModel) {
      setError("모델을 먼저 선택해주세요.");
      return;
    }

    setTrainingLoading(true);
    setTrainingResult("");
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/train_model`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (data.status === "success") {
        setTrainingResult(`모델 "${selectedModel}" 훈련이 완료되었습니다.`);
        
        // 훈련 후 버전 데이터 다시 로드
        await fetchVersionsPerformance();
      } else {
        setError(data.message || "모델 훈련에 실패했습니다.");
      }
    } catch (e) {
      setError("서버 연결 오류");
    } finally {
      setTrainingLoading(false);
    }
  };
  
  const fetchVersionsPerformance = async () => {
    setVersionsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/model_versions_performance?prediction_type=intensity`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.status === "success") {
        setVersionsData(data.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch versions performance:", e);
    } finally {
      setVersionsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mt-4">
        <div className="card shadow-sm">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0">머신러닝 모델 선택</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-12">
                <label htmlFor="ml-model" className="form-label">모델 선택</label>
                <select
                  id="ml-model"
                  className="form-select"
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  disabled={loading}
                >
                  <option value="">모델을 선택하세요</option>
                  {models.map((model, idx) => (
                    <option key={idx} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Training 버튼 */}
            <div className="mt-3">
              <button
                type="button"
                className="btn btn-success"
                onClick={handleTraining}
                disabled={!selectedModel || loading || trainingLoading}
              >
                {trainingLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Training 중...
                  </>
                ) : (
                  "Training"
                )}
              </button>
            </div>

            {loading && (
              <div className="mt-3">로딩 중...</div>
            )}
            {error && (
              <div className="alert alert-danger mt-3">{error}</div>
            )}
            {trainingResult && (
              <div className="alert alert-success mt-3">{trainingResult}</div>
            )}
            {selectedModel && !loading && !error && (
              <div className="alert alert-info mt-3">
                <b>선택된 모델:</b> {selectedModel}
              </div>
            )}
          </div>
        </div>

        {/* 모델 버전별 성능 테이블 */}
        <div className="card shadow-sm mt-4">
          <div className="card-header bg-info text-white">
            <h5 className="mb-0">모델 버전별 Test 성능 (R² Score)</h5>
          </div>
          <div className="card-body">
            {versionsLoading ? (
              <div className="text-center py-4">
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                로딩 중...
              </div>
            ) : versionsData.length === 0 ? (
              <div className="alert alert-warning">
                훈련된 모델 버전이 없습니다. Training을 먼저 실행해주세요.
              </div>
            ) : (
              <div className="table-responsive">
                {versionsData.map((model, idx) => (
                  <div key={idx} className="mb-4">
                    <h6 className="text-primary mb-3">
                      <strong>{model.model_name}</strong> 
                      <small className="text-muted ms-2">({model.model_type})</small>
                    </h6>
                    
                    {model.versions && model.versions.length > 0 ? (
                      <table className="table table-bordered table-hover table-sm">
                        <thead className="table-light">
                          <tr>
                            <th style={{width: '80px'}}>Version</th>
                            <th style={{width: '100px'}}>Stage</th>
                            <th style={{width: '130px'}}>Test Score (R²)</th>
                            <th style={{width: '130px'}}>Train Score</th>
                            <th style={{width: '100px'}}>MAE</th>
                            <th style={{width: '100px'}}>RMSE</th>
                            <th>Created</th>
                            <th style={{width: '100px'}}>User</th>
                          </tr>
                        </thead>
                        <tbody>
                          {model.versions.map((version, vIdx) => {
                            const testScore = version.metrics?.test_score;
                            const trainScore = version.metrics?.train_score;
                            const mae = version.metrics?.mae;
                            const rmse = version.metrics?.rmse;
                            
                            // R² 값에 따른 색상 (높을수록 녹색)
                            const getScoreClass = (score) => {
                              if (score >= 0.9) return 'text-success fw-bold';
                              if (score >= 0.8) return 'text-primary fw-bold';
                              if (score >= 0.7) return 'text-warning';
                              return 'text-danger';
                            };
                            
                            // Production 스테이지는 배지로 강조
                            const getStageBadge = (stage) => {
                              if (stage === 'Production') return 'badge bg-success';
                              if (stage === 'Staging') return 'badge bg-warning text-dark';
                              return 'badge bg-secondary';
                            };
                            
                            return (
                              <tr key={vIdx}>
                                <td className="text-center">
                                  <strong>v{version.version_number}</strong>
                                </td>
                                <td>
                                  <span className={getStageBadge(version.stage)}>
                                    {version.stage}
                                  </span>
                                </td>
                                <td className={testScore !== undefined ? getScoreClass(testScore) : ''}>
                                  {testScore !== undefined ? testScore.toFixed(4) : '-'}
                                </td>
                                <td className={trainScore !== undefined ? getScoreClass(trainScore) : ''}>
                                  {trainScore !== undefined ? trainScore.toFixed(4) : '-'}
                                </td>
                                <td>
                                  {mae !== undefined ? mae.toFixed(4) : '-'}
                                </td>
                                <td>
                                  {rmse !== undefined ? rmse.toFixed(4) : '-'}
                                </td>
                                <td className="small">
                                  {version.creation_time 
                                    ? new Date(version.creation_time).toLocaleString('ko-KR')
                                    : '-'}
                                </td>
                                <td className="small">
                                  {version.user_id || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-muted small mb-3">버전 정보가 없습니다.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-3">
              <small className="text-muted">
                <strong>참고:</strong> Test Score (R²)가 높을수록 예측 성능이 우수합니다. 
                MeasSet Generation에서는 자동으로 <span className="badge bg-success">Production</span> 단계의 
                R² 값이 가장 높은 모델을 사용합니다.
              </small>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
