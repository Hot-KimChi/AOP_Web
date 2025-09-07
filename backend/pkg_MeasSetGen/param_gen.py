from datetime import datetime


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

        self.df["OrgBeamstyleIdx"] = self.df.apply(
            lambda row: mode_submode_map.get((row["Mode"], row["SubModeIndex"]), -1),
            axis=1,
        )
        return self.df

    def bsIdx(self):
        ## bsIndexTrace algorithm

        def bsIndex(orgidx, duplicate):
            if duplicate == 1:
                return {0: 15, 1: 20, 5: 10}.get(orgidx, 0)
            return 0

        self.df["bsIndexTrace"] = self.df.apply(
            lambda row: bsIndex(row["OrgBeamstyleIdx"], row["isDuplicate"]), axis=1
        )
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

        self.df["TxFrequencyHz"] = self.df["SysTxFreqIndex"].apply(
            lambda i: frequencyTable[i]
        )
        return self.df

    def cnt_cycle(self):
        ## Calc_cycle for RLE code

        def calculate_cycle(waveform, rle, cycle):
            if waveform == 0:
                raw_rle = map(float, str(rle).split(":"))
                calc = [
                    round(value - 1, 4) if value > 1 else value
                    for value in map(abs, raw_rle)
                ]
                return round(sum(calc), 2)
            return cycle

        self.df["ProbeNumTxCycles"] = self.df.apply(
            lambda row: calculate_cycle(
                row["TxpgWaveformStyle"], row["TxPulseRle"], row["ProbeNumTxCycles"]
            ),
            axis=1,
        )
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

        def prof_tx_voltage(maxV, ceilV, totalpt, idx=2):
            return round((min(maxV, ceilV)) ** ((totalpt - 1 - idx) / (totalpt - 1)), 2)

        self.df["profTxVoltageVolt"] = self.df.apply(
            lambda row: prof_tx_voltage(
                row["maxTxVoltageVolt"], row["ceilTxVoltageVolt"], row["totalVoltagePt"]
            ),
            axis=1,
        )
        return self.df

    def zMeasNum(self):
        ## function: calc zMeasNum 구현

        def z_meas_num(focus):
            if focus <= 3:
                return (5 - 0.5) * 10
            elif focus <= 6:
                return (8 - 0.5) * 10
            elif focus <= 9:
                return (12 - 0.5) * 10
            else:
                return (14 - 0.5) * 10

        self.df["zMeasNum"] = self.df["TxFocusLocCm"].apply(z_meas_num)
        return self.df
