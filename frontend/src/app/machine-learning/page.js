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
    fetchModels();
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
      } else {
        setError(data.message || "모델 훈련에 실패했습니다.");
      }
    } catch (e) {
      setError("서버 연결 오류");
    } finally {
      setTrainingLoading(false);
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
      </div>
    </Layout>
  );
}
