import pandas as pd


class ParamUpdate:
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

        ##### B & M mode process #####
        df_B_mode = df.loc[(df["Mode"] == "B")]
        df_M_mode = df.loc[(df["Mode"] == "M")]
        df_C_mode = df.loc[df["Mode"] == "Cb"]
        df_D_mode = df.loc[df["Mode"] == "D"]
        df_CEUS_mode = df.loc[df["Mode"] == "Contrast"]

        # B and M-mode 데이터만 선택하여 데이터프레임으로 생성
        df_BM = pd.concat([df_B_mode, df_M_mode])
        df_BM = df_BM.reset_index(drop=True)
        # df_BM = df_BM.fillna(0)

        # 중복열 param 등록
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

        # 중복 개수 열 확인
        duplicated_mask = df_BM.duplicated(subset=cols_to_drop, keep=False)
        df_BM["isDuplicate"] = duplicated_mask.map({True: 1, False: 0})

        # isDuplicate가 1이고 Mode가 'M'인 행 삭제 / count-group-index진행
        df_BM = df_BM[(df_BM["isDuplicate"] != 1) | (df_BM["Mode"] != "M")]

        ## C and D-mode 데이터만 선택하여 데이터프레임으로 생성
        df_CD = pd.concat([df_C_mode, df_D_mode])
        df_CD = df_CD.reset_index(drop=True)
        df_CD = df_CD.fillna(0)

        # 중복 개수 열 확인
        duplicated_mask = df_CD.duplicated(subset=cols_to_drop, keep=False)
        df_CD["isDuplicate"] = duplicated_mask.map({True: 1, False: 0})

        # isDuplicate가 1이고 Mode가 'M'인 행 삭제 / count-group-index진행
        df_CD = df_CD[(df_CD["isDuplicate"] != 1) | (df_CD["Mode"] != "D")]

        df_total = pd.concat([df_BM, df_CD, df_CEUS_mode])

        return df_total

    def createGroupIdx(self, df):
        # GroupIndex 열 생성

        group_index = 1
        group_indices = []
        prev_value = None
        for value in df["TxFocusLocCm"]:
            if prev_value is None or value >= prev_value:
                group_indices.append(group_index)
            else:
                group_index += 1
                group_indices.append(group_index)
            prev_value = value
        df["groupIndex"] = group_indices

        return df

    def updateDuplicate(self, df):
        # 각 groupIndex 내에서 하나라도 isDuplicate가 0이면 해당 그룹의 모든 isDuplicate를 0으로 설정

        df["isDuplicate"] = df.groupby("groupIndex")["isDuplicate"].transform(
            lambda x: 0 if 0 in x.values else 1
        )

        return df
