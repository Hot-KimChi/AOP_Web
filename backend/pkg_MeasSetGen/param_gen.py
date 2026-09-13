from datetime import datetime

import numpy as np
import pandas as pd


class ParamGen:
    def __init__(self, data, probeid, probename):
        today = datetime.today()

        self.df = data
        self.probeid = probeid
        self.probename = probename

        self.df["probeId"] = self.probeid
        self.df["probeName"] = self.probename

        self.df["totalVoltagePt"] = 20
        self.df["zStartDistCm"] = 0.5
        self.df["DTxFreqIndex"] = 0
        self.df["dumpSwVersion"] = today.strftime("%Y-%m-%d")
        self.df["measSetComments"] = f"Beamstyle_{self.probename}_Intensity"

    def gen_sequence(self):
        self.numvoltpt()
        self.findOrgIdx()
        self.bsIdx()
        self.freqidx2Hz()
        self.cnt_cycle()
        self.maxVolt_ceilVolt()
        self.calc_profvolt()
        self.zMeasNum()

        return self.df

    def numvoltpt(self):
        ## Contrast mode 일 경우, numMeasVoltage 10 그 외에는 8
        ##  = self.df['Mode'].apply(lambda mode: 10 if mode == 'Contrast' else 8)

        self.df["numMeasVoltage"] = 10
        return self.df

    def findOrgIdx(self):
        ## find freq index

        mode_submode_map = {
            ("B", 0): 0,
            ("B", 1): 1,
            ("B", 2): 1,
            ("B", 3): 1,
            ("B", 4): 1,
            ("Cb", 0): 5,
            ("Cb", 1): 5,
            ("Cb", 3): 5,
            ("D", 0): 10,
            ("M", 0): 15,
            ("M", 1): 20,
            ("Contrast", 4): 4,
            # ("VTQ")
        }

        # apply(axis=1) 은 행마다 Series 를 새로 만들어 수천 행에서 비용이 크다.
        # 튜플 키 조회는 동일한 결과를 내면서 행 Series 생성을 피한다.
        self.df["OrgBeamstyleIdx"] = [
            mode_submode_map.get(key, -1)
            for key in zip(self.df["Mode"], self.df["SubModeIndex"])
        ]
        return self.df

    def bsIdx(self):
        ## bsIndexTrace algorithm

        bs_map = {0: 15, 1: 20, 5: 10}
        mapped = (
            self.df["OrgBeamstyleIdx"].map(bs_map).fillna(0).astype(int)
        )
        self.df["bsIndexTrace"] = np.where(self.df["isDuplicate"] == 1, mapped, 0)
        return self.df

    def freqidx2Hz(self):
        ## FrequencyIndex to FrequencyHz

        frequencyTable = [
            1000000,
            1111100,
            1250000,
            1333300,
            1428600,
            1538500,
            1666700,
            1818200,
            2000000,
            2222200,
            2500000,
            2666700,
            2857100,
            3076900,
            3333300,
            3636400,
            3809500,
            4000000,
            4210500,
            4444400,
            4705900,
            5000000,
            5333300,
            5714300,
            6153800,
            6666700,
            7272700,
            8000000,
            8888900,
            10000000,
            11428600,
            13333333,
            16000000,
            20000000,
            26666667,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
            11428600,
        ]

        freq_index = pd.to_numeric(self.df["SysTxFreqIndex"], errors="coerce")
        # 소수 인덱스는 astype(int) 에서 조용히 버림되어 "다른 주파수"가 선택된다.
        # 원본 구현은 리스트 인덱싱에서 TypeError 로 거부했으므로 동일하게 막는다.
        non_integral = freq_index.notna() & (freq_index % 1 != 0)
        invalid = (
            freq_index.isna()
            | (freq_index < 0)
            | (freq_index >= len(frequencyTable))
            | non_integral
        )
        if invalid.any():
            # 음수 인덱스는 파이썬 리스트에서 조용히 뒤쪽 값을 선택하고, 범위 초과는
            # IndexError 로 요청 전체를 실패시킨다. 어느 쪽이든 원인이 드러나야 한다.
            bad_values = sorted(
                set(map(str, self.df.loc[invalid, "SysTxFreqIndex"].tolist()))
            )
            raise ValueError(
                f"SysTxFreqIndex 값이 유효한 정수 범위(0~{len(frequencyTable) - 1})를 "
                f"벗어났습니다: {bad_values}"
            )

        self.df["TxFrequencyHz"] = np.asarray(frequencyTable)[
            freq_index.astype(int).to_numpy()
        ]
        return self.df

    def cnt_cycle(self):
        ## Calc_cycle for RLE code

        def calculate_cycle_from_rle(rle):
            raw_rle = map(float, str(rle).split(":"))
            calc = [
                round(value - 1, 4) if value > 1 else value
                for value in map(abs, raw_rle)
            ]
            return round(sum(calc), 2)

        # waveform == 0 인 행만 RLE 파싱이 필요하다. 전체 행에 apply(axis=1) 하면
        # 계산이 필요 없는 행까지 행 Series 를 만든다.
        mask = self.df["TxpgWaveformStyle"] == 0
        if mask.any():
            self.df.loc[mask, "ProbeNumTxCycles"] = self.df.loc[
                mask, "TxPulseRle"
            ].map(calculate_cycle_from_rle)
        return self.df

    def maxVolt_ceilVolt(self):
        ## update maxVoltage and ceilVoltage by VTxIndex

        self.df.loc[
            self.df["VTxIndex"] == 1, ["maxTxVoltageVolt", "ceilTxVoltageVolt"]
        ] = 93
        self.df.loc[
            self.df["VTxIndex"] == 0, ["maxTxVoltageVolt", "ceilTxVoltageVolt"]
        ] = 90
        return self.df

    def calc_profvolt(self):
        ## function: calc_profTxVoltage 구현

        idx = 2
        total_pt = pd.to_numeric(self.df["totalVoltagePt"], errors="coerce")
        if (total_pt <= 1).any() or total_pt.isna().any():
            # totalVoltagePt 가 1 이하면 지수 계산에서 0 으로 나누게 된다.
            raise ValueError("totalVoltagePt 는 2 이상이어야 합니다.")

        base = np.minimum(
            pd.to_numeric(self.df["maxTxVoltageVolt"], errors="coerce"),
            pd.to_numeric(self.df["ceilTxVoltageVolt"], errors="coerce"),
        )
        exponent = (total_pt - 1 - idx) / (total_pt - 1)
        self.df["profTxVoltageVolt"] = np.round(base**exponent, 2)
        return self.df

    def zMeasNum(self):
        ## function: calc zMeasNum 구현

        focus = pd.to_numeric(self.df["TxFocusLocCm"], errors="coerce")
        self.df["zMeasNum"] = np.select(
            [focus <= 3, focus <= 6, focus <= 9],
            [(5 - 0.5) * 10, (8 - 0.5) * 10, (12 - 0.5) * 10],
            default=(14 - 0.5) * 10,
        )
        return self.df
