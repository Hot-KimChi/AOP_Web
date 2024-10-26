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

        probeGeo_df = connect.execute_query(query)
        probeGeo_df = probeGeo_df.fillna(0).infer_objects()

        if len(probeGeo_df) == 1:
            probeGeo_df = pd.concat(
                [probeGeo_df] * len(self.est_params), ignore_index=True
            )

        # Assigning est_geo columns to est_params, broadcasting if necessary
        self.est_params = self.est_params.assign(
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
        ## need to add comment

        self.df = self.df.loc[self.df.groupby("groupIndex")["TxFocusLocCm"].idxmax()]
        self.df["AI_param"] = 610

        # loaded_model = joblib.load("")
        # prf_est = loaded_model.predict(self.est_params)
        # self.df["AI_param"] = pd.Series(prf_est, name="AI_param")
        #
        # # 반올림 적용
        # self.df["AI_param"] = self.df["AI_param"].round(1)
        #
        return self.df

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
        oneCmElement = 1 / pitchCm_df["probePitchCm"].iloc[0]
        print(oneCmElement)

        self.df = self.df.loc[self.df.groupby("groupIndex")["TxFocusLocCm"].idxmax()]
        self.df["NumTxElements"] = oneCmElement

        self.df["AI_param"] = 610

        # loaded_model = joblib.load("")
        # prf_est = loaded_model.predict(self.est_params)
        # self.df["AI_param"] = pd.Series(prf_est, name="AI_param")
        #
        # # 반올림 적용
        # self.df["AI_param"] = self.df["AI_param"].round(1)
        #
        return self.df
