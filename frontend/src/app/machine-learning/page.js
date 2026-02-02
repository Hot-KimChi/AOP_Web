"use client";
import React, { useEffect, useState, useMemo } from "react";
import Layout from '../../components/Layout';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

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

  // 차트 데이터 준비
  const chartData = useMemo(() => {
    if (versionsData.length === 0) return null;

    // 모델별 색상 정의
    const modelColors = [
      'rgb(255, 99, 132)',   // 빨강
      'rgb(54, 162, 235)',   // 파랑
      'rgb(255, 206, 86)',   // 노랑
      'rgb(75, 192, 192)',   // 청록
      'rgb(153, 102, 255)',  // 보라
      'rgb(255, 159, 64)',   // 주황
      'rgb(199, 199, 199)',  // 회색
      'rgb(83, 102, 255)',   // 인디고
      'rgb(255, 99, 255)',   // 마젠타
      'rgb(99, 255, 132)',   // 연두
    ];

    // 전체 데이터 중 최대 test_score 찾기
    let maxScore = -Infinity;
    let maxPoint = null;
    
    versionsData.forEach(model => {
      model.versions.forEach(v => {
        if (v.metrics?.test_score !== undefined && v.metrics.test_score > maxScore) {
          maxScore = v.metrics.test_score;
          maxPoint = {
            model_name: model.model_name,
            version_number: v.version_number,
            score: v.metrics.test_score
          };
        }
      });
    });

    // 데이터셋 준비
    const datasets = versionsData.map((model, idx) => {
      const color = modelColors[idx % modelColors.length];
      
      // 버전별 데이터 포인트 (x: 버전 번호, y: test_score)
      const data = model.versions
        .filter(v => v.metrics?.test_score !== undefined)
        .map(v => ({
          x: v.version_number,
          y: v.metrics.test_score
        }))
        .sort((a, b) => a.x - b.x);

      // 포인트 스타일 배열 생성 (최대값은 별 모양)
      const pointStyles = data.map(point => {
        if (maxPoint && 
            model.model_name === maxPoint.model_name && 
            point.x === maxPoint.version_number) {
          return 'star';
        }
        return 'circle';
      });

      // 포인트 반경 배열 생성 (최대값은 더 크게)
      const pointRadii = data.map(point => {
        if (maxPoint && 
            model.model_name === maxPoint.model_name && 
            point.x === maxPoint.version_number) {
          return 12;
        }
        return 5;
      });

      // 포인트 배경색 배열 생성 (최대값은 골드색)
      const pointBackgroundColors = data.map(point => {
        if (maxPoint && 
            model.model_name === maxPoint.model_name && 
            point.x === maxPoint.version_number) {
          return 'rgba(255, 215, 0, 1)'; // 골드
        }
        return color.replace('rgb', 'rgba').replace(')', ', 0.8)');
      });

      // 포인트 테두리 색 배열 생성 (최대값은 진한 골드)
      const pointBorderColors = data.map(point => {
        if (maxPoint && 
            model.model_name === maxPoint.model_name && 
            point.x === maxPoint.version_number) {
          return 'rgba(218, 165, 32, 1)'; // 진한 골드
        }
        return color;
      });

      // 포인트 테두리 두께 배열 생성 (최대값은 더 두껍게)
      const pointBorderWidths = data.map(point => {
        if (maxPoint && 
            model.model_name === maxPoint.model_name && 
            point.x === maxPoint.version_number) {
          return 3;
        }
        return 2;
      });

      return {
        label: model.model_name.replace('_AOP_Intensity', ''),
        data: data,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.5)'),
        borderWidth: 2,
        pointRadius: pointRadii,
        pointStyle: pointStyles,
        pointBackgroundColor: pointBackgroundColors,
        pointBorderColor: pointBorderColors,
        pointBorderWidth: pointBorderWidths,
        pointHoverRadius: 14,
        pointHoverBorderWidth: 4,
        tension: 0.1
      };
    }).filter(ds => ds.data.length > 0);

    return { datasets };
  }, [versionsData]);

  // 차트 옵션
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      title: {
        display: true,
        text: '모델 버전별 Test Score (R²) 추이',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `${context.dataset.label} v${context.parsed.x}: R² = ${context.parsed.y.toFixed(4)}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: 'Version Number'
        },
        ticks: {
          stepSize: 1
        }
      },
      y: {
        title: {
          display: true,
          text: 'Test Score (R²)'
        },
        min: 0.85,
        max: 1.0,
        ticks: {
          callback: function(value) {
            return value.toFixed(2);
          }
        }
      }
    }
  };

  return (
    <Layout>
      <div className="container-fluid mt-4">
        <div className="row align-items-start">
          {/* 왼쪽: 모델 버전별 성능 그래프 및 테이블 */}
          <div className="col-lg-8 mb-4">
            {/* 차트 카드 */}
            <div className="card shadow-sm mb-4">
              <div className="card-header bg-success text-white">
                <h5 className="mb-0">모델 Test Score (R²) 추이 그래프</h5>
              </div>
              <div className="card-body" style={{height: '400px'}}>
                {versionsLoading ? (
                  <div className="text-center py-5">
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    로딩 중...
                  </div>
                ) : versionsData.length === 0 ? (
                  <div className="alert alert-warning">
                    훈련된 모델 버전이 없습니다. Training을 먼저 실행해주세요.
                  </div>
                ) : chartData ? (
                  <Line data={chartData} options={chartOptions} />
                ) : null}
              </div>
            </div>

            {/* 테이블 카드 */}
            <div className="card shadow-sm">
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
                            <th style={{width: '130px'}}>Train Score (R²)</th>
                            <th>Created</th>
                            <th style={{width: '100px'}}>User</th>
                          </tr>
                        </thead>
                        <tbody>
                          {model.versions.map((version, vIdx) => {
                            const testScore = version.metrics?.test_score;
                            // train_score 대신 train_cv_score 사용 (데이터베이스에 저장된 이름)
                            const trainScore = version.metrics?.train_cv_score || version.metrics?.train_score;
                            
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
            
            <div className="mt-4 p-3 bg-light rounded border-start border-4 border-info">
              <div className="d-flex align-items-start">
                <div className="flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="bi bi-info-circle-fill text-info" viewBox="0 0 16 16">
                    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/>
                  </svg>
                </div>
                <div className="flex-grow-1 ms-3">
                  <p className="mb-2 fw-semibold text-dark">💡 성능 지표 안내</p>
                  <p className="mb-2 small text-secondary">
                    • Test Score (R²)가 <strong className="text-primary">높을수록</strong> 예측 성능이 우수합니다.<br/>
                    • <span className="badge bg-warning text-dark">⭐ 골드 별</span> 표시는 전체 모델 중 최고 성능을 나타냅니다.
                  </p>
                  <p className="mb-0 small">
                    <span className="badge bg-success me-2">Production</span> 
                    <span className="text-muted">단계의 R² 최고값 모델이 MeasSet Generation에 자동 적용됩니다.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 오른쪽: 머신러닝 모델 선택 */}
      <div className="col-lg-4 mb-4">
        <div className="card shadow-sm sticky-top" style={{top: '20px'}}>
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
            <div className="mt-3 d-grid">
              <button
                type="button"
                className="btn btn-success btn-lg"
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
              <div className="mt-3 p-3 bg-light rounded text-center border">
                <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                  <span className="visually-hidden">로딩 중...</span>
                </div>
                <span className="text-muted">로딩 중...</span>
              </div>
            )}
            {error && (
              <div className="mt-3 p-3 bg-danger bg-opacity-10 rounded border border-danger">
                <div className="d-flex align-items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="bi bi-exclamation-triangle-fill text-danger flex-shrink-0" viewBox="0 0 16 16">
                    <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>
                  </svg>
                  <span className="ms-2 text-danger small">{error}</span>
                </div>
              </div>
            )}
            {trainingResult && (
              <div className="mt-3 p-3 bg-success bg-opacity-10 rounded border border-success">
                <div className="d-flex align-items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="bi bi-check-circle-fill text-success flex-shrink-0" viewBox="0 0 16 16">
                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                  </svg>
                  <span className="ms-2 text-success small fw-semibold">{trainingResult}</span>
                </div>
              </div>
            )}
            {selectedModel && !loading && !error && !trainingResult && (
              <div className="mt-3 p-3 bg-primary bg-opacity-10 rounded border border-primary">
                <p className="mb-1 small text-primary fw-semibold">✓ 선택된 모델</p>
                <p className="mb-0 small text-dark">{selectedModel}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
    </Layout>
  );
}
