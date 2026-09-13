import logging
import os
import numpy as np
import pandas as pd
from datetime import datetime

from config import Config


def loadfile(file_path):
    encoding_data = pd.read_csv(file_path, sep="\t", encoding="cp949")
    return encoding_data


def arrangeParam(func):
    ## parameter 순서 변경.
    def wrapper(self):
        arrange_param = [
            "GroupIndex",
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
                "TxPulseRle": "TxPulseRleA",
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
        # 초 단위까지 포함한다. 분 단위 타임스탬프는 같은 probe 를 1분 안에 두 번
        # 생성하면 이전 결과 파일을 조용히 덮어쓴다.
        self.formatted_datetime = current_datetime.strftime("%Y%m%d_%H%M%S")
        self.df1 = df1
        self.df2 = df2
        self.probename = probename
        self.case = case

        # 상대 경로는 Flask 프로세스의 작업 디렉터리에 따라 저장 위치가 달라진다.
        # 다운로드 엔드포인트(/api/csv-data)와 동일한 기준 루트를 공유해야
        # 생성은 됐는데 조회는 막히는 불일치가 생기지 않는다.
        uploads_root = Config.UPLOADS_ROOT

        if self.case == 0:
            ## MeasSetGen_files
            self.df = df1
            self.directory = os.path.join(
                uploads_root, "0_MeasSetGen_files", str(self.database)
            )

        elif self.case == 1:
            ## Verification_reports
            self.directory = os.path.join(
                uploads_root, "1_Verification_Reports", str(self.database)
            )

    def make_dir(self):
        if not os.path.exists(self.directory):
            try:
                os.makedirs(self.directory)
            except OSError as e:
                logging.getLogger("DataOut").warning(f"Failed to create directory {self.directory}: {e}")
                raise

    @arrangeParam
    @renameColumns
    def save_excel(self):
        ## meas_setting 알고리즘
        if self.case == 0:
            file_path = os.path.join(
                self.directory,
                f"meas_setting_{self.probename}_{self.formatted_datetime}_result.csv",
            )

            self.df.to_csv(file_path, index=False)

        ## verification_reports
        elif self.case == 1:
            df_Intensity = pd.DataFrame(self.df1)
            df_Temperature = pd.DataFrame(self.df2)

            probename = df_Intensity["ProbeName"][0]
            if isinstance(probename, np.ndarray):
                probename = probename.item()
            probename = str(probename).strip()  ##문자열 앞뒤의 공백만 제거.

            # 엑셀 파일로 출력 (make_dir 이 생성한 디렉터리와 동일한 위치에 저장한다.
            #  과거에는 ./backend/1_Verification_Reports 라는 다른 경로를 써서
            #  디렉터리가 없으면 저장이 실패했다)
            file_path = os.path.join(
                self.directory,
                f"{probename}_{self.formatted_datetime}_result.xlsx",
            )

            with pd.ExcelWriter(file_path, engine="xlsxwriter") as writer:
                df_Intensity.to_excel(writer, sheet_name="Intensity", index=False)
                df_Temperature.to_excel(writer, sheet_name="Temperature", index=False)

        return file_path
