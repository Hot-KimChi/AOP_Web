import os, io
import numpy as np
import pandas as pd
from datetime import datetime


def loadfile(file_path):
    encoding_data = pd.read_csv(file_path, sep="\t", encoding="cp949")
    return encoding_data


def arrangeParam(func):
    ## parameter 순서 변경.
    def wrapper(self):
        arrange_param = [
            "measSetComments",
            "probeId",
            "OrgBeamstyleIdx",
            "bsIndexTrace",
            "TxFrequencyHz",
            "TxFocusLocCm",
            "maxTxVoltageVolt",
            "ceilTxVoltageVolt",
            "profTxVoltageVolt",
            "totalVoltagePt",
            "numMeasVoltage",
            "NumTxElements",
            "TxpgWaveformStyle",
            "ProbeNumTxCycles",
            "ElevAperIndex",
            "zStartDistCm",
            "zMeasNum",
            "IsTxChannelModulationEn",
            "dumpSwVersion",
            "DTxFreqIndex",
            "IsPresetCpaEn",
            "TxPulseRle",
            "CpaDelayOffsetClk",
            "VTxIndex",
            "SystemPulserSel",
            "AI_param",
            "groupIndex",
            "probeName",
            "Mode",
            "SubModeIndex",
            "BeamStyleIndex",
            "SysTxFreqIndex",
            "isDuplicate",
        ]

        self.df = self.df.reindex(columns=arrange_param)
        return func(self)

    return wrapper


def renameColumns(func):
    def wrapper(self):
        self.df = self.df.rename(
            columns={
                "OrgBeamstyleIdx": "beamstyleIndex",
                "TxFocusLocCm": "focusRangeCm",
                "ProbeNumTxCycles": "numTxCycles",
                "IsTxChannelModulationEn": "IsTxAperModulationEn",
                "IsPresetCpaEn": "IsCPAEn",
                "TxPulseRle": "MeasTxPulseRleA",
                "CpaDelayOffsetClk": "CpaDelayOffsetClkA",
                "SystemPulserSel": "SysPulserSelA",
            }
        )

        self.df = self.df.iloc[:, :27]
        return func(self)

    return wrapper


class DataOut:
    """
    폴더 생성 후, 파일 저장.
    """

    def __init__(self, case, database, df1, df2=None, probename=None):
        self.database = database

        current_datetime = datetime.now()
        self.formatted_datetime = current_datetime.strftime("%Y%m%d_%H%M")
        self.df1 = df1
        self.df2 = df2
        self.probename = probename
        self.case = case

        if self.case == 0:
            ## MeasSetGen_files
            self.df = df1
            self.directory = f"./1_uploads/0_MeasSetGen_files/{self.database}"

        elif self.case == 1:
            ## Verification_reports
            self.directory = f"./1_uploads/1_Verification_Reports/{self.database}"

    def make_dir(self):
        if not os.path.exists(self.directory):
            try:
                os.makedirs(self.directory)
                print(f"디렉토리 '{self.directory}'가 생성되었습니다.")
            except OSError as e:
                print(f"디렉토리 '{self.directory}' 생성 중 오류가 발생했습니다:", e)

    @arrangeParam
    @renameColumns
    def save_excel(self):
        ## meas_setting 알고리즘
        if self.case == 0:
            file_path = f"{self.directory}/meas_setting_{self.probename}_{self.formatted_datetime}_result.csv"
            self.df.to_csv(file_path, index=False)

            # CSV 데이터를 메모리에 저장
            csv_buffer = io.StringIO()
            self.df.to_csv(csv_buffer, index=False)
            csv_data = csv_buffer.getvalue()
            return csv_data

        ## verification_reports
        elif self.case == 1:
            df_Intensity = pd.DataFrame(self.df1)
            df_Temperature = pd.DataFrame(self.df2)

            probename = df_Intensity["ProbeName"][0]
            if isinstance(probename, np.ndarray):
                probename = probename.item()
            probename = str(probename).strip()  ##문자열 앞뒤의 공백만 제거.

            # 메모리 내에서 Excel 파일 작성
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
                df_Intensity.to_excel(writer, sheet_name="Intensity", index=False)
                df_Temperature.to_excel(writer, sheet_name="Temperature", index=False)
            output.seek(0)  # 버퍼의 시작 위치로 이동
            return output.getvalue()
