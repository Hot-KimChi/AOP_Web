import joblib
import pandas as pd
from pkg_SQL.database import SQL

# Pandas 다운캐스팅 옵션 설정
pd.set_option("future.no_silent_downcasting", True)


class PredictML:
    """
    Predict AOP value
    1) intensity case: peak of scanning-mode / using set-up range of measurement by ML
    2) temperature case: find initial PRF(for target temperature)
    3) Power case: find to set-up PRF for preventing of transducer damage
    """

    def __init__(self, database, df, probeId):
        self.database = database
        self.df = df
        self.probeId = probeId
        self._preParams()

    def _preParams(self):
        ## take parameters for ML from measSet_gen file.
        self.est_params = self.df[
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
        connect = SQL(windows_auth=True, database=self.database)
        query = f"""
            SELECT [probePitchCm], [probeRadiusCm], [probeElevAperCm0], [probeElevAperCm1], [probeElevFocusRangCm], [probeElevFocusRangCm1]
            FROM probe_geo 
            WHERE probeid = {self.probeId}
            ORDER BY 1
            """

        est_geo = connect.execute_query(query)
        est_geo = est_geo.fillna(0).infer_objects()

        if len(est_geo) == 1:
            est_geo = pd.concat([est_geo] * len(self.est_params), ignore_index=True)

        # Assigning est_geo columns to est_params, broadcasting if necessary
        self.est_params = self.est_params.assign(
            probePitchCm=est_geo["probePitchCm"].values,
            probeRadiusCm=est_geo["probeRadiusCm"].values,
            probeElevAperCm0=est_geo["probeElevAperCm0"].values,
            probeElevAperCm1=est_geo["probeElevAperCm1"].values,
            probeElevFocusRangCm=est_geo["probeElevFocusRangCm"].values,
            probeElevFocusRangCm1=est_geo["probeElevFocusRangCm1"].values,
        )

        # # Check the final DataFrame before saving to CSV
        # print("Final est_params: ", self.est_params)

        # # DataFrame을 CSV로 저장
        # self.est_params.to_csv("measSetGen_df.csv", index=False, encoding="utf-8-sig")
        # print("CSV file saved as measSetGen_df.csv")

    def intensity_zt_est(self):
        ## predict zt by Machine Learning model.
        loaded_model = joblib.load(
            r".\backend\ML_Models\RandomForestRegressor_v1_python310_sklearn1.4.2.pkl"
        )

        zt_est = loaded_model.predict(self.est_params.values)

        # AI_param을 Series로 변환하고 이름을 지정
        self.df["AI_param"] = pd.Series(zt_est, name="AI_param")

        # 반올림 적용
        self.df["AI_param"] = self.df["AI_param"].round(1)

        return self.df

    def temperature_PRF_est(self):
        ## predict PRF by ML model.

        loaded_model = joblib.load("")

        PRF_est = loaded_model.predict(self.est_params)

        return self.df
