import pandas as pd


class RemoveDuplicate:
    """
    1) parameter 선정 진행
    2) selection한 데이터프레임을 기반으로 merge 작업진행: 중복을 제거하기 위해.
    """

    def __init__(self, df):

        self.df = df

        ## parameter selection
        list_param = [
            "Mode",
            "SubModeIndex",
            "BeamStyleIndex",
            "SysTxFreqIndex",
            "TxpgWaveformStyle",
            "TxFocusLocCm",
            "NumTxElements",
            "ProbeNumTxCycles",
            "IsTxChannelModulationEn",
            "IsPresetCpaEn",
            "CpaDelayOffsetClk",
            "ElevAperIndex",
            "SystemPulserSel",
            "VTxIndex",
            "TxPulseRle",
        ]
        self.selected_df = self.df.loc[:, list_param]

        ## sorting 은 안하는 것으로 결정.
        # --> UE에서 #F에 따른 데이터를 구분하지 않기에.

    def remove_duplicate(self):
        ## B / C / D / M 모드 구분하여 중복 삭제하고 난 후, merge.

        df = self.selected_df

        # 중복 판단용 컬럼
        cols_to_drop = [
            "SysTxFreqIndex",
            "TxpgWaveformStyle",
            "ProbeNumTxCycles",
            "IsTxChannelModulationEn",
            "IsPresetCpaEn",
            "ElevAperIndex",
            "TxFocusLocCm",
            "NumTxElements",
        ]

        # B & M mode: 중복 시 M 모드 행 삭제
        df_BM = df[df["Mode"].isin(["B", "M"])].reset_index(drop=True)
        duplicated_mask = df_BM.duplicated(subset=cols_to_drop, keep=False)
        df_BM["isDuplicate"] = duplicated_mask.astype(int)
        df_BM = df_BM[(df_BM["isDuplicate"] != 1) | (df_BM["Mode"] != "M")]

        # C & D mode: 중복 시 D 모드 행 삭제
        df_CD = df[df["Mode"].isin(["Cb", "D"])].reset_index(drop=True).fillna(0)
        duplicated_mask = df_CD.duplicated(subset=cols_to_drop, keep=False)
        df_CD["isDuplicate"] = duplicated_mask.astype(int)
        df_CD = df_CD[(df_CD["isDuplicate"] != 1) | (df_CD["Mode"] != "D")]

        # CEUS mode
        df_CEUS = df[df["Mode"] == "Contrast"].copy()
        if not df_CEUS.empty:
            df_CEUS["isDuplicate"] = 0

        df_total = pd.concat([df_BM, df_CD, df_CEUS], ignore_index=True)

        return df_total
