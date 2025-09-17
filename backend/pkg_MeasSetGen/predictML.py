import joblib
import pandas as pd
from pkg_SQL.database import SQL
import numpy as np
from flask import jsonify, session
from pkg_MachineLearning.mlflow_integration import AOP_MLflowTracker

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

        self.username = session.get("username")
        self.password = session.get("password")

        if not self.username or not self.password:
            return jsonify({"error": "User not authenticated"}), 401

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

        ## load parameters from SQL database
        connect = SQL(
            username=self.username, password=self.password, database=self.database
        )
        query = f"""
            SELECT [probePitchCm], [probeRadiusCm], [probeElevAperCm0], [probeElevAperCm1], [probeElevFocusRangCm], [probeElevFocusRangCm1]
            FROM probe_geo 
            WHERE probeid = {self.probeId}
            ORDER BY 1
            """

        probeGeo_df = connect.execute_query(query)
        probeGeo_df = probeGeo_df.fillna(0).infer_objects()

        if len(probeGeo_df) == 1:
            probeGeo_df = pd.concat([probeGeo_df] * len(estParams), ignore_index=True)

        # Assigning est_geo columns to est_params, broadcasting if necessary
        estParams = estParams.assign(
            probePitchCm=probeGeo_df["probePitchCm"].values,
            probeRadiusCm=probeGeo_df["probeRadiusCm"].values,
            probeElevAperCm0=probeGeo_df["probeElevAperCm0"].values,
            probeElevAperCm1=probeGeo_df["probeElevAperCm1"].values,
            probeElevFocusRangCm=probeGeo_df["probeElevFocusRangCm"].values,
            probeElevFocusRangCm1=probeGeo_df["probeElevFocusRangCm1"].values,
        )

        # # Check the final DataFrame before saving to CSV
        # print("Final est_params: ", self.est_params)

        # # DataFrame을 CSV로 저장
        # self.est_params.to_csv("measSetGen_df.csv", index=False, encoding="utf-8-sig")
        # print("CSV file saved as measSetGen_df.csv")
        return estParams

    def intensity_zt_est(self):
        ## predict zt by Machine Learning model.
        estParams = self._paramForIntensity()

        loaded_model = joblib.load(
            r".\backend\ML_Models\RandomForestRegressor_v1_python310_sklearn1.4.2.pkl"
        )

        zt_est = loaded_model.predict(estParams.values)

        # MLflow prediction logging
        try:
            input_features = (
                estParams.to_dict("records")[0] if len(estParams) > 0 else {}
            )
            prediction_result = (
                zt_est.tolist() if hasattr(zt_est, "tolist") else list(zt_est)
            )

            AOP_MLflowTracker.log_prediction(
                model_name="RandomForestRegressor_Intensity",
                input_features=input_features,
                prediction_result=prediction_result,
                prediction_type="intensity_zt_prediction",
            )
        except Exception as e:
            # Prediction logging 실패해도 메인 기능은 계속 진행
            pass

        # AI_param을 Series로 변환하고 이름을 지정
        self.df["AI_param"] = pd.Series(zt_est, name="AI_param")

        # 반올림 적용
        self.df["AI_param"] = self.df["AI_param"].round(1)

        return self.df

    def power_PRF_est(self):
        ## predict PRF by ML model.

        ## load parameters from SQL database for transducer pitch
        connect = SQL(
            username=self.username, password=self.password, database=self.database
        )
        query = f"""
            SELECT [probePitchCm]
            FROM probe_geo 
            WHERE probeid = {self.probeId}
            ORDER BY 1
            """

        pitchCm_df = connect.execute_query(query)
        oneCmElement = np.ceil(1 / pitchCm_df["probePitchCm"].iloc[0])

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
            input_features = {
                "probePitch": (
                    float(pitchCm_df["probePitchCm"].iloc[0])
                    if not pitchCm_df.empty
                    else None
                ),
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

            AOP_MLflowTracker.log_prediction(
                model_name="PowerPRF_Calculator",
                input_features=input_features,
                prediction_result=prediction_result,
                prediction_type="power_prf_estimation",
            )
        except Exception as e:
            # Prediction logging 실패해도 메인 기능은 계속 진행
            pass

        return power_df

    def temperature_PRF_est(self):
        ## predict PRF by ML model.

        # 각 GroupIndex 내에서 최대 TxFocusLocCm 값을 찾기
        max_values = self.df.groupby("GroupIndex")["TxFocusLocCm"].transform("max")

        # 최대값과 일치하는 모든 행 선택
        temp_df = self.df[self.df["TxFocusLocCm"] == max_values]

        # 필요하다면 여기서 중복 제거
        temp_df = temp_df.drop_duplicates(subset=["GroupIndex"])

        temp_df["AI_param"] = 610
        temp_df["measSetComments"] = f"Beamstyle_{self.probeName}_temperature"

        # 결과를 GroupIndex로 정렬
        temp_df = temp_df.sort_values("GroupIndex")

        # MLflow prediction logging
        try:
            input_features = {
                "maxTxFocusLoc": (
                    float(max_values.max()) if len(max_values) > 0 else None
                ),
                "numGroups": len(temp_df),
                "probeName": self.probeName,
            }
            prediction_result = {
                "AI_param": 610,
                "measSetComments": f"Beamstyle_{self.probeName}_temperature",
            }

            AOP_MLflowTracker.log_prediction(
                model_name="TemperaturePRF_Calculator",
                input_features=input_features,
                prediction_result=prediction_result,
                prediction_type="temperature_prf_estimation",
            )
        except Exception as e:
            # Prediction logging 실패해도 메인 기능은 계속 진행
            pass

        return temp_df
