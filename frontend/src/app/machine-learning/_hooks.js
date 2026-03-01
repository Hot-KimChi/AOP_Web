/**
 * machine-learning/_hooks.js
 *
 * 머신러닝 페이지의 모든 상태(state)와 API 호출 로직을 담당하는 커스텀 훅입니다.
 *
 * 반환값 구조:
 *  [모델 선택·훈련]  models, loading, selectedModel, setSelectedModel,
 *                   error, trainingLoading, trainingResult, handleTraining
 *  [버전 성능]       versionsData, versionsLoading, chartData, chartOptions,
 *                   expandedModels, setExpandedModels
 *  [산점도]          scatterData, scatterLoading, scatterChartData,
 *                   selectedVersionsMeta (scatterData 에서 파생),
 *                   handleRemoveVersion, handleResetScatter
 *
 * 설계 원칙:
 *  - selectedVersionsMeta 는 scatterData 의 파생값(useMemo)으로 관리합니다.
 *    별개 state 로 두면 async 타이밍에 따라 두 값이 desync 될 수 있습니다.
 *  - scatterSeqRef 시퀀스 카운터로 경쟁 조건(race condition)을 방지합니다.
 *    사용자가 새 포인트를 클릭하면 이전 진행 중인 fetch 결과를 자동 폐기합니다.
 */

'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { findBestVersion, buildLineChartData, buildScatterChartData } from './_helpers';
import { makeLineChartOptions } from './_constants';

export function useMLPageData() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [상태 정의]
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 모델 선택·훈련
  const [models,          setModels]          = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [selectedModel,   setSelectedModel]   = useState('');
  const [error,           setError]           = useState('');
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingResult,  setTrainingResult]  = useState('');

  // 버전 성능 / 테이블
  const [versionsData,    setVersionsData]    = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [expandedModels,  setExpandedModels]  = useState({});

  // 산점도
  // ※ selectedVersionsMeta 는 scatterData 에서 파생하므로 별도 state 없음
  const [scatterData,      setScatterData]      = useState([]);
  const [scatterLoading,   setScatterLoading]   = useState(false);
  // 클릭한 버전에 DB 데이터가 없을 때 표시할 메시지 (빈 문자열 = 일반 빈 상태)
  const [scatterNoDataMsg, setScatterNoDataMsg] = useState('');

  // Ref: scatter 데이터 캐시 (version_id → 포인트 데이터)
  const scatterCacheRef = useRef({});
  // Ref: 초기 scatter 로드 완료 여부 (StrictMode 이중 실행 방어)
  const initialLoadDoneRef = useRef(false);
  // Ref: 비동기 경쟁 조건 방지용 시퀀스 카운터
  //   새 클릭이 발생하면 seq 가 증가하고, 이전 in-flight 요청의 결과는 무시됩니다.
  const scatterSeqRef = useRef(0);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [Step 1] scatter 캐시 기반 단건 fetch 유틸
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /**
   * version_id 에 해당하는 scatter 포인트 데이터를 가져옵니다.
   * 같은 version_id 는 캐시에서 즉시 반환하여 중복 API 요청을 방지합니다.
   * useCallback([], []) 으로 안정적인 참조를 유지합니다.
   */
  const fetchScatterByVersionId = useCallback(async (versionId) => {
    if (scatterCacheRef.current[versionId]) {
      return scatterCacheRef.current[versionId];
    }
    const res  = await fetch(
      `${API_BASE_URL}/api/prediction_points?version_id=${versionId}`,
      { credentials: 'include' }
    );
    const json = await res.json();
    if (json.status === 'success' && json.data.length > 0) {
      // 결과를 캐시에 저장 — 같은 버전 재클릭 시 네트워크 요청 없이 즉시 반환
      scatterCacheRef.current[versionId] = json.data[0];
      return json.data[0];
    }
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [Step 2] 초기 데이터 로드 (마운트 시 1회)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    // 드롭다운용 모델 목록 로드
    async function fetchModels() {
      setLoading(true);
      setError('');
      try {
        const res  = await fetch(`${API_BASE_URL}/api/get_ml_models`, { credentials: 'include' });
        const json = await res.json();
        if (json.status === 'success') {
          setModels(json.models);
        } else {
          setError('모델 정보를 불러오지 못했습니다.');
        }
      } catch {
        setError('서버 연결 오류');
      } finally {
        setLoading(false);
      }
    }

    /**
     * 버전 성능 + best model 산점도를 하나의 async 흐름으로 처리합니다.
     *
     * 순서:
     *  ① model_versions_performance API 호출
     *  ② setVersionsData → 좌측 그래프 즉시 렌더
     *  ③ StrictMode 이중 호출 방어 (initialLoadDoneRef)
     *  ④ findBestVersion 으로 best version 식별
     *  ⑤ 시퀀스 번호 기록 (사용자 클릭 시 자동 무효화)
     *  ⑥ prediction_points fetch → setScatterData
     */
    async function fetchVersionsAndScatter() {
      setVersionsLoading(true);
      setScatterLoading(true);
      try {
        const res  = await fetch(
          `${API_BASE_URL}/api/model_versions_performance?prediction_type=intensity`,
          { credentials: 'include' }
        );
        const json = await res.json();
        if (json.status !== 'success') return;

        const rawVersions = json.data || [];
        // ② 좌측 추이 그래프 상태 즉시 등록
        setVersionsData(rawVersions);

        // ③ React StrictMode 이중 호출 / HMR 방어
        if (initialLoadDoneRef.current) return;
        initialLoadDoneRef.current = true;

        // ④ raw 데이터에서 바로 best version 식별
        const best = findBestVersion(rawVersions);
        if (!best) return;

        // ⑤ 시퀀스 등록: 이후 사용자 클릭이 발생하면 seq 가 증가하여 이 결과는 폐기됨
        const initSeq = ++scatterSeqRef.current;

        // ⑥ scatter fetch
        const pointData = await fetchScatterByVersionId(best.version_id);
        if (!pointData) return;

        // 사용자가 이미 클릭했으면 초기 로드 결과를 덮어쓰지 않음
        if (scatterSeqRef.current !== initSeq) return;
        setScatterData([pointData]);
      } catch (e) {
        console.error('Initial load failed:', e);
      } finally {
        setVersionsLoading(false);
        setScatterLoading(false);
      }
    }

    fetchModels();
    fetchVersionsAndScatter();
  }, [API_BASE_URL, fetchScatterByVersionId]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [Step 3] 버전 성능 재로드 (훈련 후 호출)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /**
   * 버전 성능 데이터를 다시 가져와 상태를 갱신합니다.
   * @returns {Array} raw 버전 데이터
   */
  const refreshVersionsPerformance = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const res  = await fetch(
        `${API_BASE_URL}/api/model_versions_performance?prediction_type=intensity`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.status === 'success') {
        const rawVersions = json.data || [];
        setVersionsData(rawVersions);
        return rawVersions;
      }
    } catch (e) {
      console.error('Failed to refresh versions:', e);
    } finally {
      setVersionsLoading(false);
    }
    return [];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [Step 4] scatter 상태 변경 함수들
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /**
   * 특정 버전의 scatter 데이터를 로드하여 표시 목록에 반영합니다.
   *
   * @param {number}  versionId
   * @param {string}  modelName
   * @param {number}  versionNumber
   * @param {boolean} addMode
   *   - false (기본): 기존 선택을 모두 교체하여 단일 표시
   *   - true        : 이미 선택된 경우 제거(토글), 없으면 추가
   *
   * 시퀀스 카운터(scatterSeqRef) 사용:
   *   새 클릭이 발생하면 seq 가 증가하고, 이전 in-flight fetch 결과는 자동 폐기됩니다.
   *   → 빠른 클릭이나 느린 네트워크 환경에서 발생할 수 있는 경쟁 조건을 방지합니다.
   */
  const applyScatterVersion = useCallback(async (versionId, modelName, versionNumber, addMode = false) => {
    // 현재 요청의 시퀀스 번호 발급
    const seq = ++scatterSeqRef.current;
    setScatterLoading(true);
    try {
      const pointData = await fetchScatterByVersionId(versionId);

      // ── DB에 해당 버전의 데이터가 없는 경우 ───────────────────────────
      if (!pointData) {
        // 더 최신 요청이 이미 시작됐으면 무시
        if (scatterSeqRef.current !== seq) return;

        if (!addMode) {
          // 일반 클릭: 이전 모델 데이터를 그대로 두면 사용자가 잘못된 데이터를
          // 보게 되므로 반드시 빈 상태로 교체하고 안내 메시지를 표시합니다.
          setScatterData([]);
          const shortName = modelName.replace('_AOP_Intensity', '');
          setScatterNoDataMsg(
            `${shortName} v${versionNumber} — DB에 예측 포인트 데이터가 없습니다. Training 후 다시 시도하세요.`
          );
        }
        // Ctrl+클릭(addMode=true): 추가할 데이터가 없으므로 조용히 무시합니다.
        // 기존에 표시 중인 다른 모델 데이터는 그대로 보존됩니다.
        return;
      }

      // 더 최신 요청이 시작됐다면 이 결과는 폐기
      if (scatterSeqRef.current !== seq) return;

      // 데이터가 있으면 안내 메시지 초기화
      setScatterNoDataMsg('');

      if (addMode) {
        // Ctrl+클릭: 토글 동작 (있으면 제거, 없으면 추가)
        setScatterData((prevData) => {
          const exists = prevData.some((item) => item.version_id === versionId);
          return exists
            ? prevData.filter((item) => item.version_id !== versionId)
            : [...prevData, pointData];
        });
      } else {
        // 일반 클릭: 단일 교체 — 이전 상태에 무관하게 무조건 1개로 대체
        setScatterData([pointData]);
      }
    } catch (e) {
      console.error('Failed to apply scatter version:', e);
    } finally {
      // 현재 시퀀스의 작업일 때만 로딩 상태 해제
      if (scatterSeqRef.current === seq) setScatterLoading(false);
    }
  }, [fetchScatterByVersionId]);

  /**
   * 헤더의 × 버튼: 특정 버전을 산점도 표시 목록에서 제거합니다.
   * scatterData 만 변경하면 selectedVersionsMeta(파생값)가 자동으로 갱신됩니다.
   */
  const removeVersionFromScatter = useCallback((versionId) => {
    setScatterData((prev) => prev.filter((item) => item.version_id !== versionId));
  }, []);

  /**
   * ↺ 초기화 버튼: 전체 데이터 중 test_score 최고 버전 단일 표시로 되돌립니다.
   *
   * ※ 파라미터를 받지 않습니다.
   *   버튼 onClick 에서 직접 연결하면 SyntheticEvent 가 첫 번째 인수로 넘어와
   *   findBestVersion(event) 가 호출되어 오류가 발생합니다.
   *   → ScatterPlotCard 의 onClick={() => onReset()} 과 쌍으로 사용하세요.
   */
  const resetTobestScatter = useCallback(async () => {
    const best = findBestVersion(versionsData);
    if (!best) return;
    await applyScatterVersion(best.version_id, best.model_name, best.version_number, false);
  }, [versionsData, applyScatterVersion]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [Step 5] 차트 클릭 핸들러
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  /**
   * 추이 라인 차트의 포인트를 클릭할 때 호출됩니다.
   * - 일반 클릭  : 클릭한 버전 단일 표시
   * - Ctrl+클릭  : 현재 산점도에 추가 또는 제거(토글)
   */
  const handleChartClick = useCallback((event, elements, chart) => {
    if (!elements?.length) return;

    const el            = elements[0];
    const dataset       = chart.data.datasets[el.datasetIndex];
    const versionNumber = dataset.data[el.index].x;

    // _modelName 으로 식별: filter 후 인덱스 어긋남 방지
    const modelName   = dataset._modelName;
    const modelData   = versionsData.find((m) => m.model_name === modelName);
    const versionData = modelData?.versions.find((v) => v.version_number === versionNumber);
    if (!versionData) return;

    const addMode = !!(event.native?.ctrlKey || event.native?.metaKey);
    applyScatterVersion(versionData.version_id, modelName, versionNumber, addMode);
  }, [versionsData, applyScatterVersion]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [Step 6] 훈련 핸들러
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const handleTraining = useCallback(async () => {
    if (!selectedModel) {
      setError('모델을 먼저 선택해주세요.');
      return;
    }
    setTrainingLoading(true);
    setTrainingResult('');
    setError('');

    try {
      const res  = await fetch(`${API_BASE_URL}/api/train_model`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ model: selectedModel }),
      });
      const json = await res.json();

      if (json.status === 'success') {
        setTrainingResult(`모델 "${selectedModel}" 훈련이 완료되었습니다.`);

        // 버전 성능 갱신
        await refreshVersionsPerformance();

        // 훈련된 모델의 최신 버전 산점도 자동 로드
        const modelName = selectedModel.includes('_AOP_')
          ? selectedModel
          : `${selectedModel}_AOP_Intensity`;

        const res2  = await fetch(
          `${API_BASE_URL}/api/prediction_points?prediction_type=intensity`
          + `&model_name=${encodeURIComponent(modelName)}&latest_only=true`,
          { credentials: 'include' }
        );
        const json2 = await res2.json();

        if (json2.status === 'success' && json2.data.length > 0) {
          const m = json2.data[0];
          // 훈련 결과는 캐시에 저장 후 단독 표시
          scatterCacheRef.current[m.version_id] = m;
          setScatterData([m]);
          // 이전에 표시 중이던 '데이터 없음' 에러 메시지 제거
          setScatterNoDataMsg('');
        }
      } else {
        setError(json.message || '모델 훈련에 실패했습니다.');
      }
    } catch {
      setError('서버 연결 오류');
    } finally {
      setTrainingLoading(false);
    }
  }, [selectedModel, refreshVersionsPerformance]); // eslint-disable-line react-hooks/exhaustive-deps

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [Step 7] 차트 데이터 · 옵션 파생 (useMemo)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // versionsData 변경 시만 재계산
  const chartData = useMemo(() => buildLineChartData(versionsData), [versionsData]);

  // handleChartClick 이 versionsData 를 의존하므로 같이 갱신
  const chartOptions = useMemo(() => makeLineChartOptions(handleChartClick), [handleChartClick]);

  // scatterData 변경 시만 재계산
  const scatterChartData = useMemo(() => buildScatterChartData(scatterData), [scatterData]);

  /**
   * selectedVersionsMeta: scatterData 에서 파생되는 배지(badge) 메타 배열.
   *
   * scatterData 와 별개 state 로 관리하면 async 타이밍(race condition)에 따라
   * 두 값이 desync 될 수 있습니다. 파생값으로 처리하면 구조적으로 불일치가 불가능합니다.
   *
   * scatterData 아이템에는 이미 version_id / model_name / version_number 가 포함되어 있습니다.
   */
  const selectedVersionsMeta = useMemo(
    () => scatterData.map((item) => ({
      version_id:     item.version_id,
      model_name:     item.model_name,
      version_number: item.version_number,
    })),
    [scatterData]
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 반환값 (page.js 및 각 컴포넌트에 필요한 것만)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return {
    // 모델 선택·훈련
    models, loading,
    selectedModel, setSelectedModel,
    error, trainingLoading, trainingResult,
    handleTraining,
    // 버전 성능 / 테이블
    versionsData, versionsLoading,
    expandedModels, setExpandedModels,
    // 차트
    chartData, chartOptions,
    // 산점도
    scatterData, scatterLoading, scatterChartData,
    scatterNoDataMsg,
    selectedVersionsMeta,
    // page.js handle~ 형태로 통일
    handleRemoveVersion: removeVersionFromScatter,
    handleResetScatter:  resetTobestScatter,
  };
}
