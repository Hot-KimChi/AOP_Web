import logging
import pandas as pd
import numpy as np
import time
from pkg_MachineLearning.mlflow_integration import AOP_MLflowTracker
from utils.credential_store import get_session_credentials
from utils.database_manager import get_db_connection

logger = logging.getLogger("PredictML")

# Pandas 다운캐스팅 옵션 설정
pd.set_option("future.no_silent_downcasting", True)


class PredictML:
    """
    Predict AOP value
    1) intensity case: peak of scanning-mode / using set-up range of measurement by ML
    2) temperature case: find initial PRF(for target temperature)
    3) Power case: find to set-up PRF for preventing of transducer damage
    """

    def __init__(self, df, probeId, probeName, database):
        self.df = df
        self.probeId = probeId
        self.probeName = probeName
        self.database = database

        self.username, self.password = get_session_credentials()

        if not self.username or not self.password:
            raise ValueError("User not authenticated")

        self._probe_geo_row = None

    # 추론 DataFrame 의 컬럼명은 측정셋 생성 스키마를 따르고, 학습 데이터는
    # DB 조회 스키마를 따르므로 이름이 다르다. 같은 위치에 오는 특성끼리 매핑한다.
    INTENSITY_FEATURE_ALIASES = {
        "TxFrequencyHz": "txFrequencyHz",
        "TxFocusLocCm": "focusRangeCm",
        "NumTxElements": "numTxElements",
        "TxpgWaveformStyle": "txpgWaveformStyle",
        "ProbeNumTxCycles": "numTxCycles",
        "ElevAperIndex": "elevAperIndex",
        "IsTxChannelModulationEn": "IsTxAperModulationEn",
    }

    @classmethod
    def _align_features(cls, model, estParams: pd.DataFrame):
        """모델이 학습 시 사용한 특성명·순서에 맞춰 입력을 정렬한다.

        `.values` 로 넘기면 컬럼 순서가 바뀌어도 오류 없이 잘못된 예측이 나온다.
        모델이 `feature_names_in_` 을 갖고 있으면 그 순서로 재색인해 검증한다.
        """
        expected = getattr(model, "feature_names_in_", None)
        if expected is None:
            return estParams.values

        renamed = estParams.rename(columns=cls.INTENSITY_FEATURE_ALIASES)
        missing = [name for name in expected if name not in renamed.columns]
        if missing:
            logger.warning(
                "학습 특성명과 일치하지 않아 위치 기반으로 예측합니다. 누락: %s", missing
            )
            return estParams.values

        return renamed[list(expected)]

    # probe_geo 는 probe 당 1행인 마스터 데이터다. intensity/temperature/power 단계가
    # 각각 조회하면 요청마다 DB 왕복이 3회 발생하므로 한 번만 읽어 재사용한다.
    PROBE_GEO_COLUMNS = (
        "probePitchCm",
        "probeRadiusCm",
        "probeElevAperCm0",
        "probeElevAperCm1",
        "probeElevFocusRangCm",
        "probeElevFocusRangCm1",
        "probeNumElements",
    )

    def _get_probe_geo(self) -> pd.Series:
        """해당 probe 의 geometry 1행을 반환한다(요청 단위 캐시).

        Raises:
            ValueError: 조회 결과가 정확히 1행이 아닐 때. 0행이면 IndexError,
                복수 행이면 길이 불일치 ValueError 로 이어지던 문제를 명시적 오류로 바꾼다.
        """
        if self._probe_geo_row is not None:
            return self._probe_geo_row

        columns = ", ".join(f"[{c}]" for c in self.PROBE_GEO_COLUMNS)
        query = f"SELECT {columns} FROM probe_geo WHERE probeid = ?"

        connect = get_db_connection(self.database)
        probeGeo_df = connect.execute_query(query, (self.probeId,))

        if probeGeo_df is None or len(probeGeo_df) == 0:
            raise ValueError(
                f"probe_geo 에 probeId={self.probeId} 데이터가 없습니다."
            )
        if len(probeGeo_df) > 1:
            raise ValueError(
                f"probe_geo 에 probeId={self.probeId} 행이 {len(probeGeo_df)}개 있습니다. "
                "1개만 존재해야 합니다."
            )

        self._probe_geo_row = probeGeo_df.fillna(0).infer_objects().iloc[0]
        return self._probe_geo_row

    def _paramForIntensity(self):
        ## take parameters for ML from measSet_gen file.
        estParams = self.df[
            [
                "TxFrequencyHz",
                "TxFocusLocCm",
                "NumTxElements",
                "TxpgWaveformStyle",
                "ProbeNumTxCycles",
                "ElevAperIndex",
                "IsTxChannelModulationEn",
            ]
        ].copy()

        ## load parameters from SQL database (probe 당 1행, 요청 단위 캐시)
        probeGeo = self._get_probe_geo()

        # 스칼라 geometry 값을 모든 행에 브로드캐스트
        estParams = estParams.assign(
            probePitchCm=probeGeo["probePitchCm"],
            probeRadiusCm=probeGeo["probeRadiusCm"],
            probeElevAperCm0=probeGeo["probeElevAperCm0"],
            probeElevAperCm1=probeGeo["probeElevAperCm1"],
            probeElevFocusRangCm=probeGeo["probeElevFocusRangCm"],
            probeElevFocusRangCm1=probeGeo["probeElevFocusRangCm1"],
        )

        return estParams

    def _paramForTemperature(self):
        ## take parameters for ML from measSet_gen file.

        # 각 GroupIndex 내에서 최대 TxFocusLocCm 값을 찾기
        max_values = self.df.groupby("GroupIndex")["TxFocusLocCm"].transform("max")

        # 최대값과 일치하는 모든 행 선택
        self.temp_df = self.df[self.df["TxFocusLocCm"] == max_values]

        # 필요하다면 여기서 중복 제거
        self.temp_df = self.temp_df.drop_duplicates(subset=["GroupIndex"])

        estParams = self.temp_df[
            [
                "GroupIndex",
                "ProbeNumTxCycles",
                "NumTxElements",
                "TxFrequencyHz",
                "ElevAperIndex",
                "IsTxChannelModulationEn",
                "TxpgWaveformStyle",
                "profTxVoltageVolt",
                "VTxIndex",
            ]
        ].copy()

        estParams = estParams.rename(
            columns={
                "ProbeNumTxCycles": "numTxCycles",
                "NumTxElements": "numTxElements",
                "TxFrequencyHz": "txFrequencyHz",
                "ElevAperIndex": "elevAperIndex",
                "IsTxChannelModulationEn": "isTxAperModulationEn",
                "TxpgWaveformStyle": "txpgWaveformStyle",
                "profTxVoltageVolt": "profTxVoltageVolt",
                "VTxIndex": "VTxindex",
            }
        )

        ## load parameters from SQL database (probe 당 1행, 요청 단위 캐시)
        probeGeo = self._get_probe_geo()

        probePitch = probeGeo["probePitchCm"]
        probeNumElements = probeGeo["probeNumElements"]
        fullScanRange = probePitch * probeNumElements

        # 스칼라 geometry 값을 모든 행에 브로드캐스트
        estParams = estParams.assign(
            probePitchCm=probeGeo["probePitchCm"],
            probeRadiusCm=probeGeo["probeRadiusCm"],
            probeElevAperCm0=probeGeo["probeElevAperCm0"],
        )

        # Create two copies: one with fullScanRange, one with 0
        estParams_full = estParams.copy()
        estParams_full["scanRange"] = fullScanRange
        estParams_full["numTxCycles"] = 4  # 온도모델링을 위해서, 사이클 수를 4로 고정
        estParams_full["numTxElements"] = estParams_full["numTxElements"] // 10
        # 온도모델링을 위해서, Element 수를 1/10로 줄임

        ## TempsetNumber: 4을 위해 설정.
        estParams_zero = estParams.copy()
        estParams_zero["scanRange"] = 0

        # Combine both dataframes
        estParams_combined = pd.concat(
            [estParams_full, estParams_zero], ignore_index=True
        )

        return estParams_combined

    def intensity_zt_est(self):
        ## predict zt by Machine Learning model.
        start_time = time.time()

        estParams = self._paramForIntensity()

        # Load model from database using MLflow integration
        mlflow_tracker = AOP_MLflowTracker()

        # Load the best performing model for intensity prediction automatically
        model_info = mlflow_tracker.load_best_model(prediction_type="intensity")

        if model_info is None:
            # 모델 부재·DB 오류·역직렬화 실패를 모두 기본값 5.0 으로 덮으면,
            # 장애가 "성공한 측정셋"으로 위장되어 잘못된 설비 설정이 생성된다.
            AOP_MLflowTracker.log_simple_prediction(
                input_features={"error": "no_intensity_model"},
                prediction_result={"AI_param": None},
                prediction_type="intensity",
            )
            raise RuntimeError(
                "intensity 예측 모델을 불러오지 못했습니다. "
                "모델이 등록되어 있는지, DB 연결이 정상인지 확인해 주세요."
            )

        loaded_model = model_info["model"]
        model_name = model_info["model_name"]
        version_id = model_info["version_id"]

        # 예측 수행
        prediction_start = time.time()
        zt_est = loaded_model.predict(self._align_features(loaded_model, estParams))
        prediction_time_ms = int((time.time() - prediction_start) * 1000)

        # MLflow prediction logging
        try:
            input_features = (
                estParams.to_dict("records")[0] if len(estParams) > 0 else {}
            )
            prediction_result = (
                zt_est.tolist() if hasattr(zt_est, "tolist") else list(zt_est)
            )

            result = mlflow_tracker.log_prediction(
                model_version_id=version_id,
                input_features=input_features,
                prediction_result=prediction_result,
                prediction_type="intensity",
                request_source="intensity_estimation",
                processing_time_ms=prediction_time_ms,
            )
        except Exception as e:
            logger.debug(f"MLflow prediction logging skipped: {e}")

        # AI_param을 Series로 변환하고 이름을 지정
        self.df["AI_param"] = pd.Series(zt_est, name="AI_param")

        # 반올림 적용
        self.df["AI_param"] = self.df["AI_param"].round(1)

        return self.df

    def power_PRF_est(self):
        ## predict PRF by ML model.

        ## load parameters from SQL database for transducer pitch (요청 단위 캐시)
        probeGeo = self._get_probe_geo()
        probePitchCm = float(probeGeo["probePitchCm"])
        if probePitchCm <= 0:
            raise ValueError(
                f"probe_geo.probePitchCm 값이 유효하지 않습니다(probeId={self.probeId}, "
                f"값={probePitchCm})."
            )
        oneCmElement = np.ceil(1 / probePitchCm)

        # 각 GroupIndex 내에서 최대 TxFocusLocCm 값을 찾기
        max_values = self.df.groupby("GroupIndex")["TxFocusLocCm"].transform("max")

        # 최대값과 일치하는 모든 행 선택
        power_df = self.df[self.df["TxFocusLocCm"] == max_values]

        # 필요하다면 여기서 중복 제거
        power_df = power_df.drop_duplicates(subset=["GroupIndex"])

        power_df["measSetComments"] = f"Beamstyle_{self.probeName}_power"
        power_df["NumTxElements"] = oneCmElement
        power_df["AI_param"] = 1000

        # 결과를 GroupIndex로 정렬
        power_df = power_df.sort_values("GroupIndex")

        # MLflow prediction logging
        try:
            mlflow_tracker = AOP_MLflowTracker()

            input_features = {
                "probePitch": probePitchCm,
                "maxTxFocusLoc": (
                    float(max_values.max()) if len(max_values) > 0 else None
                ),
                "oneCmElement": float(oneCmElement),
                "numGroups": len(power_df),
            }
            prediction_result = {
                "NumTxElements": float(oneCmElement),
                "AI_param": 1000,
                "measSetComments": f"Beamstyle_{self.probeName}_power",
            }

            AOP_MLflowTracker.log_simple_prediction(
                input_features=input_features,
                prediction_result=prediction_result,
                prediction_type="power",
            )
        except Exception as e:
            logger.debug(f"MLflow prediction logging skipped: {e}")

        return power_df

    def temperature_PRF_est(self, target_tr: float = 15.0):
        ## predict PRF by ML model.
        from pkg_MeasSetGen.Temp_Prr_predict import find_prr_for_temprise_batch

        estParams = self._paramForTemperature()
        estParams["pulseRepetRate"] = 0  # 초기값 설정

        for c in [
            "isTxChannelModulationEn",
            "txpgWaveformStyle",
            "elevAperIndex",
            "VTxindex",
        ]:
            if c in estParams.columns:
                estParams[c] = estParams[c].fillna(0).astype(int)

        # iterrows 대신 to_dict('records')로 변환 (100x+ 빠름)
        user_inputs = []
        used_voltages = []

        for user_input in estParams.to_dict("records"):
            # ML 모델 입력에서 제외할 컬럼 제거
            user_input.pop("GroupIndex", None)

            V = user_input.get("profTxVoltageVolt", 0)
            user_input["pulseVoltage"] = V
            used_voltages.append(V)
            user_inputs.append(user_input)

        # 배치로 한 번에 처리
        results = find_prr_for_temprise_batch(user_inputs, target_tr=target_tr)
        ai_params = [res["best_prr"] for res in results]

        # estParams에 결과 할당 (self.temp_df가 아닌)
        estParams["AI_param"] = ai_params

        # scanRange 기준으로 DataFrame 분리
        estParams_full = estParams[estParams["scanRange"] > 0].copy()
        estParams_zero = estParams[estParams["scanRange"] == 0].copy()

        result_df = self.temp_df.copy()
        result_df["AI_param"] = estParams_zero["AI_param"].values
        result_df["AI_param"] = result_df["AI_param"].round(2)
        result_df["measSetComments"] = f"Beamstyle_{self.probeName}_temperature"
        result_df = result_df.sort_values("GroupIndex")

        # ============================================================
        # estParams_zero에서 대표 행 선택 → 동일 GroupIndex의 estParams_full 행을
        # result_df에 추가
        # ============================================================

        # Step 1: estParams_zero에서 (elevAperIndex, isTxAperModulationEn) 조합별
        #          AI_param이 가장 높은 행의 인덱스를 선택 (최대 4행)
        selected_zero_idx = estParams_zero.groupby(
            ["elevAperIndex", "isTxAperModulationEn"]
        )["AI_param"].idxmax()

        # Step 2: 선택된 zero 행의 GroupIndex로 paired full 행 찾기
        selected_group_indices = estParams_zero.loc[selected_zero_idx][
            "GroupIndex"
        ].values
        selected_full = estParams_full[
            estParams_full["GroupIndex"].isin(selected_group_indices)
        ].sort_values("GroupIndex")

        # Step 3: self.temp_df에서 동일 GroupIndex의 원본 행 가져오기
        full_result_rows = (
            self.temp_df[self.temp_df["GroupIndex"].isin(selected_group_indices)]
            .sort_values("GroupIndex")
            .copy()
        )

        # Step 4: estParams_full의 수정된 값들을 결과 행에 반영
        #   - AI_param: SA 모드 PRR 예측값
        #   - NumTxElements: estParams_full에서 // 10 된 값
        #   - ProbeNumTxCycles: estParams_full에서 4로 고정된 값
        full_result_rows["AI_param"] = selected_full["AI_param"].values
        full_result_rows["AI_param"] = full_result_rows["AI_param"].round(2)
        full_result_rows["NumTxElements"] = selected_full["numTxElements"].values
        full_result_rows["ProbeNumTxCycles"] = selected_full["numTxCycles"].values
        full_result_rows["measSetComments"] = (
            f"Beamstyle_{self.probeName}_temperature_SA"
        )

        # Step 5: 기존 result_df(zero)에 SA 모드 대표 행 추가
        result_df = pd.concat([result_df, full_result_rows], ignore_index=True)

        # # MLflow prediction logging
        # try:
        #     mlflow_tracker = AOP_MLflowTracker()

        #     input_features = {
        #         "maxTxFocusLoc": (
        #             float(max_values.max()) if len(max_values) > 0 else None
        #         ),
        #         "numGroups": len(temp_df),
        #         "probeName": self.probeName,
        #     }
        #     prediction_result = {
        #         "AI_param": 610,
        #         "measSetComments": f"Beamstyle_{self.probeName}_temperature",
        #     }

        #     AOP_MLflowTracker.log_simple_prediction(
        #         input_features=input_features,
        #         prediction_result=prediction_result,
        #         prediction_type="temperature",
        #     )
        # except Exception as e:
        #     # Prediction logging 실패해도 메인 기능은 계속 진행
        #     pass

        return result_df
