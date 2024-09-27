import joblib
import pandas as pd
from pkg_SQL.database import SQL


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
        ]

        ## load parameters from SQL database
        connect = SQL(windows_auth=True, database=self.database)
        query = f"""
            SELECT [probePitchCm], [probeRadiusCm], [probeElevAperCm0], [probeElevAperCm1], [probeElevFocusRangCm], [probeElevFocusRangCm1]
            FROM probe_geo 
            WHERE probeid = {self.probeId}
            ORDER BY 1
            """

        est_geo = connect.execute_query(query)

        self.est_params[["probePitchCm"]] = est_geo["probePitchCm"]
        self.est_params[["probeRadiusCm"]] = est_geo["probeRadiusCm"]
        self.est_params[["probeElevAperCm0"]] = est_geo["probeElevAperCm0"]
        self.est_params[["probeElevAperCm1"]] = est_geo["probeElevAperCm1"]
        self.est_params[["probeElevFocusRangCm"]] = est_geo["probeElevFocusRangCm"]
        self.est_params[["probeElevFocusRangCm1"]] = est_geo["probeElevFocusRangCm1"]

    def intensity_zt_est(self):
        ## predict zt by Machine Learning model.

        loaded_model = joblib.load(
            r".\backend\Model\RandomForestRegressor_v1_python310_sklearn1.4.2.pkl"
        )

        zt_est = loaded_model.predict(self.est_params)
        df_est = pd.DataFrame(zt_est, columns=["zt_est"])

        self.df["zt_est"] = round(df_est, 1)

        return self.df

    def temperature_PRF_est(self):
        ## predict PRF by ML model.

        loaded_model = joblib.load("")

        PRF_est = loaded_model.predict(self.est_params)

        return self.df
