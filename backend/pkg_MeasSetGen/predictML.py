import joblib
import pandas as pd
from pkg_SQL.database import SQL
import numpy as np

# Pandas 다운캐스팅 옵션 설정
pd.set_option("future.no_silent_downcasting", True)


class PredictML:
    """
    Predict AOP value
    1) intensity case: peak of scanning-mode / using set-up range of measurement by ML
    2) temperature case: find initial PRF(for target temperature)
    3) Power case: find to set-up PRF for preventing of transducer damage
    """

    def __init__(self, database, df, probeId, probeName):
        self.database = database
        self.df = df
        self.probeId = probeId
        self.probeName = probeName

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
        connect = SQL(windows_auth=True, database=self.database)
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

        # AI_param을 Series로 변환하고 이름을 지정
        self.df["AI_param"] = pd.Series(zt_est, name="AI_param")

        # 반올림 적용
        self.df["AI_param"] = self.df["AI_param"].round(1)

        return self.df

    def temperature_PRF_est(self):
        ## predict PRF by ML model.

        temp_df = self.df.loc[self.df.groupby("groupIndex")["TxFocusLocCm"].idxmax()]
        temp_df = temp_df.drop_duplicates(subset=["groupIndex"])
        temp_df["AI_param"] = 610
        temp_df["measSetComments"] = f"Beamstyle_{self.probeName}_temperature"

        # 결과를 groupIndex로 정렬
        temp_df = temp_df.sort_values("groupIndex")

        return temp_df

    def power_PRF_est(self):
        ## predict PRF by ML model.

        ## load parameters from SQL database for transducer pitch
        connect = SQL(windows_auth=True, database=self.database)
        query = f"""
            SELECT [probePitchCm]
            FROM probe_geo 
            WHERE probeid = {self.probeId}
            ORDER BY 1
            """

        pitchCm_df = connect.execute_query(query)
        oneCmElement = np.ceil(1 / pitchCm_df["probePitchCm"].iloc[0])

        power_df = self.df.loc[self.df.groupby("groupIndex")["TxFocusLocCm"].idxmax()]
        power_df = power_df.drop_duplicates(subset=["groupIndex"])
        power_df["measSetComments"] = f"Beamstyle_{self.probeName}_power"
        power_df["NumTxElements"] = oneCmElement

        power_df["AI_param"] = 1000

        # 결과를 groupIndex로 정렬
        power_df = power_df.sort_values("groupIndex")

        return power_df
